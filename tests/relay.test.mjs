import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../worker/index.js';
const origin='https://solsettle.example';
const signature='5ihmVpAbjHJT3mPeLLnAGetPsyJGgetCtDpi1PHP1sS5huQ49ngTNGkUWtMtWoEQwKEiAV65vFGuerA3btwK9uHw';
const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const body={jsonrpc:'2.0',id:1,method:'getTransaction',params:[signature,{commitment:'finalized',encoding:'jsonParsed',maxSupportedTransactionVersion:1}]};
const request=(data=body,headers={})=>new Request(origin+'/api/solana',{method:'POST',headers:{'Content-Type':'application/json','Origin':origin,...headers},body:JSON.stringify(data)});
test('relay forwards only fixed-upstream finalized reads and preserves missing evidence',async()=>{
 let calls=0;
 const handler=createHandler({},async(url,opts)=>{calls++;assert.match(url,/^https:\/\/(api.mainnet.solana.com|api.mainnet-beta.solana.com|solana.api.onfinality.io\/public)$/);const sent=JSON.parse(opts.body);if(sent.method==='getTransaction')assert.deepEqual(sent,body);assert.equal(opts.headers.Origin,undefined);return Response.json({jsonrpc:'2.0',id:1,result:sent.method==='getGenesisHash'?genesis:null});});
 const res=await handler(request());assert.equal(res.status,200);assert.equal((await res.json()).result,null);assert.equal(calls,6);
});
test('relay rejects writes, batches, weaker commitment and external origins without upstream calls',async()=>{
 const handler=createHandler({},()=>{assert.fail('Untrusted request reached upstream');});
 for(const data of [{...body,method:'sendTransaction'},[body],{...body,params:[signature,{...body.params[1],commitment:'confirmed'}]},null])assert.equal((await handler(request(data))).status,400);
 assert.equal((await handler(request(body,{Origin:'https://other.example'}))).status,403);
 assert.equal((await handler(new Request(origin+'/api/solana'))).status,405);
});
test('relay checks mainnet identity and fails closed on upstream errors',async()=>{
 const req={jsonrpc:'2.0',id:1,method:'getGenesisHash',params:[]};
 const handler=createHandler({},async()=>Response.json({jsonrpc:'2.0',id:1,result:genesis}));
 assert.equal((await (await handler(request(req))).json()).result,genesis);
 for(const send of [async()=>new Response('',{status:429}),async()=>Response.json({jsonrpc:'2.0',error:{code:-1}}),async()=>{throw Error('timeout')}])assert.equal((await createHandler({},send)(request())).status,502);
 const fallback=createHandler({},async(url,opts)=>{if(url!=='https://solana.api.onfinality.io/public')return new Response('',{status:403});return Response.json({jsonrpc:'2.0',id:1,result:JSON.parse(opts.body).method==='getGenesisHash'?genesis:{slot:123}});});
 assert.deepEqual((await (await fallback(request())).json()).result,{slot:123});
 assert.equal((await createHandler({},async()=>Response.json({jsonrpc:'2.0',result:'wrong-cluster'}))(request())).status,502);
});
test('worker serves extensionless public pages and accurate video ranges',async()=>{
 const handler=createHandler({'/index.html':btoa('home'),'/settlement.html':btoa('receipt'),'/media/demo.mp4':btoa('0123456789')});
 assert.equal(await (await handler(new Request(origin+'/settlement'))).text(),'receipt');
 const res=await handler(new Request(origin+'/media/demo.mp4',{headers:{Range:'bytes=2-5'}}));
 assert.equal(res.status,206);assert.equal(res.headers.get('Content-Range'),'bytes 2-5/10');assert.equal(await res.text(),'2345');
 assert.equal((await handler(new Request(origin+'/media/demo.mp4',{headers:{Range:'bytes=99-'}}))).status,416);
 assert.equal((await handler(new Request(origin+'/constructor'))).status,404);
 assert.equal((await handler(new Request(origin+'/.openai/hosting.json'))).status,404);
});
