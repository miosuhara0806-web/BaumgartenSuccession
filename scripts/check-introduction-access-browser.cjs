/* PR #8 introduction replay access: actual DOM, handlers and IndexedDB. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const { content } = await import('../src/content/prologue.js');
  const h = await import('../tests/helpers/prologue.js');
  const url = process.env.INTRODUCTION_BROWSER_URL || 'http://127.0.0.1:4173/';
  const out = path.resolve(process.env.INTRODUCTION_BROWSER_OUTPUT || '../preview/introduction-access-20261101/browser');
  await mkdir(out, { recursive: true });
  const report = { url, scenarios: [], errors: [] };
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const query = (action, id) => `[data-action="${action}"]${id ? `[data-id="${id}"]` : ''}`;
  async function click(page, action, id) {
    await page.locator(query(action, id)).first().click();
    await page.waitForFunction(() => !document.querySelector('.busy-corner'));
    assert.equal(await page.locator('.error-banner').count(), 0);
  }
  async function stored(page) {
    return page.evaluate(async () => {
      const { createStorage } = await import('./src/storage.js');
      const { contentForRun } = await import('./src/content/catalog.js');
      const { validateRun } = await import('./src/engine.js');
      const s = createStorage({ validateRun: r => validateRun(r, contentForRun(r)) });
      return { slot: await s.getSlot('auto'), reader: await s.getReaderProfile(), revision: await s.getRevision() };
    });
  }
  async function seed(page, run, readTextKeys = []) {
    await page.evaluate(async ({ run, readTextKeys }) => {
      const { createStorage } = await import('./src/storage.js');
      const { contentForRun } = await import('./src/content/catalog.js');
      const { validateRun } = await import('./src/engine.js');
      const s = createStorage({ validateRun: r => validateRun(r, contentForRun(r)) });
      await s.commitAuto(run, { expectedRevision: await s.getRevision(), readTextKeys });
    }, { run, readTextKeys });
    await page.reload(); await click(page, 'continue'); await click(page, 'accept-confirm');
  }
  async function available(page, expected) {
    const ordered = Object.keys(content.trials).filter(id => expected.includes(id));
    assert.deepEqual(await page.locator('.map-sidebar [data-action="introduction"]').evaluateAll(els => els.map(el => el.dataset.id)), ordered);
    const text = await page.locator('.map-sidebar .info-tools').last().textContent();
    for (const region of Object.values(content.regions)) assert.equal(text.includes(region.name), expected.some(id => content.regions[region.id].trialIds.includes(id)), region.id);
  }
  async function rejectDirect(page, trialId) {
    const before = await stored(page);
    await page.evaluate(trialId => {
      const button = document.createElement('button');
      button.dataset.action = 'introduction'; button.dataset.id = trialId;
      document.querySelector('#app').append(button); button.click();
    }, trialId);
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
    assert.deepEqual(await stored(page), before);
  }
  try {
    for (const [label, viewport, commanderId] of [
      ['pc', { width: 1440, height: 1000 }, 'commander.alphonse'],
      ['mobile', { width: 390, height: 844 }, 'commander.rosemond'],
    ]) {
      const context = await browser.newContext({ viewport }); const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      await page.goto(url);
      // Preexisting common reading includes every introduction.
      const keys = Object.values(content.trials).flatMap(t => content.scenes[t.introductionSceneId].blocks.map(id => `${id}@${content.textBlocks[id].textRevision}`));
      let r = h.start(h.defaultParty, commanderId); await seed(page, r, keys); await available(page, []);
      for (const id of ['alba', 'hexerei', 'anchoring', 'rude']) assert.equal(await page.locator(query('region', id)).isDisabled(), false);
      assert.equal(await page.locator(query('region', 'ehrenfels')).isDisabled(), true);
      await rejectDirect(page, 'ehrenfels.small1'); await rejectDirect(page, 'alba.small1');
      await page.screenshot({ path: path.join(out, `${label}-departure.png`), fullPage: true });
      let completed = [], stages = 0;
      for (const city of ['alba', 'hexerei', 'anchoring', 'rude', 'ehrenfels']) {
        r = h.read(h.act(r, 'START_REGION', { regionId: city }));
        for (let i = 0; i < 3; i++) {
          const ids = content.regions[city].trialIds;
          const expected = [...completed, ...ids.slice(0, i + 1)];
          const map = h.act(r, 'RETURN_MAP'); await seed(page, map); await available(page, expected);
          const before = await stored(page);
          await click(page, 'introduction', ids[i]);
          assert.equal(await page.locator('[role="dialog"] .novel-text').count(), 1);
          await click(page, 'close-modal'); assert.deepEqual(await stored(page), before);
          if (i < 2) await rejectDirect(page, ids[i + 1]);
          if (city !== 'ehrenfels') await rejectDirect(page, 'ehrenfels.small1');
          if (city === 'alba' && i === 0) await page.screenshot({ path: path.join(out, `${label}-small1.png`), fullPage: true });
          // A completed choice must not pre-unlock the next trial.
          r = h.read(h.choose(r));
          await seed(page, h.act(r, 'RETURN_MAP')); await available(page, expected);
          r = h.read(h.act(r, 'CONTINUE_TRIAL')); stages++;
        }
        completed.push(...content.regions[city].trialIds);
        await seed(page, r); await available(page, completed);
        if (city === 'rude') {
          assert.equal(await page.locator(query('region', 'ehrenfels')).isDisabled(), false);
          assert.equal(await page.locator('[data-action="introduction"][data-id^="ehrenfels."]').count(), 0);
          await rejectDirect(page, 'ehrenfels.small1');
          await page.screenshot({ path: path.join(out, `${label}-capital-unvisited.png`), fullPage: true });
        }
      }
      assert.equal(stages, 15);
      const width = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(width.scroll <= width.width + 1);
      report.scenarios.push({ label, commanderId, trialStages: stages, resultsDoNotUnlockNext: true,
        commonReadingIgnored: true, directCallsRejected: true, readsHaveNoSideEffects: true,
        capitalUnlockDistinctFromVisit: true, status: 'passed' });
      await context.close();
    }
    assert.deepEqual(report.errors, []);
    await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
