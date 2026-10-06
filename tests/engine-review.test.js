import test from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/fixture.js';
import { createRun, transition, getCurrentText, getAvailableChoices, validateRun } from '../src/engine.js';

function setup(position = 'draft') {
  let run = createRun(content, { runId: 'review-test' });
  const act = action => { run = transition(run, action, content); };
  const readAll = () => {
    let budget = 100;
    while (getCurrentText(run, content)) {
      assert.ok(budget-- > 0);
      act({ type: 'ACK_TEXT' });
    }
  };
  readAll();
  act({ type: 'SELECT_COMMANDER', commanderId: Object.keys(content.commanders)[0] });
  for (const characterId of ['char.harold', 'char.frederica', 'char.lisette', 'char.sandro']) act({ type: 'TOGGLE_PARTY', characterId });
  if (position === 'draft') return run;
  act({ type: 'CONFIRM_PARTY' }); act({ type: 'DEPART' }); readAll();
  if (position === 'map') return run;
  act({ type: 'START_REGION', regionId: 'alba' }); readAll();
  return run;
}

function addMajorConversation(run) {
  run.heardConversationIds.push('conversation.alba.major.harold');
  run.acquiredInformation['info.alba.major.harold'] = {
    acquiredAtSceneId: 'alba.major.decision',
    sources: [{ kind: 'conversation', id: 'conversation.alba.major.harold', sceneId: 'alba.major.decision' }],
  };
}

test('load validation rejects conversation/information before visiting their region or reaching their trial', () => {
  const draft = setup();
  addMajorConversation(draft);
  assert.throws(() => validateRun(draft, content), /未到達|未訪問/);
  const firstTrial = setup('trial');
  addMajorConversation(firstTrial);
  assert.throws(() => validateRun(firstTrial, content), /未到達|未訪問/);
  const prematureText = setup('trial');
  prematureText.acquiredInformation['info.alba.major.local'] = {
    acquiredAtSceneId: 'alba.major.intro',
    sources: [{ kind: 'text', id: 'text.alba.major.situation', sceneId: 'alba.major.intro' }],
  };
  assert.throws(() => validateRun(prematureText, content), /未到達/);
});

test('an active chapter on the map must retain a valid checkpoint regardless of stray region IDs', () => {
  for (const position of [{ phase: 'map' }, { phase: 'map', regionId: 'alba' }]) {
    const run = setup('trial');
    run.position = position;
    assert.throws(() => validateRun(run, content), /再開位置|不要な項目/);
  }
  const saved = transition(setup('trial'), { type: 'RETURN_MAP' }, content);
  assert.equal(validateRun(saved, content), true);
  const resumed = transition(saved, { type: 'START_REGION', regionId: 'alba' }, content);
  assert.equal(resumed.position.trialId, 'alba.small1');
});

test('map and setup phases reject text, trial, or event fields that could forge a reading position', () => {
  for (const phase of ['map', 'draft']) {
    for (const extra of [
      { sceneId: 'alba.major.intro', blockIndex: 0 },
      { trialId: 'alba.major' }, { regionId: 'alba' }, { eventId: 'fake' }, { stage: 'decision' },
    ]) {
      const run = setup(phase);
      run.position = { phase, ...extra };
      assert.throws(() => validateRun(run, content), /不要な項目/);
    }
  }
});

test('information cannot claim an unrelated reached scene as the source of its text', () => {
  const run = setup('trial');
  const entry = run.acquiredInformation['info.alba.small1.local'];
  assert.ok(entry);
  entry.acquiredAtSceneId = 'map';
  entry.sources[0].sceneId = 'map';
  assert.throws(() => validateRun(run, content), /文章由来/);
});

test('genuine conversation information remains valid at later trial checkpoints and after Alba completion', () => {
  let run = setup('trial');
  const act = action => { run = transition(run, action, content); };
  const readAll = () => {
    let budget = 100;
    while (getCurrentText(run, content)) {
      assert.ok(budget-- > 0);
      act({ type: 'ACK_TEXT' });
    }
  };
  act({ type: 'OPEN_CONVERSATION', conversationId: 'conversation.alba.small1.harold' });
  readAll();
  act({ type: 'RETURN_MAP' });
  assert.equal(validateRun(run, content), true);
  act({ type: 'START_REGION', regionId: 'alba' });
  for (const trialId of content.regions.alba.trialIds) {
    readAll();
    act({ type: 'RESOLVE_TRIAL', trialId, choiceId: getAvailableChoices(run, content)[0].id });
    readAll();
    act({ type: 'CONTINUE_TRIAL' });
  }
  readAll();
  assert.equal(run.chapterProgress.alba.status, 'completed');
  assert.equal(validateRun(run, content), true);
  assert.ok(run.heardConversationIds.includes('conversation.alba.small1.harold'));
});
