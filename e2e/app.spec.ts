import { expect, test } from '@playwright/test'

test('shows the native-inspired dashboard and honestly labels the demo', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your platform, connected.' })).toBeVisible()
  await expect(page.locator('.module-card')).toHaveCount(6)
  await page.getByRole('button', { name: 'Explore demo', exact: true }).first().click()
  await expect(page.locator('.demo-banner')).toContainText(
    'all readings and output actions are simulated',
  )
  await expect(page.locator('.stats-row').first()).toContainText('84%')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  expect(errors).toEqual([])
})

test('charts, controls, exports, and settings work in the browser', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore demo', exact: true }).first().click()
  await page.getByRole('link', { name: 'Motion / IMU', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Every movement, in view.' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Acceleration, Acceleration/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  expect((await downloaded).suggestedFilename()).toMatch(/^senswear-demo-imu-.*\.csv$/)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.locator('.stream-toolbar')).toContainText('Stream paused')
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.getByRole('link', { name: 'Optical / PPG' }).click()
  await expect(page.getByRole('heading', { name: 'Red channel', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled()
  await page.getByRole('link', { name: 'Temperature', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Temperature history' })).toBeVisible()
  await page.getByLabel('Interval in seconds').fill('0')
  await page.getByRole('button', { name: 'Apply interval' }).click()
  await expect(page.getByText('Measurements are disabled.', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'Touch', exact: true }).first().click()
  await expect(page.locator('.touch-strip>span')).toHaveCount(15)
  await expect(page.locator('.touch-strip .lit').first()).toBeVisible()
  await page.getByRole('link', { name: 'LED', exact: true }).first().click()
  await page.getByLabel('HEX color').fill('#112233')
  await page.getByRole('button', { name: 'Set color', exact: true }).click()
  await expect(page.locator('.applied-color')).toContainText('#112233')
  await page.getByRole('button', { name: 'Turn off', exact: true }).click()
  await expect(page.locator('.applied-color')).toContainText('#000000')
  await page.getByRole('link', { name: 'Vibration', exact: true }).first().click()
  await page.getByRole('button', { name: 'Heartbeat', exact: false }).click()
  await page.getByRole('button', { name: 'Preview pattern' }).click()
  await expect(page.getByRole('button', { name: /Playing/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Morse', exact: true }).click()
  await page.getByLabel('Your message').fill('A$')
  await expect(page.getByRole('alert')).toContainText('1–3')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Sync clock' }).click()
  await expect(page.getByText('Clock sync simulated.')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('settings.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  expect(errors).toEqual([])
})

test('unsupported browsers offer a clear explanation and functional preview', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true }),
  )
  await page.goto('/')
  await expect(page.locator('.browser-notice')).toContainText("Web Bluetooth isn't available")
  await expect(page.getByRole('button', { name: 'Connect device', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Explore demo', exact: true }).first().click()
  await expect(page.locator('.demo-banner')).toBeVisible()
})

test('chooser cancellation is recoverable and never fakes a connection', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: async () => {
          throw new DOMException('User cancelled', 'NotFoundError')
        },
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Connect device', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('No device selected')
  await expect(page.getByRole('button', { name: 'Connect device', exact: true })).toBeEnabled()
  await expect(page.locator('.device-mini')).toContainText('Not connected')
})
