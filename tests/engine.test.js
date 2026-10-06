import test from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/fixture.js';
import * as engine from '../src/engine.js';

const PARTY=['char.harold','char.frederica','char.lisette','char.sandro'];
const move=(run,type,fields={},pack=content)=>engine.transition(run,{type,...fields},pack);
function read(run,pack=content) {
  for(let n=0;engine.getCurrentText(run,pack);n++) {
    assert.ok(n<100,'text flow must terminate');
    run=move(run,'ACK_TEXT',{},pack);
  }
  return run;
}
function departed(party=PARTY,commander='commander.alphonse',pack=content) {
  let run=read(engine.createRun(pack),pack);
  run=move(run,'SELECT_COMMANDER',{commanderId:commander},pack);
  for(const characterId of party) run=move(run,'TOGGLE_PARTY',{characterId},pack);
  run=move(run,'CONFIRM_PARTY',{},pack);
  run=move(run,'DEPART',{},pack);
  return read(run,pack);
}
function resolve(run,index=0,pack=content) {
  run=read(run,pack);
  const trialId=run.position.trialId;
  const choiceId=engine.getAvailableChoices(run,pack)[index].id;
  return move(run,'RESOLVE_TRIAL',{trialId,choiceId},pack);
}
function finishTrial(run,index=0,pack=content) {
  return move(read(resolve(run,index,pack),pack),'CONTINUE_TRIAL',{},pack);
}
function major(party=PARTY,pack=content,regionId='alba') {
  let run=move(departed(party,'commander.alphonse',pack),'START_REGION',{regionId},pack);
  run=finishTrial(run,0,pack);run=finishTrial(run,0,pack);
  return read(run,pack);
}
function fullFixture() {
  // Test-only duplicated neutral chapters exercise the extension boundary. Never imported by UI.
  const pack=structuredClone(content);
  pack.mode='full';pack.contentVersion='independent-mechanics-fixture';
  for(const regionId of ['hexerei','anchoring','rude','ehrenfels']) {
    const remap=value=>JSON.parse(JSON.stringify(value).replaceAll('alba',regionId));
    const r=remap(content.regions.alba);
    Object.assign(r,{name:regionId,kind:regionId==='ehrenfels'?'final':'normal'});
    pack.regions[regionId]=r;
    for(const key of ['trials','scenes','textBlocks','conversations','information','investigations']) {
      for(const [id,value] of Object.entries(content[key]).filter(([id])=>id.includes('alba'))) {
        pack[key][id.replaceAll('alba',regionId)]=remap(value);
      }
    }
  }
  for(const [id,trigger] of [['test.encounter','afterTwoRegions'],['test.reunion','beforeFinal']]) {
    pack.storyEvents[id]={id,trigger,entrySceneId:id,completionSceneId:id};
    pack.scenes[id]={id,blocks:[`${id}.text1`,`${id}.text2`],conversationIds:[]};
    for(const suffix of ['text1','text2']) {
      const textId=`${id}.${suffix}`;
      pack.textBlocks[textId]={id:textId,textRevision:1,text:`TEST ONLY: ${textId}`,contentStatus:'fixture'};
    }
  }
  return pack;
}

test('all 24 parties × 2 commanders complete Alba with all three normal routes and four crisis roles',()=>{
  const byRole=role=>Object.values(content.characters).filter(c=>c.role===role).map(c=>c.id);
  const m=byRole('melee');let compositions=0,journeys=0;
  for(let a=0;a<m.length;a++) for(let b=a+1;b<m.length;b++) for(const ranged of byRole('ranged')) for(const healer of byRole('healer')) {
    const party=[m[a],m[b],ranged,healer];
    assert.equal(engine.isLegalParty(party,content),true);
    for(const commander of Object.keys(content.commanders)) {
      compositions++;
      for(let route=0;route<3;route++) {
        let run=departed(party,commander);
        assert.equal(engine.isLegalParty(engine.getOpponentParty(run,content).map(c=>c.id),content),true);
        run=move(run,'START_REGION',{regionId:'alba'});
        run=finishTrial(run,route);
        run=read(run);
        assert.equal(engine.getAvailableChoices(run,content).length,3);
        for(const choice of engine.getAvailableChoices(run,content)) {
          const assignments=engine.getCrisisAssignments(run,choice,content);
          assert.equal(new Set(assignments.map(a=>a.characterId)).size,4);
          assert.notEqual(assignments[0].text,assignments[1].text);
        }
        run=resolve(run,route);
        const feedback=engine.getCurrentText(run,content).text;
        party.forEach(id=>assert.ok(feedback.includes(content.characters[id].name)));
        run=move(read(run),'CONTINUE_TRIAL');
        run=finishTrial(run,route);
        assert.equal(run.chapterProgress.alba.status,'active');
        assert.equal(run.position.phase,'chapterClosing');
        run=read(run);
        assert.equal(run.position.phase,'map');
        assert.equal(run.chapterProgress.alba.status,'completed');
        assert.equal(engine.getTotalScore(run),[0,12,20][route]);
        assert.equal(engine.getTheoRemaining(run),2);
        assert.deepEqual(run.storyEvents,{});
        assert.equal(run.endingSnapshot,undefined);
        assert.deepEqual(run.visitOrder,['alba']);
        assert.throws(()=>move(run,'START_REGION',{regionId:'alba'}));
        for(const id of ['hexerei','anchoring','rude','ehrenfels']) {
          assert.equal(run.chapterProgress[id].status,'notStarted');
          assert.throws(()=>move(run,'START_REGION',{regionId:id}));
        }
        journeys++;
      }
    }
  }
  assert.equal(compositions,48);assert.equal(journeys,144);
});

test('draft enforces role limits, never swaps another character, fixes party after departure',()=>{
  let run=move(read(engine.createRun(content)),'SELECT_COMMANDER',{commanderId:'commander.rosemond'});
  run=move(run,'TOGGLE_PARTY',{characterId:PARTY[0]});run=move(run,'TOGGLE_PARTY',{characterId:PARTY[1]});
  const before=structuredClone(run);
  assert.throws(()=>move(run,'TOGGLE_PARTY',{characterId:'char.madian'}));
  assert.deepEqual(run,before);assert.throws(()=>move(run,'CONFIRM_PARTY'));
  run=move(run,'TOGGLE_PARTY',{characterId:PARTY[0]});
  assert.deepEqual(run.partyIds,[PARTY[1]]);
  assert.throws(()=>move(departed(),'TOGGLE_PARTY',{characterId:PARTY[0]}));
  assert.throws(()=>move(departed(),'SELECT_COMMANDER',{commanderId:'commander.rosemond'}));
});

test('result confirmation is idempotent, immutable, and not re-scored after data changes',()=>{
  const original=read(move(departed(),'START_REGION',{regionId:'alba'}));
  const action={trialId:'alba.small1',choiceId:'choice.alba.small1.b'};
  const result=move(original,'RESOLVE_TRIAL',action);
  assert.equal(engine.getTotalScore(original),0);assert.equal(engine.getTotalScore(result),3);
  assert.deepEqual(move(result,'RESOLVE_TRIAL',action),result);
  assert.deepEqual(move(JSON.parse(JSON.stringify(result)),'RESOLVE_TRIAL',action),result);
  assert.throws(()=>move(result,'RESOLVE_TRIAL',{...action,choiceId:'choice.alba.small1.c'}));
  const updated=structuredClone(content);updated.trials['alba.small1'].choices[1].points=5;
  assert.equal(engine.validateRun(result,updated),true);
  assert.equal(engine.getTotalScore(move(result,'RESOLVE_TRIAL',action,updated)),3);
  assert.equal(engine.getTotalScore(read(result)),3);
});

test('Theo commits information and report position together; repeat, cancel and older snapshots do not double consume',()=>{
  const before=major();
  assert.equal(engine.canUseTheo(before,content),true);
  assert.equal(engine.getTheoRemaining(before),2); // cancellation sends no engine command
  const report=move(before,'REQUEST_THEO');
  assert.equal(engine.getTheoRemaining(report),1);
  assert.ok(report.acquiredInformation['info.alba.theo']);
  assert.equal(report.position.phase,'theoReport');assert.equal(report.position.blockIndex,0);
  assert.deepEqual(move(report,'REQUEST_THEO'),report);
  const restored=JSON.parse(JSON.stringify(report));
  assert.equal(engine.validateRun(restored,content),true);
  assert.deepEqual(move(read(restored),'REQUEST_THEO'),read(restored));
  assert.equal(engine.getTheoRemaining(before),2);
  assert.equal(engine.canUseTheo(departed(),content),false);
});

test('additional choice needs current-run information, conversation completion, or Theo; never a read profile',()=>{
  let run=major();
  assert.equal(engine.getAvailableChoices(run,content).length,3);
  const old=structuredClone(run);
  run=move(run,'OPEN_CONVERSATION',{conversationId:'conversation.alba.major.harold'});
  assert.equal(run.heardConversationIds.length,0);
  assert.equal(run.acquiredInformation['info.alba.major.harold'],undefined);
  assert.equal(engine.canManualSave(run),false);
  run=read(run);
  assert.equal(engine.getAvailableChoices(run,content).length,4);
  assert.equal(engine.getAvailableChoices(old,content).length,3);
  const noHarold=major(['char.madian','char.olivel','char.vantalt','char.heidemarie']);
  assert.equal(engine.getAvailableChoices(noHarold,content).length,3);
  assert.equal(engine.getAvailableChoices(read(move(noHarold,'REQUEST_THEO')),content).length,4);
  const both=read(move(run,'REQUEST_THEO'));
  assert.equal(engine.getAvailableChoices(both,content).length,4);
  const extra=engine.getAvailableChoices(both,content).at(-1);
  assert.ok(extra.points < 10);
  assert.throws(()=>move(old,'RESOLVE_TRIAL',{trialId:'alba.major',choiceId:extra.id}));
  const fresh=major();
  assert.equal(engine.getAvailableConversations(fresh,content).some(c=>c.id==='conversation.alba.major.harold'),true);
  assert.equal(engine.getAvailableChoices(fresh,content).length,3);
});

test('scene-specific conversations revive later, and commander / party variants have independent read keys',()=>{
  let run=read(move(departed(),'START_REGION',{regionId:'alba'}));
  run=read(move(run,'OPEN_CONVERSATION',{conversationId:'conversation.alba.small1.harold'}));
  assert.equal(engine.getAvailableConversations(run,content).some(c=>c.id.includes('harold')),false);
  run=read(finishTrial(finishTrial(run)));
  assert.equal(engine.getAvailableConversations(run,content).some(c=>c.id==='conversation.alba.major.harold'),true);
  const keys=commander=>{
    let r=move(departed(PARTY,commander),'START_REGION',{regionId:'alba'});
    r=move(r,'ACK_TEXT');return engine.getCurrentText(r,content).readKey;
  };
  assert.notEqual(keys('commander.alphonse'),keys('commander.rosemond'));
  const crisisKey=party=>{
    let r=finishTrial(move(departed(party),'START_REGION',{regionId:'alba'}));
    r=resolve(r);return engine.getCurrentText(r,content).readKey;
  };
  assert.notEqual(crisisKey(PARTY),crisisKey(['char.madian','char.olivel','char.vantalt','char.heidemarie']));
  const revised=structuredClone(content);revised.textBlocks['text.intro.notice'].textRevision=2;
  assert.notEqual(engine.getCurrentText(engine.createRun(content),content).readKey,engine.getCurrentText(engine.createRun(revised),revised).readKey);
});

test('travel chatter has no game effects, requires party presence, and logs are bounded',()=>{
  const pack=structuredClone(content);
  pack.conversations['conversation.travel.olivel'].blockIds=Array.from({length:205},(_,i)=>{
    const id=`test.travel.${i}`;pack.textBlocks[id]={id,textRevision:1,text:`Fixture ${i}`,speakerId:'char.olivel'};return id;
  });
  let run=departed(['char.harold','char.olivel','char.vantalt','char.heidemarie'],'commander.alphonse',pack);
  const info=structuredClone(run.acquiredInformation);
  run=move(run,'OPEN_CONVERSATION',{conversationId:'conversation.travel.olivel'},pack);
  while(engine.getCurrentText(run,pack)) run=move(run,'ACK_TEXT',{},pack);
  assert.equal(run.recentDialogueLog.length,200);
  assert.deepEqual(run.acquiredInformation,info);
  assert.equal(engine.getTotalScore(run),0);assert.equal(engine.getTheoRemaining(run),2);
  assert.equal(engine.getAvailableConversations(departed(),content).length,0);
});

test('map interruption preserves exact result boundary and prevents another active chapter',()=>{
  const pack=fullFixture();
  let run=read(move(departed(PARTY,'commander.alphonse',pack),'START_REGION',{regionId:'alba'},pack),pack);
  const position=structuredClone(run.position);
  run=move(run,'RETURN_MAP',{},pack);
  assert.throws(()=>move(run,'START_REGION',{regionId:'hexerei'},pack));
  run=move(run,'START_REGION',{regionId:'alba'},pack);
  assert.deepEqual(run.position,position);assert.deepEqual(run.visitOrder,['alba']);
  run=read(resolve(run,2,pack),pack);
  const resultPosition=structuredClone(run.position);
  run=move(run,'RETURN_MAP',{},pack);run=move(run,'START_REGION',{regionId:'alba'},pack);
  assert.deepEqual(run.position,resultPosition);assert.equal(engine.getTotalScore(run),5);
});

test('test-only regions reorder freely; two-region encounter and four-region reunion occur once and resume',()=>{
  const pack=fullFixture();
  pack.regions=Object.fromEntries(Object.entries(pack.regions).reverse());
  let run=departed(PARTY,'commander.rosemond',pack);
  const order=['hexerei','rude','alba','anchoring'];
  for(let i=0;i<order.length;i++) {
    assert.throws(()=>move(run,'START_REGION',{regionId:'ehrenfels'},pack));
    run=move(run,'START_REGION',{regionId:order[i]},pack);
    for(let t=0;t<3;t++) run=finishTrial(run,1,pack);
    // Acknowledge only the chapter's closing block; inspect triggered event before reading it.
    run=move(run,'ACK_TEXT',{},pack);
    if(i===1||i===3) {
      const eventId=i===1?'test.encounter':'test.reunion';
      assert.equal(run.position.phase,'storyEvent');assert.equal(run.position.eventId,eventId);
      run=move(run,'ACK_TEXT',{},pack);
      const restored=JSON.parse(JSON.stringify(run));
      assert.equal(engine.validateRun(restored,pack),true);assert.equal(restored.position.blockIndex,1);
      run=read(restored,pack);
      assert.equal(run.storyEvents[eventId].status,'completed');
    }
    assert.equal(run.position.phase,'map');
    run=move(run,'RETURN_MAP',{},pack);assert.equal(run.position.phase,'map');
  }
  assert.deepEqual(run.visitOrder,order);
  run=move(run,'START_REGION',{regionId:'ehrenfels'},pack);
  assert.deepEqual(run.visitOrder,order);
  for(let t=0;t<3;t++) run=finishTrial(run,1,pack);
  run=read(run,pack);assert.equal(run.position.phase,'ending');
  assert.equal(engine.getTotalScore(run),60);
});

test('Theo limit is shared by all cities including final chapter',()=>{
  const pack=fullFixture();let run=departed(PARTY,'commander.alphonse',pack);
  for(const [index,regionId] of ['alba','hexerei','anchoring','rude','ehrenfels'].entries()) {
    run=read(move(run,'START_REGION',{regionId},pack),pack);
    run=finishTrial(run,0,pack);run=read(finishTrial(run,0,pack),pack);
    assert.equal(engine.canUseTheo(run,pack),index<2);
    if(index<2) run=read(move(run,'REQUEST_THEO',{},pack),pack);
    else assert.throws(()=>move(run,'REQUEST_THEO',{},pack));
    run=read(finishTrial(run,0,pack),pack);
  }
  assert.equal(engine.getTheoRemaining(run),0);
});

test('rank boundaries and hidden governance are independent of points',()=>{
  assert.deepEqual([59,60,79,80,100].map(engine.getFinalRank),['failure','success','success','highSuccess','highSuccess']);
  assert.throws(()=>engine.getFinalRank(101));assert.throws(()=>engine.getFinalRank(-1));
  const pack=fullFixture();const r=departed(PARTY,'commander.alphonse',pack);
  assert.equal(engine.getGovernance(r,pack).kind,'balanced');
  r.trialResults['alba.major']={awardedPoints:0,governanceTags:['people']};
  assert.equal(engine.getGovernance(r,pack).kind,'single');
  r.trialResults['hexerei.major']={awardedPoints:10,governanceTags:['reform']};
  assert.deepEqual(engine.getGovernance(r,pack).dominantTags,['people','reform']);
  r.trialResults['rude.major']={awardedPoints:10,governanceTags:['stability']};
  assert.equal(engine.getGovernance(r,pack).kind,'balanced');
});

test('save validation rejects malformed versions, positions, IDs, tags, history and progression',()=>{
  const valid=read(resolve(major(),1));
  const mutateAndReject=mutation=>{const r=structuredClone(valid);mutation(r);assert.throws(()=>engine.validateRun(r,content));};
  mutateAndReject(r=>r.schemaVersion=999);
  mutateAndReject(r=>r.contentVersion='unknown');
  mutateAndReject(r=>r.partyIds[0]='missing');
  mutateAndReject(r=>r.partyIds[1]=r.partyIds[0]);
  mutateAndReject(r=>r.visitOrder.push('alba'));
  mutateAndReject(r=>r.trialResults['alba.major'].awardedPoints=11);
  mutateAndReject(r=>r.trialResults['alba.small1'].awardedPoints=-1);
  mutateAndReject(r=>r.trialResults['alba.major'].governanceTags=['people','people']);
  mutateAndReject(r=>r.trialResults['alba.small1'].governanceTags=['people']);
  mutateAndReject(r=>r.position.blockIndex=999);
  mutateAndReject(r=>r.position.sceneId='alba.small1.intro');
  mutateAndReject(r=>r.chapterProgress.hexerei.status='completed');
  mutateAndReject(r=>r.chapterProgress.alba.status='completed');
  mutateAndReject(r=>r.position={phase:'completed'});
  mutateAndReject(r=>r.readTextKeys=[]);
  mutateAndReject(r=>r.heardConversationIds.push('conversation.alba.major.heidemarie'));
  mutateAndReject(r=>r.theoInvestigations.alba='investigation.alba');
  mutateAndReject(r=>r.acquiredInformation['info.alba.theo']={sources:[],acquiredAtSceneId:'alba.major.decision'});
  mutateAndReject(r=>r.storyEvents.missing={status:'completed'});
  mutateAndReject(r=>r.recentDialogueLog.push({textId:'missing'}));
});

test('conditions are whitelisted, fully checked, and current-state scoped',()=>{
  const r=major();
  assert.equal(engine.evaluateCondition({all:[{partyHas:'char.harold'},{trialResolved:'alba.small1'}]},r,content),true);
  assert.equal(engine.evaluateCondition({any:[{partyHas:'char.olivel'},{commanderIs:'commander.rosemond'}]},r,content),false);
  assert.throws(()=>engine.evaluateCondition({script:'return true'},r,content));
  assert.throws(()=>engine.evaluateCondition({any:[{partyHas:'char.harold'},{bad:'id'}]},r,content));
  assert.throws(()=>engine.evaluateCondition({all:[]},r,content));
});
