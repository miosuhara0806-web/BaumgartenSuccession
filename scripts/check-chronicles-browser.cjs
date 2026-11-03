const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {mkdir,writeFile}=require('node:fs/promises');
const path=require('node:path');
(async()=>{
  const {defaultContent:content}=await import('../src/content/catalog.js');
  const {content:old}=await import('../src/content/ending.js');
  const {endingRun}=await import('../tests/helpers/ending.js');
  const {createHelpers}=await import('../tests/helpers/prologue.js');
  const last=(score,commanderId,pack)=>{
    const r=endingRun(score,commanderId,pack);
    r.position={phase:'ending',sceneId:pack.officialEnding.lastSceneId,blockIndex:0};return r;
  };
  const rose71=last(71,'commander.rosemond',content),alpha100=last(100,'commander.alphonse',old),map=createHelpers(content).start();
  const out=path.resolve(process.env.CHRONICLES_BROWSER_OUTPUT||'../preview/chronicles-20261103');await mkdir(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const report={scenarios:[],errors:[]},q=(action,id)=>`[data-action="${action}"]${id?`[data-id="${id}"]`:''}`;
  async function click(page,action,id){await page.locator(q(action,id)).first().click();await page.waitForFunction(()=>!document.querySelector('.busy-corner'));assert.equal(await page.locator('.error-banner').count(),0);}
  async function snapshot(page){return page.evaluate(async()=>{
    const {createStorage}=await import('./src/storage.js');const{contentForRun}=await import('./src/content/catalog.js');const{validateRun}=await import('./src/engine.js');
    const s=createStorage({contentStatus:'reviewed',validateRun:r=>validateRun(r,contentForRun(r))});
    return{slots:await s.listSlots(),reader:await s.getReaderProfile(),records:await s.listChronicles(),revision:await s.getRevision()};
  });}
  async function install(page,run,complete=false){await page.evaluate(async({run,complete})=>{
    const{createStorage}=await import('./src/storage.js');const{contentForRun}=await import('./src/content/catalog.js');const e=await import('./src/engine.js');
    const s=createStorage({contentStatus:'reviewed',validateRun:r=>e.validateRun(r,contentForRun(r))});
    if(complete){const pack=contentForRun(run);const next=e.transition(run,{type:'ACK_TEXT'},pack);await s.recordCompletion(next,e.buildEndingRecord(next,pack),{expectedRevision:await s.getRevision()});}
    else await s.commitAuto(run,{expectedRevision:await s.getRevision()});
  },{run,complete});await page.reload();await page.locator(q('new')).waitFor();}
  async function layout(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  async function facts(locator){return locator.locator('.chronicle-facts > div').evaluateAll(rows=>Object.fromEntries(rows.map(el=>[el.querySelector('dt').textContent,el.querySelector('dd').textContent])));}
  try{
    for(const[size,viewport]of[['pc',{width:1440,height:1000}],['mobile',{width:390,height:844}],['narrow',{width:320,height:740}]]){
      const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();
      page.on('pageerror',e=>report.errors.push(`${size}: ${e.message}`));
      await page.goto(process.env.CHRONICLES_BROWSER_URL||'http://127.0.0.1:4173/');await page.locator(q('new')).waitFor();
      assert.equal(await page.locator(q('chronicles')).count(),0);
      await install(page,rose71);await click(page,'continue');await click(page,'accept-confirm');await click(page,'ack-page');
      await page.locator('.fin-page').waitFor();await click(page,'fin-title');assert.equal(await page.locator(q('chronicles')).count(),1);
      await page.screenshot({path:path.join(out,`${size}-title.png`),fullPage:true});
      const before=await snapshot(page);assert.equal(before.records.length,1);
      await click(page,'chronicles');await page.locator('.chronicle-card').waitFor();
      const shown=await facts(page.locator('.chronicle-card'));
      assert.equal(shown['指揮官'],'ローズモンド');assert.equal(shown['即位者'],'アルフォンス');assert.equal(shown['最終継承点'],'71／100');
      assert.equal(shown['総合評価'],'もう一方の双子が即位');await layout(page);
      await page.screenshot({path:path.join(out,`${size}-list-71.png`),fullPage:true});
      await click(page,'chronicle-detail',before.records[0].completionKey);await layout(page);
      assert.equal(await page.locator('.chronicle-page ul li').count(),4);
      assert.equal(await page.locator('.chronicle-policies > div').count(),5);
      assert.equal(await page.locator('.chronicle-text').count(),2);
      assert.ok(!(await page.locator('.chronicle-page').textContent()).includes('の後日談（保存本文）'));
      assert.equal(Object.keys(before.records[0].companionAfterwordSnapshots).length,4);
      await page.screenshot({path:path.join(out,`${size}-detail.png`),fullPage:true});
      const epilogue=page.locator('.chronicle-text').first();await epilogue.locator('summary').click();
      const prose=epilogue.locator('.chronicle-prose');
      assert.equal((await prose.locator('p').allTextContents()).join('\n\n'),before.records[0].epilogueSnapshot);
      assert.ok(await prose.evaluate(el=>el.clientHeight<=innerHeight*.65+1&&el.scrollHeight>el.clientHeight));
      await prose.focus();await page.keyboard.press('End');await layout(page);
      await page.screenshot({path:path.join(out,`${size}-saved-text.png`),fullPage:true});
      assert.deepEqual(await snapshot(page),before);
      await click(page,'chronicles-back');await click(page,'chronicle-detail',before.records[0].completionKey);
      const ensemble=page.locator('.chronicle-text').nth(1);await ensemble.locator('summary').click();
      assert.equal((await ensemble.locator('p').allTextContents()).join('\n\n'),before.records[0].ensembleAfterwordSnapshot);
      await click(page,'chronicles-back');await click(page,'chronicles-title');assert.deepEqual(await snapshot(page),before);
      await click(page,'continue');await click(page,'accept-confirm');assert.equal(await page.locator('.fin-page').count(),1);
      assert.equal((await snapshot(page)).records.length,1);
      await click(page,'fin-title');await click(page,'new');await click(page,'accept-confirm');
      assert.equal((await snapshot(page)).slots.auto.run.position.phase,'intro');
      await click(page,'title');await click(page,'accept-confirm');await page.locator('.title-page').waitFor();assert.equal(await page.locator(q('chronicles')).count(),1);
      await click(page,'chronicles');assert.equal(await page.locator('.chronicle-card').count(),1);await click(page,'chronicles-title');
      assert.deepEqual((await snapshot(page)).records,before.records);

      // Exercise the regular save/load UI after browsing, at a legal map checkpoint.
      await install(page,map);await click(page,'continue');await click(page,'accept-confirm');
      await click(page,'saves');await click(page,'save-slot','manual1');
      const savedMap=(await snapshot(page)).slots.manual1.run;
      await click(page,'title');await click(page,'accept-confirm');
      await click(page,'chronicles');await click(page,'chronicles-title');
      await click(page,'saves');await click(page,'load-slot','manual1');await click(page,'accept-confirm');
      assert.deepEqual((await snapshot(page)).slots.auto.run,savedMap);assert.deepEqual((await snapshot(page)).records,before.records);

      // An older official content edition supplies a second, distinct completion snapshot.
      await install(page,alpha100,true);await click(page,'chronicles');
      const multiple=await snapshot(page);assert.equal(multiple.records.length,2);
      assert.equal(await page.locator('.chronicle-card').count(),2);
      assert.equal((await facts(page.locator('.chronicle-card').first()))['最終継承点'],'100／100');
      for(const record of multiple.records){await click(page,'chronicle-detail',record.completionKey);assert.equal((await facts(page.locator('.chronicle-page')))['最終継承点'],`${record.finalScore}／100`);await click(page,'chronicles-back');}
      await layout(page);await page.screenshot({path:path.join(out,`${size}-multiple.png`),fullPage:true});
      await click(page,'chronicles-title');assert.deepEqual(await snapshot(page),multiple);
      report.scenarios.push({size,unclearedHidden:true,unlockedAfterFIN:true,rose71Sovereign:'アルフォンス',readOnly:true,storedTextExact:true,finLoad:true,newRunRetains:true,manualSaveLoad:true,oldAndNewRecords:2,status:'passed'});
      console.log(`${size}: history, saved text, read-only browsing, FIN/load and new runs passed`);await context.close();
    }
    assert.deepEqual(report.errors,[]);await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({scenarios:report.scenarios.length,errors:report.errors,status:'passed'}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
