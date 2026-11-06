// Restricted, read-only Solana relay. No caller-supplied upstream or write RPC.
const UPSTREAMS = ['https://api.mainnet.solana.com','https://api.mainnet-beta.solana.com','https://solana.api.onfinality.io/public'];
const MAINNET = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const types = {html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',svg:'image/svg+xml',png:'image/png',mp4:'video/mp4',vtt:'text/vtt; charset=utf-8',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
const common = {'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{...common,'Content-Type':'application/json','Cache-Control':'no-store'}});

export function createHandler(assets,send=fetch,upstreams=UPSTREAMS) {
  return async function handle(request) {
    const url=new URL(request.url);
    if(url.pathname==='/api/solana') {
      if(request.method!=='POST')return json({error:'POST required'},405);
      const origin=request.headers.get('Origin');
      if(origin && origin!==url.origin)return json({error:'Same-origin requests only'},403);
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required'},415);
      let input;
      try {
        const text=await request.text();
        if(text.length>2048)return json({error:'Request too large'},413);
        input=JSON.parse(text);
      }catch{return json({error:'Invalid JSON'},400);}
      const p=input?.params;
      const validGenesis=input?.method==='getGenesisHash' && Array.isArray(p) && p.length===0;
      const validTx=input?.method==='getTransaction' && Array.isArray(p) && p.length===2 &&
        typeof p[0]==='string' && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(p[0]) &&
        p[1]?.commitment==='finalized' && p[1]?.encoding==='jsonParsed' && p[1]?.maxSupportedTransactionVersion===1;
      if(input?.jsonrpc!=='2.0' || (!validGenesis&&!validTx))return json({error:'Only finalized transaction reads and mainnet identity checks are supported'},400);
      // Rebuild the request to discard arbitrary options, headers and batch calls.
      const body={jsonrpc:'2.0',id:1,method:input.method,params:validGenesis?[]:[p[0],{commitment:'finalized',encoding:'jsonParsed',maxSupportedTransactionVersion:1}]};
      let missing=false;
      for(const upstream of upstreams){
        const read=async payload=>{
          const res=await send(upstream,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(5500)});
          if(!res.ok)throw Error('HTTP '+res.status);
          const data=await res.json();
          if(data.jsonrpc!=='2.0' || !Object.hasOwn(data,'result') || data.error)throw Error('RPC error');
          return data.result;
        };
        try{
          const genesis=await read({jsonrpc:'2.0',id:1,method:'getGenesisHash',params:[]});
          if(genesis!==MAINNET)throw Error('Wrong cluster');
          const result=validGenesis?genesis:await read(body);
          if(result===null){missing=true;continue;}
          return json({jsonrpc:'2.0',id:1,result});
        }catch(e){console.warn('Solana read provider unavailable',new URL(upstream).hostname,e.message);}
      }
      return missing?json({jsonrpc:'2.0',id:1,result:null}):json({error:'Solana read unavailable'},502);
    }
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
    let pathname;
    try{pathname=decodeURIComponent(url.pathname);}catch{return new Response('Not found',{status:404});}
    let key=pathname==='/'?'/index.html':pathname;
    if(!Object.hasOwn(assets,key) && !key.split('/').pop().includes('.'))key+='.html';
    const encoded=Object.hasOwn(assets,key)?assets[key]:null;
    if(!encoded)return new Response('Not found',{status:404});
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    let start=0,end=bytes.length-1,status=200;
    const headers={...common,'Content-Type':types[key.split('.').pop()]||'application/octet-stream','Cache-Control':'public, max-age=0, must-revalidate'};
    if(key.endsWith('.mp4')){
      headers['Accept-Ranges']='bytes';
      const range=request.headers.get('Range');
      if(range){
        const m=/^bytes=(\d+)-(\d*)$/.exec(range);
        start=m?Number(m[1]):-1;end=m?.[2]?Math.min(Number(m[2]),end):end;
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.length}});
        status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+bytes.length;
      }
    }
    headers['Content-Length']=String(end-start+1);
    return new Response(request.method==='HEAD'?null:bytes.subarray(start,end+1),{status,headers});
  };
}

const assets = /* EMBED_ASSETS */ {};
export default {fetch(request,env={}){
  const configured=env.SOLANA_RPC_URL;
  const upstreams=typeof configured==='string' && /^https:\/\/solana-mainnet\.g\.alchemy\.com\/v2\/[A-Za-z0-9_-]+$/.test(configured)?[configured,...UPSTREAMS]:UPSTREAMS;
  return createHandler(assets,fetch,upstreams)(request);
}};
