/* Real Chromium acceptance, all 26 dialogues on PC and mobile.
 * Run standalone using start-preview.cjs or DIALOGUE_BROWSER_URL; set
 * DIALOGUE_BROWSER_NORMAL=1 for the unmodified app on npm start's URL.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const { content } = await import('../src/content/companion-dialogue-unified.js');
  const { content: old } = await import('../src/content/ehrenfels.js');
  const { getAvailableChoices } = await import('../src/engine.js');
  const { companionDialogueManuscript: manuscript } = await import('../src/content/companion-dialogue-manuscript.js');
  const { reviewParties } = await import('./companion-dialogue-review-seeds.js');
  const normal = process.env.DIALOGUE_BROWSER_NORMAL === '1';
  const out = path.resolve(process.env.DIALOGUE_BROWSER_OUTPUT || `../preview/companion-dialogue-20261030/browser-${normal?'app':'file'}`);
  await mkdir(out,{recursive:true});
  const url = process.env.DIALOGUE_BROWSER_URL || 'http://127.0.0.1:4204/';
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const report={url,mode:normal?'app':'standalone',viewports:[],conversations:[],errors:[],failedRequests:[]};
  const dbName=normal?'baumgarten-succession-v1':'baumgarten-succession-companion-dialogue-review-20261030';
  async function state(page) {
    return page.evaluate(async dbName=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const tx=db.transaction(['slots','readerProfile']);
      const get=(s,k)=>new Promise((resolve,reject)=>{const r=tx.objectStore(s).get(k);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const [slot,reader]=await Promise.all([get('slots','auto'),get('readerProfile','global')]);db.close();return {run:slot?.run,reader};
    },dbName);
  }
  async function click(page,action,id) {
    await page.locator(`[data-action="${action}"]${id?`[data-id="${id}"]`:''}`).first().click();
    await page.waitForFunction(()=>!document.querySelector('.busy-corner') && document.querySelector('.save-light')?.textContent!=='保存中…');
    assert.equal(await page.locator('.error-banner').count(),0);
  }
  async function layout(page) {
    const box=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
    assert.ok(box.scroll<=box.width+1 && box.body<=box.width+1,JSON.stringify(box));
  }
  async function save(page) { await click(page,'saves');await click(page,'save-slot','manual1');if(await page.locator('[data-action="accept-confirm"]').count()) await click(page,'accept-confirm'); }
  async function load(page) { await click(page,'saves');await click(page,'load-slot','manual1');await click(page,'accept-confirm'); }
  const score=r=>Object.values(r.trialResults).reduce((s,row)=>s+row.awardedPoints,0);
  const unchanged=(r,before)=>{
    assert.equal(score(r),score(before));assert.deepEqual(r.trialResults,before.trialResults);
    assert.deepEqual(r.theoInvestigations,before.theoInvestigations);
  };
  try {
    for(const [label,viewport] of [['pc',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
      for(const region of Object.keys(reviewParties)) {
        const context=await browser.newContext({viewport});
        const page=await context.newPage();
        page.on('pageerror',e=>report.errors.push(e.message));
        page.on('requestfailed',r=>report.failedRequests.push({url:r.url().slice(0,180),error:r.failure()?.errorText}));
        page.on('console',m=>{if(m.type()==='error') report.errors.push(m.text());});
        await page.goto(url);
        if(normal) {
          await click(page,'new');while(await page.locator('[data-action="ack"]').count()) await click(page,'ack');
          await click(page,'select-commander',region==='hexerei'?'commander.rosemond':'commander.alphonse');
          for(const actor of reviewParties[region]) {await click(page,'profile',`char.${actor}`);await click(page,'toggle-party',`char.${actor}`);}
          await click(page,'confirm-party');await click(page,'depart');
          while(await page.locator('[data-action="ack"]').count()) await click(page,'ack');
          await click(page,'region',region);await click(page,'ack-introduction');
          while(await page.locator('[data-action="ack"]').count()) await click(page,'ack');
        } else { await click(page,'review-dialogue',region);await click(page,'accept-confirm'); }
        assert.equal((await state(page)).run.contentVersion,content.contentVersion);
        let count=0, scrollable=0;
        for(const [trialIndex,key] of ['small1','small2','major'].entries()) {
          if(trialIndex>0) {await click(page,'ack-introduction');while(await page.locator('[data-action="ack"]').count()) await click(page,'ack');}
          const rows=manuscript.filter(row=>row.id.startsWith(`conversation.${region}.${key}.`));
          assert.deepEqual(await page.locator('[data-action="conversation"]').evaluateAll(els=>els.map(el=>el.dataset.id)),rows.map(row=>row.id));
          for(const [j,row] of rows.entries()) {
            const c=content.conversations[row.id],memoId=c.informationIdsOnComplete[0],name=content.characters[c.participantIds[0]].name;
            await save(page);
            const before=(await state(page)).run;
            const choices=Object.keys(content.trials).flatMap(id=>content.trials[id].choices);
            assert.deepEqual(choices,Object.keys(old.trials).flatMap(id=>old.trials[id].choices));
            await click(page,'conversation',row.id);
            const opened=(await state(page)).run;
            assert.equal(opened.acquiredInformation[memoId],undefined);assert.ok(!opened.heardConversationIds.includes(row.id));
            assert.equal(await page.locator('.conversation-title').textContent(),row.title);
            assert.equal(await page.locator('.conversation-text.manuscript-text').count(),1);
            assert.deepEqual(await page.locator('.conversation-text p').allTextContents(),row.lines);
            assert.deepEqual(await page.locator('.conversation-text p').evaluateAll(els=>els.map(el=>({label:el.getAttribute('aria-label'),kind:el.className}))),row.lines.map(t=>({label:t.startsWith('「')?`${name}の台詞`:'地の文',kind:t.startsWith('「')?'speech':'narration'})));
            assert.equal(await page.locator('[data-action="skip"]').isDisabled(),true);
            await layout(page);
            const overflow=await page.locator('.conversation-text').evaluate(el=>{
              el.scrollTop=el.scrollHeight;const last=el.lastElementChild.getBoundingClientRect(),box=el.getBoundingClientRect();
              return {scrollable:el.scrollHeight>el.clientHeight,end:el.scrollTop+el.clientHeight>=el.scrollHeight-1,last:last.bottom<=box.bottom+1};
            });
            assert.equal(overflow.end,true);assert.equal(overflow.last,true);if(overflow.scrollable) scrollable++;
            if(j===0 && trialIndex===0) {
              await page.screenshot({path:path.join(out,`${label}-${region}-end.png`),fullPage:true});
              await page.locator('.conversation-text').evaluate(el=>{el.scrollTop=0;});
              await page.screenshot({path:path.join(out,`${label}-${region}-start.png`),fullPage:true});
              // Reload while unconfirmed must not grant read status or memo.
              await page.reload();await click(page,'continue');await click(page,'accept-confirm');
              assert.deepEqual(await page.locator('.conversation-text p').allTextContents(),row.lines);
              assert.equal((await state(page)).run.acquiredInformation[memoId],undefined);
              await page.locator('.conversation-text').evaluate(el=>{el.scrollTop=el.scrollHeight;});
            }
            await click(page,'ack-conversation');
            let r=(await state(page)).run;unchanged(r,before);
            assert.ok(r.heardConversationIds.includes(row.id));assert.equal(r.acquiredInformation[memoId].sources.length,1);
            assert.deepEqual(await page.locator('.choice').evaluateAll(els=>els.map(el=>el.dataset.id)),getAvailableChoices(r,old).map(c=>c.id));
            await click(page,'log');
            const log=await page.locator('.log-entry p').evaluateAll(els=>els.map(el=>({text:el.textContent,speaker:el.closest('.log-entry').querySelector('strong').textContent})));
            assert.deepEqual(log.filter(p=>row.lines.includes(p.text)),row.lines.map(text=>({text,speaker:text.startsWith('「')?name:'地の文'})));
            await layout(page);await click(page,'close-modal');
            await click(page,'memo');assert.ok((await page.locator('.modal-body').textContent()).includes(content.information[memoId].summary));await layout(page);await click(page,'close-modal');
            // Every dialogue, not just one sample, must finish through read-skip.
            await load(page);assert.equal((await state(page)).run.acquiredInformation[memoId],undefined);
            await click(page,'log');await click(page,'close-modal');assert.equal((await state(page)).run.acquiredInformation[memoId],undefined);
            await click(page,'conversation',row.id);assert.equal(await page.locator('[data-action="skip"]').isDisabled(),false);
            await click(page,'skip');r=(await state(page)).run;unchanged(r,before);
            assert.equal(r.acquiredInformation[memoId].sources.length,1);assert.ok(r.heardConversationIds.includes(row.id));
            assert.deepEqual(await page.locator('.choice').evaluateAll(els=>els.map(el=>el.dataset.id)),getAvailableChoices(r,old).map(c=>c.id));await layout(page);
            report.conversations.push({viewport:label,id:row.id,title:row.title,paragraphs:row.lines.length,scrollable:overflow.scrollable,confirm:true,skip:true,log:true,memo:true,unchangedScoreChoiceDefinitionsAndTags:true,status:'passed'});count++;
          }
          await click(page,'choice',`choice.${region}.${key}.${'aab'[trialIndex]}`);await click(page,'accept-confirm');
          while(await page.locator('[data-action="ack"]').count()) await click(page,'ack');
          await click(page,'next-trial');while(await page.locator('[data-action="ack"]').count()) await click(page,'ack');
        }
        assert.equal(count,region==='alba'?10:8);
        const final=(await state(page)).run;assert.equal(final.position.phase,'map');assert.equal(final.chapterProgress[region].status,'completed');
        await save(page);await load(page);assert.deepEqual((await state(page)).run,final);
        await layout(page);report.viewports.push({label,region,count,scrollable,dbName,status:'passed'});
        console.log(`${normal?'app':'standalone'} ${label} ${region}: ${count} passed`);await context.close();
      }
    }
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);assert.equal(report.conversations.length,52);
    await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({cases:report.conversations.length,paragraphs:report.conversations.reduce((s,c)=>s+c.paragraphs,0),errors:report.errors,output:out}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
