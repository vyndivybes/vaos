import { test, expect } from '@playwright/test';

test('live-health: Chromium launches and reports a version',async({browser})=>{
  expect((await browser.version()).length).toBeGreaterThan(0);
});

test('happy-path: read-only browser task reaches approved local target',async({page})=>{
  const response=await page.goto('http://127.0.0.1:18765/ok',{waitUntil:'domcontentloaded'});
  expect(response?.status()).toBe(200);
  await expect(page.locator('#status')).toHaveText('ready');
  expect(await page.title()).toBe('VAOS Wave 1');
});

test('failure-mode: provider surfaces target HTTP failure without mutating state',async({page})=>{
  const response=await page.goto('http://127.0.0.1:18765/fail',{waitUntil:'domcontentloaded'});
  expect(response?.status()).toBe(500);
  await expect(page.locator('body')).toContainText('intentional qualification failure fixture');
});
