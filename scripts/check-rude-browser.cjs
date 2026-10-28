/* Real Chromium acceptance checks. Run the local server first (npm start).
 * Requires Playwright; set PLAYWRIGHT_MODULE or install it outside the release.
 * No production save is accessed: every case gets a fresh browser context.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const { rudeManuscript: manuscript } = await import('../src/content/rude-manuscript.js');
  const out = path.resolve(process.env.RUDE_BROWSER_OUTPUT || '../preview/rude-20261028/browser');
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const report = { cases: [], errors: [], paragraphs: 0, conversations: 0, results: 0 };
  const url = process.env.RUDE_BROWSER_URL || 'http://127.0.0.1:4173/';
  const state = page => page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open(databases[0].name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction(['slots', 'readerProfile']);
    const get = (store, key) => new Promise((resolve, reject) => { const r = tx.objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const [slot, reader] = await Promise.all([get('slots','auto'), get('readerProfile','global')]);
    db.close(); return { run: slot?.run, reader, dbName: databases[0].name };
  });
  async function click(page, action, id) {
    const locator = page.locator(`[data-action="${action}"]${id ? `[data-id="${id}"]` : ''}`).first();
    await locator.click();
    await page.waitForFunction(() => !document.querySelector('.busy-corner') && document.querySelector('.save-light')?.textContent !== '保存中…');
    assert.equal(await page.locator('.error-banner').count(), 0);
  }
  async function resume(page) {
    await page.reload(); await page.locator('[data-action="continue"]').waitFor();
    await click(page, 'continue'); await click(page, 'accept-confirm');
  }
  async function save(page, slot) { await click(page,'saves'); await click(page,'save-slot',slot); }
  async function load(page, slot) { await click(page,'saves'); await click(page,'load-slot',slot); await click(page,'accept-confirm'); }
  async function checkLayout(page) {
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(layout.scroll <= layout.width + 1, JSON.stringify(layout));
  }
  async function start(page, commander) {
    await page.goto(url); await click(page,'new');
    await page.locator('[data-action="ack"]').waitFor();
    while (await page.locator('[data-action="ack"]').count()) await click(page,'ack');
    await click(page,'select-commander',`commander.${commander}`);
    // Commander portraits must remain loaded.
    for (const actor of ['madian','olivel','sandro','lisette']) {
      await click(page,'profile',`char.${actor}`); await click(page,'toggle-party',`char.${actor}`);
    }
    await click(page,'confirm-party'); await click(page,'depart');
    await page.locator('[data-action="ack"]').waitFor();
    while (await page.locator('[data-action="ack"]').count()) await click(page,'ack');
    assert.equal(await page.locator('[data-id="ehrenfels"]').isDisabled(),true);
    assert.equal(await page.locator('.kingdom-map img').evaluate(el=>el.complete && el.naturalWidth>0),true);
    await click(page,'region','rude');
  }
  try {
    for (const [label, viewport, commander] of [['pc',{width:1440,height:1000},'alphonse'], ['mobile',{width:390,height:844},'rosemond']]) {
      for (const [routeIndex, route] of ['bac','acb','cba'].entries()) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        await start(page,commander);
        const commanderName = commander === 'alphonse' ? 'アルフォンス' : 'ローズモンド';
        for (const [i,row] of manuscript.trials.entries()) {
          const trialId = `rude.${row.key}`;
          const paragraphs = await page.locator('.novel-text p').allTextContents();
          assert.deepEqual(paragraphs,row.introduction.replaceAll('【主人公】',commanderName).split('\n\n'));
          await checkLayout(page); await click(page,'ack-introduction');
          assert.equal(await page.locator('.choice').count(),3);
          const expectedActors = row.conversations.map(c=>`conversation.${trialId}.${c.actor}`);
          assert.deepEqual(await page.locator('[data-action="conversation"]').evaluateAll(els=>els.map(el=>el.dataset.id)), expectedActors);
          if (routeIndex === 0) {
            for (const [j,dialogue] of row.conversations.entries()) {
              const conversationId = expectedActors[j], memoId=`info.${trialId}.${dialogue.actor}`;
              if (i===0 && j===0) await save(page,'manual1');
              await click(page,'conversation',conversationId);
              assert.equal((await state(page)).run.acquiredInformation[memoId],undefined);
              assert.deepEqual(await page.locator('.conversation-text p').allTextContents(),dialogue.lines);
              const name={sandro:'サンドロ',olivel:'オリヴェル',madian:'マディアン',lisette:'リゼット'}[dialogue.actor];
              assert.equal(await page.locator('.dialogue-panel .speaker').textContent(),name);
              assert.equal(await page.locator('.conversation-title').textContent(),dialogue.title);
              assert.deepEqual(await page.locator('.conversation-text p').evaluateAll(els=>els.map(el=>el.getAttribute('aria-label'))),dialogue.lines.map(t=>t.startsWith('「')?`${name}の台詞`:'地の文'));
              await checkLayout(page);
              const overflow=await page.locator('.conversation-text').evaluate(el=>{ el.scrollTop=el.scrollHeight; const last=el.lastElementChild.getBoundingClientRect(),box=el.getBoundingClientRect(); return {end:el.scrollTop+el.clientHeight>=el.scrollHeight-1,last:last.bottom<=box.bottom+1}; });
              assert.deepEqual(overflow,{end:true,last:true});
              if (i===0 && j===1) {
                await page.locator('.toast').waitFor({state:'hidden'});
                await page.screenshot({path:path.join(out,`${label}-olivel-full-conversation.png`),fullPage:true});
                await page.locator('.conversation-text').evaluate(el=>{el.scrollTop=0;});
                await page.screenshot({path:path.join(out,`${label}-olivel-conversation-start.png`),fullPage:true});
                await resume(page);
                assert.deepEqual(await page.locator('.conversation-text p').allTextContents(),dialogue.lines);
                assert.equal((await state(page)).run.acquiredInformation[memoId],undefined);
              }
              await click(page,'ack-conversation');
              assert.ok((await state(page)).run.acquiredInformation[memoId]);
              assert.equal(await page.locator(`[data-id="${conversationId}"]`).count(),0);
              if (i===0 && j===0) {
                await save(page,'manual2'); await load(page,'manual1');
                assert.equal((await state(page)).run.acquiredInformation[memoId],undefined);
                await click(page,'log'); await click(page,'close-modal');
                assert.equal((await state(page)).run.acquiredInformation[memoId],undefined);
                await click(page,'conversation',conversationId);
                assert.equal(await page.locator('[data-action="skip"]').isDisabled(),false);
                await click(page,'skip'); assert.ok((await state(page)).run.acquiredInformation[memoId]);
                await load(page,'manual2');
              }
              report.conversations++; report.paragraphs+=dialogue.lines.length;
            }
            await click(page,'log');
            const logText=await page.locator('.modal-body').textContent();
            for (const dialogue of row.conversations) for (const paragraph of dialogue.lines) assert.ok(logText.includes(paragraph));
            await click(page,'close-modal');
          }
          if (i===2 && routeIndex===0) {
            await click(page,'theo'); await click(page,'cancel-confirm');
            assert.deepEqual((await state(page)).run.theoInvestigations,{});
            await click(page,'theo'); await click(page,'accept-confirm');
            assert.equal(await page.locator('.trial-main h2').textContent(),manuscript.theo.reportTitle);
            assert.equal(await page.locator('.dialogue-text').textContent(),manuscript.theo.report);
            assert.equal(Object.keys((await state(page)).run.theoInvestigations).length,1);
            await resume(page); await click(page,'ack');
            assert.equal(await page.locator('.choice').count(),3);
            assert.equal(await page.locator('[data-action="theo"]').count(),0);
          }
          const choice=row.choices.find(c=>c.letter===route[i]);
          await click(page,'choice',`choice.${trialId}.${choice.letter}`); await click(page,'accept-confirm');
          assert.equal(await page.locator('.dialogue-text').textContent(),choice.reaction.replaceAll('【主人公】',commanderName));
          assert.equal(await page.locator('.trial-main .memo-text').textContent(),choice.evaluationReason);
          assert.equal((await state(page)).run.acquiredInformation[`info.${trialId}.result.${choice.letter}`],undefined);
          await checkLayout(page);
          if (i===2 && routeIndex===0) await page.screenshot({path:path.join(out,`${label}-major-result.png`),fullPage:true});
          await click(page,'ack');
          const r=(await state(page)).run;
          assert.ok(r.acquiredInformation[`info.${trialId}.result.${choice.letter}`]);
          for (const other of 'abc') if (other!==choice.letter) assert.equal(r.acquiredInformation[`info.${trialId}.result.${other}`],undefined);
          await click(page,'next-trial'); report.results++;
        }
        const before=await state(page);
        assert.equal(Object.values(before.run.trialResults).reduce((s,r)=>s+r.awardedPoints,0),[14,20,17][routeIndex]);
        assert.equal(before.run.chapterProgress.rude.status,'completed');
        assert.equal(before.run.contentVersion,'alba-hexerei-anchoring-rude-2026-10-28');
        await click(page,'record','rude'); await checkLayout(page);
        if (routeIndex===0) await page.screenshot({path:path.join(out,`${label}-completed-record.png`),fullPage:true});
        await click(page,'close-modal'); await resume(page);
        assert.deepEqual((await state(page)).run,before.run);
        report.cases.push({label,route,score:[14,20,17][routeIndex],dbName:before.dbName,status:'passed'});
        console.log(`${label} ${route}: passed`);
        await context.close();
      }
    }
    assert.deepEqual(report.errors,[]);
    await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
