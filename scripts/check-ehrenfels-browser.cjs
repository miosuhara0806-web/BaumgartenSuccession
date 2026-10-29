/* Real Chromium acceptance checks. Run the local server first (npm start).
 * Requires Playwright; set PLAYWRIGHT_MODULE or install it outside the release.
 * No production save is accessed: every case gets a fresh browser context.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const { ehrenfelsManuscript: manuscript } = await import('../src/content/ehrenfels-manuscript.js');
  const out = path.resolve(process.env.EHRENFELS_BROWSER_OUTPUT || '../preview/ehrenfels-20261029/browser');
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const report = { cases: [], errors: [], paragraphs: 0, conversations: 0, results: 0 };
  const url = process.env.EHRENFELS_BROWSER_URL || 'http://127.0.0.1:4173/';
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
  async function start(page, commander, routeIndex) {
    await page.goto(url);
    if (process.env.EHRENFELS_REVIEW_SHORTCUT === '1') {
      await click(page,'review-capital',routeIndex===0?'a':'b');
      await click(page,'accept-confirm');
      assert.equal(await page.locator('[data-id="ehrenfels"]').isDisabled(),false);
      await click(page,'region','ehrenfels');
      return;
    }
    await click(page,'new');
    await page.locator('[data-action="ack"]').waitFor();
    while (await page.locator('[data-action="ack"]').count()) await click(page,'ack');
    await click(page,'select-commander',`commander.${commander}`);
    // Commander portraits must remain loaded.
    for (const actor of (routeIndex===0?['heidemarie','frederica','harold','lisette']:['heidemarie','harold','madian','lisette'])) {
      await click(page,'profile',`char.${actor}`); await click(page,'toggle-party',`char.${actor}`);
    }
    await click(page,'confirm-party'); await click(page,'depart');
    await page.locator('[data-action="ack"]').waitFor();
    while (await page.locator('[data-action="ack"]').count()) await click(page,'ack');
    assert.equal(await page.locator('[data-id="ehrenfels"]').isDisabled(),true);
    assert.equal(await page.locator('.kingdom-map img').evaluate(el=>el.complete && el.naturalWidth>0),true);
    const normalRoutes={alba:'acb',hexerei:'aab',anchoring:'bab',rude:'acb'};
    for (const [regionId, letters] of Object.entries(normalRoutes)) {
      assert.equal(await page.locator('[data-id="ehrenfels"]').isDisabled(),true);
      await click(page,'region',regionId);
      for (const [i,letter] of [...letters].entries()) {
        await click(page,'ack-introduction');
        while(await page.locator('[data-action="ack"]').count()) await click(page,'ack');
        // Use one earlier city, reserving the second shared investigation for the capital.
        if (regionId==='rude' && i===2 && routeIndex===0) {
          await click(page,'theo'); await click(page,'accept-confirm'); await click(page,'ack');
        }
        await click(page,'choice',`choice.${regionId}.${['small1','small2','major'][i]}.${letter}`);
        await click(page,'accept-confirm');
        while(await page.locator('[data-action="ack"]').count()) await click(page,'ack');
        await click(page,'next-trial');
        while(await page.locator('[data-action="ack"]').count()) await click(page,'ack');
      }
    }
    assert.equal(await page.locator('[data-id="ehrenfels"]').isDisabled(),false);
    assert.equal(Object.values((await state(page)).run.trialResults).reduce((s,r)=>s+r.awardedPoints,0),80);
    await checkLayout(page);
    await page.screenshot({path:path.join(out,`${commander}-${routeIndex}-capital-unlocked.png`),fullPage:true});
    await click(page,'region','ehrenfels');
  }
  try {
    for (const [label, viewport, commander] of [['pc',{width:1440,height:1000},'alphonse'], ['mobile',{width:390,height:844},'rosemond']]) {
      for (const [routeIndex, route] of ['cbc','baa','acb'].entries()) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        const effectiveCommander=process.env.EHRENFELS_REVIEW_SHORTCUT==='1'?(routeIndex===0?'alphonse':'rosemond'):commander;
        await start(page,effectiveCommander,routeIndex);
        const commanderName = effectiveCommander === 'alphonse' ? 'アルフォンス' : 'ローズモンド';
        for (const [i,row] of manuscript.trials.entries()) {
          const trialId = `ehrenfels.${row.key}`;
          const paragraphs = await page.locator('.novel-text p').allTextContents();
          assert.deepEqual(paragraphs,row.introduction.replaceAll('【主人公】',commanderName).split('\n\n'));
          await checkLayout(page); await click(page,'ack-introduction');
          assert.equal(await page.locator('.choice').count(),3);
          const expectedActors = row.conversations.filter(c=>(routeIndex===0?['heidemarie','frederica','harold','lisette']:['heidemarie','harold','madian','lisette']).includes(c.actor)).map(c=>`conversation.${trialId}.${c.actor}`);
          assert.deepEqual(await page.locator('[data-action="conversation"]').evaluateAll(els=>els.map(el=>el.dataset.id)), expectedActors);
          if (routeIndex < 2) {
            for (const [j,dialogue] of row.conversations.filter(c=>expectedActors.includes(`conversation.${trialId}.${c.actor}`)).entries()) {
              const conversationId = expectedActors[j], memoId=`info.${trialId}.${dialogue.actor}`;
              if (i===0 && j===0) await save(page,'manual1');
              await click(page,'conversation',conversationId);
              assert.equal((await state(page)).run.acquiredInformation[memoId],undefined);
              assert.deepEqual(await page.locator('.conversation-text p').allTextContents(),dialogue.lines);
              const name={heidemarie:'ハイデマリー',frederica:'フレデリカ',harold:'ハロルド',madian:'マディアン',lisette:'リゼット'}[dialogue.actor];
              assert.equal(await page.locator('.dialogue-panel .speaker').textContent(),name);
              assert.equal(await page.locator('.conversation-title').textContent(),dialogue.title);
              assert.deepEqual(await page.locator('.conversation-text p').evaluateAll(els=>els.map(el=>el.getAttribute('aria-label'))),dialogue.lines.map(t=>t.startsWith('「')?`${name}の台詞`:'地の文'));
              await checkLayout(page);
              const overflow=await page.locator('.conversation-text').evaluate(el=>{ el.scrollTop=el.scrollHeight; const last=el.lastElementChild.getBoundingClientRect(),box=el.getBoundingClientRect(); return {end:el.scrollTop+el.clientHeight>=el.scrollHeight-1,last:last.bottom<=box.bottom+1}; });
              assert.deepEqual(overflow,{end:true,last:true});
              if (i===0 && j===0) {
                await page.locator('.toast').waitFor({state:'hidden'});
                await page.screenshot({path:path.join(out,`${label}-narrative-full-conversation.png`),fullPage:true});
                await page.locator('.conversation-text').evaluate(el=>{el.scrollTop=0;});
                await page.screenshot({path:path.join(out,`${label}-narrative-conversation-start.png`),fullPage:true});
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
            const logParagraphs=await page.locator('.log-entry p').evaluateAll(els=>els.map(el=>({text:el.textContent,speaker:el.closest('.log-entry').querySelector('strong').textContent})));
            for(const dialogue of row.conversations.filter(c=>expectedActors.includes(`conversation.${trialId}.${c.actor}`))) {
              const name={heidemarie:'ハイデマリー',frederica:'フレデリカ',harold:'ハロルド',madian:'マディアン',lisette:'リゼット'}[dialogue.actor];
              assert.deepEqual(logParagraphs.filter(p=>dialogue.lines.includes(p.text)).map(p=>({text:p.text,speaker:p.speaker})),dialogue.lines.map(text=>({text,speaker:text.startsWith('「')?name:'地の文'})));
            }
            for (const dialogue of row.conversations.filter(c=>expectedActors.includes(`conversation.${trialId}.${c.actor}`))) for (const paragraph of dialogue.lines) assert.ok(logText.includes(paragraph));
            await click(page,'close-modal');
          }
          if (i===2 && routeIndex===0) {
            await click(page,'theo'); await click(page,'cancel-confirm');
            assert.equal(Object.keys((await state(page)).run.theoInvestigations).length,process.env.EHRENFELS_REVIEW_SHORTCUT==='1'?0:1);
            await click(page,'theo'); await click(page,'accept-confirm');
            assert.equal(await page.locator('.trial-main h2').textContent(),manuscript.theo.reportTitle);
            assert.equal(await page.locator('.dialogue-text').textContent(),manuscript.theo.report);
            assert.equal(Object.keys((await state(page)).run.theoInvestigations).length,process.env.EHRENFELS_REVIEW_SHORTCUT==='1'?1:2);
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
        assert.equal(Object.values(before.run.trialResults).reduce((s,r)=>s+r.awardedPoints,0),80+[14,20,17][routeIndex]);
        assert.equal(before.run.chapterProgress.ehrenfels.status,'completed');
        assert.equal(before.run.contentVersion,'alba-hexerei-anchoring-rude-ehrenfels-2026-10-29');
        assert.equal(before.run.position.phase,'map');
        assert.equal(before.run.endingSnapshot,undefined);
        assert.equal(before.run.completionKey,undefined);
        assert.ok((await page.locator('.notice').allTextContents()).some(t=>t.includes('正式な最終判断') && t.includes('未実装')));
        for (const id of ['alba','hexerei','anchoring','rude','ehrenfels']) {
          assert.equal(before.run.chapterProgress[id].status,'completed');
          await click(page,'record',id); await checkLayout(page); await click(page,'close-modal');
        }
        await click(page,'memo');
        for(const id of Object.keys(before.run.acquiredInformation).filter(id=>id.startsWith('info.ehrenfels.'))) {
          const {content}=await import('../src/content/ehrenfels.js');
          assert.ok((await page.locator('.modal-body').textContent()).includes(content.information[id].summary));
        }
        await click(page,'close-modal');
        await save(page,'manual3'); await load(page,'manual3');
        await click(page,'record','ehrenfels'); await checkLayout(page);
        if (routeIndex===0) await page.screenshot({path:path.join(out,`${label}-completed-record.png`),fullPage:true});
        await click(page,'close-modal'); await resume(page);
        assert.deepEqual((await state(page)).run,before.run);
        report.cases.push({label,route,totalScore:80+[14,20,17][routeIndex],score:[14,20,17][routeIndex],dbName:before.dbName,status:'passed'});
        console.log(`${label} ${route}: passed`);
        await context.close();
      }
    }
    assert.deepEqual(report.errors,[]);
    await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
