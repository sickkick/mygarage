/**
 * Capture instance branding PR screenshots into docs/screenshots/pr/branding/.
 *
 * Prerequisites: backend on :8686 (this branch), frontend on :3000.
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../docs/screenshots/pr/branding')
const BASE = 'http://127.0.0.1:3000'
const API = 'http://127.0.0.1:8686/api'
const exe =
  process.env.PW_CHROME ||
  '/Users/michaelshaffer/Projects/mygarage/.pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell'

async function ensureBranding(page) {
  // Set display name
  await page.request.post(`${API}/settings/batch`, {
    data: { settings: { app_name: 'Shaffer Garage' } },
  })

  // Create a simple logo PNG in the browser and upload it
  const logoBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#0ea5e9'
    ctx.beginPath()
    ctx.roundRect(16, 16, 224, 224, 40)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 72px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('SG', 128, 128)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const buf = await blob.arrayBuffer()
    return Array.from(new Uint8Array(buf))
  })

  const logoPath = path.join(OUT, '_tmp-logo.png')
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(logoPath, Buffer.from(logoBytes))

  await page.request.post(`${API}/branding/logo`, {
    multipart: {
      file: {
        name: 'logo.png',
        mimeType: 'image/png',
        buffer: fs.readFileSync(logoPath),
      },
    },
  })
  await page.request.post(`${API}/branding/favicon`, {
    multipart: {
      file: {
        name: 'favicon.png',
        mimeType: 'image/png',
        buffer: fs.readFileSync(logoPath),
      },
    },
  })
  fs.unlinkSync(logoPath)
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: exe })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

  // Warm page for canvas logo generation
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await ensureBranding(page)

  // ---- Login with custom branding ----
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.getByText('Shaffer Garage').first().waitFor({ timeout: 10000 })
  await page.screenshot({ path: path.join(OUT, 'login-branding.png') })
  console.log('wrote login-branding.png')

  // ---- Settings Branding card ----
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.locator('button').filter({ hasText: /^System$/i }).first().click().catch(() => {})
  await page.waitForTimeout(600)
  await page.getByText(/^Branding$/i).first().waitFor({ timeout: 15000 })
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('h2')].find((h) => /branding/i.test(h.textContent || ''))
    el?.scrollIntoView({ block: 'start' })
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, 'settings-branding.png') })
  console.log('wrote settings-branding.png')

  // ---- Nav lockup on dashboard ----
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.getByRole('link', { name: 'Shaffer Garage' }).first().waitFor({ timeout: 10000 })
  await page.screenshot({ path: path.join(OUT, 'nav-branding.png') })
  console.log('wrote nav-branding.png')

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
