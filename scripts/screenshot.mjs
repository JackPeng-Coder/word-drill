import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5178';

const browser = await chromium.launch({ channel: 'chromium' });

async function shoot(page, file) {
  await page.screenshot({ path: `reports/${file}.png` });
  console.log('saved reports/' + file + '.png');
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.dict-row');
  await page.waitForTimeout(600);
  await shoot(page, 'home');

  await page.fill('.search', 'CET-4');
  await page.waitForTimeout(300);
  await page.locator('.dict-row').first().click();
  await page.getByRole('button', { name: '开始排查' }).click();
  await page.waitForSelector('.word');
  await page.waitForTimeout(500);
  await shoot(page, 'drill');

  await page.locator('.options .option').first().click();
  await page.waitForTimeout(450);
  await shoot(page, 'feedback');

  await page.getByRole('button', { name: '设置' }).click();
  await page.waitForTimeout(350);
  await shoot(page, 'settings');

  await page.getByRole('button', { name: '存档', exact: true }).click();
  await page.waitForTimeout(300);
  await shoot(page, 'data');

  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.dict-row');
  await page.waitForTimeout(500);
  await shoot(page, 'mobile-home');
  await page.fill('.search', 'CET-4');
  await page.waitForTimeout(250);
  await page.locator('.dict-row').first().click();
  await page.getByRole('button', { name: '开始排查' }).click();
  await page.waitForSelector('.word');
  await page.waitForTimeout(400);
  await shoot(page, 'mobile-drill');
  await page.close();
}

await browser.close();
