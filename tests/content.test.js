import test from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/fixture.js';

test('the content pack contains the eight approved profiles and two commanders', () => {
  assert.deepEqual(Object.keys(content.characters), ['char.harold', 'char.frederica', 'char.madian', 'char.olivel', 'char.lisette', 'char.vantalt', 'char.sandro', 'char.heidemarie']);
  assert.equal(Object.keys(content.commanders).length, 2);
  const roles = Object.values(content.characters).reduce((counts, character) => {
    counts[character.role] = (counts[character.role] ?? 0) + 1;
    assert.ok(character.age > 0);
    assert.ok(content.regions[character.originRegionId]);
    assert.ok(character.activityRegionIds.every(id => content.regions[id]));
    for (const field of ['profile', 'expertise', 'relationships']) assert.ok(character[field].length > 0);
    assert.equal(character.portraitAssetId, null);
    return counts;
  }, {});
  assert.deepEqual(roles, { melee: 4, ranged: 2, healer: 2 });
  assert.equal(new Set(Object.values(content.characters).map(character => character.displayOrder)).size, 8);
  assert.equal(content.characters['char.frederica'].originRegionId, 'hexerei');
  assert.deepEqual(content.characters['char.frederica'].activityRegionIds, ['alba']);
  assert.equal(content.characters['char.sandro'].originRegionId, 'anchoring');
  assert.deepEqual(content.characters['char.sandro'].activityRegionIds, ['hexerei']);
  assert.match(content.characters['char.lisette'].relationships.join(' '), /ハロルド.*オリヴェル/);
  assert.match(content.characters['char.sandro'].profile, /難病.*研究/);
});

test('only Alba has trials and no final-story content is activated', () => {
  assert.deepEqual(Object.keys(content.regions), ['alba', 'hexerei', 'anchoring', 'rude', 'ehrenfels']);
  assert.deepEqual(Object.values(content.regions).filter(region => region.implemented).map(region => region.id), ['alba']);
  assert.deepEqual(content.regions.alba.trialIds, ['alba.small1', 'alba.small2', 'alba.major']);
  assert.equal(Object.keys(content.trials).length, 3);
  assert.deepEqual(content.storyEvents, {});
  for (const region of Object.values(content.regions).filter(region => !region.implemented)) {
    assert.deepEqual(region.trialIds, []);
    assert.equal(region.theoInvestigationId, null);
  }
});

test('all provisional content is visibly identified and result scoring covers boundaries', () => {
  assert.equal(content.contentStatus, 'fixture');
  assert.equal(content.mode, 'albaPrototype');
  assert.match(content.fixtureNotice, /仮データ/);
  for (const dictionary of [content.textBlocks, content.conversations, content.information, content.investigations, content.trials]) {
    for (const [id, item] of Object.entries(dictionary)) {
      assert.equal(item.id, id);
      assert.equal(item.contentStatus, 'fixture');
    }
  }
  const tags = new Set(['people', 'reform', 'stability', 'coordination', 'fairness']);
  const conditionalChoices = [];
  for (const trial of Object.values(content.trials)) {
    assert.equal(trial.maxPoints, trial.kind === 'small' ? 5 : 10);
    assert.deepEqual(trial.choices.filter(choice => !choice.condition).map(choice => choice.points), trial.kind === 'small' ? [0, 3, 5] : [0, 6, 10]);
    for (const choice of trial.choices) {
      assert.equal(choice.contentStatus, 'fixture');
      assert.ok(Number.isInteger(choice.points) && choice.points >= 0 && choice.points <= trial.maxPoints);
      assert.ok(choice.governanceTags.every(tag => tags.has(tag)));
      assert.equal(new Set(choice.governanceTags).size, choice.governanceTags.length);
      assert.ok(choice.governanceTags.length <= (trial.kind === 'major' ? 2 : 0));
      if (trial.kind === 'major') assert.ok(choice.policyId);
      if (choice.condition) conditionalChoices.push(choice);
    }
  }
  assert.equal(conditionalChoices.length, 1);
  assert.equal(conditionalChoices[0].points, 6);
  assert.equal(Object.values(content.trials).reduce((sum, trial) => sum + trial.maxPoints, 0), 20);
});

test('every content reference resolves and conditions are declarative', () => {
  const actorIds = new Set([...Object.keys(content.characters), ...Object.keys(content.commanders), 'support.theo', 'support.chancellor']);
  const lookup = {
    commanderIs: content.commanders, partyHas: content.characters, conversationHeard: content.conversations,
    infoAcquired: content.information, trialResolved: content.trials, regionCompleted: content.regions, eventCompleted: content.storyEvents,
  };
  function conditionIsValid(condition) {
    if (!condition) return;
    for (const [key, value] of Object.entries(condition)) {
      if (key === 'all' || key === 'any') {
        assert.ok(Array.isArray(value) && value.length > 0);
        value.forEach(conditionIsValid);
      } else {
        assert.ok(lookup[key], `unsupported condition ${key}`);
        assert.ok(lookup[key][value], `unknown condition reference ${value}`);
      }
    }
  }
  for (const scene of Object.values(content.scenes)) {
    for (const blockId of scene.blocks) assert.ok(content.textBlocks[blockId]);
    for (const conversationId of scene.conversationIds) {
      assert.ok(content.conversations[conversationId]);
      assert.ok(content.conversations[conversationId].sceneIds.includes(scene.id));
    }
  }
  for (const trial of Object.values(content.trials)) {
    assert.ok(content.regions[trial.regionId]);
    assert.ok(content.scenes[trial.entrySceneId]);
    assert.ok(content.scenes[trial.decisionSceneId]);
    for (const choice of trial.choices) {
      choice.feedbackBlockIds.forEach(id => assert.ok(content.textBlocks[id]));
      conditionIsValid(choice.condition);
    }
  }
  for (const block of Object.values(content.textBlocks)) {
    if (block.speakerId) assert.ok(actorIds.has(block.speakerId));
    block.informationIdsOnAcknowledge.forEach(id => assert.ok(content.information[id]));
    conditionIsValid(block.condition);
  }
  for (const conversation of Object.values(content.conversations)) {
    conversation.participantIds.forEach(id => assert.ok(actorIds.has(id)));
    conversation.sceneIds.forEach(id => assert.ok(content.scenes[id]));
    conversation.blockIds.forEach(id => assert.ok(content.textBlocks[id]));
    conversation.informationIdsOnComplete.forEach(id => assert.ok(content.information[id]));
    conditionIsValid(conversation.condition);
  }
  for (const information of Object.values(content.information)) {
    assert.ok(content.regions[information.regionId]);
    assert.ok(content.trials[information.trialId]);
    assert.ok(content.scenes[information.sourceSceneId]);
    if (information.sourceActorId) assert.ok(actorIds.has(information.sourceActorId));
    assert.ok(['local', 'commander', 'companion', 'theo'].includes(information.sourceKind));
  }
  for (const investigation of Object.values(content.investigations)) {
    assert.ok(content.regions[investigation.regionId]);
    assert.ok(content.information[investigation.informationId]);
    investigation.reportBlockIds.forEach(id => assert.ok(content.textBlocks[id]));
  }
});

test('crisis has exactly three unconditional sets with four distinct active roles', () => {
  const trial = content.trials['alba.small2'];
  assert.equal(trial.interaction, 'crisisPlan');
  assert.equal(trial.choices.length, 3);
  for (const choice of trial.choices) {
    assert.equal(choice.condition, undefined);
    assert.deepEqual(Object.keys(choice.crisisRoleFallbacks), ['melee1', 'melee2', 'ranged', 'healer']);
    assert.equal(new Set(Object.values(choice.crisisRoleFallbacks)).size, 4);
    assert.ok(choice.feedbackBlockIds.some(id => content.textBlocks[id].crisisAssignments));
  }
});

test('conversations remain scene-specific, observations are distinct, and travel has no effect', () => {
  const haroldOpinions = Object.values(content.conversations).filter(conversation => conversation.participantIds.includes('char.harold'));
  assert.equal(haroldOpinions.length, 2);
  assert.notEqual(haroldOpinions[0].sceneIds[0], haroldOpinions[1].sceneIds[0]);
  assert.notEqual(haroldOpinions[0].informationIdsOnComplete[0], haroldOpinions[1].informationIdsOnComplete[0]);
  for (const trial of Object.values(content.trials)) assert.ok(content.scenes[trial.decisionSceneId].conversationIds.length < 4);
  const commanderBlocks = Object.values(content.textBlocks).filter(block => block.condition?.commanderIs);
  assert.equal(commanderBlocks.length, 2);
  assert.equal(new Set(commanderBlocks.map(block => block.id)).size, 2);
  assert.equal(new Set(commanderBlocks.flatMap(block => block.informationIdsOnAcknowledge)).size, 2);
  const travel = Object.values(content.conversations).filter(conversation => conversation.kind.startsWith('travel'));
  assert.ok(travel.length > 0);
  for (const conversation of travel) {
    assert.deepEqual(conversation.informationIdsOnComplete, []);
    for (const blockId of conversation.blockIds) assert.deepEqual(content.textBlocks[blockId].informationIdsOnAcknowledge, []);
    assert.equal(conversation.points, undefined);
    assert.equal(conversation.governanceTags, undefined);
  }
  assert.match(content.information['info.alba.theo'].summary, /三冊.*空白.*出典/);
});
