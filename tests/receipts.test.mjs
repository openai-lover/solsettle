import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { USDC_MINT, quoteRequest, reconcile, canShowDeposit, depositDeadline } from '../dist/core.js';
import { isSignature, inspectCredit, verifyCredits, MAINNET_GENESIS, TOKEN_PROGRAM } from '../dist/solana-proof.js';

const ref = JSON.parse(readFileSync(new URL('../dist/reference-transfer.json', import.meta.url)));
const {signature, recipient} = ref;
const other = '9xQeWvG816bUx9EPfEZnXzjKLK2CrVcHSR2JkkfNYRzS';
const inv = { v:1, id:'SS-TEST-333', name:'Example', description:'Fixture', due:'2099-12-01', amount:'2.50',recipient };
const origin = {assetId:'base-usdc',blockchain:'base',symbol:'USDC',decimals:6};
const dest = {assetId:'sol-usdc',blockchain:'sol',symbol:'USDC',decimals:6,contractAddress:USDC_MINT};
const req = quoteRequest(inv,origin,dest,'0x1234567890abcdef1234567890abcdef12345678',{dry:false});
const deposit = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const quote = {quoteRequest:req,quote:{depositAddress:deposit,deadline:req.deadline,amountIn:'2510000',amountOut:'2500000'}};
const status = {status:'SUCCESS',quoteResponse:quote,swapDetails:{amountOut:'2500000',destinationChainTxHashes:[{hash:signature}]}};
const balance = (accountIndex,owner,amount) => ({accountIndex, mint:USDC_MINT,owner,programId:TOKEN_PROGRAM,uiTokenAmount:{amount,decimals:6}});
function fixture() {
 return {slot:123,blockTime:1700000000,transaction:{signatures:[signature],message:{accountKeys:['source','dest'],
   instructions:[]}},meta:{err:null,preTokenBalances:[balance(0,other,'5000000'),balance(1,recipient,'125000')],
   postTokenBalances:[balance(0,other,'2500000'),balance(1,recipient,'2625000')],
   innerInstructions:[{instructions:[{programId:TOKEN_PROGRAM,parsed:{type:'transferChecked',info:{source:'source',destination:'dest',mint:USDC_MINT,tokenAmount:{amount:'2500000',decimals:6}}}}]}]}};
}
const makeRpc = tx => async (method,params) => {
 if(method==='getGenesisHash')return MAINNET_GENESIS;
 assert.equal(method,'getTransaction'); assert.equal(params[0],signature); assert.equal(params[1].commitment,'finalized'); return tx;
};
test('a matching provider success plus independently finalized USDC credit marks paid',async()=>{
 const proof=await verifyCredits(recipient,req.amount,[signature],makeRpc(fixture()));
 assert.equal(proof.creditedAtomic,'2500000');assert.equal(reconcile(status,req,deposit,proof).paid,true);
 assert.equal(reconcile(status,req,deposit,{...proof,recipient:other}).paid,false);
});
test('a public transaction reference alone cannot mark a private invoice paid',async()=>{
 const proof=await verifyCredits(recipient,req.amount,[signature],makeRpc(fixture()));
 assert.equal(reconcile(null,req,deposit,proof).paid,false);
 assert.equal(reconcile({...status,status:'PROCESSING'},req,deposit,proof).paid,false);
});
test('recipient, canonical mint and token program all restrict credit',()=>{
 for(const change of [
   tx=>{tx.meta.postTokenBalances[1].mint=other;},
   tx=>{tx.meta.innerInstructions[0].instructions[0].programId=other;},
   tx=>{tx.meta.innerInstructions[0].instructions[0].parsed.info.mint=other;},
   tx=>{tx.meta.innerInstructions[0].instructions[0].parsed.info.destination='source';}
 ]) {const tx=fixture();change(tx);let accepted=false;try{accepted=BigInt(inspectCredit(tx,signature,recipient).creditedAtomic)>0n;}catch{}assert.equal(accepted,false);}
});
test('failed, missing and wrong-signature transactions never qualify',()=>{
 for(const tx of [null,{...fixture(),meta:{...fixture().meta,err:{code:1}}},{...fixture(),transaction:{...fixture().transaction,signatures:['other']}}])assert.throws(()=>inspectCredit(tx,signature,recipient));
});
test('net USDC protects against self-transfers, partial credit and authority changes',()=>{
 const self=fixture();self.meta.preTokenBalances[0].owner=recipient;self.meta.postTokenBalances[0].owner=recipient;
 assert.equal(inspectCredit(self,signature,recipient).creditedAtomic,'0');
 const partial=fixture();partial.meta.postTokenBalances[1].uiTokenAmount.amount='125001';
 assert.equal(inspectCredit(partial,signature,recipient).creditedAtomic,'1');
 const changed=fixture();changed.meta.preTokenBalances[1].owner=other;assert.throws(()=>inspectCredit(changed,signature,recipient));
});
test('newly created destination token accounts are supported',()=>{
 const tx=fixture();tx.meta.preTokenBalances.pop();tx.meta.postTokenBalances[1].uiTokenAmount.amount='2500000';
 assert.equal(inspectCredit(tx,signature,recipient).creditedAtomic,'2500000');
});
test('duplicate signatures, wrong cluster and insufficient credit fail closed',async()=>{
 await assert.rejects(verifyCredits(recipient,req.amount,[signature,signature],makeRpc(fixture())));
 await assert.rejects(verifyCredits(recipient,req.amount,[signature],async()=> 'devnet'));
 const proof=await verifyCredits(recipient,'2500001',[signature],makeRpc(fixture()));assert.equal(proof.sufficient,false);
 assert.equal(isSignature('a'.repeat(89)),false);assert.equal(isSignature('1'.repeat(64)),false);
});
test('every refund must match the original deposit and report a positive amount',()=>{
 const refunded={status:'REFUNDED',quoteResponse:quote,swapDetails:{refundedAmount:'2440000',refundReason:'under minimum'}};
 assert.deepEqual(reconcile(refunded,req,deposit),{state:'REFUNDED',title:'Refund reported by Aurora',paid:false});
 assert.equal(reconcile(refunded,req,'wrong').state,'UNVERIFIED');
 assert.equal(reconcile({...refunded,swapDetails:{}},req,deposit).state,'REFUND_REVIEW');
 assert.equal(reconcile({...refunded,quoteResponse:{...quote,quoteRequest:{...req,refundTo:'other'}}},req,deposit).state,'UNVERIFIED');
});
test('deposit instructions close on inactivity or any non-pending state',()=>{
 const q={deadline:'2030-02-02T00:00:00Z',timeWhenInactive:'2030-02-01T00:00:00Z'};
 assert.equal(depositDeadline(q),Date.parse(q.timeWhenInactive));
 const earlier='2030-01-31T01:00:00Z';assert.equal(depositDeadline(q,earlier),Date.parse(earlier));
 assert.equal(canShowDeposit('PENDING_DEPOSIT',q,Date.parse(earlier),earlier),false);
 for(const state of ['REFUNDED','FAILED','INCOMPLETE_DEPOSIT','PROCESSING','KNOWN_DEPOSIT_TX','UNVERIFIED','CHAIN_CHECK_REQUIRED','SUCCESS'])assert.equal(canShowDeposit(state,q,0),false);
 assert.equal(canShowDeposit('PENDING_DEPOSIT',q,0),true);assert.equal(canShowDeposit('PENDING_DEPOSIT',q,Date.parse(q.timeWhenInactive)),false);
});
test('a status without client sessionId binds only to the original signed quote',async()=>{
 const issued={...quote,signature:'test-provider-signature',timestamp:'2026-11-04T13:00:33.991Z'};
 const statusReq={...req};delete statusReq.sessionId;
 const returned={...status,quoteResponse:{...issued,quoteRequest:statusReq,correlationId:'new-status-correlation'}};
 const proof=await verifyCredits(recipient,req.amount,[signature],makeRpc(fixture()));
 assert.equal(reconcile(returned,req,deposit,proof,issued).paid,true);
 for(const wrong of [null,{...issued,signature:'different'},{...issued,timestamp:'other'},
     {...issued,quote:{...issued.quote,amountIn:'2509999'}},
     {...issued,quoteRequest:{...req,sessionId:'SS-OTHER'}}]) {
   assert.equal(reconcile(returned,req,deposit,proof,wrong).paid,false);
 }
 assert.equal(reconcile({...returned,quoteResponse:{...returned.quoteResponse,quoteRequest:{...statusReq,recipient:other}}},req,deposit,proof,issued).paid,false);
});
