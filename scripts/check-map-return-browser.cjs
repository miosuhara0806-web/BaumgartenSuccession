const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const {mkdir, writeFile} = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const {content} = await import('../src/content/map-return.js');
  const {createHelpers} = await import('../tests/helpers/prologue.js');
  const {drawMapReturn} = await import('../src/map-return.js');
  const h = createHelpers(content);
  const ids = Object.keys(content.characters), key = 'trial:alba.small1';
  const result = party => h.read(h.choose(h.read(h.act(h.start(party), 'START_REGION', {regionId:'alba'}))));
  const bases = [result(ids.slice(0,4)), result(ids.slice(4))];
  function seed(base, predicate) {
    for (let i=0; i<1000; i++) {
      const r = {...base, runId:`browser-map-return-${i}`};
      if (predicate(drawMapReturn(r, key))) return r;
    }
    throw new Error('Missing browser seed');
  }
  const out = path.resolve(process.env.MAP_RETURN_BROWSER_OUTPUT || '../preview/map-return-20261103');
  await mkdir(out, {recursive:true});
  const report = {scenarios:[], errors:[]};
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox']});
  const q = (action,id) => `[data-action="${action}"]${id ? `[data-id="${id}"]` : ''}`;
  async function click(page, action, id) {
    await page.locator(q(action,id)).first().click();
    await page.waitForFunction(() => !document.querySelector('.busy-corner'));
    assert.equal(await page.locator('.error-banner').count(), 0);
  }
  async function saved(page) {
    return page.evaluate(async () => {
      const {createStorage} = await import('./src/storage.js');
      const {validateRun} = await import('./src/engine.js');
      const {contentForRun} = await import('./src/content/catalog.js');
      const s = createStorage({validateRun:r=>validateRun(r,contentForRun(r))});
      return {run:(await s.getSlot('auto')).run, reader:await s.getReaderProfile()};
    });
  }
  async function resume(page) {
    await page.reload(); await click(page,'continue'); await click(page,'accept-confirm');
  }
  async function install(page, r) {
    await page.evaluate(async r => {
      const {createStorage} = await import('./src/storage.js');
      const {validateRun} = await import('./src/engine.js');
      const {contentForRun} = await import('./src/content/catalog.js');
      const s = createStorage({validateRun:r=>validateRun(r,contentForRun(r))});
      await s.commitAuto(r,{expectedRevision:await s.getRevision()});
    }, r);
    await resume(page);
  }
  async function layout(page) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
    assert.equal(await page.locator('[role="dialog"]').count(),0);
    assert.ok(await page.locator(q('region','alba')).isEnabled());
  }
  try {
    for (const [size, viewport] of [['pc',{width:1440,height:1000}],['mobile',{width:390,height:844}],['narrow',{width:320,height:740}]]) {
      const context = await browser.newContext({viewport,reducedMotion:'reduce'});
      const page = await context.newPage();
      page.on('pageerror',e=>report.errors.push(`${size}: ${e.message}`));
      await page.goto(process.env.MAP_RETURN_BROWSER_URL || 'http://127.0.0.1:4173/');
      await page.locator(q('new')).waitFor();
      console.log(`${size}: ready`);
      for (const speakerId of ids) for (const lineIndex of [0,1]) {
        const base = bases.find(r=>r.partyIds.includes(speakerId));
        const r = seed(base,d=>d?.speakerId===speakerId && d.lineIndex===lineIndex);
        await install(page,r);
        console.log(`${size}: ${speakerId}/${lineIndex} loaded`);
        await click(page,'return-map');
        const chatter = page.locator('.map-chatter');
        assert.equal(await chatter.count(),1);
        assert.equal(await chatter.locator('.map-chatter-name').textContent(),content.characters[speakerId].name);
        assert.equal(await chatter.locator('.map-chatter-text').textContent(),`「${content.mapReturnLines[speakerId][lineIndex]}」`);
        const img = chatter.locator('img'); await img.evaluate(el=>el.decode());
        assert.equal(await img.getAttribute('src'),content.portraits[speakerId].src);
        await layout(page);
        assert.ok(await chatter.evaluate(el=>{
          const b=el.getBoundingClientRect(),nav=document.querySelector('.map-destinations').getBoundingClientRect();
          return b.top>=nav.bottom && b.left>=0 && b.right<=innerWidth && getComputedStyle(el).position==='static';
        }));
        if (speakerId==='char.olivel' && lineIndex===0) await page.screenshot({path:path.join(out,`${size}-long-line.png`),fullPage:true});
        report.scenarios.push({size,speakerId,lineIndex,status:'passed'});
      }
      const before = await saved(page);
      for (const [action,id] of [['memo'],['log'],['profile',before.run.partyIds[0]]]) {
        await click(page,action,id); await click(page,'close-modal');
        assert.deepEqual(await saved(page),before);
      }
      await click(page,'saves'); await click(page,'save-slot','manual1');
      if (await page.locator(q('accept-confirm')).count()) await click(page,'accept-confirm');
      await click(page,'saves'); await click(page,'load-slot','manual1'); await click(page,'accept-confirm');
      assert.deepEqual(await saved(page),before);
      await resume(page); assert.deepEqual(await saved(page),before);
      assert.equal(await page.locator('.map-chatter').count(),1);
      await click(page,'region','alba');
      await click(page,'return-map');
      assert.deepEqual(await saved(page),before);

      const miss = seed(bases[0],d=>d===null);
      await install(page,miss); await click(page,'return-map');
      const missed = await saved(page);
      assert.equal(await page.locator('.map-chatter').count(),0);
      await layout(page); await resume(page);
      assert.deepEqual(await saved(page),missed);
      await click(page,'region','alba'); await click(page,'next-trial');
      assert.equal((await saved(page)).run.position.trialId,'alba.small2');
      report.scenarios.push({size,hitAndMissResume:true,manualSaveLoad:true,profileMemoLog:true,checkpointReentry:true,missContinues:true,status:'passed'});

      await install(page,h.start());
      assert.equal(await page.locator('.map-chatter').count(),0);
      assert.deepEqual((await saved(page)).run.mapReturnChatter,{currentKey:null,draws:{}});
      await page.screenshot({path:path.join(out,`${size}-no-chatter.png`),fullPage:true});
      await context.close();
    }
    assert.deepEqual(report.errors,[]);
    await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({scenarios:report.scenarios.length,errors:report.errors,output:out}));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
