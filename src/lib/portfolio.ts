import { isAddress } from 'viem'
import { normalize } from 'viem/ens'
import { client, evmChain } from './evm'
import type { EvmChain } from './evm'
import { solanaPortfolio } from './solana'
import type { Holding, Portfolio } from './types'
import { jget } from './util'

export const isSol = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)
export async function resolve(input: string): Promise<{ address: string; kind: 'solana' | 'evm'; label?: string }> {
  const q = input.trim()
  if (isAddress(q)) return { address: q, kind: 'evm' }
  if (isSol(q)) return { address: q, kind: 'solana' }
  if (/\.sol$/i.test(q)) {
    const r = await jget<{ s: string; result: string }>(`https://sdk-proxy.sns.id/resolve/${encodeURIComponent(q.replace(/\.sol$/i, '').toLowerCase())}`)
    if (r.s !== 'ok' || !isSol(r.result)) throw new Error(`Couldn't resolve ${q}`)
    return { address: r.result, kind: 'solana', label: q.toLowerCase() }
  }
  if (/\.[a-z]+$/i.test(q)) {
    const a = await client('ethereum').getEnsAddress({ name: normalize(q) })
    if (!a) throw new Error(`Couldn't resolve ${q}`)
    return { address: a, kind: 'evm', label: q.toLowerCase() }
  }
  throw new Error('Enter a Solana or EVM address, or an ENS / SNS name')
}

const CACHE = 'bagscope:cache:'
export async function load(input: string): Promise<Portfolio> {
  const r = await resolve(input)
  try {
    let p: Portfolio
    if (r.kind === 'solana') p = { ...(await solanaPortfolio(r.address)), input, label: r.label }
    else {
      const warnings: string[] = []
      const parts = await Promise.all((['ethereum', 'base', 'bsc'] as EvmChain[]).map((c) => evmChain(c, r.address, warnings)))
      const hist = new Map<number, number>()
      parts.forEach((x) => x.history.forEach((h) => { const d = Math.floor(h.t / 864e5) * 864e5; hist.set(d, (hist.get(d) ?? 0) + h.v) }))
      if (!parts.some((x) => x.holdings.length)) throw new Error(warnings[0] ?? 'No data')
      p = { input, address: r.address, kind: 'evm', label: r.label, holdings: parts.flatMap((x) => x.holdings), txs: parts.flatMap((x) => x.txs).sort((a, b) => (b.time ?? 0) - (a.time ?? 0)).slice(0, 25), nfts: parts.flatMap((x) => x.nfts), history: [...hist].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t), source: warnings.length ? 'partial' : 'live', warnings, fetchedAt: Date.now() }
    }
    try { localStorage.setItem(CACHE + r.address, JSON.stringify({ ...p, txs: p.txs.slice(0, 12), nfts: p.nfts.slice(0, 12) })) } catch { /* quota */ }
    return p
  } catch (e) {
    const c = localStorage.getItem(CACHE + r.address)
    if (c) { const p = JSON.parse(c) as Portfolio; return { ...p, source: 'partial', warnings: [`Live APIs unavailable (${(e as Error).message}); showing snapshot from ${new Date(p.fetchedAt).toLocaleString()}`] } }
    return demo(r.address, r.kind, r.label, (e as Error).message)
  }
}

export function demo(address = 'DemoWa11et1111111111111111111111111111111111', kind: 'solana' | 'evm' = 'solana', label = 'demo.sol', why?: string): Portfolio {
  const L = (m: string) => `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${m}/logo.png`
  const rows: [string, string, number, number, number, string?][] = [
    ['SOL', 'Solana', 1842.5, 162.4, 3.2, L('So11111111111111111111111111111111111111112')], ['JUP', 'Jupiter', 48211, 0.92, -2.4], ['BONK', 'Bonk', 1.8e9, 0.0000231, 8.9],
    ['WIF', 'dogwifhat', 61250, 1.94, 12.7], ['USDC', 'USD Coin', 84120, 1, 0, L('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')], ['POPCAT', 'Popcat', 120400, 0.41, -6.1],
    ['JTO', 'Jito', 9400, 2.31, 1.8], ['MEW', 'cat in a dogs world', 4.2e6, 0.0041, 22.5], ['PYTH', 'Pyth Network', 31000, 0.31, -1.2], ['FARTCOIN', 'Fartcoin', 88000, 0.62, 31.4],
  ]
  const holdings: Holding[] = rows.map(([symbol, name, amount, p, ch, logo], i) => ({ chain: 'solana', id: `demo${i}`, symbol, name, amount, price: p, value: amount * p, change24h: ch, logo, explorer: 'https://solscan.io', native: i === 0 }))
  const total = holdings.reduce((s, h) => s + (h.value ?? 0), 0)
  const now = Date.now()
  return {
    input: label, address, kind, label, holdings, nfts: [], fetchedAt: now, source: 'demo', warnings: [why ? `Live data unavailable (${why}). Showing demo portfolio.` : 'Demo portfolio with illustrative numbers.'],
    history: Array.from({ length: 90 }, (_, i) => ({ t: now - (89 - i) * 864e5, v: total * (0.55 + 0.45 * (i / 89) + 0.08 * Math.sin(i / 6) + 0.04 * Math.sin(i * 1.7)) })),
    txs: [['swap', '12.5 SOL → 1.9M BONK'], ['swap', '4,000 USDC → 2,051 WIF'], ['receive', '+250 JUP'], ['send', '−40 SOL → 7xKX…q2Lp'], ['swap', '0.8 SOL → 88,000 FARTCOIN'], ['failed', 'Failed transaction']].map(([kind, summary], i) => ({ chain: 'solana', hash: `demo${i}`, time: now - i * 3.7e6, kind: kind as 'swap', summary, explorer: 'https://solscan.io' })),
  }
}
