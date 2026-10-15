export async function jget<T>(url: string, init: RequestInit = {}, ms = 12000): Promise<T> {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, { ...init, signal: c.signal })
    if (!r.ok) throw new Error(`${r.status} ${new URL(url).host}`)
    return (await r.json()) as T
  } finally { clearTimeout(t) }
}
export const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
export const usd = (v?: number, compact = false) => v == null || !isFinite(v) ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: compact && Math.abs(v) >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: compact && Math.abs(v) >= 1e5 ? 2 : Math.abs(v) < 1 ? 4 : 2 }).format(v)
export const price = (v?: number) => {
  if (v == null || !isFinite(v)) return '—'
  if (v >= 1) return usd(v)
  if (v === 0) return '$0'
  const z = Math.floor(-Math.log10(v)) // degen-style subscript zeros: $0.0₅1234
  if (z >= 4) return `$0.0${String(z).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[+d]).join('')}${Math.round(v * 10 ** (z + 4)).toString().slice(0, 4)}`
  return `$${v.toPrecision(4)}`
}
export const num = (v: number) => new Intl.NumberFormat('en-US', { notation: v >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: v < 1 ? 6 : v < 1000 ? 3 : 1 }).format(v)
export const pct = (v?: number) => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`)
export const short = (a: string, n = 4) => (a.length > 2 * n + 3 ? `${a.slice(0, n + (a.startsWith('0x') ? 2 : 0))}…${a.slice(-n)}` : a)
export const ago = (t: number) => { const s = (Date.now() - t) / 1000; return s < 60 ? `${s | 0}s` : s < 3600 ? `${(s / 60) | 0}m` : s < 86400 ? `${(s / 3600) | 0}h` : `${(s / 86400) | 0}d` }
export async function settle<T>(p: Promise<T>, warn: string[], label: string): Promise<T | undefined> {
  try { return await p } catch (e) { warn.push(`${label}: ${(e as Error).message || 'failed'}`); return undefined }
}

/** Route remote images through a public image CDN (uniform sizing, avoids CORP-blocked hosts). */
export const img = (u: string | undefined, w = 64) => !u ? undefined : u.startsWith('data:') ? u : `https://wsrv.nl/?url=${encodeURIComponent(u.replace('ipfs://', 'https://ipfs.io/ipfs/'))}&w=${w}&h=${w}&fit=cover&output=webp`
