import { defineConfig, devices } from '@playwright/test'

const ci = !!process.env.CI
const browserChannel = process.env.PLAYWRIGHT_CHANNEL ?? (ci ? 'chromium' : 'msedge')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: ci,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Edge'],
        channel: browserChannel,
        viewport: { width: 1440, height: 1050 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Edge'],
        channel: browserChannel,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: ci
      ? 'npm run preview -- --port 4173 --strictPort'
      : 'npm run dev -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !ci,
  },
})
