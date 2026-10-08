import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'.',
  testMatch:['scripts/qualification/playwright-wave1.spec.mjs'],
  workers:1,
  fullyParallel:false,
  retries:0,
  timeout:30_000,
  globalTimeout:120_000,
  use:{
    headless:true,
    trace:'on',
    screenshot:'only-on-failure',
  },
  webServer:{
    command:'node scripts/qualification/wave1-http-fixture.mjs',
    port:18765,
    reuseExistingServer:false,
    timeout:30_000,
  },
});
