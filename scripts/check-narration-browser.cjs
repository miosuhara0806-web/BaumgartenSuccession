const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

(async () => {
  const { defaultContent: content } = await import('../src/content/catalog.js');
  const e = await import('../src/engine.js');
  const { createHelpers } = await import('../tests/helpers/prologue.js');
  const { endingRun } = await import('../tests/helpers/ending.js');
  const h = createHelpers(content);
  // Compare typography with PR #9 before this follow-up, without changing saves.
  const originalCss = execFileSync('git', ['show', '906e32d:src/styles.css'], { encoding: 'utf8' });
  const out = path.resolve(process.env.NARRATION_BROWSER_OUTPUT || '../preview/narration-20261105');
  await mkdir(out, { recursive: true });
  const report = { scenarios: [], errors: [] };
  function samples(commanderId) {
    const list = [], add = (name, run, screenshot = false) => {
      e.validateRun(run, content);
      list.push({ name, run, screenshot });
    };
    let intro = e.createRun(content), speech = false;
    add('prologue-narration', intro, true);
    while (e.getCurrentText(intro, content)) {
      const page = e.getCurrentTextPage(intro, content);
      if (!speech && page.some(b => b.speakerId)) {
        add('prologue-speech', intro, true); speech = true;
      }
      intro = h.act(intro, 'ACK_TEXT');
    }
    assert.ok(speech);
    let departure = h.draft(commanderId);
    for (const characterId of h.defaultParty) departure = h.act(departure, 'TOGGLE_PARTY', { characterId });
    add('departure', h.act(h.act(departure, 'CONFIRM_PARTY'), 'DEPART'));
    let r = h.start(undefined, commanderId);
    for (const city of ['alba', 'hexerei', 'anchoring', 'rude', 'ehrenfels']) {
      let trial = h.act(r, 'START_REGION', { regionId: city });
      add(`${city}-introduction`, trial, city === 'alba');
      trial = h.read(trial);
      let conversation;
      for (let i = 0; i < 3; i++) {
        conversation = e.getAvailableConversations(trial, content).find(c => c.presentation === 'manuscript');
        if (conversation) break;
        if (i < 2) trial = h.read(h.act(h.read(h.choose(trial)), 'CONTINUE_TRIAL'));
      }
      assert.ok(conversation, `${city}: no eligible manuscript conversation`);
      add(`${city}-conversation`, h.act(trial, 'OPEN_CONVERSATION', { conversationId: conversation.id }), city === 'alba');
      let closing = h.finishCity(r, city, { stopBeforeClosing: true });
      if (city === 'alba') add('city-closing', closing);
      closing = h.read(closing, content, state => ['storyEvent', 'ending'].includes(state.position.phase));
      if (closing.position.phase === 'storyEvent') {
        while (closing.position.phase === 'storyEvent') {
          const stage = content.scenes[closing.position.sceneId]?.reunionStage;
          if (stage !== 'comic') add(`reunion-${stage}`, closing, true);
          closing = h.act(closing, 'ACK_TEXT');
        }
      }
      r = closing;
    }
    let ending = endingRun(90, commanderId, content);
    const seen = new Set();
    while (ending.position.phase === 'ending' && e.getCurrentText(ending, content)) {
      const scene = ending.position.sceneId;
      const page = e.getCurrentTextPage(ending, content);
      if (!seen.has(scene) && page.some(b => !b.speakerId)) {
        add(scene, ending, ['ending.return', 'ending.coronation-cg', 'ending.ensemble'].includes(scene));
        seen.add(scene);
      }
      ending = h.act(ending, 'ACK_TEXT');
    }
    assert.ok(seen.has('ending.return') && seen.has('ending.ensemble'));
    return list;
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  async function click(page, action) {
    await page.locator(`[data-action="${action}"]`).first().click();
    await page.waitForFunction(() => !document.querySelector('.busy-corner'));
  }
  async function install(page, run) {
    await page.evaluate(async run => {
      const { createStorage } = await import('./src/storage.js');
      const { contentForRun } = await import('./src/content/catalog.js');
      const { validateRun } = await import('./src/engine.js');
      const s = createStorage({ validateRun: r => validateRun(r, contentForRun(r)) });
      await s.commitAuto(run, { expectedRevision: await s.getRevision() });
    }, run);
    await page.reload(); await click(page, 'continue'); await click(page, 'accept-confirm');
  }
  async function typography(page) {
    return page.evaluate(() => {
      const prose = [...document.querySelectorAll('.dialogue-text, .novel-text, .manuscript-text p')].map(el => {
        const s = getComputedStyle(el), b = el.getBoundingClientRect();
        // Japanese closing punctuation may hang into the reserved half-em padding.
        const frame = el.closest('.manuscript-text') || el;
        const f = frame.getBoundingClientRect();
        return { size: s.fontSize, color: s.color, lineRatio: Number.parseFloat(s.lineHeight) / Number.parseFloat(s.fontSize),
          whiteSpace: s.whiteSpace, letterSpacing: s.letterSpacing, marginTop: s.marginTop, marginBottom: s.marginBottom,
          fits: frame.scrollWidth <= frame.clientWidth + 1 && b.left >= -1 && b.right <= innerWidth + 1 && b.left + el.scrollWidth <= f.right + 1,
          box: { left: b.left, right: b.right, frameRight: f.right, scroll: el.scrollWidth, client: el.clientWidth } };
      });
      const ui = [...document.querySelectorAll('.speaker, .face-icon, .read-indicator, .button, .trial-sidebar .small, .dialogue-panel > .small')].map(el => {
        const s = getComputedStyle(el);
        return [el.className, s.fontSize, s.color, s.lineHeight, s.marginTop, s.marginBottom];
      });
      return { prose, ui, text: document.querySelector('main').textContent, fits: document.documentElement.scrollWidth <= innerWidth + 1 };
    });
  }
  try {
    for (const [size, viewport, commanderId] of [
      ['pc', { width: 1440, height: 1000 }, 'commander.alphonse'],
      ['mobile', { width: 390, height: 844 }, 'commander.rosemond'],
      ['narrow', { width: 320, height: 740 }, 'commander.alphonse'],
    ]) {
      if (process.env.NARRATION_BROWSER_SIZE && size !== process.env.NARRATION_BROWSER_SIZE) continue;
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      await page.goto(process.env.NARRATION_BROWSER_URL || 'http://127.0.0.1:4173/');
      await page.locator('[data-action="new"]').waitFor();
      const selectors = new Set();
      for (const sample of samples(commanderId)) {
        await install(page, sample.run);
        const current = await typography(page);
        assert.ok(current.prose.length > 0, sample.name);
        assert.ok(current.fits, `${size}/${sample.name}: document overflow`);
        for (const p of current.prose) {
          assert.equal(p.size, size === 'pc' ? '16.2px' : '15px', `${size}/${sample.name}: font size`);
          assert.equal(p.color, 'rgb(36, 59, 53)', `${size}/${sample.name}: color`);
          if (!p.fits) await page.screenshot({ path: path.join(out, `${size}-overflow.png`), fullPage: true });
          assert.ok(p.fits, `${size}/${sample.name}: prose overflow ${JSON.stringify(p.box)}`);
        }
        for (const selector of ['.novel-text', '.manuscript-text .narration', '.narration-turn .dialogue-text']) {
          if (await page.locator(selector).count()) selectors.add(selector);
        }
        const baseline = await page.addStyleTag({ content: originalCss });
        const before = await typography(page);
        assert.deepEqual(current.ui, before.ui, `${sample.name}: supplemental typography changed`);
        assert.equal(current.text, before.text);
        assert.equal(current.prose.length, before.prose.length);
        current.prose.forEach((p, i) => {
          const old = before.prose[i];
          assert.ok(Math.abs(p.lineRatio - old.lineRatio) < .001, `${sample.name}: line spacing ratio changed`);
          assert.equal(p.whiteSpace, old.whiteSpace, `${sample.name}: white space`);
          for (const key of ['marginTop', 'marginBottom']) {
            assert.ok(Math.abs(Number.parseFloat(p[key]) / Number.parseFloat(p.size) - Number.parseFloat(old[key]) / Number.parseFloat(old.size)) < .001, `${sample.name}: ${key} ratio`);
          }
        });
        await baseline.evaluate(el => el.remove());
        if (sample.screenshot) {
          await page.locator('.toast').waitFor({ state: 'hidden' });
          await page.screenshot({ path: path.join(out, `${size}-${sample.name}.png`), fullPage: true });
        }
        assert.equal(await page.locator('.error-banner').count(), 0);
        report.scenarios.push({ size, scene: sample.name, paragraphs: current.prose.length, status: 'passed' });
      }
      assert.equal(selectors.size, 3);
      await context.close();
      console.log(`${size}: narration size/color, spacing, supplemental text and layout passed`);
    }
    assert.deepEqual(report.errors, []);
    await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ scenarios: report.scenarios.length, errors: report.errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
