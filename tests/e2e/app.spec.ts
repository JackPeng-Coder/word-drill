import fs from 'node:fs';
import { expect, test } from '@playwright/test';

async function startFirstDict(page: import('@playwright/test').Page) {
  await page.locator('.dict-row').first().click();
  const start = page.getByRole('button', { name: '开始排查' });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await expect(page.locator('.word')).toBeVisible();
}

test('首页可加载词表并进入练习，题目结构正确', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.locator('.dict-row').first()).toBeVisible();
  expect(await page.locator('.dict-row').count()).toBeGreaterThan(10);
  await expect(page.locator('.masthead')).toContainText('单词排查器');

  await startFirstDict(page);

  await expect(page.locator('.options .option')).toHaveCount(4);
  await expect(page.locator('.meta-options .option')).toHaveCount(2);
  await expect(page.locator('.meta-options .option').nth(0)).toContainText('以上都不对');
  await expect(page.locator('.meta-options .option').nth(1)).toContainText('不知道');
  await expect(page.locator('.drill-counter')).toContainText('1 /');
  expect(errors).toEqual([]);
});

test('不知道 → 回退 → 跳过 的流程与统计撤销', async ({ page }) => {
  await page.goto('/');
  await startFirstDict(page);
  const firstWord = (await page.locator('.word').textContent())?.trim();

  await page.locator('.meta-options .option').nth(1).click();
  await expect(page.locator('.stamp')).toHaveText('不知道');
  await expect(page.locator('.feedback-note').first()).toContainText('未掌握');

  await page.getByRole('button', { name: /回退/ }).click();
  await expect(page.locator('.stamp')).toHaveCount(0);
  await expect(page.locator('.word')).toHaveText(firstWord ?? '');
  await expect(page.locator('.options .option.is-picked')).toHaveCount(0);

  await page.getByRole('button', { name: /跳过/ }).click();
  await expect(page.locator('.drill-counter')).toContainText('2 /');
});

test('考察顺序可切换为随机并持久化', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  const orderRow = page.locator('.setting-row', { hasText: '考察顺序' });
  await orderRow.getByRole('button', { name: '随机' }).click();
  await expect(orderRow.getByRole('button', { name: '随机' })).toHaveClass(/is-active/);

  await page.reload();
  await page.getByRole('button', { name: '设置' }).click();
  const orderRowAfter = page.locator('.setting-row', { hasText: '考察顺序' });
  await expect(orderRowAfter.getByRole('button', { name: '随机' })).toHaveClass(/is-active/);

  await page.getByRole('button', { name: '练习台' }).click();
  const randomSeg = page.locator('.side .segmented').nth(1).getByRole('button', { name: '随机' });
  await expect(randomSeg).toHaveClass(/is-active/);
});

test('导出存档 JSON', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '存档' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出', exact: true }).click(),
  ]);
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const parsed = JSON.parse(fs.readFileSync(String(filePath), 'utf8'));
  expect(parsed.app).toBe('worddrill');
  expect(parsed.schemaVersion).toBe(1);
  expect(typeof parsed.settings).toBe('object');
  expect(typeof parsed.stats).toBe('object');
});

test('限时到点自动判为超时', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByLabel('自定义限时秒数').fill('3');
  await page.getByRole('button', { name: '练习台' }).click();
  await startFirstDict(page);
  await expect(page.locator('.stamp')).toHaveText('超时', { timeout: 10_000 });
  await expect(page.locator('.feedback-note').first()).toContainText('超时');
});
