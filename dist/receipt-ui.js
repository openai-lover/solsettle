import { units, solAddress } from './core.js';
import { isSignature, verifyCredits, formatUsdc } from './solana-proof.js';

function row(label, value) {
  const line = document.createElement('div');
  line.className = 'proof-row';
  const name = document.createElement('span');
  const data = document.createElement('strong');
  name.textContent = label;
  data.textContent = value;
  line.append(name, data);
  return line;
}

export function renderCredit(result, host) {
  host.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = result.sufficient ? 'Finalized USDC credit verified' : 'Credit below the required amount';
  host.append(title, row('Expected', formatUsdc(result.expectedAtomic) + ' USDC'),
    row('Verified credit', formatUsdc(result.creditedAtomic) + ' USDC'),
    row('Mint', result.mint), row('Receiving wallet', result.recipient));
  for (const tx of result.transactions) {
    const link = document.createElement('a');
    link.className = 'external';
    link.href = tx.explorer;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Inspect finalized transaction · slot ' + tx.slot.toLocaleString('en-US') + ' ↗';
    host.append(link);
  }
  const time = document.createElement('p');
  time.className = 'help';
  time.textContent = 'Checked ' + new Date(result.checkedAt).toLocaleString() + ' · Solana mainnet';
  host.append(time);
}

export function mountReceiptCheck(main) {
  main.innerHTML = `<div class="eyebrow">SOLSETTLE / RECEIPTS</div><div class="headingrow"><div>
    <h1>Verify a USDC receipt</h1><p class="sub">Check whether a finalized Solana transaction credited the expected wallet.</p></div></div>
    <div class="receipt-layout"><section class="card"><h2>Destination evidence</h2>
    <p class="sub">Enter a transaction from a payment record, or inspect an existing public transfer.</p>
    <button class="quiet" id="reference">Load public reference</button>
    <form id="receiptForm"><div class="field"><label for="proofSig">Solana transaction signature</label><input id="proofSig" required autocomplete="off" spellcheck="false"></div>
    <div class="field"><label for="proofOwner">Expected receiving wallet</label><input id="proofOwner" required autocomplete="off" spellcheck="false"></div>
    <div class="field"><label for="proofAmount">Expected amount · USDC</label><input id="proofAmount" required inputmode="decimal" placeholder="0.00"></div>
    <button class="primary" id="checkProof">Verify on Solana ↗</button></form></section>
    <section class="card proof-sheet" aria-live="polite"><div class="eyebrow">FINALIZED ON-CHAIN DATA</div>
    <div id="proofResult"><h3>Waiting for a receipt</h3><p>The check matches the signature, successful execution, canonical USDC mint, receiving owner and net token balance increase.</p></div>
    <p id="proofScope" class="help">This independent check inspects the destination transfer. Payment reconciliation also checks the original Aurora quote.</p></section></div>`;
  const form = main.querySelector('#receiptForm');
  const result = main.querySelector('#proofResult');
  const scope = main.querySelector('#proofScope');
  const sig = main.querySelector('#proofSig');
  const owner = main.querySelector('#proofOwner');
  const amount = main.querySelector('#proofAmount');
  let revision = 0;
  const reset = () => { revision++; result.textContent = 'Review the inputs, then verify against the Solana node.'; };
  form.oninput = reset;
  main.querySelector('#reference').onclick = async () => {
    const version = ++revision;
    try {
      const response = await fetch('./reference-transfer.json', { credentials: 'omit' });
      if (!response.ok) throw Error('Reference unavailable.');
      const ref = await response.json();
      if (version !== revision) return;
      sig.value = ref.signature; owner.value = ref.recipient; amount.value = ref.amount;
      result.textContent = 'Public reference loaded. Run the check to retrieve finalized evidence.';
      scope.textContent = 'Reference provenance: an existing public USDC transfer, independent of any SolSettle invoice. It demonstrates destination validation only.';
    } catch (e) { if (version === revision) result.textContent = e.message; }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const version = ++revision;
    const button = main.querySelector('#checkProof');
    try {
      const signature = sig.value.trim(), recipient = owner.value.trim();
      if (!isSignature(signature) || !solAddress(recipient)) throw Error('Check the signature and public wallet address.');
      const expected = units(amount.value);
      button.disabled = true;
      result.textContent = 'Reading finalized Solana transaction and token balance changes…';
      const proof = await verifyCredits(recipient, expected, [signature]);
      if (version === revision) renderCredit(proof, result);
    } catch (e) {
      if (version === revision) result.textContent = 'Could not verify this credit. ' + e.message;
    } finally { button.disabled = false; }
  };
}
