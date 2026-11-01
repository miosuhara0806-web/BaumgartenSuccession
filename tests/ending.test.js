import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {content} from '../src/content/ending.js';
import {content as previous} from '../src/content/prologue.js';
import {endingManuscript as script,manuscriptSha256} from '../src/content/ending-manuscript.js';
import {contentForRun,defaultContent}from '../src/content/catalog.js';
import * as engine from '../src/engine.js';
import {createStorage}from '../src/storage.js';
import {MemoryIndexedDB}from './helpers/memory-indexeddb.js';
import {endingRun}from './helpers/ending.js';
const source=(await readFile(new URL('../src/app.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\r?\n/gm,'').replace(/await init\(\);\s*$/,'');
export async function endingHarness(snapshot) {
  const indexedDB=new MemoryIndexedDB();
  const storage=createStorage({indexedDB,contentStatus:'reviewed',validateRun:r=>engine.validateRun(r,contentForRun(r))});
  await storage.open();const saved=await storage.commitAuto(snapshot,{expectedRevision:await storage.getRevision()});
  const dom={addEventListener(){},querySelector(){return dom;},querySelectorAll(){return[];}};
  const context=vm.createContext({defaultContent,contentForRun,...engine,createStorage:()=>storage,structuredClone,document:dom,window:{scrollTo(){}},CSS:{escape:s=>s},setTimeout:()=>0,clearTimeout(){}});
  new vm.Script(source+`
    render=()=>syncReadingSession();
    run=structuredClone(globalThis.snapshot);content=contentForRun(run);reader=globalThis.saved.readerProfile;revision=globalThis.saved.revision;slotsRevision=revision;ready=true;title=false;syncReadingSession();
    globalThis.api={state:()=>structuredClone({run,reader,revision,pending:!!pending,title,readingPreviewIndex}),handle,perform,load,openSaves,endingPage,finPage};
  `).runInContext(Object.assign(context,{snapshot,saved}));
  return {app:context.api,storage,indexedDB};
}
const collect=value=>Array.isArray(value)?value:Object.values(value).flatMap(collect);
test('the static official manuscript preserves every quote and narration; only the common Rosemond reply is adjusted',async()=>{
  const text=await readFile(new URL('../docs/Baumgarten_ending_script_v2.txt',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(text).digest('hex'),manuscriptSha256);
  for(const[name,hash]of [['アルフォンス','a1a70617364403115365f9154263b16203c11402395e08305dd98ab0a970295a'],['ローズモンド','4d4f34bbb216705befbcc008a6710e94065d62df8130614a52a8ab4b97502df0']]) {
    const image=await readFile(new URL(`../src/assets/戴冠式${name}.png`,import.meta.url));
    assert.equal(createHash('sha256').update(image).digest('hex'),hash);assert.equal(image.readUInt32BE(16),1130);assert.equal(image.readUInt32BE(20),753);
  }
  const packs=[...text.matchAll(/```text\n([\s\S]*?)```/g)].slice(0,3).map(m=>m[1]);
  const rows=collect(script);
  const quotes=value=>(value.match(/「[^」]*」/g)||[]).sort();
  assert.deepEqual(quotes(rows.map(r=>r.text).join('\n')),quotes(packs.join('\n')));
  for(const row of rows)assert.ok(packs.some(p=>p.includes(row.text)),row.text);
  const headings=new Set(['最終章　最終評定','王都帰還','双子の再会','アルフォンス主人公の場合','ローズモンド主人公の場合','最終評定','統治傾向の評定',
    '民意が単独最多','安定が単独最多','改革が単独最多','公正が単独最多','調整が単独最多','民意＋安定','民意＋改革','民意＋公正','民意＋調整',
    '安定＋改革','安定＋公正','安定＋調整','改革＋公正','改革＋調整','公正＋調整','3種類以上が同率最多','総合評定','継承点90〜100','継承点80〜89','継承点79以下',
    '王位宣言','アルフォンス主人公／継承点80以上','ローズモンド主人公／継承点80以上','アルフォンス主人公／継承点79以下','ローズモンド主人公／継承点79以下',
    '継承戦の終わり','戴冠式','アルフォンスが即位する場合','ローズモンドが即位する場合','アルフォンス','ローズモンド','【イベントCG：アルフォンス戴冠式】','【イベントCG：ローズモンド戴冠式】','戴冠式のあと','八人の談話']);
  const raw=new Set(rows.map(r=>r.text));
  for(const paragraph of packs.flatMap(p=>p.trim().split(/\n\s*\n/))) {
    if(paragraph.startsWith('※')||headings.has(paragraph)||paragraph.includes('\n「'))continue;
    assert.ok(raw.has(paragraph),`Missing narration: ${paragraph}`);
  }
  assert.equal(Object.keys(script.governance).length,16);
  const returned=content.scenes['ending.return'].blocks.map(id=>content.textBlocks[id]);
  assert.ok(returned.some(b=>b.text==='エーレンフェルスで最後の判断を終え、一行は王都へ戻った。'));
  assert.ok(returned.some(b=>b.speakerId==='commander.rosemond'&&b.text==='「……終わったのですね」'));
  assert.ok(returned.some(b=>b.speakerId==='commander.alphonse'&&b.text==='「……終わったのか」'));
  assert.equal(script.ensemble.filter(b=>b.speakerId==='char.harold'&&b.text.includes('僕')).length,2);
});
test('the new edition preserves every trial, tag and accepted block; old saves stay in their original edition',()=>{
  assert.equal(defaultContent,content);assert.equal(contentForRun(engine.createRun(previous)),previous);
  for(const key of ['trials','characters','commanders','regions','conversations','information','investigations','textBlocks']) {
    if(key==='textBlocks')for(const[id,b]of Object.entries(previous.textBlocks))assert.deepEqual(content.textBlocks[id],b,id);
    else assert.deepEqual(content[key],previous[key],key);
  }
  assert.equal(previous.scenes['prologue.reunion-comic.parties'].nextLabel,'漫画を読む →');
  assert.equal(content.scenes['prologue.reunion-comic.parties'].nextLabel,'再会の場面へ →');
  assert.equal(engine.getFinalRank(79),'success');assert.equal(engine.getFinalRank(89),'highSuccess');
});
test('all sixteen governance texts select exactly once; actual major-trial tags are the only counted tags',()=>{
  const base=endingRun(90);
  for(const[key,rows]of Object.entries(script.governance)) {
    const r={...base,endingResult:{...base.endingResult,governanceKey:key}};
    const scene=content.scenes['ending.governance'];
    const visible=scene.blocks.map((_,blockIndex)=>engine.getCurrentText({...r,position:{phase:'ending',sceneId:scene.id,blockIndex}},content)).filter(Boolean);
    assert.deepEqual(visible.map(b=>b.text),rows.map(b=>b.text));
  }
  const counts=Object.fromEntries(engine.GOVERNANCE_TAGS.map(tag=>[tag,0]));
  for(const[id,result]of Object.entries(base.trialResults))if(content.trials[id].kind==='major')for(const tag of result.governanceTags)counts[tag]++;
  assert.deepEqual(engine.getGovernance(base,content).counts,counts);
  let combinations=[{}];
  for(const trial of Object.values(content.trials).filter(t=>t.kind==='major'))combinations=combinations.flatMap(results=>trial.choices.map(choice=>({...results,[trial.id]:{governanceTags:choice.governanceTags}})));
  const reachable=new Set(combinations.map(trialResults=>{
    const g=engine.getGovernance({trialResults},content);return g.kind==='balanced'?'balanced':[...g.dominantTags].sort().join('+');
  }));
  assert.equal(combinations.length,243);assert.equal(reachable.size,14);
  assert.deepEqual(Object.keys(script.governance).filter(key=>!reachable.has(key)).sort(),['coordination+reform','fairness+people']);
  const cgText=r=>engine.getCurrentText({...r,position:{phase:'ending',sceneId:'ending.coronation-cg',blockIndex:0}},content);
  const other=endingRun(79);
  assert.equal(cgText(base).text,cgText(other).text);assert.notEqual(cgText(base).readKey,cgText(other).readKey);
});
test('both protagonists at 79, 80, 85, 89, 90 and 100 follow the right declaration, coronation, all eight voices and FIN',async()=>{
  for(const commanderId of Object.keys(content.commanders))for(const score of [79,80,85,89,90,100]) {
    const r=endingRun(score,commanderId),{app,storage}=await endingHarness(r);
    const rank=score>=90?'high':score>=80?'normal':'other';
    const sovereign=score>=80?commanderId:Object.keys(content.commanders).find(id=>id!==commanderId);
    assert.equal(r.endingResult.rank,rank);assert.equal(r.endingResult.sovereignId,sovereign);
    const before=structuredClone(r.trialResults),speakers=new Set(),seenScenes=new Set();let pageCount=0;
    while(app.state().run.position.phase==='ending') {
      assert.ok(++pageCount<220);
      const current=app.state().run,sceneId=current.position.sceneId,scene=content.scenes[sceneId];seenScenes.add(sceneId);
      const html=app.endingPage();assert.doesNotMatch(html,/主人公|○○の場合|継承点\d|が単独最多/);
      if(sceneId==='ending.coronation-cg')assert.ok(html.includes(`戴冠式${content.commanders[sovereign].name}.png`));
      for(const b of engine.getCurrentTextPage(current,content))if(sceneId==='ending.ensemble'&&b.speakerId?.startsWith('char.')){speakers.add(b.speakerId);assert.ok(html.includes(content.portraits[b.speakerId].src));}
      if(!seenScenes.has(`saved:${sceneId}`)) {
        await storage.saveManual('manual1',current,{expectedRevision:await storage.getRevision()});await app.openSaves();await app.load('manual1');assert.deepEqual(app.state().run,current);seenScenes.add(`saved:${sceneId}`);
      }
      await app.handle('ack-page');
      if(app.state().run.position.phase==='ending') {
        const after=app.state();await app.handle('read-prev');await app.handle('read-forward');
        assert.deepEqual(app.state().run,after.run);assert.deepEqual(app.state().reader,after.reader);assert.equal(app.state().revision,after.revision);
      }
    }
    const final=app.state().run;assert.equal(final.position.phase,'completed');assert.deepEqual(final.trialResults,before);
    assert.deepEqual(final.partyIds,r.partyIds);assert.deepEqual(final.acquiredInformation,r.acquiredInformation);
    assert.deepEqual(final.theoInvestigations,r.theoInvestigations);assert.deepEqual(final.visitOrder,r.visitOrder);
    assert.equal(final.endingSnapshot.sovereignId,sovereign);assert.equal(final.endingSnapshot.rank,rank);
    assert.equal(speakers.size,8);assert.equal((await storage.listChronicles()).length,1);
    assert.deepEqual((await storage.getSlot('auto')).run,final);
    assert.ok(app.finPage().includes('FIN'));assert.equal((app.finPage().match(/class="fin-city"/g)||[]).length,5);
    assert.doesNotMatch(app.finPage(),/継承点|high|normal|other/);
    await app.handle('fin-title');assert.equal(app.state().title,true);
  }
});
test('final read, immutable completion and FIN save are atomic and retry without duplicate records',async()=>{
  const early=endingRun(90),earlyStorage=await endingHarness(early);
  await assert.rejects(earlyStorage.storage.recordCompletion(early,engine.buildEndingRecord(early,content),{expectedRevision:await earlyStorage.storage.getRevision()}),/読み終える前/);
  let r=endingRun(90);while(engine.getCurrentText(r,content)&&r.position.sceneId!=='ending.farewell')r=engine.transition(r,{type:'ACK_TEXT'},content);
  const {app,storage,indexedDB}=await endingHarness(r);
  indexedDB.failNextWrite('readerProfile');
  await app.handle('ack-page');assert.equal(app.state().pending,true);assert.deepEqual((await storage.getSlot('auto')).run,r);assert.equal((await storage.listChronicles()).length,0);
  await app.handle('retry');assert.equal(app.state().pending,false);assert.equal(app.state().run.position.phase,'completed');
  assert.equal((await storage.listChronicles()).length,1);
  const key=engine.getCurrentText(r,content).readKey;
  assert.equal((await storage.getReaderProfile()).readTextKeys.filter(k=>k===key).length,1);
  const completed=app.state().run;
  await storage.recordCompletion(completed,engine.buildEndingRecord(completed,content),{expectedRevision:await storage.getRevision()});
  assert.equal((await storage.listChronicles()).length,1);
  const corrupt=structuredClone(completed);corrupt.endingResult.sovereignId='commander.rosemond';assert.throws(()=>engine.validateRun(corrupt,content));
});
