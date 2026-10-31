/* Real Chromium acceptance. Run with npm start; outputs live outside the repo. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const { content } = await import('../src/content/prologue.js');
  const { content: historical } = await import('../src/content/companion-dialogue-unified.js');
  const h = await import('../tests/helpers/prologue.js');
  const e = await import('../src/engine.js');
  const url = process.env.PROLOGUE_BROWSER_URL || 'http://127.0.0.1:4173/';
  const out = path.resolve(process.env.PROLOGUE_BROWSER_OUTPUT || '../preview/prologue-20261031/browser');
  await mkdir(out, { recursive: true });
  const report = { url, scenarios: [], errors: [] };
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const query = (action, id) => `[data-action="${action}"]${id ? `[data-id="${id}"]` : ''}`;
  async function click(page, action, id) {
    await page.locator(query(action, id)).first().click();
    await page.waitForFunction(() => !document.querySelector('.busy-corner'));
    assert.equal(await page.locator('.error-banner').count(), 0);
  }
  async function state(page) {
    return page.evaluate(async () => {
      const { createStorage } = await import('./src/storage.js');
      const { validateRun } = await import('./src/engine.js');
      const { contentForRun } = await import('./src/content/catalog.js');
      const s = createStorage({ validateRun: r => validateRun(r, contentForRun(r)) });
      return (await s.getSlot('auto')).run;
    });
  }
  async function seed(page, run) {
    await page.evaluate(async run => {
      const { createStorage } = await import('./src/storage.js');
      const { validateRun } = await import('./src/engine.js');
      const { contentForRun } = await import('./src/content/catalog.js');
      const s = createStorage({ validateRun: r => validateRun(r, contentForRun(r)) });
      await s.commitAuto(run, { expectedRevision: await s.getRevision() });
    }, run);
    await resume(page);
  }
  async function resume(page) {
    await page.reload(); await click(page, 'continue'); await click(page, 'accept-confirm');
  }
  async function read(page) {
    for (let i = 0; await page.locator(query('ack')).count(); i++) {
      assert.ok(i < 200); await click(page, 'ack');
    }
  }
  async function layout(page) {
    const b = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(b.scroll <= b.width + 1, JSON.stringify(b));
  }
  try {
    for (const [label, viewport, commander] of [
      ['pc', { width: 1440, height: 1000 }, 'commander.alphonse'],
      ['mobile', { width: 390, height: 844 }, 'commander.rosemond'],
    ]) {
      const ctx = await browser.newContext({ viewport }); const page = await ctx.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      await page.goto(url); await click(page, 'new');
      assert.equal(await page.locator('.speaker').textContent(), '記録');
      await click(page, 'ack'); await click(page, 'ack');
      assert.equal(await page.locator('.speaker').textContent(), '現王');
      await read(page); await click(page, 'select-commander', commander); await read(page);
      assert.equal(await page.locator('.trial-sidebar').count(), 0);
      assert.equal(await page.locator(query('tutorial-choice', 'b')).isDisabled(), true);
      for (const [i, locationId] of ['preparation', 'warehouse', 'servants'].entries()) {
        await click(page, 'tutorial-location', locationId);
        if (i === 0) { const before = await state(page); await resume(page); assert.deepEqual(await state(page), before); }
        await read(page);
        assert.equal(await page.locator(query('tutorial-choice', 'b')).isDisabled(), i !== 2);
      }
      for (const id of ['a', 'c']) { await click(page, 'tutorial-choice', id); await read(page); }
      await click(page, 'tutorial-location', 'warehouse'); await read(page);
      assert.equal((await state(page)).tutorial.investigatedLocationIds.length, 3);
      await click(page, 'tutorial-choice', 'b'); await click(page, 'ack');
      const success = await state(page); await resume(page); assert.deepEqual(await state(page), success); await read(page);
      assert.equal((await state(page)).position.phase, 'draft');
      assert.equal(await page.locator('.character-card').count(), 8);
      assert.doesNotMatch(await page.locator('.card-grid').textContent(), /歳|近接|遠隔|回復|テオ/);
      assert.equal(await page.locator(query('confirm-party')).isDisabled(), true);
      for (const c of Object.values(content.characters)) {
        const card = page.locator(query('profile', c.id));
        const img = card.locator('img'); await img.waitFor({ state: 'visible' });
        assert.equal(await img.evaluate(i => i.complete && i.naturalWidth > 0), true);
        const box = await card.locator('.portrait').boundingBox(); assert.ok(Math.abs(box.width - box.height) <= 1);
        await click(page, 'profile', c.id);
        assert.ok((await page.locator('.modal-body').textContent()).includes(`${c.age}歳`));
        const full = page.locator('.full-portrait img');
        const size = await full.evaluate(i => ({ w: i.clientWidth, h: i.clientHeight, nw: i.naturalWidth, nh: i.naturalHeight }));
        assert.ok(size.w > 150 && Math.abs(size.w / size.h - size.nw / size.nh) < .01, JSON.stringify(size));
        if (c.id === 'char.sandro') await page.screenshot({ path: path.join(out, `${label}-detail.png`), fullPage: true });
        await layout(page); await click(page, 'close-modal');
      }
      for (const id of h.defaultParty) { await click(page, 'profile', id); await click(page, 'toggle-party', id); }
      await page.screenshot({ path: path.join(out, `${label}-draft.png`), fullPage: true });
      await click(page, 'profile', 'char.madian'); assert.equal(await page.locator(query('toggle-party')).isDisabled(), true);
      assert.match(await page.locator('.modal-body').textContent(), /同行者は4名まで/); await click(page, 'close-modal');
      await click(page, 'confirm-party'); assert.equal(await page.locator('.confirmation-grid article').count(), 4);
      const confirm = await page.locator('.confirmation-grid').textContent();
      assert.doesNotMatch(confirm, /アルフォンス|ローズモンド|マディアン|ヴァンタルト|テオ/);
      await click(page, 'back-draft'); assert.equal(await page.locator('.character-card.selected').count(), 4);
      await click(page, 'confirm-party'); await click(page, 'depart');
      assert.equal((await state(page)).position.sceneId, 'prologue.court');
      assert.equal(await page.locator('.story-parties .member').count(), 8);
      await read(page); assert.equal((await state(page)).position.phase, 'map');
      for (const city of ['alba', 'hexerei', 'anchoring', 'rude']) assert.equal(await page.locator(query('region', city)).isDisabled(), false);
      // Actual UI retains Lisette D and Theo's cancellation semantics.
      await click(page, 'region', 'alba'); await click(page, 'ack-introduction'); await read(page);
      await click(page, 'choice', 'choice.alba.small1.a'); await click(page, 'accept-confirm'); await read(page); await click(page, 'next-trial');
      await click(page, 'ack-introduction'); await read(page);
      assert.equal(await page.locator(query('choice', 'choice.alba.small2.d')).count(), 0);
      await click(page, 'conversation', 'conversation.alba.small2.lisette'); await click(page, 'ack-conversation');
      assert.equal(await page.locator(query('choice', 'choice.alba.small2.d')).count(), 1);
      await click(page, 'choice', 'choice.alba.small2.d'); await click(page, 'accept-confirm'); await read(page);
      assert.equal((await state(page)).trialResults['alba.small2'].awardedPoints, 4);
      await click(page, 'next-trial'); await click(page, 'ack-introduction'); await read(page);
      await click(page, 'theo'); await click(page, 'cancel-confirm'); assert.equal(Object.keys((await state(page)).theoInvestigations).length, 0);
      await click(page, 'theo'); await click(page, 'accept-confirm'); await read(page); assert.equal(Object.keys((await state(page)).theoInvestigations).length, 1);
      // Arrive through the last real closing ACK, then resume mid-event and after it.
      let r = h.finishCity(h.start(h.defaultParty, commander), 'hexerei');
      r = h.finishCity(r, 'alba', { stopBeforeClosing: true }); await seed(page, r);
      while ((await state(page)).position.phase === 'chapterClosing') await click(page, 'ack');
      assert.equal((await state(page)).position.phase, 'storyEvent');
      assert.equal(await page.locator('.trial-sidebar, .chapter-path, .result-score, [data-action="region"]').count(), 0);
      assert.match(await page.locator('h1').textContent(), /双子の再会.*宿場/);
      await click(page, 'ack'); r = await state(page); await resume(page); assert.deepEqual(await state(page), r);
      await page.screenshot({ path: path.join(out, `${label}-reunion.png`), fullPage: true }); await layout(page);
      await read(page); assert.equal((await state(page)).storyEvents['event.midgame-reunion'].status, 'completed');
      await resume(page); assert.equal((await state(page)).position.phase, 'map');
      // Broken originals leave names, details and controls available.
      await page.route('**/companion-*.png', route => route.abort());
      await seed(page, h.draft(commander));
      assert.equal(await page.locator('.character-card').count(), 8);
      for (const id of h.defaultParty) { await click(page, 'profile', id); await click(page, 'toggle-party', id); }
      await click(page, 'confirm-party'); await click(page, 'depart'); await read(page);
      assert.equal((await state(page)).position.phase, 'map');
      // Historical content bypasses new tutorial/reunion, even after a new run has read them.
      let old = h.read(e.createRun(historical), historical);
      old = h.act(old, 'SELECT_COMMANDER', { commanderId: commander }, historical);
      await seed(page, old); assert.equal((await state(page)).position.phase, 'draft');
      assert.equal((await state(page)).tutorial, undefined);
      assert.equal(await page.locator('.official-portrait').count(), 0);
      report.scenarios.push({ label, commander, officialImages: 8, tutorialReload: true, correctReload: true,
        partyConfirmation: true, lisetteD: true, theoCancel: true, reunionReload: true, brokenImages: true, historical: true, status: 'passed' });
      await ctx.close();
    }
    assert.deepEqual(report.errors, []);
    await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
