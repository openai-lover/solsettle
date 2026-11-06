# SolSettle

SolSettle lets an independent business invoice a fixed amount of native USDC on Solana. The client can choose a supported asset on another chain. The merchant can inspect the destination transaction instead of relying on a screenshot or a transaction hash alone.

[Recheck the funded project payment](https://solsettle-invoices.nununong.chatgpt.site/settlement) · [Hosted workspace](https://solsettle-invoices.nununong.chatgpt.site) · [Receipt verifier](https://solsettle-invoices.nununong.chatgpt.site/#receipt) · [Narrated demo](https://solsettle-invoices.nununong.chatgpt.site/watch.html) · [Slides](https://solsettle-invoices.nununong.chatgpt.site/slides.html)

## What you can reproduce

- **Live Solana read.** Open *Verify a receipt*, load the public reference and verify. The browser reads a finalized mainnet transaction, checks the canonical USDC mint and receiving owner, and verifies 34.842798 USDC of supported net credit. Change the expected amount to 35 USDC and verify again to see the shortfall. The reference is an unrelated public transfer selected from the USDC mint's public history. It is not a SolSettle invoice, Aurora settlement, or revenue. [Inspect the reference transaction](https://explorer.solana.com/tx/4kLHTLY5p4eg4F6jVL648K1JcrHa2qRMbdpRnd741EURRTSYmusWuGvdFnSgXZcmqrzsND7Ddm9WRYqAR4oa4f42).
- **Refund handling.** Open *Try sample*, open the Northstar Studio invoice, then choose *Explore refund case*. A synthetic provider record goes through the same reconciliation function used by checkout. A 249 USDC sample deposit and a 248.95 USDC reported return leave zero invoice credit. No funds move in sample mode.
- **Live Aurora quote.** Open [Live quotes](https://solsettle-invoices.nununong.chatgpt.site/#quote) to request a current Base USDC to Solana USDC exact-output estimate using the dedicated project key. The dry request is bound to synthetic preview addresses and generates no payment instructions. On November 4, 2026 a real API response quoted 0.748838 Base USDC for 0.50 Solana USDC. A later request can return a different price. Payer gas is additional. The Aurora catalogue returned 215 assets and included Base and Solana USDC. It did not list Arc.
- **Funded integration.** The application implements token discovery, exact-output quotes and status reads. A project-originated payment has now been confirmed through Aurora and a finalized Solana USDC credit. A separate Base transfer log confirms a partial source return in the same successful attempt. The independent reference transfer and full-refund sample are separate cases. Open the funded receipt to recheck all three amounts through Aurora, Base and Solana. The walkthrough and slides show this completed case.

## Funded invoice SS-7824D845

On November 4, the payer sent **0.748888 native USDC on Base** to the quoted deposit address. Aurora reported SUCCESS. The merchant received **0.500000 native USDC on Solana**, verified at finalized slot **465313040**. A separate successful Base native-USDC transfer returned **0.000315 USDC** to the specified refund wallet. The invoice remained paid. These are the three observed token transfers. They do not include a claim about all wallet or gas charges.

- [Source deposit](https://basescan.org/tx/0x4deafb688eb0db7033a1c66c42498cca5de73faabb79ddc5c730e8b7138e8353)
- [Finalized destination transaction](https://explorer.solana.com/tx/5ihmVpAbjHJT3mPeLLnAGetPsyJGgetCtDpi1PHP1sS5huQ49ngTNGkUWtMtWoEQwKEiAV65vFGuerA3btwK9uHw)
- [Actual partial source return](https://basescan.org/tx/0x23bb6e6b2d97c5fb37db8c0d319aa55469660798a38f40b73f5cf45ad8d65f3e)

The read-only replay fetches the provider status, checks a fingerprint of the originally issued signed quote and its bound terms, checks the Solana transaction and checks both Base transfer logs. A failed live lookup is explicitly distinguished from the recorded receipt. The public case contains only replay inputs and public transaction references, not private wallet keys, authentication data or a full customer export.

## Run locally

Use Node.js 20 or newer. No build or package installation is needed.

```sh
node server.mjs
node --test tests/*.test.mjs
```

Open http://127.0.0.1:4187/. The hosted video and deck are also included under `dist/media/`. The test suite has 30 passing checks. Payment and refund cases in the suite use fixtures. For the hosted Worker, run `node scripts/build-worker.mjs`; it embeds the 28 public assets and the restricted read-only relay in `dist/server/index.js`.

## Configure Aurora and follow an invoice

1. For a separate deployment, obtain a project-owned public integration key through [Aurora Studio](https://studio.aurora.dev/). An operator can set `PROJECT_PUBLIC_KEY` in `dist/project-config.js` to make it available across the deployment. Alternatively use *Settings* in a single browser. The hosted release uses its own publicly distributable integration identifier. Aurora Studio shows a 0.00% custom fee. Aurora protocol and network fees still apply. Only Aurora's documented public integration identifier belongs here. Do not enter a private key, personal access token or seed phrase.
2. Use *Test connection*. The client discovers supported tokens from Aurora and matches Solana USDC by blockchain, mint address, symbol and six decimals.
3. Create a fixed USDC invoice for a receiving wallet you control. Check the wallet address with the payer out of band. The share link contains the invoice details in its URL fragment and does not authenticate the merchant.
4. Select the source token and a refund wallet on that network. Preview a dry exact-output quote. Preparing instructions requests a fresh non-dry quote and checks the echoed terms. A quote does not transfer funds.
5. Only the owner of the source wallet reviews and signs a transfer. Mainnet funds, network fees and Aurora fees apply. Use the precise source network, asset, amount, destination and any required memo in the fresh instructions.
6. Refresh status. Stop sending once a deposit has been detected or its window has closed. The status lookup remains available after expiry.
7. Settlement needs matching Aurora success, coverage of the requested amount, distinct Solana destination signatures and a fresh independent finalized-chain read. Export the invoice and payment record for your records.
8. A provider-reported refund must match the original request and deposit and include a positive refunded amount. The checkout identifies this as a provider report. For Base USDC the app also reads source-chain transfer logs to check a matching deposit and a reported return. A partial return in a successful payment is shown separately from a full refund. A refunded attempt can be archived before a new quote. Failures and uncertain responses require review.

## Verification boundaries

The browser asks a same-origin read-only relay for the mainnet genesis hash and finalized parsed transaction data. The relay forwards only these two methods to the official Solana mainnet endpoints with an OnFinality fallback, checking each provider's mainnet identity; it accepts no caller-supplied upstream, transaction submission, or weaker commitment. This avoids relying on a browser-accessible node whose historical transaction retention may be short. Upstream failures and null results never mark payment verified. It checks successful execution, signature, token program, canonical mint, token account owner, external transfers and the recipient's net increase using integer atomic units. Credits are capped by both the eligible transfers and the net increase. A changed owner, unavailable node, missing metadata, insufficient amount or duplicate signature cannot produce a newly verified payment. Old provider-only successes need a new check. When Aurora omits a client session ID in its status response, the originally issued quote must match the invoice, the provider signature and timestamp, the deposit address, the input/output amounts and the remaining bound terms. A completed record in this workspace cannot reuse another invoice's recorded signature.

The workspace is local to a browser, with no shared merchant ledger or signed invoice identity. A merchant on a different device can independently check the destination receipt. Browser records and downloadable JSON are not attestations. The verifier depends on the selected RPC service's integrity and availability. A balance change alone does not prove it came through Aurora. SolSettle does not hold keys, connect to an exchange account or sign transfers.

## Implementation

- `dist/core.js` validates invoices, binds quotes, calls Aurora and reconciles provider state.
- `dist/solana-proof.js` validates finalized USDC credits through read-only RPC.
- `dist/base-proof.js` checks matching native USDC transfer logs on Base for the deposit and return.
- `dist/receipt-ui.js` lets reviewers reproduce a destination check without a wallet.
- `dist/app.js` implements invoicing, checkout recovery, deposit visibility, local records and export.
- `tests/` covers exact amounts, expiry, quote/refund binding, failed transactions, insufficient credit, missing evidence, duplicate signatures and newly created token accounts.

## Sources

[Aurora keys and fees](https://docs.intents.aurora.dev/getting-started/api-keys-and-fees.md) · [Supported tokens](https://docs.intents.aurora.dev/api-reference/swap-api-reference/get-supported-tokens.md) · [Quote schema](https://docs.intents.aurora.dev/api-reference/swap-api-reference/request-a-quote.md) · [Swap status](https://docs.intents.aurora.dev/api-reference/swap-api-reference/get-swap-status.md) · [Solana getTransaction](https://solana.com/docs/rpc/http/gettransaction) · [USDC mints](https://developers.circle.com/stablecoins/usdc-contract-addresses) · [Official RPC endpoints](https://solana.com/docs/references/clusters) · [Hackathon track](https://www.encodeclub.com/programmes/solana-hackathon-2026)

New AI-assisted implementation for the Encode Solana Developer Hackathon, Aurora Intents track. The walkthrough uses captured application states and actions, a live independent mainnet read and English synthetic narration.
