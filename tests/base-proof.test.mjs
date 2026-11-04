import { BASE_ASSET, BASE_USDC, verifyBaseUsdc } from '../dist/base-proof.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const paidHash='0x'+'a'.repeat(64),backHash='0x'+'b'.repeat(64);
const wallet='0x'+'1'.repeat(40),deposit='0x'+'2'.repeat(40),bridge='0x'+'3'.repeat(40);
const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic=a=>'0x'+a.slice(2).padStart(64,'0');
function receipt(hash,from,to,amount){
 return {status:'0x1',transactionHash:hash,blockNumber:'0xc0',logs:[{address:BASE_USDC,removed:false,
     topics:[transfer,topic(from),topic(to)],data:'0x'+BigInt(amount).toString(16).padStart(64,'0')}]};
}
const status={quoteResponse:{quoteRequest:{originAsset:BASE_ASSET,refundTo:wallet},quote:{depositAddress:deposit}},
  swapDetails:{depositedAmount:'748888',refundedAmount:'315',originChainTxHashes:[{hash:paidHash},{hash:backHash}]}};
const source=()=>receipt(paidHash,wallet,deposit,748888);
const refund=()=>receipt(backHash,bridge,wallet,315);
const node=(a,b)=>async(method,params)=>method==='eth_chainId'?'0x2105':(params[0]===paidHash?a:b);
test('confirms both the funded Base deposit and an independent partial return in a successful invoice',async()=>{
 const p=await verifyBaseUsdc(status,node(source(),refund()));
 assert.equal(p.depositTx.atomic,'748888');assert.equal(p.refundTx.atomic,'315');
});
test('wrong chain, token, recipient, value or reverted/removed logs cannot verify a Base refund',async()=>{
 await assert.rejects(verifyBaseUsdc(status,async()=> '0x1'));
 for(const mutate of [r=>r.status='0x0',r=>r.logs[0].address=bridge,r=>r.logs[0].removed=true,
   r=>r.logs[0].topics[2]=topic(deposit),r=>r.logs[0].data='0x'+'2'.padStart(64,'0'),r=>r.transactionHash=paidHash]){
   const returned=refund();mutate(returned);const p=await verifyBaseUsdc(status,node(source(),returned));
   assert.equal(p.refundTx,null);assert.ok(p.depositTx);
 }
});
