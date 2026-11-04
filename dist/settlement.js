import { aurora, formatAtomic, reconcile } from './core.js';
import { verifyCredits } from './solana-proof.js';
import { verifyBaseUsdc } from './base-proof.js';
import { PROJECT_PUBLIC_KEY } from './project-config.js';

const fields=['dry','swapType','originAsset','destinationAsset','amount','recipient','recipientType','refundTo','refundType','depositType','depositMode','sessionId','deadline','slippageTolerance'];
const $=id=>document.getElementById(id);
async function digest(text) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
function display(record){
  $('deposit').textContent=formatAtomic(record.depositedAtomic,6);
  $('credit').textContent=formatAtomic(record.outputAtomic,6);
  $('returned').textContent=formatAtomic(record.returnAtomic,6);
  $('depositLink').href='https://basescan.org/tx/'+record.sourceTx;
  $('creditLink').href='https://explorer.solana.com/tx/'+record.destinationTx;
  $('returnLink').href='https://basescan.org/tx/'+record.returnTx;
}
async function check(record){
  const status=await aurora('status',PROJECT_PUBLIC_KEY,{query:'?'+new URLSearchParams({depositAddress:record.depositAddress})});
  const response=status.quoteResponse;
  if(status.status!=='SUCCESS' || !response?.signature || await digest(response.signature)!==record.issuedSignatureSha256 ||
     response.timestamp!==record.quotedAt || response.quote?.depositAddress!==record.depositAddress ||
     response.quote.amountIn!==record.quotedInputAtomic || response.quote.amountOut!==record.outputAtomic)throw Error('The live reply does not match the original issued quote.');
  const echoed=response.quoteRequest;
  if(!echoed || (echoed.sessionId!==undefined && echoed.sessionId!==record.invoiceId))throw Error('Invoice identity mismatch.');
  const original={...echoed,sessionId:record.invoiceId};
  if(await digest(JSON.stringify(fields.map(key=>original[key]??null)))!==record.originalTermsSha256)throw Error('The recipient, refund wallet or other original invoice terms do not match.');
  const issued={...response,quoteRequest:original};
  const hashes=status.swapDetails?.destinationChainTxHashes?.map(t=>t.hash);
  if(!Array.isArray(hashes)||hashes.length!==1||hashes[0]!==record.destinationTx)throw Error('Destination reference differs from the recorded payment.');
  const [solana,base]=await Promise.all([verifyCredits(original.recipient,original.amount,hashes),verifyBaseUsdc(status)]);
  if(!reconcile(status,original,record.depositAddress,solana,issued).paid ||
     solana.creditedAtomic!==record.outputAtomic || base.depositTx?.hash!==record.sourceTx ||
     base.depositTx.atomic!==record.depositedAtomic || base.refundTx?.hash!==record.returnTx ||
     base.refundTx.atomic!==record.returnAtomic)throw Error('The live transfer evidence does not cover all three recorded amounts.');
  return solana;
}
try {
  const res=await fetch('./project-payment.json',{credentials:'omit'});
  if(!res.ok)throw Error('The project receipt is unavailable.');
  const record=await res.json();display(record);
  $('result').textContent='Recorded on '+record.observedDate+' UTC. Use Recheck to request current evidence.';
  $('verify').disabled=false;
  $('verify').onclick=async()=>{
    $('verify').disabled=true;$('badge').textContent='Checking';$('result').textContent='Reading the signed Aurora quote, Solana finality and Base USDC transfer logs…';
    try{const proof=await check(record);$('badge').textContent='Verified live';$('result').textContent='All three amounts matched. Solana slot '+proof.transactions[0].slot.toLocaleString('en-US')+' · checked '+new Date().toISOString().slice(11,19)+' UTC.';}
    catch(e){$('badge').textContent='Recorded receipt';$('result').textContent='Live recheck incomplete. '+e.message;}
    finally{$('verify').disabled=false;}
  };
}catch(e){$('result').textContent=e.message;}
