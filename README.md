# SolSettle

An invoice-first cross-chain checkout: a freelancer requests a fixed amount of USDC on Solana, while their client chooses a supported asset on another network. Built for the Encode Solana Hackathon 2026, Aurora Intents track.

## Current status — 23 October 2026

Working browser-local MVP. Invoice creation, share links, a separately labelled sample journey, Aurora REST adapters, payment-session recovery and receipt export are implemented. Fourteen automated tests pass. **A live Aurora key and real settlement evidence are not yet configured/verified. This is not a completed live-payment demonstration.**

## Run

Requires Node.js 20+; no package installation is needed.

```
node server.mjs
node --test tests/core.test.mjs
```

Open http://127.0.0.1:4187/. Choose Try sample for an explicitly simulated walkthrough. Create an invoice for a real receiving wallet to exercise live mode. Never send money to sample addresses.

## Integration

1. Sign in at https://studio.aurora.dev/ and obtain your public integration key.
2. Save it under Settings. The key and invoices remain in browser localStorage.
3. Test connection. The app discovers tokens through `GET https://intents-api.aurora.dev/api/tokens/{apiKey}` and selects canonical Solana USDC by chain, mint, symbol and decimals.
4. Create an invoice and enter a refund wallet on the source chain.
5. Preview a dry `EXACT_OUTPUT` quote. Prepare a fresh live quote only after reviewing it. This creates instructions, not a transfer.
6. The human pays from their wallet. The app does not sign or broadcast financial transactions.
7. Refresh status through `GET /api/status/{apiKey}?depositAddress=...`. Paid requires SUCCESS, matching quote parameters, the same deposit address, sufficient settled amount and at least one destination transaction reference.
8. Export the payment record. Check the explorer independently.

## Architecture

- `dist/core.js`: integer money conversion, address checks, invoice validation, Aurora client, quote binding and settlement reconciliation.
- `dist/app.js`: client-side invoice workspace, quote preview, deposit instructions, session persistence and record export.
- `dist/style.css`: responsive application design.
- `tests/core.test.mjs`: money, recipient/refund binding, unsupported routes, expiry, insufficient funds, refund states and unsafe external links.

## Scope and trust

- Browser-local storage, no shared ledger or backend reconciliation. Different browsers do not automatically synchronize paid status.
- Invoice links encode their contents in a URL fragment. They are **not signed** and do not authenticate the merchant. Confirm receiving addresses out of band.
- Provider-reported settlement is not independent chain verification. The app exposes destination transaction links and raw records, and never invents a transaction hash.
- Source networks currently limited to Ethereum, Base, Arbitrum, Optimism, BNB Chain, Avalanche, Polygon and Solana; available tokens come from Aurora. Memo chains are intentionally excluded.
- A quote's deposit window can expire before settlement or refund completes; polling remains available afterwards. Do not issue another payment while an old one is unresolved.
- Mainnet funds and gas are real. The app itself has no custody, signing keys, auto-pay function or fee surcharge. Aurora and network fees still apply.
- Demo/sample states never contribute to live invoices or live settlement totals.
- Production follow-up: shared project key, signed invoices, durable server ledger, replay-safe settlement reconciliation, independent Solana transaction validation, accessibility audit and support workflow.

## AI disclosure

This new implementation was developed with AI assistance. No existing hackathon project source was copied into it. The human entrant owns the product decisions, deployment review and live wallet authorization. Live verification limits are stated above.

## Official references

- Competition: https://www.encodeclub.com/programmes/solana-hackathon-2026
- Aurora keys/fees: https://docs.intents.aurora.dev/getting-started/api-keys-and-fees
- Tokens: https://docs.intents.aurora.dev/api-reference/swap-api-reference/get-supported-tokens
- Quote schema: https://docs.intents.aurora.dev/api-reference/swap-api-reference/request-a-quote
- Status schema: https://docs.intents.aurora.dev/api-reference/swap-api-reference/get-swap-status
