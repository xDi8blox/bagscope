import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Area, Donut, PALETTE } from './components/Charts'
import { demo, load } from './lib/portfolio'
import type { Chain, Holding, Portfolio } from './lib/types'
import { CHAIN_META } from './lib/types'
import { ago, num, pct, price, short, usd } from './lib/util'
import { useWatch, watch } from './lib/watch'

const EXAMPLES = [
  { q: 'vitalik.eth', tag: 'ENS · Ethereum', note: 'Vitalik Buterin' },
  { q: 'toly.sol', tag: 'SNS · Solana', note: 'Anatoly Yakovenko' },
  { q: '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', tag: 'Solana whale', note: 'Binance hot wallet' },
  { q: '0xF977814e90dA44bFA03b6295A0616a897441aceC', tag: 'EVM whale', note: 'Binance 8 · ETH/BSC/Base' },
]
const pnl24 = (h: Holding) => (h.value != null && h.change24h != null ? h.value - h.value / (1 + h.change24h / 100) : undefined)
const setUrl = (q?: string) => { const u = new URL(location.href); if (q) u.searchParams.set('address', q); else u.searchParams.delete('address'); history.replaceState(null, '', u) }

function Logo({ s = 30 }: { s?: number }) { return <img src={`${import.meta.env.BASE_URL}logo.svg`} width={s} height={s} alt="" /> }
function TokenIcon({ h }: { h: Holding }) {
  const [err, setErr] = useState(false)
  return h.logo && !err ? <img className="tok" src={h.logo} alt="" loading="lazy" onError={() => setErr(true)} /> : <span className="tok gen" style={{ background: `hsl(${[...h.symbol].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360} 60% 35%)` }}>{h.symbol.slice(0, 2)}</span>
}
const ChainDot = ({ c }: { c: Chain }) => <span className="chain" style={{ '--c': CHAIN_META[c].color } as React.CSSProperties}>{CHAIN_META[c].name}</span>
function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  return <button className="ghost sm" onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1200) }}>{ok ? '✓ Copied' : label}</button>
}

export default function App() {
  const [q, setQ] = useState(new URLSearchParams(location.search).get('address') ?? '')
  const [p, setP] = useState<Portfolio | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dust, setDust] = useState(false)
  const [chain, setChain] = useState<Chain | 'all'>('all')
  const input = useRef<HTMLInputElement>(null)
  const watched = useWatch()

  const run = useCallback(async (v: string) => {
    v = v.trim(); if (!v) return
    setQ(v); setBusy(true); setErr(''); setUrl(v); setChain('all')
    try {
      const r = v === 'demo' ? demo() : await load(v)
      setP(r); watch.update(r.address, r.holdings.reduce((s, h) => s + (h.value ?? 0), 0))
    } catch (e) { setErr((e as Error).message); setP(null) } finally { setBusy(false) }
  }, [])
  useEffect(() => { if (q) run(q) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === '/' && document.activeElement !== input.current) { e.preventDefault(); input.current?.focus() } }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [])

  const view = useMemo(() => {
    if (!p) return null
    const all = p.holdings.filter((h) => chain === 'all' || h.chain === chain).sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
    const priced = all.filter((h) => (h.value ?? 0) >= 1)
    const rows = dust ? all : priced
    const total = priced.reduce((s, h) => s + (h.value ?? 0), 0)
    const ch = priced.reduce((s, h) => s + (pnl24(h) ?? 0), 0)
    const top = priced.slice(0, 7).map((h) => ({ label: h.symbol, value: h.value ?? 0 }))
    const rest = total - top.reduce((s, x) => s + x.value, 0)
    if (rest > total * 0.005) top.push({ label: 'Other', value: rest })
    const chains = [...new Set(p.holdings.map((h) => h.chain))]
    return { rows, total, ch, top, hidden: all.length - priced.length, chains }
  }, [p, dust, chain])

  return (
    <div className="app">
      <header className="bar">
        <a className="brand" href="./" onClick={(e) => { e.preventDefault(); setP(null); setQ(''); setUrl() }}><Logo /><span>Bag<b>scope</b></span></a>
        <form className="search" onSubmit={(e) => { e.preventDefault(); run(q) }} role="search">
          <span aria-hidden>⌕</span>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Solana / EVM address, ENS or .sol…" aria-label="Wallet address or name" spellCheck={false} autoComplete="off" />
          <kbd>/</kbd>
          <button className="primary" disabled={busy}>{busy ? 'Scoping…' : 'Scope'}</button>
        </form>
      </header>
      {!!watched.length && (
        <nav className="watchbar" aria-label="Watched wallets">
          <span className="dim">★ Watching</span>
          {watched.map((w) => <button key={w.address} className={`wchip ${p?.address === w.address ? 'on' : ''}`} onClick={() => run(w.input)}><b>{w.label ?? short(w.address)}</b>{w.total != null && <small>{usd(w.total, true)}</small>}</button>)}
        </nav>
      )}

      {err && <div className="alert" role="alert">⚠ {err}</div>}
      {!p && !busy && <Landing onPick={run} />}
      {busy && !p && <Skeleton />}

      {p && view && (
        <main className={`dash ${busy ? 'busy' : ''}`}>
          {p.source !== 'live' && <div className={`alert ${p.source}`}>{p.source === 'demo' ? '◆ Demo mode · ' : '◐ Partial data · '}{p.warnings.slice(0, 3).join(' · ')}</div>}
          <section className="hero card">
            <div>
              <div className="who">
                <span className="avatar" style={{ background: `conic-gradient(from ${parseInt(p.address.slice(-6), 36) % 360}deg, #3cff9e, #14c9ff, #9d7bff, #3cff9e)` }} />
                <div><h1>{p.label ?? short(p.address, 6)}</h1><code title={p.address}>{short(p.address, 8)}</code></div>
              </div>
              <div className="total"><span className="dim">Net worth{chain !== 'all' ? ` · ${CHAIN_META[chain].name}` : ''}</span><b>{usd(view.total)}</b>
                <span className={view.ch >= 0 ? 'up' : 'down'}>{view.ch >= 0 ? '▲' : '▼'} {usd(Math.abs(view.ch))} ({pct(view.total ? (view.ch / (view.total - view.ch)) * 100 : 0)}) 24h</span></div>
            </div>
            <div className="hero-actions">
              <button className={`ghost ${watch.has(p.address) ? 'on' : ''}`} onClick={() => watch.toggle({ input: p.input, label: p.label, address: p.address, total: view.total, at: Date.now() })}>{watch.has(p.address) ? '★ Watching' : '☆ Watch'}</button>
              <Copy text={p.address} label="⧉ Address" />
              <Copy text={location.href} label="↗ Share" />
              <a className="ghost" href={p.kind === 'solana' ? `https://solscan.io/account/${p.address}` : `https://etherscan.io/address/${p.address}`} target="_blank" rel="noreferrer">Explorer ↗</a>
              <a className="ghost" href={p.kind === 'solana' ? `https://gmgn.ai/sol/address/${p.address}` : `https://debank.com/profile/${p.address}`} target="_blank" rel="noreferrer">{p.kind === 'solana' ? 'GMGN ↗' : 'DeBank ↗'}</a>
              <button className="ghost" onClick={() => run(p.input)} disabled={busy} title="Refresh">↻</button>
            </div>
            {view.chains.length > 1 && <div className="chips">{(['all', ...view.chains] as const).map((c) => <button key={c} className={chain === c ? 'on' : ''} onClick={() => setChain(c)}>{c === 'all' ? 'All chains' : CHAIN_META[c].name}</button>)}</div>}
          </section>

          <section className="card alloc"><h2>Allocation</h2>
            {view.top.length ? <div className="alloc-body"><Donut items={view.top} total={view.total} />
              <ul className="legend">{view.top.map((t, i) => <li key={t.label}><i style={{ background: PALETTE[i % PALETTE.length] }} /><span>{t.label}</span><b>{((t.value / view.total) * 100).toFixed(1)}%</b></li>)}</ul></div> : <p className="dim">No priced holdings.</p>}
          </section>
          <section className="card hist"><h2>Value history <small className="dim">{p.source === 'demo' ? 'demo' : p.kind === 'evm' ? 'native balance · at current price' : ''}</small></h2>
            {p.history.length > 1 ? <Area data={p.history} /> : <p className="dim empty-note">History needs an indexer. Blockscout covers ETH & Base native balances; Solana history isn't exposed by keyless APIs.</p>}
          </section>

          <section className="card holdings"><h2>Holdings <small className="dim">{view.rows.length}</small>
            <label className="toggle"><input type="checkbox" checked={dust} onChange={(e) => setDust(e.target.checked)} /> Show dust & unpriced ({view.hidden})</label></h2>
            <div className="table" role="table">
              <div className="tr th" role="row"><span>Token</span><span>Price</span><span>24h</span><span>Balance</span><span>Value</span><span title="Estimated from 24h price change">24h PnL est.</span></div>
              {view.rows.map((h) => { const pl = pnl24(h); return (
                <a className="tr" role="row" key={h.chain + h.id} href={h.explorer} target="_blank" rel="noreferrer">
                  <span className="tcell"><TokenIcon h={h} /><span><b>{h.symbol}</b><small>{h.name} {view.chains.length > 1 && <ChainDot c={h.chain} />}</small></span></span>
                  <span className="mono">{price(h.price)}</span>
                  <span className={`mono ${(h.change24h ?? 0) >= 0 ? 'up' : 'down'}`}>{pct(h.change24h)}</span>
                  <span className="mono">{num(h.amount)}</span>
                  <span className="mono strong">{usd(h.value)}<i className="bar-fill" style={{ width: `${view.total ? Math.min(100, ((h.value ?? 0) / view.total) * 100) : 0}%` }} /></span>
                  <span className={`mono ${(pl ?? 0) >= 0 ? 'up' : 'down'}`}>{pl == null ? '—' : `${pl >= 0 ? '+' : '−'}${usd(Math.abs(pl))}`}</span>
                </a>) })}
            </div>
          </section>

          <section className="card activity"><h2>Recent activity</h2>
            {p.txs.length ? <ul className="txs">{p.txs.map((t) => (
              <li key={t.chain + t.hash}><span className={`kind ${t.kind}`}>{{ swap: '⇄', send: '↑', receive: '↓', contract: '◇', failed: '✕' }[t.kind]}</span>
                <div><b>{t.kind === 'contract' ? 'Interaction' : t.kind[0].toUpperCase() + t.kind.slice(1)}</b><small>{t.summary}</small></div>
                <a href={t.explorer} target="_blank" rel="noreferrer" className="dim">{t.time ? ago(t.time) : ''} ↗</a></li>))}</ul> : <p className="dim">No recent transactions found.</p>}
          </section>

          {!!p.nfts.length && <section className="card nfts"><h2>NFTs <small className="dim">{p.nfts.length}</small></h2>
            <div className="nft-grid">{p.nfts.map((n, i) => <a key={i} href={n.explorer} target="_blank" rel="noreferrer" className="nft">{n.image ? <img src={n.image.replace('ipfs://', 'https://ipfs.io/ipfs/')} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span className="nft-ph">◆</span>}<b>{n.name}</b><small>{n.collection}</small></a>)}</div></section>}
          <footer className="foot dim">Data: Solana RPC · Jupiter · DexScreener · Blockscout · CoinGecko · publicnode. Updated {new Date(p.fetchedAt).toLocaleTimeString()}. Not financial advice. PnL is an estimate from 24h price change.</footer>
        </main>
      )}
    </div>
  )
}

function Landing({ onPick }: { onPick: (q: string) => void }) {
  return (
    <main className="landing">
      <div className="glow" aria-hidden />
      <span className="pill">Solana · Ethereum · Base · BNB Chain</span>
      <h1>Scope any bag.<br /><em>Instantly.</em></h1>
      <p className="dim">Paste a wallet, ENS or .sol name. Holdings, prices, allocation, swaps, PnL and NFTs, with no keys and no sign-up.</p>
      <div className="examples">
        {EXAMPLES.map((e) => <button key={e.q} className="ex card" onClick={() => onPick(e.q)}><small>{e.tag}</small><b>{e.q.length > 20 ? short(e.q, 6) : e.q}</b><span className="dim">{e.note}</span></button>)}
        <button className="ex card" onClick={() => onPick('demo')}><small>Offline</small><b>Demo degen</b><span className="dim">Sample Solana memecoin bag</span></button>
      </div>
    </main>
  )
}
const Skeleton = () => <main className="dash">{[0, 1, 2, 3].map((i) => <div key={i} className={`card sk sk${i}`} />)}</main>
