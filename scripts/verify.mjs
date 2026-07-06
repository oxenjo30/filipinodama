// End-to-end verification: drives the built app in a real Chromium instance.
// - every route renders without console errors, failed requests, or broken images
// - a local 2-player move round-trips through the engine (turn switches)
// - the bot answers in bot mode
// - room pages validate input and stay honest about offline status
// - screenshots at mobile + desktop for visual review
// Usage: node scripts/verify.mjs [--shots <dir>]
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const PORT = 4173
const BASE = `http://localhost:${PORT}`
const shotsDir = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1]
  : './verify-shots'

const failures = []
const note = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) failures.push(msg)
}

// ---- start preview server ----------------------------------------------
// spawn vite directly (no shell) so server.kill() reliably stops it on Windows
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: process.cwd(), stdio: 'pipe' },
)
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server timeout')), 20000)
  server.stdout.on('data', (d) => {
    if (String(d).includes('localhost')) {
      clearTimeout(t)
      resolve()
    }
  })
  server.on('exit', () => reject(new Error('preview exited early')))
})

await mkdir(shotsDir, { recursive: true })
const browser = await chromium.launch()

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 500 })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`)
  })
  return { ctx, page, errors }
}

async function checkImages(page, label) {
  const broken = await page.evaluate(() =>
    [...document.images]
      .filter((img) => img.src && !img.src.endsWith('undefined') && img.complete && img.naturalWidth === 0)
      .map((img) => img.src),
  )
  note(broken.length === 0, `${label}: no broken images${broken.length ? ` -> ${broken.join(', ')}` : ''}`)
}

const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 900 }

// ---- 1. route sweep on both viewports -----------------------------------
const routes = [
  ['landing', '/landing'],
  ['home', '/home'],
  ['play', '/play'],
  ['play-ai', '/play/ai'],
  ['game-local', '/game/local'],
  ['game-bot', '/game/bot'],
  ['room-create', '/room/create'],
  ['room-join', '/room/join'],
  ['rules', '/rules'],
  ['leaderboard', '/leaderboard'],
  ['profile', '/profile'],
  ['settings', '/settings'],
]

for (const [vpName, viewport] of [['mobile', MOBILE], ['desktop', DESKTOP]]) {
  const { ctx, page, errors } = await newPage(viewport)
  for (const [name, path] of routes) {
    errors.length = 0
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(350)
    note(errors.length === 0, `${vpName} ${path}: no errors${errors.length ? ` -> ${errors[0]}` : ''}`)
    await checkImages(page, `${vpName} ${path}`)
    await page.screenshot({ path: `${shotsDir}/${vpName}-${name}.png`, fullPage: name === 'landing' || name === 'rules' })
  }

  // no horizontal scroll on mobile
  if (vpName === 'mobile') {
    await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    note(overflow <= 0, `mobile /home: no horizontal scroll (overflow=${overflow}px)`)
  }
  await ctx.close()
}

// ---- 2. splash flow ------------------------------------------------------
{
  const { ctx, page } = await newPage(MOBILE)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${shotsDir}/mobile-splash.png` })
  await page.waitForURL('**/landing', { timeout: 8000 })
  note(true, 'splash: auto-navigates to landing on first visit')
  await ctx.close()
}

// ---- 3. local 2-player move flow ----------------------------------------
{
  const { ctx, page, errors } = await newPage(MOBILE)
  await page.goto(`${BASE}/game/local`, { waitUntil: 'networkidle' })

  // red man on a3 (row5,col0) can step to b4
  await page.getByRole('button', { name: 'a3, red piece' }).click()
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: 'b4' }).click()
  await page.waitForTimeout(500)
  const movedRed = await page.getByRole('button', { name: 'b4, red piece' }).count()
  note(movedRed === 1, 'local: red a3 -> b4 applied on the board')

  // blue answers b6 -> a5
  await page.getByRole('button', { name: 'b6, blue piece' }).click()
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: 'a5' }).click()
  await page.waitForTimeout(500)
  const movedBlue = await page.getByRole('button', { name: 'a5, blue piece' }).count()
  note(movedBlue === 1, 'local: blue b6 -> a5 applied on the board')

  // history shows both moves
  await page.getByRole('button', { name: 'Move history' }).click()
  await page.waitForTimeout(300)
  const entries = await page.locator('ol li').count()
  note(entries === 2, `local: move history lists 2 moves (got ${entries})`)
  await page.getByRole('button', { name: 'Close dialog' }).click()

  // undo brings red back
  await page.getByRole('button', { name: 'Undo move' }).click()
  await page.waitForTimeout(400)
  const undone = await page.getByRole('button', { name: 'b6, blue piece' }).count()
  note(undone === 1, 'local: undo restores blue piece to b6')

  await page.screenshot({ path: `${shotsDir}/mobile-game-inplay.png` })
  note(errors.length === 0, `local flow: no console errors${errors.length ? ` -> ${errors[0]}` : ''}`)
  await ctx.close()
}

// ---- 4. bot answers ------------------------------------------------------
{
  const { ctx, page, errors } = await newPage(DESKTOP)
  await page.goto(`${BASE}/game/bot`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'a3, red piece' }).click()
  await page.getByRole('button', { name: 'b4' }).click()
  await page.waitForTimeout(1800) // bot thinks ~750ms then moves
  await page.getByRole('button', { name: 'Move history' }).click()
  await page.waitForTimeout(300)
  const entries = await page.locator('ol li').count()
  note(entries === 2, `bot: bot replied after human move (history=${entries})`)
  await page.screenshot({ path: `${shotsDir}/desktop-game-bot.png` })
  note(errors.length === 0, `bot flow: no console errors${errors.length ? ` -> ${errors[0]}` : ''}`)
  await ctx.close()
}

// ---- 5. room pages: honest validation ------------------------------------
{
  const { ctx, page } = await newPage(MOBILE)
  await page.goto(`${BASE}/room/join`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Join room' }).click()
  await page.waitForTimeout(200)
  const emptyErr = await page.getByText('Enter the 6-character room code.').count()
  note(emptyErr === 1, 'join room: empty code shows validation error')

  await page.getByLabel('Room code').fill('ABC123')
  await page.getByLabel('Player name').fill('Tester')
  await page.getByRole('button', { name: 'Join room' }).click()
  await page.waitForTimeout(300)
  const honest = await page.getByText('Online rooms are not connected yet.').count()
  note(honest >= 1, 'join room: offline status shown instead of fake join')

  await page.goto(`${BASE}/room/create`, { waitUntil: 'networkidle' })
  await page.getByLabel('Player name').fill('Tester')
  await page.getByRole('button', { name: 'Create room preview' }).click()
  await page.waitForTimeout(300)
  const code = await page.locator('p.heading-caps').textContent()
  note(/^[A-Z2-9]{6}$/.test(code?.trim() ?? ''), `create room: local code generated (${code?.trim()})`)
  await page.screenshot({ path: `${shotsDir}/mobile-room-created.png` })
  await ctx.close()
}

// ---- 6. settings persist -------------------------------------------------
{
  const { ctx, page } = await newPage(MOBILE)
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('switch', { name: 'Move hints' }).click()
  await page.reload({ waitUntil: 'networkidle' })
  const hints = await page.getByRole('switch', { name: 'Move hints' }).getAttribute('aria-checked')
  note(hints === 'false', 'settings: move-hints toggle persists across reload')
  await ctx.close()
}

// ---- 7. mandatory capture, surrender, result modal, rematch ---------------
{
  const { ctx, page, errors } = await newPage(MOBILE)
  await page.goto(`${BASE}/game/local`, { waitUntil: 'networkidle' })

  // g3-f4, h6-g5 sets up a forced capture f4xh6
  await page.getByRole('button', { name: 'g3, red piece' }).click()
  await page.getByRole('button', { name: 'f4', exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'h6, blue piece' }).click()
  await page.getByRole('button', { name: 'g5', exact: true }).click()
  await page.waitForTimeout(400)

  const banner = await page.getByText('Capture required').count()
  note(banner === 1, 'capture: "Capture required" banner appears')

  // quiet moves are locked out: selecting a non-capturing piece shows no hints
  await page.getByRole('button', { name: 'a3, red piece' }).click()
  await page.waitForTimeout(200)
  const strayHints = await page.locator('.anim-hint').count()
  note(strayHints === 0, 'capture: non-capture piece is not selectable while capture exists')

  await page.getByRole('button', { name: 'f4, red piece' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'h6', exact: true }).click()
  await page.waitForTimeout(500)
  const captured = await page.getByRole('button', { name: 'h6, red piece' }).count()
  const victimGone = await page.getByRole('button', { name: 'g5, blue piece' }).count()
  note(captured === 1 && victimGone === 0, 'capture: red jumped g5 and landed on h6')

  // surrender -> result modal -> rematch
  await page.getByRole('button', { name: 'Surrender' }).first().click()
  await page.getByRole('button', { name: 'Blue surrenders' }).click()
  await page.waitForTimeout(900)
  const winTitle = await page.getByText('Red wins').count()
  note(winTitle === 1, 'result: modal announces the winner after surrender')
  await page.screenshot({ path: `${shotsDir}/mobile-result.png` })

  await page.getByRole('button', { name: 'Rematch' }).click()
  await page.waitForTimeout(500)
  const resetBlue = await page.getByRole('button', { name: 'h6, blue piece' }).count()
  note(resetBlue === 1, 'result: rematch resets the board')
  note(errors.length === 0, `end-game flow: no console errors${errors.length ? ` -> ${errors[0]}` : ''}`)
  await ctx.close()
}

// ---- 8. mode select + AI difficulty flow ----------------------------------
{
  const { ctx, page, errors } = await newPage(DESKTOP)
  await page.goto(`${BASE}/play`, { waitUntil: 'networkidle' })
  const comingSoon = await page.getByText('Coming soon — online play isn’t connected yet.').count()
  note(comingSoon === 2, `mode select: Quick + Ranked honestly marked coming soon (${comingSoon})`)
  await page.screenshot({ path: `${shotsDir}/desktop-play-modes.png` })

  await page.getByRole('link', { name: /Play vs AI/ }).click()
  await page.waitForURL('**/play/ai')
  await page.getByRole('radio', { name: /Hard/ }).click()
  await page.screenshot({ path: `${shotsDir}/desktop-play-ai.png` })
  await page.getByRole('button', { name: /Start match — Hard/ }).click()
  await page.waitForURL('**/game/bot?d=hard')
  await page.waitForTimeout(500)
  const header = await page.getByText('Versus Bot · Hard').count()
  note(header === 1, 'vs AI: match starts with the chosen Hard difficulty')

  // hard bot answers a move
  await page.getByRole('button', { name: 'a3, red piece' }).click()
  await page.getByRole('button', { name: 'b4', exact: true }).click()
  await page.waitForTimeout(1800)
  await page.getByRole('button', { name: 'Move history' }).click()
  await page.waitForTimeout(300)
  const entries = await page.locator('ol li').count()
  note(entries === 2, `vs AI: hard bot replied (history=${entries})`)
  note(errors.length === 0, `vs AI flow: no console errors${errors.length ? ` -> ${errors[0]}` : ''}`)
  await ctx.close()
}

await browser.close()
server.kill()

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURES`}`)
process.exit(failures.length === 0 ? 0 : 1)
