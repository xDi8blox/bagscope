import { chromium } from 'playwright'
const base = process.env.URL || 'http://localhost:4330/'
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined })
const errors = []
const only = process.env.ONLY?.split(',')
const shoot = async (file, q, mobile = false, wait = 'section.holdings, .alert') => {
  if (only && !only.includes(file)) return
  const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 1000 } })
  const p = await ctx.newPage()
  p.on('console', (m) => m.type() === 'error' && errors.push(`${file}: ${m.text()}`))
  p.on('pageerror', (e) => errors.push(`${file}: ${e.message}`))
  await p.goto(base + q)
  if (q) await p.waitForSelector(wait, { timeout: 60000 }).catch(() => errors.push(`${file}: timeout`))
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `screenshots/${file}.png`, fullPage: !mobile })
  await ctx.close()
}
await shoot('landing', '')
await shoot('evm-vitalik', '?address=vitalik.eth')
await shoot('solana-toly', '?address=toly.sol')
await shoot('demo', '?address=demo')
await shoot('mobile-landing', '', true)
await shoot('mobile-evm', '?address=vitalik.eth', true)
await shoot('mobile-demo', '?address=demo', true)
await b.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
