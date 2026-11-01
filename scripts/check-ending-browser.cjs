const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {mkdir,writeFile}=require('node:fs/promises');
const path=require('node:path');
(async()=>{
  const {content}=await import('../src/content/ending.js');
  const {endingRun}=await import('../tests/helpers/ending.js');
  const out=path.resolve(process.env.ENDING_BROWSER_OUTPUT||'../preview/ending-20261101/browser');
  const url=process.env.ENDING_BROWSER_URL||'http://127.0.0.1:4173/';
  await mkdir(out,{recursive:true});
  const report={scenarios:[],errors:[]};
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const q=(action,id)=>`[data-action="${action}"]${id?`[data-id="${id}"]`:''}`;
  async function click(page,action,id){await page.locator(q(action,id)).first().click();await page.waitForFunction(()=>!document.querySelector('.busy-corner'));assert.equal(await page.locator('.error-banner').count(),0);}
  async function saved(page){return page.evaluate(async()=>{
    const{createStorage}=await import('./src/storage.js');const{contentForRun}=await import('./src/content/catalog.js');const{validateRun}=await import('./src/engine.js');
    const s=createStorage({validateRun:r=>validateRun(r,contentForRun(r))});
    return{run:(await s.getSlot('auto')).run,reader:await s.getReaderProfile(),revision:await s.getRevision(),records:await s.listChronicles()};
  });}
  async function resume(page){await page.reload();await click(page,'continue');await click(page,'accept-confirm');}
  async function layout(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  try {
    for(const [size,viewport]of [['pc',{width:1440,height:1000}],['mobile',{width:390,height:844}]])
    for(const commanderId of Object.keys(content.commanders))for(const score of [90,85,79]) {
      if(process.env.ENDING_BROWSER_CASE&&`${size}-${commanderId.split('.')[1]}-${score}`!==process.env.ENDING_BROWSER_CASE)continue;
      const label=`${size}-${commanderId.split('.')[1]}-${score}`;
      const context=await browser.newContext({viewport,reducedMotion:report.scenarios.length===0?'no-preference':'reduce'});
      const page=await context.newPage();page.on('pageerror',error=>report.errors.push(`${label}: ${error.message}`));
      await page.goto(url);await page.locator(q('new')).waitFor();
      const initial=endingRun(score,commanderId);
      await page.evaluate(async run=>{
        const{createStorage}=await import('./src/storage.js');const{validateRun}=await import('./src/engine.js');const{contentForRun}=await import('./src/content/catalog.js');
        const s=createStorage({validateRun:r=>validateRun(r,contentForRun(r))});await s.commitAuto(run,{expectedRevision:await s.getRevision()});
      },initial);
      await resume(page);
      const seen=new Set(),voices=new Set(),corrections=new Set();let pages=0,imageFailureChecked=false;
      while(await page.locator('.ending-page').count()) {
        assert.ok(++pages<220);const before=await saved(page),scene=before.run.position.sceneId;
        assert.doesNotMatch(await page.locator('.ending-page').textContent(),/主人公|○○の場合|継承点\d|が単独最多/);
        const shownText=await page.locator('.ending-page').textContent();
        for(const text of ['エーレンフェルスで最後の判断を終え、一行は王城へ戻った。','「同じじゃない？」','「変えたくない人もいる」'])if(shownText.includes(text))corrections.add(text);
        await layout(page);
        if(scene==='ending.ensemble') {
          for(const id of Object.keys(content.characters)) {
            const name=content.characters[id].name;
            const labels=page.locator('.speaker').filter({hasText:name});
            if(await labels.count()) {
              const img=labels.first().locator('img');await img.evaluate(el=>el.decode());
              assert.equal(await img.getAttribute('src'),content.portraits[id].src);voices.add(id);
            }
          }
        }
        if(!seen.has(scene)) {
          seen.add(scene);
          if(['ending.assessment','ending.verdict','ending.coronation','ending.ensemble','ending.farewell'].includes(scene))await page.screenshot({path:path.join(out,`${label}-${scene.split('.')[1]}.png`),fullPage:true});
          if(scene==='ending.coronation-cg') {
            const king=before.run.endingResult.sovereignId;
            const img=page.locator('.coronation-fit img');await img.evaluate(el=>el.decode());
            assert.equal(await img.getAttribute('src'),`./src/assets/戴冠式${content.commanders[king].name}.png`);
            const box=await img.evaluate(el=>{const b=el.getBoundingClientRect();return{ratio:b.width/b.height,bottom:b.bottom,textTop:document.querySelector('.dialogue-panel').getBoundingClientRect().top};});
            assert.ok(Math.abs(box.ratio-1130/753)<0.01);assert.ok(box.bottom<=box.textTop);
            await page.screenshot({path:path.join(out,`${label}-coronation-cg.png`),fullPage:true});
            await page.locator('.comic-zoom summary').click();await page.locator('.comic-zoom-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;el.scrollLeft=el.scrollWidth;});await layout(page);
            await page.locator('.comic-zoom summary').click();
          }
          if(['ending.assessment','ending.coronation-cg','ending.ensemble'].includes(scene)) {
            await click(page,'saves');await click(page,'save-slot','manual1');
            if(await page.locator(q('accept-confirm')).count())await click(page,'accept-confirm');
            await click(page,'saves');await click(page,'load-slot','manual1');await click(page,'accept-confirm');
            assert.deepEqual((await saved(page)).run,before.run);
          }
          if(scene==='ending.coronation-cg'&&size==='mobile'&&score===79) {
            await page.route(target=>decodeURIComponent(target.pathname).includes('/戴冠式'),route=>route.abort());
            await resume(page);await page.locator('.coronation-fit .comic-fallback').waitFor({state:'visible'});
            assert.deepEqual((await saved(page)).run,before.run);imageFailureChecked=true;
          }
        }
        await click(page,'ack-page');
        if(await page.locator('.ending-page').count()) {
          const after=await saved(page);await click(page,'read-prev');assert.equal(await page.locator(q('skip')).isDisabled(),true);
          await click(page,'read-forward');assert.deepEqual(await saved(page),after);
        }
      }
      const complete=await saved(page);assert.equal(complete.run.position.phase,'completed');assert.equal(complete.records.length,1);
      assert.equal(complete.run.endingResult.sovereignId,initial.endingResult.sovereignId);assert.deepEqual(complete.run.trialResults,initial.trialResults);
      assert.equal(voices.size,8);assert.equal(corrections.size,3);assert.equal(await page.locator('.fin-city').count(),5);assert.equal(await page.locator('.fin-page h1').textContent(),'FIN');
      assert.equal(await page.locator('.app-header').count(),0);assert.doesNotMatch(await page.locator('.fin-page').textContent(),/継承点|統治/);
      if(report.scenarios.length===0)await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.fin-actions')).opacity)>.99);
      await layout(page);await page.screenshot({path:path.join(out,`${label}-fin.png`),fullPage:true});
      await resume(page);assert.equal(await page.locator('.fin-page').count(),1);assert.equal((await saved(page)).records.length,1);
      await click(page,'fin-title');assert.equal(await page.locator('.title-menu').count(),1);
      report.scenarios.push({label,score,sovereignId:initial.endingResult.sovereignId,pages,voices:voices.size,approvedTextCorrections:corrections.size,saveResume:true,readOnlyReview:true,completedRecords:1,imageFailureChecked,status:'passed'});
      await context.close();
    }
    assert.deepEqual(report.errors,[]);await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({scenarios:report.scenarios.length,errors:report.errors,status:'passed'}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
