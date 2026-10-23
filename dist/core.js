export const API='https://intents-api.aurora.dev';
export const USDC_MINT='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export function units(value,decimals=6){
  const s=String(value).trim();
  if(!Number.isInteger(decimals)||decimals<0||decimals>30||!/^\d+(\.\d+)?$/.test(s))throw Error('Enter a positive decimal amount.');
  const [whole,fraction='']=s.split('.');
  if(fraction.length>decimals)throw Error(`Use at most ${decimals} decimal places.`);
  const n=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0');
  if(n<=0n||n>1_000_000_000_000_000n)throw Error('Amount is outside the supported range.');
  return n.toString();
}
export function solAddress(s){
  if(typeof s!=='string'||s.length<32||s.length>44||/^1+$/.test(s))return false;
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;
  for(const c of s){const i=alphabet.indexOf(c);if(i<0)return false;n=n*58n+BigInt(i);}
  let bytes=0;for(;n>0;n>>=8n)bytes++;return bytes+(s.match(/^1*/)?.[0].length||0)===32;
}
export function invoice(v){
  if(!v||v.v!==1||typeof v.id!=='string'||!/^SS-[A-Z0-9-]{3,50}$/.test(v.id))throw Error('Invalid invoice identifier.');
  if(typeof v.name!=='string'||!v.name.trim()||v.name.length>80||typeof v.description!=='string'||v.description.length>240)throw Error('Check the invoice name and description.');
  if(!solAddress(v.recipient))throw Error('Enter a valid Solana wallet address.');
  units(v.amount);if(!/^\d{4}-\d{2}-\d{2}$/.test(v.due)||!Number.isFinite(Date.parse(v.due+'T23:59:59Z')))throw Error('Choose a valid due date.');
  return {v:1,id:v.id,name:v.name.trim(),description:v.description,recipient:v.recipient,amount:String(v.amount),due:v.due};
}
export function encodeInvoice(v){return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(invoice(v))))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function decodeInvoice(s){if(s.length>3000)throw Error('Invoice link is too long.');try{return invoice(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)))));}catch{throw Error('This invoice link is invalid. Ask the sender for a new one.');}}
export function destinationToken(tokens){return tokens.find(t=>['sol','solana'].includes(t.blockchain)&&t.symbol==='USDC'&&t.contractAddress===USDC_MINT&&t.decimals===6);}
export function quoteRequest(inv,origin,destination,refundTo,{dry=true,now=Date.now()}={}){
  invoice(inv);if(Date.parse(inv.due+'T23:59:59Z')<now)throw Error('Invoice is past due. Ask the sender to issue a new one.');
  if(!origin?.assetId||!destinationToken([destination]))throw Error('The supported USDC route is unavailable.');
  if(!['eth','base','arb','op','bsc','avax','pol','sol','solana'].includes(origin.blockchain))throw Error('This source chain is not yet supported by SolSettle.');
  if(['sol','solana'].includes(origin.blockchain)?!solAddress(refundTo):!/^0x[a-fA-F0-9]{40}$/.test(refundTo)||/^0x0{40}$/i.test(refundTo))throw Error('Enter a refund wallet on the selected source network.');
  if(origin.assetId===destination.assetId)throw Error('Choose a different source asset for this cross-chain checkout.');
  return {dry,swapType:'EXACT_OUTPUT',depositType:'ORIGIN_CHAIN',depositMode:'SIMPLE',originAsset:origin.assetId,destinationAsset:destination.assetId,amount:units(inv.amount),slippageTolerance:50,refundTo,refundType:'ORIGIN_CHAIN',recipient:inv.recipient,recipientType:'DESTINATION_CHAIN',deadline:new Date(now+15*60*1000).toISOString()};
}
export function validateQuote(response,request,{requireFresh=true}={}){
 const r=response?.quoteRequest,q=response?.quote;
 if(!r||!q||['dry','swapType','originAsset','destinationAsset','amount','recipient','recipientType','refundTo','refundType','depositType'].some(k=>r[k]!==request[k]))throw Error('Quote does not match this invoice. No payment instructions will be shown.');
 if(!/^\d+$/.test(q.amountIn)||!/^\d+$/.test(q.amountOut)||BigInt(q.amountOut)<BigInt(request.amount))throw Error('Quote does not cover the invoice amount.');
 if(!request.dry&&(!q.depositAddress||!Number.isFinite(Date.parse(q.deadline))||(requireFresh&&Date.parse(q.deadline)<=Date.now())))throw Error('Payment quote has expired or is missing deposit information.');
 return response;
}
export function reconcile(status,request,depositAddress){
 if(!status||typeof status.status!=='string')return {state:'UNVERIFIED',title:'Status unavailable',paid:false};
 const labels={PENDING_DEPOSIT:'Awaiting payment',KNOWN_DEPOSIT_TX:'Deposit detected',INCOMPLETE_DEPOSIT:'Deposit below required amount',PROCESSING:'Settlement in progress',REFUNDED:'Refunded',FAILED:'Payment failed'};
 if(status.status!=='SUCCESS')return {state:status.status,title:labels[status.status]||'Unrecognized status',paid:false};
 try{validateQuote(status.quoteResponse,request,{requireFresh:false});}catch{return {state:'UNVERIFIED',title:'Settlement needs review',paid:false};}
 const d=status.swapDetails;
 if(status.quoteResponse.quote.depositAddress!==depositAddress||!d||!/^\d+$/.test(d.amountOut||'')||BigInt(d.amountOut)<BigInt(request.amount)||!d.destinationChainTxHashes?.length)return {state:'UNVERIFIED',title:'Settlement evidence incomplete',paid:false};
 return {state:'SUCCESS',title:'Settled on Solana',paid:true};
}
export function safeUrl(s){try{const u=new URL(s);return u.protocol==='https:'?u.href:null;}catch{return null;}}
export async function aurora(path,key,options={}){
 if(!key?.trim())throw Error('Add your Aurora public integration key in Settings to use live payments.');
 const response=await fetch(`${API}/api/${path}/${encodeURIComponent(key.trim())}${options.query||''}`,{method:options.body?'POST':'GET',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined,signal:AbortSignal.timeout(20000)});
 let data;try{data=await response.json();}catch{throw Error('Aurora returned an unreadable response. Please retry.');}
 if(!response.ok)throw Error(response.status===429?'Too many requests. Wait a moment and retry.':String(data.message||`Aurora service error (${response.status})`).slice(0,250));return data;
}
