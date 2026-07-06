// Quick single-page screenshot of the built app.
// Usage: node scripts/shot.mjs <route> <out.png> [width] [height]
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const [route = '/', out = 'shot.png', w = '1440', h = '900'] = process.argv.slice(2)
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', '4174', '--strictPort'],
  { stdio: 'pipe' },
)
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview timeout')), 15000)
  server.stdout.on('data', (d) => {
    if (String(d).includes('localhost')) {
      clearTimeout(t)
      res()
    }
  })
  server.on('exit', () => rej(new Error('preview exited early')))
})
const browser = await chromium.launch()
const page = await (
  await browser.newContext({ viewport: { width: Number(w), height: Number(h) } })
).newPage()
await page.goto(`http://localhost:4174${route}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: out })
await browser.close()
server.kill()
console.log(`saved ${out}`)
