import type { Holding, Portfolio, Tx } from './types'
import { chunk, jget, settle } from './util'

const RPC = 'https://api.mainnet-beta.solana.com'
const SOL = 'So11111111111111111111111111111111111111112'
const PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']
const SOLSCAN = 'https://solscan.io'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
let rid = 0
const rpc = <T,>(method: string, params: unknown[]) =>
  jget<{ result: T; error?: { message: string } }>(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }) }, 15000)
    .then((r) => { if (r.error) throw new Error(r.error.message); return r.result })

async function balances(addr: string, warn: string[]): Promise<{ sol: number; tokens: Map<string, number> }> {
  const tokens = new Map<string, number>()
  let solAmt: number | undefined
  // primary: Jupiter Ultra holdings (one keyless call); fallback: public RPC token accounts
  const h = await settle(jget<Any>(`https://lite-api.jup.ag/ultra/v1/holdings/${addr}`, {}, 15000), [], 'holdings')
  if (h) { solAmt = Number(h.uiAmount ?? 0); for (const [mint, accs] of Object.entries<Any[]>(h.tokens ?? {})) { const u = accs.reduce((s, a) => s + Number(a.uiAmount ?? 0), 0); if (u > 0 && mint !== SOL) tokens.set(mint, u) } }
  else {
    const sol = await settle(rpc<{ value: number }>('getBalance', [addr]), warn, 'SOL balance')
    solAmt = sol ? sol.value / 1e9 : undefined
    for (const programId of PROGRAMS) {
      const r = await settle(rpc<{ value: Any[] }>('getTokenAccountsByOwner', [addr, { programId }, { encoding: 'jsonParsed' }]), warn, 'Token accounts')
      for (const a of r?.value ?? []) { const i = a.account.data.parsed.info; const u = Number(i.tokenAmount.uiAmountString ?? i.tokenAmount.uiAmount); if (u > 0) tokens.set(i.mint, (tokens.get(i.mint) ?? 0) + u) }
    }
  }
  if (solAmt == null && !tokens.size) throw new Error('Solana RPC unavailable')
  return { sol: solAmt ?? 0, tokens }
}

export async function solanaPortfolio(addr: string): Promise<Omit<Portfolio, 'input' | 'label'>> {
  const warnings: string[] = []
  const { sol, tokens } = await balances(addr, warnings)
  const mints = [SOL, ...[...tokens.keys()].slice(0, 199)]
  const prices: Record<string, Any> = {}, meta: Record<string, Any> = {}
  await Promise.all([
    ...chunk(mints, 50).map((c) => settle(jget<Record<string, Any>>(`https://lite-api.jup.ag/price/v3?ids=${c.join(',')}`), warnings, 'Prices').then((r) => Object.assign(prices, r ?? {}))),
    ...chunk(mints, 100).map((c) => settle(jget<Any[]>(`https://lite-api.jup.ag/tokens/v2/search?query=${c.join(',')}`), warnings, 'Token metadata').then((r) => r?.forEach((m) => (meta[m.id] = m)))),
  ])
  const mk = (id: string, amount: number, native = false): Holding => {
    const p = prices[id], m = meta[id]
    return { chain: 'solana', id, native, amount, symbol: native ? 'SOL' : m?.symbol ?? id.slice(0, 4), name: native ? 'Solana' : m?.name ?? 'Unknown token', logo: native ? 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' : m?.icon,
      price: p?.usdPrice, value: p?.usdPrice != null ? p.usdPrice * amount : undefined, change24h: p?.priceChange24h ?? m?.stats24h?.priceChange, explorer: native ? `${SOLSCAN}/account/${addr}` : `${SOLSCAN}/token/${id}` }
  }
  const holdings = [mk(SOL, sol, true), ...[...tokens].map(([id, a]) => mk(id, a))]
  const txs = await settle(solTxs(addr, (m) => meta[m]?.symbol), warnings, 'Transactions') ?? []
  return { address: addr, kind: 'solana', holdings, txs, nfts: [], history: [], source: warnings.length ? 'partial' : 'live', warnings, fetchedAt: Date.now() }
}

async function solTxs(addr: string, symOf: (m: string) => string | undefined): Promise<Tx[]> {
  const sigs = await rpc<Any[]>('getSignaturesForAddress', [addr, { limit: 12 }])
  const out: Tx[] = []
  for (const s of sigs.slice(0, 12)) {
    const base = { chain: 'solana' as const, hash: s.signature, time: s.blockTime ? s.blockTime * 1000 : undefined, explorer: `${SOLSCAN}/tx/${s.signature}` }
    if (s.err) { out.push({ ...base, kind: 'failed', summary: 'Failed transaction' }); continue }
    if (out.length >= 8) { out.push({ ...base, kind: 'contract', summary: s.memo ?? 'Transaction' }); continue }
    const t = await settle(rpc<Any>('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]), [], 'tx')
    if (!t) { out.push({ ...base, kind: 'contract', summary: 'Transaction' }); continue }
    const keys: Any[] = t.transaction.message.accountKeys
    const i = keys.findIndex((k) => (k.pubkey ?? k) === addr)
    const deltas: { sym: string; d: number }[] = []
    if (i >= 0) { const d = (t.meta.postBalances[i] - t.meta.preBalances[i]) / 1e9; if (Math.abs(d) > 0.0005) deltas.push({ sym: 'SOL', d }) }
    const tb = (arr: Any[]) => new Map<string, number>(arr.filter((b) => b.owner === addr).map((b) => [b.mint, Number(b.uiTokenAmount.uiAmountString ?? 0)]))
    const pre = tb(t.meta.preTokenBalances ?? []), post = tb(t.meta.postTokenBalances ?? [])
    for (const m of new Set([...pre.keys(), ...post.keys()])) { const d = (post.get(m) ?? 0) - (pre.get(m) ?? 0); if (d) deltas.push({ sym: m === SOL ? 'wSOL' : symOf(m) ?? `${m.slice(0, 4)}…`, d }) }
    const neg = deltas.filter((x) => x.d < 0), pos = deltas.filter((x) => x.d > 0)
    const f = (x: { sym: string; d: number }) => `${Math.abs(x.d).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${x.sym}`
    const kind: Tx['kind'] = neg.length && pos.length ? 'swap' : pos.length ? 'receive' : neg.length ? 'send' : 'contract'
    out.push({ ...base, kind, summary: kind === 'swap' ? `${f(neg[0])} → ${f(pos[0])}` : deltas.length ? deltas.map((x) => (x.d > 0 ? '+' : '−') + f(x)).join(', ') : 'Program interaction' })
  }
  return out
}
