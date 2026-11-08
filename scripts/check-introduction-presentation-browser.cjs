/* Actual app, isolated browser storage, both commanders, all fifteen novels. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const { defaultContent: content } = await import('../src/content/catalog.js');
  const e = await import('../src/engine.js');
  const { createHelpers } = await import('../tests/helpers/prologue.js');
  const { endingRun } = await import('../tests/helpers/ending.js');
  const url = process.env.INTRODUCTION_PRESENTATION_URL || 'http://127.0.0.1:4173/';
  const out = path.resolve(process.env.INTRODUCTION_PRESENTATION_OUTPUT || '../preview/introduction-display-20261108');
  await mkdir(out, { recursive:true });
  const h = createHelpers(content), targets = ['anchoring.small2', 'hexerei.major'];
  const report = { url, scenarios:[], errors:[], screenshots:[] };
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function samples(commanderId) {
    const result = [];
    let r = h.start(undefined, commanderId);
    for (const city of ['alba', 'hexerei', 'anchoring', 'rude', 'ehrenfels']) {
      const base = r;
      r = h.act(r, 'START_REGION', { regionId:city });
      for (let i = 0; i < 3; i++) {
        e.validateRun(r, content);
        const blocks = content.scenes[r.position.sceneId].blocks.map((_, blockIndex) =>
          e.getCurrentText({ ...r, position:{ ...r.position, blockIndex } }, content));
        result.push({ run:r, raw:blocks.flatMap(b => b.text.split('\n\n')), keys:blocks.map(b => b.readKey) });
        r = h.act(h.read(h.choose(h.read(r))), 'CONTINUE_TRIAL');
      }
      r = h.finishCity(base, city);
    }
    return result;
  }
  const routes = Object.fromEntries(Object.keys(content.commanders).map(id => [id, samples(id)]));
  const final = endingRun(90, 'commander.alphonse', content);
  final.position = { phase:'ending', sceneId:content.officialEnding.lastSceneId, blockIndex:0 };
  const completed = e.transition(final, { type:'ACK_TEXT' }, content);
  const record = e.buildEndingRecord(completed, content);
  const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox'] });
  async function click(page, action, id) {
    await page.locator(`[data-action="${action}"]${id ? `[data-id="${id}"]` : ''}`).first().click();
    await page.waitForFunction(() => !document.querySelector('.busy-corner'));
    assert.equal(await page.locator('.error-banner').count(), 0);
  }
  async function persisted(page) {
    return page.evaluate(async () => {
      const { createStorage } = await import('./src/storage.js');
      const { contentForRun } = await import('./src/content/catalog.js');
      const { validateRun } = await import('./src/engine.js');
      const s = createStorage({ contentStatus:'reviewed', validateRun:r => validateRun(r, contentForRun(r)) });
      return { revision:await s.getRevision(), slots:await s.listSlots(), reader:await s.getReaderProfile(), chronicles:await s.listChronicles() };
    });
  }
  async function seed(page, sample) {
    await page.evaluate(async ({ run, keys }) => {
      const { createStorage } = await import('./src/storage.js');
      const { contentForRun } = await import('./src/content/catalog.js');
      const { validateRun } = await import('./src/engine.js');
      const s = createStorage({ contentStatus:'reviewed', validateRun:r => validateRun(r, contentForRun(r)) });
      await s.commitAuto(run, { expectedRevision:await s.getRevision(), readTextKeys:keys });
    }, sample);
    await page.reload(); await click(page, 'continue'); await click(page, 'accept-confirm');
  }
  async function inspect(page, sample, selector, width) {
    const article = page.locator(selector);
    const shown = await article.locator('p').allTextContents();
    assert.equal(shown.length, sample.raw.length);
    shown.forEach((p, i) => assert.equal(p.replaceAll('\n', ''), sample.raw[i].replaceAll('\n', '')));
    const trialId = sample.run.position.trialId, target = targets.includes(trialId);
    if (!target) {
      const original = `<article class="novel-text" aria-label="小説本文">${sample.raw.map(p => `<p>${esc(p)}</p>`).join('')}</article>`;
      assert.equal(await article.evaluate(el => el.outerHTML), original);
    } else {
      assert.equal(shown.reduce((n, p) => n + (p.match(/\n/g) || []).length, 0), trialId === 'anchoring.small2' ? 1 : 0);
      shown.filter(p => p.startsWith('「')).forEach(p => assert.doesNotMatch(p, /\n/));
      shown.forEach(p => { for (const line of p.split('\n').slice(0, -1)) assert.ok(line.endsWith('。')); });
    }
    const metrics = await article.evaluate((el, raw) => {
      const s = getComputedStyle(el), b = el.getBoundingClientRect(), ps = [...el.querySelectorAll('p')];
      let displayedHeight = 0, originalHeight = 0;
      ps.forEach((p, i) => {
        displayedHeight += p.getBoundingClientRect().height;
        const text = p.textContent; p.textContent = raw[i];
        originalHeight += p.getBoundingClientRect().height; p.textContent = text;
      });
      return { size:s.fontSize, color:s.color, lineRatio:parseFloat(s.lineHeight) / parseFloat(s.fontSize),
        whiteSpace:s.whiteSpace, paragraphMargin:getComputedStyle(ps[0]).marginBottom,
        displayedHeight, originalHeight,
        fits:el.scrollWidth <= el.clientWidth + 1 && b.left >= -1 && b.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 };
    }, sample.raw);
    assert.equal(metrics.size, width > 760 ? '16.2px' : '15px');
    assert.equal(metrics.color, 'rgb(36, 59, 53)');
    assert.ok(Math.abs(metrics.lineRatio - 2.15) < .001);
    assert.equal(metrics.whiteSpace, 'pre-line');
    assert.ok(Math.abs(parseFloat(metrics.paragraphMargin) / parseFloat(metrics.size) - 1.5) < .001);
    assert.ok(metrics.fits, `${trialId}/${width}: overflow`);
    if (target) assert.ok(metrics.displayedHeight < metrics.originalHeight, `${trialId}: fixed wraps not improved`);
    else assert.equal(metrics.displayedHeight, metrics.originalHeight);
    return metrics;
  }
  try {
    for (const [size, viewport] of [['pc',{ width:1440, height:1000 }], ['mobile',{ width:390, height:844 }], ['narrow',{ width:320, height:740 }]]) {
      for (const [commanderId, rows] of Object.entries(routes)) {
        const context = await browser.newContext({ viewport, reducedMotion:'reduce' });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        await page.goto(url); await page.locator('[data-action="new"]').waitFor();
        await page.evaluate(async ({ completed, record }) => {
          const { createStorage } = await import('./src/storage.js');
          const { contentForRun } = await import('./src/content/catalog.js');
          const { validateRun } = await import('./src/engine.js');
          const s = createStorage({ contentStatus:'reviewed', validateRun:r => validateRun(r, contentForRun(r)) });
          await s.recordCompletion(completed, record, { expectedRevision:await s.getRevision() });
        }, { completed, record });
        for (const sample of rows) {
          const trialId = sample.run.position.trialId;
          await seed(page, sample);
          const before = await persisted(page);
          assert.equal(before.chronicles.length, 1);
          assert.deepEqual(before.slots.auto.run, sample.run);
          assert.equal(await page.locator('.dialogue-panel > .small.muted').textContent(), '導入小説');
          assert.equal(await page.locator('.read-indicator').first().textContent(), '既読');
          const normal = await inspect(page, sample, '.trial-main .novel-text', viewport.width);
          const normalHTML = await page.locator('.novel-text').evaluate(el => el.outerHTML);
          assert.doesNotMatch(await page.locator('main').textContent(), /10月16日版|正式原稿|正式版/);
          const screenshot = targets.includes(trialId) && size !== 'narrow';
          const prefix = `${size}-${commanderId.split('.')[1]}-${trialId}`;
          if (screenshot) {
            const file = `${prefix}-normal.png`;
            await page.locator('.toast').waitFor({ state:'hidden' });
            await page.screenshot({ path:path.join(out, file), fullPage:true }); report.screenshots.push(file);
          }
          await click(page, 'introduction', trialId);
          const dialog = page.locator('[role="dialog"]');
          assert.equal(await dialog.locator('.modal-body > .small.muted').textContent(), '導入小説閲覧のみ。進行・得点・情報・既読は変更しません。');
          assert.equal(await dialog.locator('h2').textContent(), content.scenes[sample.run.position.sceneId].title);
          assert.doesNotMatch(await dialog.textContent(), /10月16日版|正式原稿|正式版/);
          const replay = await inspect(page, sample, '[role="dialog"] .novel-text', viewport.width);
          assert.equal(await dialog.locator('.novel-text').evaluate(el => el.outerHTML), normalHTML);
          if (screenshot) {
            const file = `${prefix}-replay.png`;
            await dialog.screenshot({ path:path.join(out, file) }); report.screenshots.push(file);
          }
          await click(page, 'close-modal');
          assert.deepEqual(await persisted(page), before);
          report.scenarios.push({ size, commanderId, trialId, normal, replay, saveAndHistoryUnchanged:true });
        }
        // Existing history remains readable after every novel has been rendered.
        await click(page, 'title'); await click(page, 'accept-confirm');
        const beforeHistory = await persisted(page);
        await click(page, 'chronicles'); await click(page, 'chronicle-detail');
        assert.equal(await page.locator('.chronicle-page').count(), 1);
        assert.deepEqual(await persisted(page), beforeHistory);
        await context.close();
      }
    }
    assert.equal(report.scenarios.length, 90);
    assert.deepEqual(report.errors, []);
    await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ scenarios:report.scenarios.length, displays:report.scenarios.length * 2,
      errors:report.errors, screenshots:report.screenshots.length, report:path.join(out, 'report.json') }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
