/* PR #8 acceptance revisions: browser reading, names, copy and immutable review. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
(async()=>{
  const {content}=await import('../src/content/prologue.js');
  const h=await import('../tests/helpers/prologue.js');
  const e=await import('../src/engine.js');
  const out=path.resolve(process.env.READING_BROWSER_OUTPUT||'../preview/reading-acceptance-20261101/browser');
  const url=process.env.READING_BROWSER_URL||'http://127.0.0.1:4173/';
  await mkdir(out,{recursive:true});
  const report={url,scenarios:[],errors:[]};
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const q=(action,id)=>`[data-action="${action}"]${id?`[data-id="${id}"]`:''}`;
  async function click(page,action,id){
    await page.locator(q(action,id)).first().click();
    await page.waitForFunction(()=>!document.querySelector('.busy-corner'));
    assert.equal(await page.locator('.error-banner').count(),0);
  }
  async function stored(page){
    return page.evaluate(async()=>{
      const{createStorage}=await import('./src/storage.js');
      const{contentForRun}=await import('./src/content/catalog.js');
      const{validateRun}=await import('./src/engine.js');
      const s=createStorage({validateRun:r=>validateRun(r,contentForRun(r))});
      return{slot:await s.getSlot('auto'),reader:await s.getReaderProfile(),revision:await s.getRevision()};
    });
  }
  async function resume(page){await page.reload();await click(page,'continue');await click(page,'accept-confirm');}
  async function seed(page,run){
    await page.evaluate(async run=>{
      const{createStorage}=await import('./src/storage.js');
      const{contentForRun}=await import('./src/content/catalog.js');
      const{validateRun}=await import('./src/engine.js');
      const s=createStorage({validateRun:r=>validateRun(r,contentForRun(r))});
      await s.commitAuto(run,{expectedRevision:await s.getRevision()});
    },run);await resume(page);
  }
  async function read(page){
    for(let i=0;await page.locator(q('ack-page')).count();i++){
      assert.ok(i<250);await click(page,'ack-page');
    }
  }
  async function review(page){
    const before=await stored(page);
    await click(page,'read-prev');assert.equal(await page.locator(q('skip')).isDisabled(),true);
    await click(page,'read-forward');assert.deepEqual(await stored(page),before);
  }
  async function layout(page){
    const box=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));
    assert.ok(box.s<=box.w+1,JSON.stringify(box));
  }
  try{
    for(const[label,viewport,commanderId]of[
      ['pc',{width:1440,height:1000},'commander.alphonse'],
      ['mobile',{width:390,height:844},'commander.rosemond'],
    ]){
      const context=await browser.newContext({viewport});const page=await context.newPage();
      page.on('pageerror',error=>report.errors.push(error.message));
      const name=content.commanders[commanderId].name;
      await page.goto(url);await click(page,'new');await click(page,'ack-page');await click(page,'ack-page');
      assert.deepEqual(await page.locator('.dialogue-turn .speaker').allTextContents(),['アルフォンス','ローズモンド','アルフォンス','ローズモンド']);
      await layout(page);await page.screenshot({path:path.join(out,`${label}-twins.png`),fullPage:true});
      const before=await stored(page);await click(page,'ack-page');
      assert.equal((await stored(page)).slot.run.recentDialogueLog.length,before.slot.run.recentDialogueLog.length+4);
      await review(page);await read(page);await click(page,'select-commander',commanderId);await read(page);
      for(const id of ['warehouse','servants','preparation']){await click(page,'tutorial-location',id);await read(page);}
      await click(page,'tutorial-choice','b');await read(page);
      assert.doesNotMatch(await page.locator('.page').textContent(),/四人|四名|八名/);
      for(const id of h.defaultParty){await click(page,'profile',id);await click(page,'toggle-party',id);}
      await click(page,'confirm-party');assert.match(await page.locator('.page').textContent(),/この4名と共に/);
      await click(page,'depart');assert.ok((await page.locator('.dialogue-text').textContent()).startsWith(`${name}側4名`));
      let courtMixed=0;
      while((await stored(page)).slot.run.position.sceneId==='prologue.court'){
        if(await page.locator('.dialogue-turn').count()){
          courtMixed++;await page.screenshot({path:path.join(out,`${label}-court.png`),fullPage:true});
        }
        await click(page,'ack-page');
      }
      assert.equal(courtMixed,3);
      assert.match(await page.locator('.dialogue-text').textContent(),new RegExp(`${name}の傍らには、選んだ4人`));
      assert.doesNotMatch(await page.locator('.dialogue-text').textContent(),/主人公/);
      await read(page);assert.equal((await stored(page)).slot.run.position.phase,'map');
      for(const city of ['alba','hexerei','anchoring','rude'])assert.equal(await page.locator(q('region',city)).isDisabled(),false);
      let results=0;
      for(const city of ['anchoring','rude']){
        let r=h.read(h.act(h.start(h.defaultParty,commanderId),'START_REGION',{regionId:city}));
        for(let i=0;i<(city==='anchoring'?3:1);i++){
          for(const letter of 'abc'){
            const feedback=h.choose(r,letter);await seed(page,feedback);
            assert.ok((await page.locator('.dialogue-text').textContent()).includes(name));
            assert.doesNotMatch(await page.locator('.dialogue-text').textContent(),/主人公|\{commander\}|【主人公】/);
            await click(page,'ack-page');await review(page);await layout(page);
            if(city==='anchoring'&&i===2&&letter==='b'){
              await click(page,'read-prev');await page.screenshot({path:path.join(out,`${label}-anchoring-result.png`),fullPage:true});await click(page,'read-forward');
            }
            results++;
          }
          r=h.read(h.act(h.read(h.choose(r)),'CONTINUE_TRIAL'));
        }
      }
      let r=h.finishCity(h.start(h.defaultParty,commanderId),'alba');
      r=h.finishCity(r,'rude',{stopBeforeClosing:true});await seed(page,r);
      assert.equal((await stored(page)).slot.run.position.phase,'storyEvent');
      await click(page,'ack-page');const mid=(await stored(page)).slot.run;
      await resume(page);assert.deepEqual((await stored(page)).slot.run,mid);await read(page);
      assert.equal((await stored(page)).slot.run.storyEvents['event.midgame-reunion'].status,'completed');
      assert.equal((await stored(page)).slot.run.position.phase,'map');
      report.scenarios.push({label,commanderId,groupedDeclarationTurns:4,courtPages:3,feedbackChoices:results,
        reviewReadOnly:true,departureName:true,freeSelection:true,tutorial:true,reunionResume:true,status:'passed'});
      await context.close();
    }
    assert.deepEqual(report.errors,[]);
    await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
