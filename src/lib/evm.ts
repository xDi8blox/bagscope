import { createPublicClient, erc20Abi, formatUnits, getAddress, http } from 'viem'
import { base, bsc, mainnet } from 'viem/chains'
import type { Chain, Holding, Nft, Tx } from './types'
import { CHAIN_META } from './types'
import { chunk, jget, settle } from './util'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
export type EvmChain = Exclude<Chain, 'solana'>
export const EVM: Record<EvmChain, { viem: typeof mainnet | typeof base | typeof bsc; rpc: string; scout?: string; dex: string; gecko: string; logo: string }> = {
  ethereum: { viem: mainnet, rpc: 'https://ethereum-rpc.publicnode.com', scout: 'https://eth.blockscout.com', dex: 'ethereum', gecko: 'ethereum', logo: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  base: { viem: base, rpc: 'https://base-rpc.publicnode.com', scout: 'https://base.blockscout.com', dex: 'base', gecko: 'ethereum', logo: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  bsc: { viem: bsc, rpc: 'https://bsc-rpc.publicnode.com', dex: 'bsc', gecko: 'binancecoin', logo: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png' },
}
// Curated majors + memes checked via Multicall3 when no indexer is reachable.
const CURATED: Record<EvmChain, string[]> = {
  ethereum: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0xdac17f958d2ee523a2206206994597c13d831ec7', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', '0x6b175474e89094c44da98b954eedeac495271d0f', '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', '0x6982508145454ce325ddbe47a25d4ec3d2311933', '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', '0x514910771af9ca656af840dff83e8264ecf986ca', '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'],
  base: ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', '0x4200000000000000000000000000000000000006', '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', '0x4ed4e862860bed51a9570b96d89af5e1b0efefed', '0x532f27101965dd16442e59d40670faf5ebb142e4', '0x940181a94a35a4569e4529a3cdfb74e38fd98631', '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b'],
  bsc: ['0x55d398326f99059ff775485246999027b3197955', '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c', '0x2170ed0880ac9a755fd29b2688956bd959f933f8', '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82', '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'],
}
export const client = (c: EvmChain) => createPublicClient({ chain: EVM[c].viem, transport: http(EVM[c].rpc, { timeout: 12000 }) })

let natives: Promise<Record<string, Any>> | undefined
const nativePrices = () => (natives ??= jget<Record<string, Any>>('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin&vs_currencies=usd&include_24hr_change=true').catch(() => ({} as Record<string, Any>)))

/** DexScreener: best-liquidity pair per token → price, 24h change, logo. */
async function dexPrices(c: EvmChain, addrs: string[]) {
  const out: Record<string, { price: number; change?: number; logo?: string; liq: number; symbol?: string; name?: string }> = {}
  for (const part of chunk(addrs, 30)) {
    const pairs = await jget<Any[]>(`https://api.dexscreener.com/tokens/v1/${EVM[c].dex}/${part.join(',')}`).catch(() => [])
    for (const p of pairs) {
      const k = p.baseToken.address.toLowerCase(), liq = p.liquidity?.usd ?? 0
      if (!out[k] || liq > out[k].liq) out[k] = { price: Number(p.priceUsd), change: p.priceChange?.h24, logo: p.info?.imageUrl, liq, symbol: p.baseToken.symbol, name: p.baseToken.name }
    }
  }
  return out
}

export async function evmChain(c: EvmChain, addr: string, warn: string[]): Promise<{ holdings: Holding[]; txs: Tx[]; nfts: Nft[]; history: { t: number; v: number }[] }> {
  const ex = CHAIN_META[c].explorer, cfg = EVM[c]
  const np = (await nativePrices())[cfg.gecko]
  const native = (amount: number): Holding => ({ chain: c, id: 'native', native: true, symbol: CHAIN_META[c].native, name: c === 'bsc' ? 'BNB' : `Ether (${CHAIN_META[c].name})`, logo: cfg.logo, amount, price: np?.usd, value: np?.usd != null ? np.usd * amount : undefined, change24h: np?.usd_24h_change, explorer: `${ex}/address/${addr}` })
  const holdings: Holding[] = []
  let txs: Tx[] = [], nfts: Nft[] = [], history: { t: number; v: number }[] = []
  let indexed = false
  if (cfg.scout) {
    const S = cfg.scout + '/api/v2/addresses/' + addr
    const [info, toks] = await Promise.all([settle(jget<Any>(S), [], ''), settle(jget<Any>(`${S}/tokens?type=ERC-20`, {}, 15000), [], '')])
    if (info && toks) {
      indexed = true
      holdings.push(native(Number(formatUnits(BigInt(info.coin_balance ?? 0), 18))))
      for (const t of toks.items ?? []) {
        const d = Number(t.token.decimals ?? 18), amount = Number(formatUnits(BigInt(t.value ?? 0), d)), p = t.token.exchange_rate ? Number(t.token.exchange_rate) : undefined
        if (amount > 0) holdings.push({ chain: c, id: t.token.address_hash ?? t.token.address, symbol: t.token.symbol ?? '?', name: t.token.name ?? 'Unknown', logo: t.token.icon_url ?? undefined, amount, price: p, value: p != null ? p * amount : undefined, explorer: `${ex}/token/${t.token.address_hash ?? t.token.address}?a=${addr}` })
      }
      const [tx, nf, hist] = await Promise.all([settle(jget<Any>(`${S}/transactions`), [], ''), settle(jget<Any>(`${S}/nft?type=ERC-721,ERC-1155`), [], ''), settle(jget<Any>(`${S}/coin-balance-history-by-day`), [], '')])
      const me = addr.toLowerCase()
      txs = (tx?.items ?? []).slice(0, 15).map((t: Any): Tx => {
        const v = Number(formatUnits(BigInt(t.value ?? 0), 18)), out = t.from?.hash?.toLowerCase() === me, m: string = t.method ?? ''
        const kind: Tx['kind'] = t.status !== 'ok' ? 'failed' : /swap|exactinput|exactoutput|execute|multicall/i.test(m) ? 'swap' : v > 0 ? (out ? 'send' : 'receive') : 'contract'
        return { chain: c, hash: t.hash, time: Date.parse(t.timestamp), kind, explorer: `${ex}/tx/${t.hash}`, summary: `${m || (v ? 'Transfer' : 'Call')}${v ? ` · ${v.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${CHAIN_META[c].native}` : ''}${out ? ` → ${t.to?.ens_domain_name ?? t.to?.name ?? (t.to?.hash ?? '').slice(0, 8)}` : ` ← ${t.from?.ens_domain_name ?? (t.from?.hash ?? '').slice(0, 8)}`}` }
      })
      nfts = (nf?.items ?? []).slice(0, 24).map((n: Any): Nft => ({ chain: c, name: n.metadata?.name ?? `#${String(n.id).slice(0, 10)}`, image: n.image_url ?? n.metadata?.image, collection: n.token?.name ?? 'Collection', explorer: `${ex}/nft/${n.token?.address_hash ?? n.token?.address}/${n.id}` }))
      if (np?.usd) history = (hist?.items ?? []).map((h: Any) => ({ t: Date.parse(h.date), v: Number(formatUnits(BigInt(String(h.value).split('.')[0] || '0'), 18)) * np.usd })).filter((h: { t: number }) => isFinite(h.t)).sort((a: { t: number }, b: { t: number }) => a.t - b.t)
    }
  }
  if (!indexed) { // RPC fallback: native + curated ERC-20s via Multicall3
    const cl = client(c), a = getAddress(addr)
    const bal = await settle(cl.getBalance({ address: a }), warn, `${CHAIN_META[c].name} RPC`)
    if (bal == null) return { holdings, txs, nfts, history }
    holdings.push(native(Number(formatUnits(bal, 18))))
    const tokens = CURATED[c].map((t) => getAddress(t))
    const res = await settle(cl.multicall({ contracts: tokens.flatMap((t) => [{ address: t, abi: erc20Abi, functionName: 'balanceOf', args: [a] }, { address: t, abi: erc20Abi, functionName: 'decimals' }, { address: t, abi: erc20Abi, functionName: 'symbol' }] as const) }), warn, `${CHAIN_META[c].name} multicall`)
    if (res) tokens.forEach((t, i) => {
      const [b, d, s] = res.slice(i * 3, i * 3 + 3)
      if (b.status === 'success' && (b.result as bigint) > 0n) holdings.push({ chain: c, id: t.toLowerCase(), symbol: String(s.result ?? '?'), name: String(s.result ?? '?'), amount: Number(formatUnits(b.result as bigint, Number(d.result ?? 18))), explorer: `${ex}/token/${t}?a=${addr}` })
    })
    warn.push(`${CHAIN_META[c].name}: no keyless indexer reachable, showing native + ${tokens.length} majors only`)
  }
  // enrich with DexScreener (24h change, logos, missing prices) for the most valuable / unpriced tokens
  const erc = holdings.filter((h) => !h.native).sort((x, y) => (y.value ?? 0) - (x.value ?? 0)).slice(0, 60)
  if (erc.length) {
    const dp = await dexPrices(c, erc.map((h) => h.id.toLowerCase()))
    for (const h of erc) {
      const d = dp[h.id.toLowerCase()]; if (!d) continue
      h.change24h = d.change; h.logo ??= d.logo; if (h.price == null && d.liq > 5000) { h.price = d.price; h.value = d.price * h.amount }
      if (h.symbol === h.name && d.name) h.name = d.name
    }
  }
  return { holdings, txs, nfts, history }
}
