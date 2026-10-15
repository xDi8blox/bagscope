import { useSyncExternalStore } from 'react'
export interface Watched { input: string; label?: string; address: string; total?: number; at: number }
const K = 'bagscope:watch'
let list: Watched[] = JSON.parse(localStorage.getItem(K) || '[]')
const subs = new Set<() => void>()
const save = () => { localStorage.setItem(K, JSON.stringify(list)); subs.forEach((f) => f()) }
export const watch = {
  has: (a: string) => list.some((w) => w.address === a),
  toggle: (w: Watched) => { list = watch.has(w.address) ? list.filter((x) => x.address !== w.address) : [w, ...list]; save() },
  update: (a: string, total: number) => { if (watch.has(a)) { list = list.map((w) => (w.address === a ? { ...w, total, at: Date.now() } : w)); save() } },
}
export const useWatch = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => list)
