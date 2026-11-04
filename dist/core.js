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
export function formatAtomic(value, decimals) {
  if (!/^\d{1,40}$/.test(String(value)) || !Number.isInteger(decimals) || decimals < 0 || decimals > 30) throw Error('Token amount or decimals unavailable.');
  const n = BigInt(value), scale = 10n ** BigInt(decimals);
  if (!decimals) return n.toString();
  const fraction = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return (n / scale).toString() + (fraction ? '.' + fraction : '');
}
export function sourceAddress(chain, address) {
  if (['sol','solana'].includes(chain)) return solAddress(address);
  return ['eth','base','arb','op','bsc','avax','pol'].includes(chain) &&
    typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address) && !/^0x0{40}$/i.test(address);
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
  if(!sourceAddress(origin.blockchain,refundTo))throw Error('Enter a refund wallet on the selected source network.');
  if(origin.assetId===destination.assetId)throw Error('Choose a different source asset for this cross-chain checkout.');
  return {dry,swapType:'EXACT_OUTPUT',sessionId:inv.id,depositType:'ORIGIN_CHAIN',depositMode:'SIMPLE',originAsset:origin.assetId,destinationAsset:destination.assetId,amount:units(inv.amount),slippageTolerance:50,refundTo,refundType:'ORIGIN_CHAIN',recipient:inv.recipient,recipientType:'DESTINATION_CHAIN',deadline:new Date(now+15*60*1000).toISOString()};
}
export function depositDeadline(quote, requestedDeadline) {
  const dates = [quote?.deadline, quote?.timeWhenInactive, requestedDeadline].filter(Boolean).map(Date.parse);
  return dates.length && dates.every(Number.isFinite) ? Math.min(...dates) : NaN;
}

export function validateQuote(response, request, { requireFresh = true } = {}) {
  const echoed = response?.quoteRequest;
  const q = response?.quote;
  const boundFields = ['dry', 'swapType', 'originAsset', 'destinationAsset', 'amount', 'recipient',
    'recipientType', 'refundTo', 'refundType', 'depositType', 'depositMode', 'sessionId', 'deadline', 'slippageTolerance'];
  if (!echoed || !q || boundFields.some(field => echoed[field] !== request[field])) {
    throw Error('Aurora’s quote differs from the approved invoice terms. Check the route again.');
  }
  if (!/^[1-9]\d{0,29}$/.test(q.amountIn || '') || !/^[1-9]\d{0,29}$/.test(q.amountOut || '') ||
      BigInt(q.amountOut) < BigInt(request.amount)) throw Error('This quote does not cover the invoice.');
  const expiry = depositDeadline(q, request.deadline);
  if (!request.dry && (typeof q.depositAddress !== 'string' || !q.depositAddress.trim() ||
      !Number.isFinite(expiry) || (requireFresh && expiry <= Date.now()))) {
    throw Error('This payment quote has expired or is missing deposit instructions.');
  }
  return response;
}

export function reconcile(status, request, depositAddress, proof = null, issuedQuote = null) {
  const result = (state, title, paid = false) => ({state, title, paid});
  const unchecked = () => result('UNVERIFIED', 'Evidence needs review');
  if (!status || typeof status.status !== 'string') return unchecked();
  const state = status.status;
  if (state === 'PENDING_DEPOSIT' && !status.quoteResponse) return result(state, 'Awaiting payment');
  try {
    const returned = status.quoteResponse;
    let expected = request;
    // Aurora echoes sessionId when issuing a quote, but may omit it from status.
    // Accept that omission only for the same provider-signed quote originally issued for this invoice.
    if (request.sessionId && returned?.quoteRequest?.sessionId === undefined) {
      validateQuote(issuedQuote, request, { requireFresh: false });
      if (typeof issuedQuote.signature !== 'string' || !issuedQuote.signature || issuedQuote.signature !== returned.signature ||
          !issuedQuote.timestamp || issuedQuote.timestamp !== returned.timestamp ||
          issuedQuote.quote.depositAddress !== depositAddress || issuedQuote.quote.amountIn !== returned.quote?.amountIn ||
          issuedQuote.quote.amountOut !== returned.quote?.amountOut) return unchecked();
      expected = { ...request, sessionId: undefined };
    }
    validateQuote(returned, expected, { requireFresh: false });
  } catch { return unchecked(); }
  if (!depositAddress || request.dry || status.quoteResponse.quote.depositAddress !== depositAddress) return unchecked();
  const details = status.swapDetails;
  if (state === 'REFUNDED') {
    if (!/^[1-9]\d{0,29}$/.test(details?.refundedAmount || '')) return result('REFUND_REVIEW', 'Refund amount needs confirmation');
    return result(state, 'Refund reported by Aurora');
  }
  const labels = { PENDING_DEPOSIT:'Awaiting payment', KNOWN_DEPOSIT_TX:'Deposit detected',
    INCOMPLETE_DEPOSIT:'Incomplete deposit', PROCESSING:'Settlement in progress', FAILED:'Payment failed' };
  if (state !== 'SUCCESS') return Object.hasOwn(labels,state) ? result(state,labels[state]) : unchecked();
  const hashes = Array.isArray(details?.destinationChainTxHashes) ? details.destinationChainTxHashes.map(tx => tx?.hash) : [];
  if (!/^[1-9]\d{0,29}$/.test(details?.amountOut || '') || BigInt(details.amountOut) < BigInt(request.amount) ||
      !Array.isArray(hashes) || !hashes.length || hashes.length > 10 ||
      hashes.some(h => typeof h !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(h)) ||
      new Set(hashes).size !== hashes.length) return unchecked();
  if (!proof) return result('CHAIN_CHECK_REQUIRED', 'Checking finalized Solana receipt');
  if (!proof.sufficient || proof.network !== 'mainnet-beta' || proof.commitment !== 'finalized' ||
      proof.recipient !== request.recipient || proof.mint !== USDC_MINT || proof.expectedAtomic !== request.amount ||
      !/^[1-9]\d{0,29}$/.test(proof.creditedAtomic || '') || BigInt(proof.creditedAtomic) < BigInt(request.amount) ||
      !Array.isArray(proof.transactions) || hashes.length !== proof.transactions.length ||
      hashes.some((h,i) => proof.transactions[i]?.signature !== h)) return unchecked();
  return result('SUCCESS', 'Verified on Solana', true);
}

export function canShowDeposit(state, quote, now = Date.now(), requestedDeadline) {
  return state === 'PENDING_DEPOSIT' && Number.isFinite(depositDeadline(quote, requestedDeadline)) && now < depositDeadline(quote, requestedDeadline);
}
export function safeUrl(s){try{const u=new URL(s);return u.protocol==='https:'?u.href:null;}catch{return null;}}
export async function aurora(path,key,options={}){
 if(!key?.trim())throw Error('Add your Aurora public integration key in Settings to use live payments.');
 const response=await fetch(`${API}/api/${path}/${encodeURIComponent(key.trim())}${options.query||''}`,{method:options.body?'POST':'GET',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined,signal:AbortSignal.timeout(20000)});
 let data;try{data=await response.json();}catch{throw Error('Aurora returned an unreadable response. Please retry.');}
 if(!response.ok)throw Error(response.status===429?'Too many requests. Wait a moment and retry.':String(data.message||`Aurora service error (${response.status})`).slice(0,250));return data;
}
