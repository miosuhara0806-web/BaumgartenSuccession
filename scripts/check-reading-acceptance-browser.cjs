/* PR #8 acceptance revisions: browser reading, names, copy and immutable review. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
(async()=>{
  const {content}=await import('../src/content/prologue.js');
  const h=await import('../tests/helpers/prologue.js');
  const e=await import('../src/engine.js');
  const out=path.resolve(process.env.READING_BROWSER_OUTPUT||'../preview/reunion-comic-20261101/browser');
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
      if((await page.locator('.page').textContent()).includes('少し間を置く。')) {
        assert.equal(await page.locator('.narration-turn').count(),1);
        assert.ok(await page.locator('.dialogue-turn').count()>=2);
        assert.equal(await page.locator('.narration-turn .speaker').count(),0);
      }
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
  async function icons(page,selector,count){
    const images=page.locator(`${selector} .face-icon img`);
    assert.equal(await images.count(),count);
    await images.evaluateAll(async list=>{await Promise.all(list.map(img=>img.decode()));});
    assert.ok(await images.evaluateAll(list=>list.every(img=>img.naturalWidth>0&&img.alt==='')));
    const sizes=await images.evaluateAll(list=>list.map(img=>img.parentElement.getBoundingClientRect().width));
    assert.ok(sizes.every(size=>size>=32&&size<=36));
  }
  async function cgLayout(page){
    const img=page.locator('.event-cg img');
    assert.equal(await img.count(),1);await img.evaluate(el=>el.decode());
    const box=await img.evaluate(el=>{
      const r=el.getBoundingClientRect(),text=document.querySelector('.dialogue-panel').getBoundingClientRect();
      return {width:r.width,height:r.height,left:r.left,right:r.right,bottom:r.bottom,textTop:text.top,
        naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight,viewport:innerWidth};
    });
    assert.equal(box.naturalWidth,1672);assert.equal(box.naturalHeight,941);
    assert.ok(Math.abs(box.width/box.height-1672/941)<0.01);
    assert.ok(box.width>=(box.viewport>760?800:300));
    assert.ok(box.left>=0&&box.right<=box.viewport&&box.bottom<=box.textTop);
    await layout(page);
  }
  try{
    for(const[label,viewport,commanderId]of[
      ['pc-alphonse',{width:1440,height:1000},'commander.alphonse'],
      ['mobile-rosemond',{width:390,height:844},'commander.rosemond'],
      ['pc-rosemond',{width:1440,height:1000},'commander.rosemond'],
      ['mobile-alphonse',{width:390,height:844},'commander.alphonse'],
    ]){
      const context=await browser.newContext({viewport});const page=await context.newPage();
      page.on('pageerror',error=>report.errors.push(error.message));
      const name=content.commanders[commanderId].name;
      await page.goto(url);await click(page,'new');
      assert.equal(await page.locator('.event-cg').count(),0);
      await click(page,'ack-page');
      assert.equal(await page.locator('.event-cg').count(),0);
      await icons(page,'.speaker',1);
      assert.match(await page.locator('.speaker img').getAttribute('src'),/kingdom-emblem\.svg$/);
      await click(page,'ack-page');
      await cgLayout(page);
      const reviewBefore=await stored(page);
      await click(page,'read-prev');assert.equal(await page.locator('.event-cg').count(),0);
      await click(page,'read-forward');await cgLayout(page);
      assert.deepEqual(await stored(page),reviewBefore);
      const cgSaved=await stored(page);
      await resume(page);assert.deepEqual((await stored(page)).slot.run,cgSaved.slot.run);
      await cgLayout(page);
      assert.deepEqual(await page.locator('.dialogue-turn .speaker').allTextContents(),['アルフォンス','ローズモンド','アルフォンス','ローズモンド']);
      await icons(page,'.dialogue-turn',4);
      assert.ok(await page.locator('.dialogue-turn').evaluateAll(list=>list.every(el=>{
        const css=getComputedStyle(el);return css.borderTopWidth==='0px'&&parseFloat(css.marginTop)<=12;
      })));
      await layout(page);await page.screenshot({path:path.join(out,`${label}-twins.png`),fullPage:true});
      const before=await stored(page);await click(page,'ack-page');
      assert.equal(await page.locator('.event-cg').count(),0);
      assert.equal((await stored(page)).slot.run.recentDialogueLog.length,before.slot.run.recentDialogueLog.length+4);
      // Reading history is reset by load, so use the newly acknowledged CG page.
      const afterCg=await stored(page);
      await click(page,'read-prev');await cgLayout(page);
      await click(page,'read-forward');assert.equal(await page.locator('.event-cg').count(),0);
      assert.deepEqual(await stored(page),afterCg);
      await read(page);await click(page,'select-commander',commanderId);await read(page);
      for(const id of ['warehouse','servants','preparation']){await click(page,'tutorial-location',id);await read(page);}
      await click(page,'tutorial-choice','b');
      const success=await page.locator('.dialogue-text').textContent();
      if(commanderId.endsWith('rosemond')) {
        assert.match(success,/西棟ですね/);assert.match(success,/止まっているはずです/);
        assert.doesNotMatch(success,/西棟だ|はずだ/);
      } else {assert.match(success,/西棟だ/);assert.match(success,/止まっているはずだ/);}
      await read(page);
      assert.doesNotMatch(await page.locator('.page').textContent(),/四人|四名|八名/);
      for(const id of h.defaultParty){await click(page,'profile',id);await click(page,'toggle-party',id);}
      await click(page,'confirm-party');assert.match(await page.locator('.page').textContent(),/この4名と共に/);
      await click(page,'depart');assert.ok((await page.locator('.dialogue-text').textContent()).startsWith(`${name}側4名`));
      await icons(page,'.story-parties',8);
      assert.deepEqual(await page.locator('.story-parties .member img').evaluateAll(list=>list.map(img=>img.getAttribute('src'))),
        [...h.defaultParty,...e.getOpponentParty((await stored(page)).slot.run,content).map(c=>c.id)].map(id=>content.portraits[id].src));
      await layout(page);await page.screenshot({path:path.join(out,`${label}-both-parties.png`),fullPage:true});
      let courtMixed=0;
      while((await stored(page)).slot.run.position.sceneId==='prologue.court'){
        if(await page.locator('.dialogue-turn').count()){
          courtMixed++;await page.screenshot({path:path.join(out,`${label}-court.png`),fullPage:true});
        }
        if((await page.locator('.dialogue-panel').textContent()).includes('少し間を置く。')) {
          assert.equal(await page.locator('.dialogue-turn').count(),3);
          assert.match(await page.locator('.dialogue-panel').textContent(),/ですが.*少し間を置く。.*兄上も、お気をつけて/s);
          await page.screenshot({path:path.join(out,`${label}-pause.png`),fullPage:true});
          const beforePause=(await stored(page)).slot.run;
          await resume(page);assert.deepEqual((await stored(page)).slot.run,beforePause);
        }
        await click(page,'ack-page');
      }
      assert.equal(courtMixed,commanderId.endsWith('rosemond')?4:3);
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
      assert.equal(await page.locator('.story-parties').count(),0);
      assert.match(await page.locator('.dialogue-text').textContent(),/街道沿いの宿場/);
      await click(page,'ack-page');
      assert.deepEqual(await page.locator('.story-parties h2').allTextContents(),['アルフォンスの一行','ローズモンドの一行']);
      await icons(page,'.story-parties',8);await layout(page);
      const reunion=(await stored(page)).slot.run;
      const own=reunion.partyIds,other=e.getOpponentParty(reunion,content).map(c=>c.id);
      const ordered=commanderId.endsWith('alphonse')?[...own,...other]:[...other,...own];
      assert.deepEqual(await page.locator('.story-parties .member img').evaluateAll(list=>list.map(el=>el.getAttribute('src'))),ordered.map(id=>content.portraits[id].src));
      await page.screenshot({path:path.join(out,`${label}-reunion-parties.png`),fullPage:true});
      await click(page,'ack-page');
      const comicRun=(await stored(page)).slot.run;
      const comic=page.locator('.comic-fit img');await comic.evaluate(el=>el.decode());
      assert.equal(await page.locator('.dialogue-text').count(),0);
      const imageBox=await comic.evaluate(el=>{
        const box=el.getBoundingClientRect();return {width:box.width,height:box.height,nw:el.naturalWidth,nh:el.naturalHeight,bottom:box.bottom,
          controls:document.querySelector('.dialogue-actions').getBoundingClientRect().top};
      });
      assert.equal(imageBox.nw,1024);assert.equal(imageBox.nh,1536);
      assert.ok(Math.abs(imageBox.width/imageBox.height-2/3)<0.01);assert.ok(imageBox.bottom<=imageBox.controls);
      if(await page.locator('.toast').count())assert.ok(await page.locator('.toast').evaluate(el=>el.getBoundingClientRect().top)>=imageBox.bottom);
      await layout(page);await page.screenshot({path:path.join(out,`${label}-reunion-comic.png`),fullPage:true});
      await page.locator('.comic-zoom summary').click();
      const scroll=page.locator('.comic-zoom-scroll');
      await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;el.scrollLeft=el.scrollWidth;});
      assert.ok(await scroll.evaluate(el=>el.scrollTop>0&&el.scrollTop+el.clientHeight>=el.scrollHeight-1));
      if(viewport.width<760)assert.ok(await scroll.evaluate(el=>el.scrollLeft>0));
      await layout(page);await page.screenshot({path:path.join(out,`${label}-comic-zoom-bottom.png`),fullPage:true});
      await page.locator('.comic-zoom summary').click();
      await click(page,'saves');await click(page,'save-slot','manual1');
      await resume(page);assert.deepEqual((await stored(page)).slot.run,comicRun);
      await click(page,'ack-page');const closing=await stored(page);
      await click(page,'read-prev');assert.equal(await page.locator('.comic-reader').count(),1);
      await click(page,'read-forward');assert.deepEqual(await stored(page),closing);
      await click(page,'saves');await click(page,'load-slot','manual1');await click(page,'accept-confirm');
      assert.deepEqual((await stored(page)).slot.run,comicRun);
      await click(page,'ack-page');assert.match(await page.locator(q('ack-page')).textContent(),/旅を続ける/);
      await click(page,'ack-page');
      assert.equal((await stored(page)).slot.run.storyEvents['event.midgame-reunion'].status,'completed');
      assert.equal((await stored(page)).slot.run.position.phase,'map');
      let completed=(await stored(page)).slot.run;
      for(const city of ['hexerei','anchoring','ehrenfels'])completed=h.finishCity(completed,city);
      assert.equal(Object.keys(completed.trialResults).length,15);
      assert.equal(completed.storyEvents['event.midgame-reunion'].status,'completed');
      await page.route(url=>decodeURIComponent(url.pathname).endsWith('/夕暮れの宿場で再会する双子(3).png'),route=>route.abort());
      await seed(page,comicRun);await page.locator('.comic-fit .comic-fallback').waitFor({state:'visible'});
      await click(page,'ack-page');await click(page,'ack-page');
      assert.equal((await stored(page)).slot.run.position.phase,'map');
      await icons(page,'.map-sidebar .member',4);
      // Failed portrait requests must leave all names and navigation usable.
      let roster=h.start(h.defaultParty,commanderId);
      roster={...roster,position:{phase:'departure',sceneId:'prologue.court',blockIndex:0}};
      await page.route('**/src/assets/portraits/*.png',route=>route.abort());
      await seed(page,roster);
      await page.waitForFunction(()=>[...document.querySelectorAll('.story-parties .face-icon img')]
        .every(img=>img.classList.contains('image-unavailable')));
      assert.equal(await page.locator('.story-parties .member').count(),8);
      assert.ok(await page.locator('.story-parties .member span:last-child').evaluateAll(list=>list.every(el=>el.textContent.length>1)));
      assert.equal(await page.locator(q('ack-page')).isEnabled(),true);
      await layout(page);
      // An unavailable CG must never gate the existing story/selection/tutorial flow.
      await page.route(url=>decodeURIComponent(url.pathname).endsWith('/王宮で向き合う双子の貴族.png'),route=>route.abort());
      const brokenCg=e.createRun(content);brokenCg.position.blockIndex=3;
      await seed(page,brokenCg);
      await page.locator('.event-cg-fallback').waitFor({state:'visible'});
      assert.equal(await page.locator(q('ack-page')).isEnabled(),true);
      await read(page);assert.equal((await stored(page)).slot.run.position.phase,'commanderSelection');
      await click(page,'select-commander',commanderId);await read(page);
      assert.equal((await stored(page)).slot.run.position.stage,'investigate');
      assert.equal(await page.locator('.event-cg').count(),0);
      report.scenarios.push({label,commanderId,groupedDeclarationTurns:4,feedbackChoices:results,
        cgShared:true,cgAspectRatio:true,cgResume:true,cgReview:true,cgFailureProgress:true,
        reunionComic:true,reunionManualSave:true,reunionZoom:true,reunionCompletion:true,remainingCities:true,
        courtPages:courtMixed,officialIcons:true,missingImageNames:true,reviewReadOnly:true,departureName:true,freeSelection:true,tutorial:true,reunionResume:true,status:'passed'});
      await context.close();
    }
    assert.deepEqual(report.errors,[]);
    await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
