export type Chain = 'solana' | 'ethereum' | 'base' | 'bsc'
export interface Holding { chain: Chain; id: string; symbol: string; name: string; logo?: string; amount: number; price?: number; value?: number; change24h?: number; explorer: string; native?: boolean }
export interface Tx { chain: Chain; hash: string; time?: number; kind: 'swap' | 'send' | 'receive' | 'contract' | 'failed'; summary: string; explorer: string }
export interface Nft { chain: Chain; name: string; image?: string; collection: string; explorer: string }
export interface Portfolio {
  input: string; address: string; kind: 'solana' | 'evm'; label?: string
  holdings: Holding[]; txs: Tx[]; nfts: Nft[]; history: { t: number; v: number }[]
  source: 'live' | 'partial' | 'demo'; warnings: string[]; fetchedAt: number
}
export const CHAIN_META: Record<Chain, { name: string; color: string; explorer: string; native: string }> = {
  solana: { name: 'Solana', color: '#9945ff', explorer: 'https://solscan.io', native: 'SOL' },
  ethereum: { name: 'Ethereum', color: '#7d8cff', explorer: 'https://etherscan.io', native: 'ETH' },
  base: { name: 'Base', color: '#2f6bff', explorer: 'https://basescan.org', native: 'ETH' },
  bsc: { name: 'BNB Chain', color: '#f3ba2f', explorer: 'https://bscscan.com', native: 'BNB' },
}
