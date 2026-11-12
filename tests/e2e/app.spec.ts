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
  // 判分后错误选项要标出来源单词
  await expect(page.locator('.option-source').first()).toBeVisible();

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

test('未掌握 TXT 只导出选错过的词', async ({ page }) => {
  await page.goto('/');
  // 关掉自动跳题与单击即提交，方便确定性地构造一次错选
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('switch', { name: '答对自动下一题' }).click();
  await page.getByRole('switch', { name: '单选单击即提交' }).click();
  await page.getByRole('button', { name: '练习台' }).click();
  await startFirstDict(page);

  const submit = async () => {
    await page.getByRole('button', { name: /提交/ }).click();
    await expect(page.locator('.stamp')).toBeVisible();
  };

  // 1) 只标「不知道」：练过但不算选错，不进 TXT
  await page.locator('.meta-options .option').nth(1).click();
  await submit();
  await expect(page.locator('.stamp')).toHaveText('不知道');
  await page.getByRole('button', { name: '下一题' }).click();

  // 2) 制造一次确定的选错
  const missedWord = (await page.locator('.word').textContent())?.trim() ?? '';
  await page.locator('.options .option').nth(0).click();
  await submit();
  if (((await page.locator('.stamp').textContent()) ?? '').trim() === '全对') {
    await page.getByRole('button', { name: /回退/ }).click();
    await expect(page.locator('.stamp')).toHaveCount(0);
    await page.locator('.options .option').nth(1).click();
    await submit();
    await expect(page.locator('.stamp')).not.toHaveText('全对');
  }

  await page.getByRole('button', { name: '存档' }).click();
  const panel = page.locator('.panel', { hasText: '导出未掌握 TXT' });
  await expect(panel.locator('.inline', { hasText: '当前可导出' }).locator('b')).toHaveText('1');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: '导出 TXT' }).click(),
  ]);
  const filePath = await download.path();
  const text = fs.readFileSync(String(filePath), 'utf8');
  expect(text.trim().split('\n').filter(Boolean)).toEqual([missedWord]);
});

test('从未选错时 TXT 导出给出提示', async ({ page }) => {
  await page.goto('/');
  await page.locator('.dict-row').first().click();
  await page.getByRole('button', { name: '存档' }).click();
  const panel = page.locator('.panel', { hasText: '导出未掌握 TXT' });
  await expect(panel.locator('.inline', { hasText: '当前可导出' }).locator('b')).toHaveText('0');
  await panel.getByRole('button', { name: '导出 TXT' }).click();
  await expect(page.locator('.toast')).toContainText('暂无可导出');
});

test('限时到点自动判为超时', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByLabel('单选自定义限时秒数').fill('3');
  await page.getByLabel('多选自定义限时秒数').fill('3');
  await page.getByRole('button', { name: '练习台' }).click();
  await startFirstDict(page);
  await expect(page.locator('.stamp')).toHaveText('超时', { timeout: 10_000 });
  await expect(page.locator('.feedback-note').first()).toContainText('超时');
});

test('单选与多选限时分别默认 10s / 15s，且互不影响', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  const singleRow = page.locator('.setting-row', { hasText: '单选限时' });
  const multiRow = page.locator('.setting-row', { hasText: '多选限时' });
  await expect(singleRow.locator('.seg.is-active')).toHaveText('10s');
  await expect(multiRow.locator('.seg.is-active')).toHaveText('15s');

  // 练习页的倒计时按题型取限时
  await page.getByRole('button', { name: '练习台' }).click();
  await startFirstDict(page);
  const label = (await page.locator('.word-label').textContent()) ?? '';
  const expectedTitle = label.includes('不定项') ? '本题限时 15 秒' : '本题限时 10 秒';
  await expect(page.locator('.timer')).toHaveAttribute('title', expectedTitle);

  // 改单选限时不应影响多选
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByLabel('单选自定义限时秒数').fill('7');
  await expect(singleRow.locator('.seg.is-active')).toHaveCount(0);
  await expect(page.getByLabel('多选自定义限时秒数')).toHaveValue('15');
  await expect(multiRow.locator('.seg.is-active')).toHaveText('15s');
});

test('答对一次即掌握：反馈与顶栏未掌握数同步', async ({ page }) => {
  await page.goto('/');
  // 关自动跳题与单击即提交，便于从判色结果反推正确选项
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('switch', { name: '答对自动下一题' }).click();
  await page.getByRole('switch', { name: '单选单击即提交' }).click();
  await page.getByRole('button', { name: '练习台' }).click();
  await startFirstDict(page);

  const mastUnmastered = page.locator('.mast-stat', { hasText: '未掌握' }).locator('b');
  const optionAt = (i: number) => page.locator('.options .option, .meta-options .option').nth(i);
  const submit = async () => {
    await page.getByRole('button', { name: /提交/ }).click();
    await expect(page.locator('.stamp')).toBeVisible();
  };

  // 先点「不知道」：这一词随即计入未掌握，同时判色会标出全部正确项
  await page.locator('.meta-options .option').nth(1).click();
  await submit();
  await expect(page.locator('.stamp')).toHaveText('不知道');
  await expect(mastUnmastered).toHaveText('1');
  const correctIdx = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.options .option, .meta-options .option')];
    return els
      .map((el, i) =>
        el.classList.contains('is-correct') || el.classList.contains('is-missed') ? i : -1,
      )
      .filter((i) => i >= 0);
  });
  expect(correctIdx.length).toBeGreaterThan(0);

  // 回退后按正确项作答一次，就应当直接变成已掌握
  await page.getByRole('button', { name: /回退/ }).click();
  await expect(page.locator('.stamp')).toHaveCount(0);
  for (const i of correctIdx) await optionAt(i).click();
  await submit();
  await expect(page.locator('.stamp')).toHaveText('全对');
  await expect(page.locator('.feedback-note').first()).toContainText('本词已掌握');
  await expect(mastUnmastered).toHaveText('0');
});

test('提交前后页面不发生竖直位移（桌面 + 手机）', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await startFirstDict(page);
    await page.waitForTimeout(450);

    const measure = () =>
      page.evaluate(() => {
        // 词头不是 sticky，用布局坐标（累加 offsetTop）测布局位置；
        // 动作栏是 sticky，滚动会改变它的 offsetTop，因此改测其高度
        const layoutTop = (el: Element | null) => {
          let y = 0;
          let node = el as HTMLElement | null;
          while (node) {
            y += node.offsetTop;
            node = node.offsetParent as HTMLElement | null;
          }
          return y;
        };
        const actions = document.querySelector('.drill-actions') as HTMLElement;
        return {
          wordTop: layoutTop(document.querySelector('.word')),
          actionsHeight: actions.offsetHeight,
          docHeight: document.documentElement.scrollHeight,
        };
      });

    const before = await measure();
    await page.keyboard.press('0');
    await page.waitForTimeout(500);
    const after = await measure();

    expect(Math.abs(after.wordTop - before.wordTop)).toBeLessThan(0.6);
    expect(after.actionsHeight).toBe(before.actionsHeight);
    expect(after.docHeight).toBe(before.docHeight);
  }
});
