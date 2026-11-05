const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const { defaultContent: content } = await import('../src/content/catalog.js');
  const { createHelpers } = await import('../tests/helpers/prologue.js');
  const h = createHelpers(content), cities = ['alba', 'hexerei', 'anchoring', 'rude'];
  const start = h.start();
  const two = cities.slice(0, 2).reduce((r, city) => h.finishCity(r, city), start);
  const four = cities.slice(2).reduce((r, city) => h.finishCity(r, city), two);
  let major = h.read(h.act(start, 'START_REGION', { regionId: 'alba' }));
  for (let i = 0; i < 2; i++) major = h.read(h.act(h.read(h.choose(major)), 'CONTINUE_TRIAL'));
  let reunion = h.finishCity(h.finishCity(start, 'alba'), 'hexerei', { stopBeforeClosing: true });
  reunion = h.read(reunion, content, r => r.position.phase === 'storyEvent');
  const out = path.resolve(process.env.GUIDANCE_BROWSER_OUTPUT || '../preview/post-release-guidance-20261105');
  await mkdir(out, { recursive: true });
  const report = { scenarios: [], errors: [] };
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const q = action => `[data-action="${action}"]`;
  const notice = '[aria-label="王都解放のお知らせ"]';
  async function click(page, action) {
    await page.locator(q(action)).first().click();
    await page.waitForFunction(() => !document.querySelector('.busy-corner'));
    assert.equal(await page.locator('.error-banner').count(), 0);
  }
  async function saved(page) {
    return page.evaluate(async () => {
      const { createStorage } = await import('./src/storage.js');
      const { validateRun } = await import('./src/engine.js');
      const { contentForRun } = await import('./src/content/catalog.js');
      const s = createStorage({ validateRun: r => validateRun(r, contentForRun(r)) });
      return (await s.getSlot('auto')).run;
    });
  }
  async function resume(page) {
    await page.reload(); await click(page, 'continue'); await click(page, 'accept-confirm');
  }
  async function install(page, run) {
    await page.evaluate(async r => {
      const { createStorage } = await import('./src/storage.js');
      const { validateRun } = await import('./src/engine.js');
      const { contentForRun } = await import('./src/content/catalog.js');
      const s = createStorage({ validateRun: r => validateRun(r, contentForRun(r)) });
      await s.commitAuto(r, { expectedRevision: await s.getRevision() });
    }, run);
    await resume(page);
  }
  async function layout(page) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
  }
  try {
    for (const [size, viewport] of [['pc', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }], ['narrow', { width: 320, height: 740 }]]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(`${size}: ${e.message}`));
      await page.goto(process.env.GUIDANCE_BROWSER_URL || 'http://127.0.0.1:4173/');
      await page.locator(q('new')).waitFor();
      for (const r of [start, two, reunion]) {
        await install(page, r);
        assert.equal(await page.locator(notice).count(), 0);
        if (r === reunion) assert.equal((await saved(page)).position.eventId, 'event.midgame-reunion');
      }
      await install(page, four);
      assert.equal(await page.locator(notice).count(), 1);
      await layout(page);
      await page.screenshot({ path: path.join(out, `${size}-capital.png`), fullPage: true });
      for (const action of ['memo', 'log', 'saves']) {
        await click(page, action); await click(page, 'close-modal');
        assert.equal(await page.locator(notice).count(), 1);
      }
      assert.deepEqual(await saved(page), four);
      await resume(page);
      assert.equal(await page.locator(notice).count(), 1);
      await page.locator('[data-action="region"][data-id="ehrenfels"]').click();
      await page.waitForFunction(() => !document.querySelector('.busy-corner'));
      assert.equal(await page.locator(notice).count(), 0);
      await install(page, major);
      assert.match(await page.locator('.trial-sidebar').textContent(), /旅全体で合計2回まで、各都市の大試練で最大1回/);
      assert.match(await page.locator('.trial-sidebar').textContent(), /テオは王国の密偵/);
      assert.match(await page.locator('.trial-sidebar').textContent(), /残り 2 \/ 2 回/);
      await layout(page);
      await page.screenshot({ path: path.join(out, `${size}-theo.png`), fullPage: true });
      await click(page, 'theo');
      await click(page, 'accept-confirm');
      assert.equal(Object.keys((await saved(page)).theoInvestigations).length, 1);
      assert.match(await page.locator('.trial-sidebar').textContent(), /残り 1 \/ 2 回/);
      report.scenarios.push({ size, status: 'passed', checks: ['locked-capital', 'reunion', 'unlocked-capital', 'modal-return', 'reload', 'capital-entry', 'theo-copy', 'theo-use', 'layout'] });
      await context.close();
    }
    assert.deepEqual(report.errors, []);
    await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
