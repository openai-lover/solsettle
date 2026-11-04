const BASE_RPC = 'https://mainnet.base.org';
export const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
export const BASE_ASSET = 'nep141:base-' + BASE_USDC + '.omft.near';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const HASH = /^0x[0-9a-f]{64}$/i;
async function rpc(method, params) {
  const response = await fetch(BASE_RPC, {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(16000)});
  if (!response.ok) throw Error('Base RPC unavailable.');
  const data=await response.json();
  if(data.error)throw Error('Base could not return transaction evidence.');
  return data.result;
}
export async function verifyBaseUsdc(status, readRpc=rpc) {
  const issued=status.quoteResponse, q=issued?.quote, request=issued?.quoteRequest, detail=status.swapDetails;
  if(request?.originAsset!==BASE_ASSET || !/^0x[0-9a-f]{40}$/i.test(request.refundTo) ||
     !/^0x[0-9a-f]{40}$/i.test(q?.depositAddress) || !detail)throw Error('Base USDC evidence unavailable for this route.');
  const hashes=detail.originChainTxHashes?.map(tx=>tx.hash);
  if(!Array.isArray(hashes)||!hashes.length||hashes.length>10||hashes.some(h=>!HASH.test(h))||new Set(hashes).size!==hashes.length)throw Error('Invalid source transaction list.');
  if(BigInt(await readRpc('eth_chainId',[]))!==8453n)throw Error('Unexpected Base network.');
  const wallet=request.refundTo.toLowerCase(),deposit=q.depositAddress.toLowerCase();
  let depositTx=null, refundTx=null;
  for(const hash of hashes){
    const rec=await readRpc('eth_getTransactionReceipt',[hash]);
    if(rec?.status!=='0x1'||rec.transactionHash?.toLowerCase()!==hash.toLowerCase()||!Array.isArray(rec.logs))continue;
    for(const l of rec.logs){
      if(l.removed||l.address?.toLowerCase()!==BASE_USDC||l.topics?.length!==3||l.topics[0]?.toLowerCase()!==TRANSFER ||
        !/^0x0{24}[0-9a-f]{40}$/i.test(l.topics[1])||!/^0x0{24}[0-9a-f]{40}$/i.test(l.topics[2])||!/^0x[0-9a-f]{64}$/i.test(l.data))continue;
      const from='0x'+l.topics[1].slice(-40).toLowerCase(),to='0x'+l.topics[2].slice(-40).toLowerCase(),amount=BigInt(l.data).toString();
      if(from===to||amount==='0')continue;
      const item={hash,atomic:amount,block:Number(BigInt(rec.blockNumber)),explorer:'https://basescan.org/tx/'+hash};
      if(from===wallet&&to===deposit&&amount===detail.depositedAmount)depositTx=item;
      if(to===wallet&&amount===detail.refundedAmount)refundTx=item;
    }
  }
  return {chainId:8453,mint:BASE_USDC,depositTx,refundTx,checkedAt:new Date().toISOString()};
}
