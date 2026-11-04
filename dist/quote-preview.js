import { aurora, destinationToken, quoteRequest, validateQuote, formatAtomic } from './core.js';
import { PROJECT_PUBLIC_KEY } from './project-config.js';

const baseMint = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
// Fixed test inputs for dry quotes only. This page never requests a deposit.
const previewOwner = '9xQeWvG816bUx9EPfEZnXzjKLK2CrVcHSR2JkkfNYRzS';
const previewRefund = '0x1234567890abcdef1234567890abcdef12345678';

export function mountQuotes(main) {
  main.innerHTML = `<div class="eyebrow">SOLSETTLE / ROUTES</div><div class="headingrow"><div><h1>Preview a live quote</h1>
    <p class="sub">Ask Aurora what it would cost to receive a fixed amount of USDC on Solana.</p></div></div>
    <div class="receipt-layout"><section class="card"><h2>Base USDC to Solana USDC</h2>
    <p>Use the project’s Aurora integration to check the current exact-output price.</p>
    <form id="routePreview"><div class="field"><label for="receiveAmount">Receive on Solana · USDC</label>
    <input id="receiveAmount" inputmode="decimal" required value="1.00" autocomplete="off"></div>
    <button class="primary" id="refreshQuote">Get live Aurora quote ↗</button></form>
    <p class="help">Preview only. This uses synthetic quote addresses. No wallet connection, deposit address or transfer is created.</p></section>
    <section class="card proof-sheet" aria-live="polite"><div class="eyebrow">AURORA SWAP API</div><div id="routeResult"><h3>Ready for a quote</h3><p>The price is fetched when you request it.</p></div></section></div>`;
  const form=main.querySelector('#routePreview'), result=main.querySelector('#routeResult');
  const amount=main.querySelector('#receiveAmount'), button=main.querySelector('#refreshQuote');
  let revision=0;
  amount.oninput=()=>{revision++;result.textContent='Request a fresh quote for the edited amount.';};
  form.onsubmit=async event=>{
    event.preventDefault();
    const v=++revision, now=Date.now(), requested=amount.value.trim();
    button.disabled=true;result.textContent='Discovering the current Aurora route and requesting an exact-output quote…';
    try {
      const {tokens}=await aurora('tokens',PROJECT_PUBLIC_KEY);
      if(!Array.isArray(tokens))throw Error('The supported-token catalogue is unavailable.');
      const origin=tokens.find(t=>t.blockchain==='base' && t.symbol==='USDC' && t.decimals===6 && t.contractAddress?.toLowerCase()===baseMint);
      const destination=destinationToken(tokens);
      const example={v:1,id:'SS-PREVIEW-001',name:'Quote preview only',description:'Synthetic inputs',
        recipient:previewOwner,amount:requested,due:new Date(now+86400000).toISOString().slice(0,10)};
      const req=quoteRequest(example,origin,destination,previewRefund,{dry:true,now});
      const response=validateQuote(await aurora('quote',PROJECT_PUBLIC_KEY,{body:req}),req);
      if(response.quote.depositAddress || response.quote.depositMemo)throw Error('Unexpected payment instructions in a dry quote.');
      if(v!==revision)return;
      result.replaceChildren();
      const heading=document.createElement('h3');heading.textContent='Live exact-output quote';result.append(heading);
      const pairs=[['Send on Base',formatAtomic(response.quote.amountIn,origin.decimals)+' USDC'],
        ['Receive on Solana',formatAtomic(response.quote.amountOut,destination.decimals)+' USDC'],
        ['Integration','Aurora Intents · EXACT_OUTPUT'],['Deposit address','None · dry quote'],
        ['Quoted at',new Date().toISOString().slice(11,19)+' UTC']];
      for(const [key,value] of pairs){const line=document.createElement('div');line.className='proof-row';
        const label=document.createElement('span');label.textContent=key;const data=document.createElement('strong');data.textContent=value;line.append(label,data);result.append(line);}
      const note=document.createElement('p');note.className='help';
      note.textContent='This is a point-in-time estimate. A payable invoice requests fresh instructions. Wallet gas is additional.';result.append(note);
    }catch(e){if(v===revision)result.textContent='Quote unavailable. '+e.message;}finally{button.disabled=false;}
  };
}
