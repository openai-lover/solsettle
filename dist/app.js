import {USDC_MINT,units,formatAtomic,sourceAddress,invoice,encodeInvoice,decodeInvoice,destinationToken,quoteRequest,validateQuote,reconcile,canShowDeposit,depositDeadline,aurora} from './core.js';
import { verifyCredits, formatUsdc } from './solana-proof.js';
import { mountReceiptCheck, renderCredit } from './receipt-ui.js';
import { PROJECT_PUBLIC_KEY } from './project-config.js';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}};
let records=read('solsettle.records',[]).filter(r=>{try{invoice(r.invoice);return true;}catch{return false;}}),settings=read('solsettle.settings',{}),sample=false,view='invoices',filter='All',current=null,request=null,quote=null,receipt=null,tokens=[],epoch=0;
let chainProof = null;
let verifyMessage = '';
function integrationKey() { return PROJECT_PUBLIC_KEY || settings.key || ''; }
// Older releases stored a provider-only success; it needs a new chain check.
records = records.map(r => r.paid && !r.chainProof ? { ...r, paid: false, needsRecheck: true } : r);
const sampleInv={v:1,id:'SS-SAMPLE-001',name:'Northstar Studio',description:'Brand identity & website design · Final delivery',recipient:'9xQeWvG816bUx9EPfEZnXzjKLK2CrVcHSR2JkkfNYRzS',amount:'250.00',due:'2026-11-08'};
const save=()=>localStorage.setItem('solsettle.records',JSON.stringify(records));
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',4000);}
function error(s,target='#actionError'){const e=$(target);if(e){e.innerHTML=`<div class="error" role="alert">${esc(s)}</div>`;}else toast(s);}
function money(s){return Number(s).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6});}
function statusOf(r){return r.paid?'Settled':r.needsRecheck?'Receipt check due':Date.parse(r.invoice.due+'T23:59:59Z')<Date.now()?'Past due':'Awaiting';}
function rows(){return sample?[{invoice:sampleInv,paid:false},{invoice:{...sampleInv,id:'SS-SAMPLE-002',name:'Paper & Pine',description:'Illustration package',amount:'480.00'},paid:true},{invoice:{...sampleInv,id:'SS-SAMPLE-003',name:'Orbit Collective',description:'Product consultation',amount:'150.00'},paid:false}]:records;}
function render(){epoch++;$('#crumb').textContent=({invoices:'Invoices',how:'How it works',proof:'Verify a receipt',settings:'Settings',checkout:'Checkout'})[view];document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(view==='invoices')dashboard();else if(view==='settings')settingsPage();else if(view==='how')how();else if(view==='proof')mountReceiptCheck($('#main'));else checkout();}
function dashboard(){const all=rows(),paid=all.filter(r=>r.paid),unpaid=all.filter(r=>!r.paid);$('#main').innerHTML=`<div class="eyebrow">YOUR MONEY, SIMPLIFIED</div><div class="headingrow"><div><h1>Good work deserves easy payment.</h1><p class="sub">Send one invoice. Get paid in USDC on Solana.</p></div><button class="primary" id="create">＋ New invoice</button></div>${sample?'<div class="samplebar">Sample workspace · All names, balances and settlement states below are fictional. No funds move. <button class="back" id="exitSample">Exit sample ↗</button></div>':''}<section class="hero"><div><div class="eyebrow" style="color:#adc59a;margin-bottom:14px">LESS CHAIN TALK. MORE GETTING PAID.</div><h2>Your client chooses the coin.<br>You choose peace of mind.</h2><p>Aurora Intents routes the payment.<br>Your invoice settles in USDC on Solana.</p></div><div class="flow" aria-label="Source assets routed into USDC on Solana"><div class="coins"><div class="coin">◈ ETH on Ethereum</div><div class="coin">$ USDC on Base</div><div class="coin">◎ SOL on Solana</div></div><span class="arrow">⟶</span><div class="settle"><small>YOU RECEIVE</small><strong>USDC</strong><small>◎ On Solana</small></div></div></section><section class="metrics"><div class="metric"><span class="label">Settled${sample?' · sample':''}</span><strong>${money(paid.reduce((n,r)=>n+Number(r.invoice.amount),0))}<span style="font-size:11px;color:#87917e"> USDC</span></strong><small>${paid.length} invoice${paid.length===1?'':'s'} completed</small></div><div class="metric"><span class="label">Awaiting payment</span><strong>${money(unpaid.reduce((n,r)=>n+Number(r.invoice.amount),0))}<span style="font-size:11px;color:#87917e"> USDC</span></strong><small>${unpaid.length} invoice${unpaid.length===1?'':'s'} open</small></div><div class="metric"><span class="label">Settlement currency</span><strong>USDC <span style="font-size:15px;color:#789365">↙</span></strong><small>One currency for your records</small></div></section><div class="sectionhead"><h2>Your invoices <span style="color:#9aa48f;font-weight:400">${all.length}</span></h2><div class="filters">${['All','Awaiting','Settled'].map(f=>`<button class="${f===filter?'active':''}" data-filter="${f}">${f}</button>`).join('')}</div></div><div class="tablebox">${all.length?`<table><thead><tr><th>Invoice / client</th><th>Amount</th><th>Due date · UTC</th><th>Status</th><th></th></tr></thead><tbody>${all.filter(r=>filter==='All'||(filter==='Awaiting'?!r.paid:statusOf(r)===filter)).map(r=>`<tr><td><strong>${esc(r.invoice.name)}</strong><small>${esc(r.invoice.id)}</small></td><td><strong>${money(r.invoice.amount)} USDC</strong><small>Solana</small></td><td>${esc(r.invoice.due)}</td><td><span class="pill ${r.paid?'green':'amber'}">${statusOf(r)}</span></td><td><button class="rowbutton" data-open="${esc(r.invoice.id)}">Open ↗</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty"><h3>Your next payment starts here.</h3><p>Create your first invoice, or try the sample workspace.</p><button class="quiet" id="emptySample">Explore sample →</button></div>'}</div><p class="help" style="margin-top:16px">Invoices and payment sessions are saved in this browser. Export receipts for your records. Sample activity is never added to live totals.</p>`;
 $('#create').onclick=createInvoice;$('#exitSample')?.addEventListener('click',()=>{sample=false;render();});$('#emptySample')?.addEventListener('click',()=>{sample=true;render();});document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render();});document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{current=rows().find(r=>r.invoice.id===b.dataset.open).invoice;quote=null;request=null;receipt=null;chainProof=null;verifyMessage='';view='checkout';render();});}
function createInvoice(){const due=new Date(Date.now()+14*86400000).toISOString().slice(0,10);$('#modalbody').innerHTML=`<div class="eyebrow">MAKE GETTING PAID SIMPLE</div><h2 style="margin-top:8px">Create an invoice</h2><p class="sub">Your client pays from their chain. You receive Solana USDC.</p><form id="invoiceform"><div class="field"><label for="name">Business or project name</label><input id="name" required maxlength="80" placeholder="Your studio"></div><div class="field"><label for="description">What is this payment for?</label><textarea id="description" maxlength="240" placeholder="Project, milestone or service"></textarea></div><div class="twocol"><div class="field"><label for="amount">Amount in USDC</label><input id="amount" required inputmode="decimal" placeholder="250.00"></div><div class="field"><label for="due">Due date (end of day UTC)</label><input id="due" type="date" required value="${due}"></div></div><div class="field"><label for="recipient">Your Solana receiving wallet</label><input id="recipient" required autocomplete="off" spellcheck="false" value="${esc(settings.recipient||'')}" placeholder="Solana public address"><span class="help">Check this address carefully. Never enter a private key or seed phrase.</span></div><p class="help">The share link includes these invoice details. Anyone with it can read them. SolSettle does not verify the sender's identity; confirm payment details with your client.</p><div id="formError"></div><button class="primary full">Create invoice →</button></form>`;$('#modal').showModal();$('#invoiceform').onsubmit=e=>{e.preventDefault();try{const v=invoice({v:1,id:'SS-'+crypto.randomUUID().slice(0,8).toUpperCase(),name:$('#name').value,description:$('#description').value,amount:$('#amount').value,due:$('#due').value,recipient:$('#recipient').value.trim()});if(Date.parse(v.due+'T23:59:59Z')<Date.now())throw Error('Choose today or a future due date.');records.unshift({invoice:v,paid:false,created:new Date().toISOString()});save();sample=false;current=v;request=quote=receipt=chainProof=null;verifyMessage='';$('#modal').close();view='checkout';render();toast('Invoice created. Review it before sharing.');}catch(err){error(err.message,'#formError');}};}
function settingsPage(){$('#main').innerHTML=`<div class="narrow"><div class="eyebrow">YOUR WORKSPACE</div><div class="headingrow"><div><h1>Payment settings</h1><p class="sub">Configure the Aurora Swap API connection.</p></div></div><form id="settingsform" class="card"><div class="field"><label for="key">Aurora public integration key</label><input id="key" value="${esc(integrationKey())}" ${PROJECT_PUBLIC_KEY?'readonly':''} autocomplete="off" spellcheck="false" placeholder="Your app key from Aurora Studio"><span class="help">Aurora documents this as a public app key. It cannot sign wallet transactions. A personal override stays in this browser.</span></div><a href="https://studio.aurora.dev/" target="_blank" rel="noopener noreferrer" class="external">Open Aurora Studio ↗</a><div class="field"><label for="defaultRecipient">Default Solana receiving wallet (optional)</label><input id="defaultRecipient" value="${esc(settings.recipient||'')}" spellcheck="false"></div><button class="primary">Save settings</button><button type="button" class="quiet" id="testApi">Test connection</button><div id="actionError"></div><div class="settings-status" id="connection"></div></form><div class="note">Mainnet payments require real assets and network fees. SolSettle never requests your seed phrase or signs transactions. Use a small amount for the first live test.<br><br>Protocol fees and potential refund fees are quoted by Aurora; SolSettle adds no fee in this prototype.</div></div>`;$('#settingsform').onsubmit=e=>{e.preventDefault();settings={key:$('#key').value.trim(),recipient:$('#defaultRecipient').value.trim()};localStorage.setItem('solsettle.settings',JSON.stringify(settings));tokens=[];toast('Settings saved in this browser.');};$('#testApi').onclick=async()=>{const b=$('#testApi');b.disabled=true;$('#actionError').innerHTML='';try{const result=await aurora('tokens',$('#key').value);if(!Array.isArray(result.tokens)||!destinationToken(result.tokens))throw Error('Connected, but canonical Solana USDC is unavailable.');$('#connection').textContent=`Connected · ${result.tokens.length} supported assets. Solana USDC available.`;}catch(e){error(e.message);}finally{b.disabled=false;}};}
function how(){$('#main').innerHTML=`<div class="eyebrow">BUILT AROUND YOUR INVOICE</div><div class="headingrow"><div><h1>Different chains. Same finish line.</h1><p class="sub">An exact-output payment flow, designed for independent businesses.</p></div></div><div class="cards"><div class="card"><div class="stepnumber">1</div><h2>Request USDC</h2><p>Create an invoice with a fixed amount and a Solana receiving wallet. Share its link with your client.</p></div><div class="card"><div class="stepnumber">2</div><h2>Pay from your chain</h2><p>Your client chooses a supported token and refund address. Aurora quotes how much they need to send for the requested USDC amount.</p></div><div class="card"><div class="stepnumber">3</div><h2>Follow the money</h2><p>Track deposit, routing and settlement. We match Aurora’s status to the invoice and verify a finalized transfer of canonical USDC into the receiving wallet.</p></div></div><div class="card" style="margin-top:24px"><h2>What if something goes wrong?</h2><ul class="timeline"><li>Not enough deposited<small>The invoice stays unpaid. Follow Aurora's incomplete-deposit status; do not assume payment succeeded.</small></li><li>Quote expires<small>New deposits are disabled in the interface. Existing deposits can still be tracked; refunds follow Aurora's rules.</small></li><li>Payment is refunded<small>The invoice stays unpaid. We display the provider's refund reason and amount, if available.</small></li><li>Service unavailable<small>No fabricated success. Keep the payment address and retry status lookup later.</small></li></ul><p class="help">The MVP is a browser-local, unsigned invoice tool, not a custody service or accounting ledger. Solana RPC verifies the destination credit independently. A refund amount shown by Aurora is identified as provider-reported. A project-owned public integration key can be configured for all payers. Without it, live quotes require a public key in Settings.</p></div>`;}
function checkout(){if(!current){view='invoices';dashboard();return;}const inv=current;const local=records.find(r=>r.invoice.id===inv.id);const sessions=read('solsettle.sessions',{});const old=sessions[inv.id];if(!sample&&old&&JSON.stringify(old.invoice)===JSON.stringify(inv)&&!quote){request=old.request;quote=old.quote;receipt=old.receipt||null;chainProof=old.chainProof||null;}
$('#main').innerHTML=`<button class="back" id="back">← Back to invoices</button>${sample?'<div class="samplebar" style="margin-top:20px">Interactive sample · No payment address is generated. Status changes here are simulated.</div>':''}<div class="checkout"><section class="bill"><span class="pill gray">INVOICE ${esc(inv.id)}</span><h2 style="margin-top:22px">${esc(inv.name)}</h2><p class="sub">${esc(inv.description||'Invoice payment')}</p><div class="amount">${money(inv.amount)}</div><div class="currency">USDC · Receive on Solana</div><hr><div class="kv"><span>Due date · UTC</span><strong>${esc(inv.due)}</strong></div><div class="kv"><span>Settlement asset</span><strong>USDC on Solana</strong></div><div class="kv"><span>Receiving wallet</span></div><div class="address">${sample?'Sample address — not for payment':esc(inv.recipient)}</div><p class="help">Verify the recipient with the sender before paying. Invoice links are not digitally signed.</p><div class="actions">${!sample?'<button class="quiet" id="share">Copy invoice link</button>':''}<button class="quiet" id="exportInvoice">Export invoice</button></div></section><section class="checkoutpanel"><div class="eyebrow">PAYMENT CHECKOUT</div><h2 style="margin-top:10px">Pay your way.</h2><p class="sub">Choose your asset. The invoice amount stays in USDC.</p><div id="paymentBody"></div><div id="actionError"></div></section></div>`;
$('#back').onclick=()=>{view='invoices';current=null;history.replaceState(null,'',location.pathname);render();};$('#share')?.addEventListener('click',async()=>{const url=new URL(location.pathname,location.origin);url.hash='invoice='+encodeInvoice(inv);try{await navigator.clipboard.writeText(url.href);toast('Invoice link copied.');}catch{error('Clipboard unavailable. Use Export invoice to save the details.');}});$('#exportInvoice').onclick=()=>download(sample?'sample-invoice.json':inv.id+'.json',{...inv,sample});
if(sample){sampleCheckout();return;}if(quote){depositPanel();return;}
$('#paymentBody').innerHTML=`<div class="field"><label for="source">Pay with</label><select id="source"><option value="">Loading supported assets…</option></select></div><div class="field"><label for="refund">Refund wallet on source network</label><input id="refund" autocomplete="off" spellcheck="false" placeholder="Your wallet, in case a refund is needed"><span class="help">Use a self-custody wallet on the selected network. Exchange deposit addresses may require unsupported memos.</span></div><button id="getquote" class="primary full" disabled>Preview live quote →</button><p class="help">Previewing a quote does not move funds. Slippage tolerance: 0.5%. Destination amount: ${esc(inv.amount)} USDC.</p><div id="previewQuote"></div>`;const tick=epoch;loadTokens().then(()=>{if(tick!==epoch)return;const dest=destinationToken(tokens);const supported=tokens.filter(t=>['eth','base','arb','op','bsc','avax','pol','sol','solana'].includes(t.blockchain)&&t.assetId!==dest?.assetId);$('#source').innerHTML='<option value="">Select a token & network</option>'+supported.map(t=>`<option value="${esc(t.assetId)}">${esc(t.symbol)} · ${esc(t.blockchain)}</option>`).join('');$('#getquote').disabled=!dest;}).catch(e=>{if(tick===epoch){$('#source').innerHTML='<option>Integration setup needed</option>';error(e.message);}});
$('#getquote').onclick=async()=>{const b=$('#getquote');b.disabled=true;$('#actionError').innerHTML='';$('#previewQuote').innerHTML='';const version=epoch;try{const origin=tokens.find(t=>t.assetId===$('#source').value);const req=quoteRequest(inv,origin,destinationToken(tokens),$('#refund').value.trim());const response=validateQuote(await aurora('quote',integrationKey(),{body:req}),req);if(version!==epoch||$('#source').value!==origin.assetId||$('#refund').value.trim()!==req.refundTo)return;const q=response.quote;$('#previewQuote').innerHTML=`<div class="status"><div class="kv"><span>You send approximately</span><strong>${esc(formatAtomic(q.amountIn,origin.decimals))} ${esc(origin.symbol)}</strong></div><div class="kv"><span>On network</span><strong>${esc(origin.blockchain)}</strong></div><div class="kv"><span>Invoice receives</span><strong>${esc(formatAtomic(q.amountOut,6))} USDC</strong></div><div class="kv"><span>Estimated duration</span><strong>${esc(q.timeEstimate)} sec</strong></div><p>Final deposit instructions will use a fresh quote. Amounts can change. Wallet gas is additional.</p></div><button class="primary full" id="prepare">Prepare payment instructions</button>`;$('#prepare').onclick=()=>prepare(inv,origin,req.refundTo);}catch(e){if(version===epoch)error(e.message);}finally{if(version===epoch)b.disabled=false;}};['source','refund'].forEach(id=>$('#'+id).addEventListener('input',()=>{$('#previewQuote').innerHTML='';}));}
async function loadTokens(){if(!tokens.length){const response=await aurora('tokens',integrationKey());if(!Array.isArray(response.tokens))throw Error('Token service response is invalid.');tokens=response.tokens;}return tokens;}
async function prepare(inv,origin,refundTo){const version=epoch;const button=$('#prepare');button.disabled=true;try{const req=quoteRequest(inv,origin,destinationToken(tokens),refundTo,{dry:false});const q=validateQuote(await aurora('quote',integrationKey(),{body:req}),req);if(version!==epoch||$('#source').value!==origin.assetId||$('#refund').value.trim()!==refundTo)return;if(!sourceAddress(origin.blockchain,q.quote.depositAddress))throw Error('Aurora did not return an address on the selected source network.');request=req;quote=q;receipt=null;chainProof=null;verifyMessage='';persistSession();render();}catch(e){if(version===epoch){error(e.message);button.disabled=false;}}}
function persistSession(){const s=read('solsettle.sessions',{}),old=s[current.id];const same=old?.quote?.quote?.depositAddress===quote?.quote?.depositAddress;s[current.id]={invoice:current,request,quote,receipt,chainProof,depositLocked:Boolean((same && old.depositLocked) || (receipt && receipt.status !== 'PENDING_DEPOSIT')),origin:tokens.find(t=>t.assetId===request.originAsset)||(same?old?.origin:null),key:same?old.key:integrationKey()};localStorage.setItem('solsettle.sessions',JSON.stringify(s));}
function depositPanel() {
  const q = quote.quote;
  const expiry = depositDeadline(q);
  const state = receipt ? reconcile(receipt, request, q.depositAddress, chainProof) :
    {state:'PENDING_DEPOSIT', title:'Awaiting payment', paid:false};
  const session = read('solsettle.sessions', {})[current.id];
  
  const origin = tokens.find(token => token.assetId === request.originAsset) || session?.origin;
  const validSource = origin?.assetId === request.originAsset && Number.isInteger(origin.decimals) && origin.decimals >= 0 &&
    origin.decimals <= 30 && sourceAddress(origin.blockchain, q.depositAddress);
  const canDeposit = validSource && !session?.depositLocked && canShowDeposit(state.state, q);
  const asset = esc(origin?.symbol || request.originAsset);
  const messages = {
    PENDING_DEPOSIT: canDeposit ? 'Send once from your wallet on the selected source network.' : 'Deposit instructions are closed. Track this attempt and any funds already sent.',
    KNOWN_DEPOSIT_TX:'Your deposit has been detected. Refresh to follow settlement.',
    PROCESSING:'Aurora is routing the existing deposit. Follow this attempt here.',
    INCOMPLETE_DEPOSIT:'Aurora reports an incomplete deposit. Keep this attempt open and track the outcome.',
    REFUNDED:'Aurora reports a return to the source refund wallet. The invoice remains unpaid.',
    REFUND_REVIEW:'Aurora reported a refund, but the returned amount is missing. Keep the payment record.',
    FAILED:'The provider reported a failure. Review the deposit and refund evidence before another payment.',
    CHAIN_CHECK_REQUIRED:'Aurora reported success. A finalized destination credit is still required.',
    UNVERIFIED:'The available evidence does not establish payment of this invoice.',
    SUCCESS:'The provider route and finalized Solana USDC credit match this invoice.'
  };
  const details = receipt?.swapDetails || {};
  $('#paymentBody').innerHTML = `<div class="status"><span class="pill ${state.paid?'green':'amber'}">${esc(state.title)}</span>
    <p>${esc(messages[state.state] || messages.UNVERIFIED)}</p></div>
    ${canDeposit ? `<div class="kv"><span>Send exactly</span><strong>${esc(formatAtomic(q.amountIn,origin.decimals))} ${asset}</strong></div>
      <div class="kv"><span>Source network</span><strong>${esc(origin?.blockchain || request.originAsset)}</strong></div>
      <div class="kv"><span>Deposit before</span><strong>${esc(new Date(expiry).toLocaleString())}</strong></div>
      <div class="field"><label>Deposit address</label><div class="address">${esc(q.depositAddress)}</div>
      <button class="quiet" id="copyDeposit">Copy deposit address</button></div>
      ${q.depositMemo ? '<div class="error">Required memo: '+esc(q.depositMemo)+'</div>' : ''}
      <p class="help">Review the network, token, amount and gas in your wallet before signing.</p>` : ''}
    <div class="kv"><span>Source refund wallet</span></div><div class="address">${esc(request.refundTo)}</div>
    ${state.state === 'REFUNDED' ? '<div class="status"><strong>Provider-reported refund</strong><p>'+esc(details.refundedAmountFormatted || details.refundedAmount)+' '+(details.refundedAmountFormatted?asset:'atomic source units')+'</p>'+esc(details.refundReason || 'Reason not supplied')+'</div>' : ''}
    <div id="chainEvidence" aria-live="polite"></div>
    ${verifyMessage ? '<p class="help">'+esc(verifyMessage)+'</p>' : ''}
    <button class="primary full" id="refresh">Refresh payment status</button>
    <div class="actions"><button class="quiet" id="exportSession">Export payment record</button>
    ${state.state === 'REFUNDED' ? '<button class="quiet" id="retryRefund">Archive refund &amp; request a fresh quote</button>' : ''}</div>
    <p class="help">Your wallet signs the transfer. Refreshing only reads Aurora and Solana. If money has already moved, track the original attempt.</p>`;
  if (chainProof) renderCredit(chainProof, $('#chainEvidence'));
  if (canDeposit) $('#copyDeposit').onclick = async () => {
    if (!canShowDeposit(state.state, q)) { depositPanel(); return; }
    try { await navigator.clipboard.writeText(q.depositAddress); toast('Deposit address copied. Check the network.'); }
    catch { error('Copy the deposit address manually.'); }
  };
  $('#retryRefund')?.addEventListener('click', () => {
    const sessions = read('solsettle.sessions', {});
    const history = read('solsettle.attempts', {});
    const previous = sessions[current.id];
    if (!previous || reconcile(previous.receipt, previous.request, previous.quote?.quote?.depositAddress).state !== 'REFUNDED') return;
    history[current.id] = [...(history[current.id] || []), previous];
    localStorage.setItem('solsettle.attempts', JSON.stringify(history));
    delete sessions[current.id];
    localStorage.setItem('solsettle.sessions', JSON.stringify(sessions));
    request = quote = receipt = chainProof = null; verifyMessage = ''; render();
  });
  $('#refresh').onclick = refresh;
  $('#exportSession').onclick = () => download(current.id+'-payment.json', {
    invoice:current,request,quote,receipt,chainProof,checkedState:state.state,
    verification:'Aurora quote/status plus finalized Solana USDC credit when chainProof is present.'
  });
}

async function refresh() {
  const version = epoch;
  const button = $('#refresh');
  button.disabled = true;
  $('#actionError').replaceChildren();
  try {
    const session = read('solsettle.sessions', {})[current.id];
    const deposit = quote.quote.depositAddress;
    const params = new URLSearchParams({depositAddress:deposit});
    if (quote.quote.depositMemo) params.set('depositMemo',quote.quote.depositMemo);
    const data = await aurora('status',session?.key || integrationKey(),{query:'?'+params});
    if (version !== epoch) return;
    receipt = data;
    chainProof = null;
    verifyMessage = '';
    if (reconcile(data,request,deposit).state === 'CHAIN_CHECK_REQUIRED') {
      try {
        const hashes = data.swapDetails.destinationChainTxHashes.map(tx => tx.hash);
        const verified = await verifyCredits(current.recipient, units(current.amount), hashes);
        if (version !== epoch) return;
        const duplicate = records.some(row => row.invoice.id !== current.id && row.paid &&
          row.chainProof?.transactions?.some(tx => hashes.includes(tx.signature)));
        if (duplicate) throw Error('A transaction already belongs to another settled invoice in this workspace.');
        chainProof = verified;
      } catch (e) {
        if (version !== epoch) return;
        verifyMessage = e.message;
      }
    }
    const state = reconcile(data,request,deposit,chainProof);
    const local = records.find(row => row.invoice.id === current.id && JSON.stringify(row.invoice) === JSON.stringify(current));
    if (local && state.paid) {
      local.paid = true; local.needsRecheck = false; local.receipt = data; local.chainProof = chainProof; save();
    }
    persistSession();
    depositPanel();
  } catch (e) { if (version === epoch) { error(e.message); button.disabled = false; } }
}
function sampleCheckout(){let step=0;const scenarios=[['Ready to preview','Choose a source asset to see the sample journey.'],['Quote previewed','Illustrative only: '+money(Number(current.amount)+0.8)+' USDC on Base → '+money(current.amount)+' USDC on Solana.'],['Deposit detected','Sample status: the source-chain deposit has been seen.'],['Settlement in progress','Sample status: Aurora routes the payment to Solana.'],['Settled on Solana','Sample success. In live mode, matching settlement data and a destination transaction are required.']];function draw(){const [title,body]=scenarios[step];$('#paymentBody').innerHTML=`<div class="field"><label for="sampleSource">Pay with</label><select id="sampleSource" disabled><option>USDC · Base</option></select></div><div class="status"><span class="pill ${step===4?'green':'amber'}">${title} · SAMPLE</span><p>${body}</p></div><ul class="timeline">${scenarios.slice(1,step+1).map(([t,b])=>`<li>${t}<small>${b}</small></li>`).join('')}</ul><button class="primary full" id="sampleNext">${step===4?'Restart sample':'Continue sample →'}</button><button class="quiet full" id="sampleRefund">Explore refund case</button><p class="help">No live quote, payment address or transaction is generated in sample mode.</p>`;$('#sampleNext').onclick=()=>{step=(step+1)%5;draw();};$('#sampleRefund').onclick=()=>{
  const req=quoteRequest(current,{assetId:'example:base-usdc',blockchain:'base'},
    {blockchain:'sol',symbol:'USDC',decimals:6,contractAddress:USDC_MINT,assetId:'example:sol-usdc'},
    '0x1234567890abcdef1234567890abcdef12345678',{dry:false,now:Date.parse('2026-10-23T12:00:00Z')});
  const deposit='SAMPLE-NO-PAYMENT-ADDRESS';
  const q={quoteRequest:req,quote:{depositAddress:deposit,deadline:req.deadline,amountIn:req.amount,amountOut:req.amount}};
  const deposited=BigInt(req.amount)-1000000n;
  const returned=deposited-50000n;
  const record={status:'REFUNDED',quoteResponse:q,swapDetails:{depositedAmount:deposited.toString(),refundedAmount:returned.toString(),refundReason:'Deposit below the required minimum'}};
  const outcome=reconcile(record,req,deposit);
  $('#paymentBody').innerHTML=`<div class="eyebrow">SIMULATED PROVIDER RECORD</div><div class="status"><span class="pill amber">Refunded · SAMPLE</span>
    <h3>Underfunded deposit returned</h3><p>The same reconciliation rules used by live checkout processed this fictional refund record.</p>
    <div class="kv"><span>Source deposit · Base</span><strong>${formatUsdc(deposited)} USDC</strong></div>
    <div class="kv"><span>Returned to refund wallet</span><strong>${formatUsdc(returned)} USDC</strong></div>
    <div class="kv"><span>Invoice credit · Solana</span><strong>${outcome.paid?'Unexpected state':'0 USDC · unpaid'}</strong></div></div>
    <p class="help">Illustrative amounts. The deposit window is closed. No funds moved and no transaction hash was generated.</p>
    <button class="quiet full" id="sampleReset">Restart sample</button>`;
  $('#sampleReset').onclick=()=>{step=0;draw();};
};}draw();}
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;render();});$('#sample').onclick=()=>{sample=!sample;view='invoices';render();};$('.close').onclick=()=>$('#modal').close();
function route(){const hash=location.hash;if(hash==='#receipt'){view='proof';sample=false;}else if(hash==='#sample'){view='invoices';sample=true;}else if(hash.startsWith('#invoice=')){try{current=decodeInvoice(hash.slice(9));sample=false;view='checkout';quote=request=receipt=chainProof=null;verifyMessage='';}catch(e){toast(e.message);view='invoices';}}render();}window.addEventListener('hashchange',route);route();
