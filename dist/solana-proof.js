import { USDC_MINT, solAddress } from './core.js';

export const SOLANA_RPC = '/api/solana';
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function isSignature(value) {
  if (typeof value !== 'string' || value.length < 64 || value.length > 88 || /^1+$/.test(value)) return false;
  let n = 0n;
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return false;
    n = n * 58n + BigInt(digit);
  }
  let bytes = (value.match(/^1*/)?.[0] || '').length;
  for (; n > 0n; n >>= 8n) bytes++;
  return bytes === 64;
}

export function formatUsdc(atomic) {
  const n = BigInt(atomic);
  const sign = n < 0n ? '-' : '';
  const magnitude = n < 0n ? -n : n;
  const fraction = (magnitude % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return sign + (magnitude / 1000000n).toString() + (fraction ? '.' + fraction : '');
}

export async function rpc(method, params) {
  const response = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(40000),
    credentials: 'omit',
    referrerPolicy: 'no-referrer'
  });
  if (!response.ok) throw Error('Solana RPC is unavailable (' + response.status + '). Retry the evidence check.');
  const body = await response.json();
  if (body.error) throw Error('The Solana node could not return final transaction data. Try again later.');
  return body.result;
}

function tokenAccounts(rows, keys) {
  if (!Array.isArray(rows)) throw Error('The node did not return complete token balance metadata.');
  const accounts = new Map();
  for (const row of rows) {
    if (row.mint !== USDC_MINT) continue;
    const key = keys[row.accountIndex];
    const amount = row.uiTokenAmount?.amount;
    if (!Number.isInteger(row.accountIndex) || !key || !row.owner || accounts.has(key) ||
        row.uiTokenAmount?.decimals !== 6 || !/^\d{1,30}$/.test(amount || '') ||
        (row.programId && row.programId !== TOKEN_PROGRAM)) {
      throw Error('Canonical USDC balance metadata is incomplete or inconsistent.');
    }
    accounts.set(key, { owner: row.owner, amount: BigInt(amount) });
  }
  return accounts;
}

/** Compute only the net USDC increase supported by external SPL transfers into this wallet. */
export function inspectCredit(transaction, signature, recipient) {
  if (!isSignature(signature) || !solAddress(recipient)) throw Error('Invalid signature or Solana receiving wallet.');
  const meta = transaction?.meta;
  const message = transaction?.transaction?.message;
  if (!meta || meta.err !== null || transaction.transaction.signatures?.[0] !== signature ||
      !Number.isSafeInteger(transaction.slot) || transaction.slot <= 0 || !Array.isArray(message?.accountKeys)) {
    throw Error('A successful finalized transaction matching this signature is required.');
  }
  const keys = message.accountKeys.map(entry => typeof entry === 'string' ? entry : entry.pubkey);
  const before = tokenAccounts(meta.preTokenBalances, keys);
  const after = tokenAccounts(meta.postTokenBalances, keys);
  const instructions = [...(message.instructions || []), ...(meta.innerInstructions || []).flatMap(group => group.instructions || [])];
  let incoming = 0n;
  let net = 0n;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const pre = before.get(key);
    const post = after.get(key);
    if (pre?.owner !== recipient && post?.owner !== recipient) continue;
    if (pre && post && pre.owner !== post.owner) throw Error('Token account ownership changed during this transaction.');
    net += (post?.amount || 0n) - (pre?.amount || 0n);
  }
  for (const ix of instructions) {
    if (ix.programId !== TOKEN_PROGRAM || !['transfer', 'transferChecked'].includes(ix.parsed?.type)) continue;
    const info = ix.parsed.info;
    if (after.get(info.destination)?.owner !== recipient || !before.has(info.source) ||
        before.get(info.source).owner === recipient || info.source === info.destination) continue;
    if (ix.parsed.type === 'transferChecked' && (info.mint !== USDC_MINT || info.tokenAmount?.decimals !== 6)) continue;
    const amount = info.tokenAmount?.amount ?? info.amount;
    if (!/^\d{1,30}$/.test(amount || '')) throw Error('The token transfer amount could not be read exactly.');
    incoming += BigInt(amount);
  }
  const supported = incoming === 0n ? 0n : (net < incoming ? net : incoming);
  if (net < 0n) throw Error('A referenced transaction reduced the recipient’s USDC balance.');
  return { signature, slot: transaction.slot, blockTime: transaction.blockTime ?? null,
    recipient, mint: USDC_MINT, creditedAtomic: supported.toString(), netAtomic: net.toString(),
    transferAtomic: incoming.toString(), explorer: 'https://explorer.solana.com/tx/' + signature };
}

export async function verifyCredits(recipient, expectedAtomic, signatures, readRpc = rpc) {
  if (!solAddress(recipient) || !/^[1-9]\d{0,29}$/.test(expectedAtomic) || !Array.isArray(signatures) ||
      signatures.length < 1 || signatures.length > 10 || signatures.some(s => !isSignature(s)) ||
      new Set(signatures).size !== signatures.length) {
    throw Error('Provide a wallet, positive USDC amount and distinct Solana transaction signatures.');
  }
  if (await readRpc('getGenesisHash', []) !== MAINNET_GENESIS) throw Error('The node did not identify Solana mainnet.');
  const transactions = [];
  for (const sig of signatures) {
    const tx = await readRpc('getTransaction', [sig, { commitment: 'finalized', encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]);
    if (!tx) throw Error('The node did not return this finalized transaction. It may be unavailable or outside its retained history. Retry or inspect the explorer; this check has not verified payment.');
    transactions.push(inspectCredit(tx, sig, recipient));
  }
  const sum = transactions.reduce((n, tx) => n + BigInt(tx.creditedAtomic), 0n);
  return { network: 'mainnet-beta', commitment: 'finalized', mint: USDC_MINT, recipient,
    expectedAtomic, creditedAtomic: sum.toString(), sufficient: sum >= BigInt(expectedAtomic),
    checkedAt: new Date().toISOString(), transactions };
}
