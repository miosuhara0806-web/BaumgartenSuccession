// Pure, serializable game state. Persistence and cross-run read history live elsewhere.
export const GOVERNANCE_TAGS = Object.freeze(['people', 'reform', 'stability', 'coordination', 'fairness']);
const SETUP_PHASES = new Set(['intro', 'commanderSelection', 'draft', 'partyConfirmation']);
const PHASES = new Set([...SETUP_PHASES, 'departure', 'map', 'trial', 'conversation', 'theoReport', 'trialResult', 'chapterClosing', 'storyEvent', 'ending', 'completed']);
const ROLE_LIMITS = { melee: 2, ranged: 1, healer: 1 };
const clone = value => structuredClone(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unique = values => Array.isArray(values) && new Set(values).size === values.length;
const string = value => typeof value === 'string' && value.length > 0;
const orderedCharacters = content => Object.values(content.characters).sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
const normalRegions = content => Object.values(content.regions).filter(region => region.kind === 'normal');
const completedCount = (run, content) => normalRegions(content).filter(region => run.chapterProgress[region.id]?.status === 'completed').length;
const activeRegionId = run => Object.keys(run.chapterProgress).find(id => run.chapterProgress[id].status === 'active');
const mainPosition = run => run.position.returnPosition || run.position;
const sceneKnown = (id, content) => id === 'map' || own(content.scenes, id);

export function isLegalParty(partyIds, content) {
  return unique(partyIds) && partyIds.length === 4 && partyIds.every(id => own(content.characters, id)) &&
    Object.entries(ROLE_LIMITS).every(([role, count]) => partyIds.filter(id => content.characters[id].role === role).length === count);
}

export function getOpponentParty(run, content) {
  return orderedCharacters(content).filter(character => !run.partyIds.includes(character.id));
}

export function getTotalScore(run) {
  return Object.values(run.trialResults).reduce((total, result) => total + result.awardedPoints, 0);
}

export function getTheoRemaining(run) { return 2 - Object.keys(run.theoInvestigations).length; }

export function getFinalRank(score) {
  assert(Number.isInteger(score) && score >= 0 && score <= 100, '継承点が範囲外です。');
  return score >= 80 ? 'highSuccess' : score >= 60 ? 'success' : 'failure';
}

export function getGovernance(run, content) {
  const counts = Object.fromEntries(GOVERNANCE_TAGS.map(tag => [tag, 0]));
  for (const [trialId, result] of Object.entries(run.trialResults)) {
    if (content.trials[trialId]?.kind === 'major') for (const tag of result.governanceTags) counts[tag]++;
  }
  const maximum = Math.max(...Object.values(counts));
  const dominantTags = GOVERNANCE_TAGS.filter(tag => counts[tag] === maximum);
  return { kind: dominantTags.length === 1 ? 'single' : dominantTags.length === 2 ? 'dual' : 'balanced', dominantTags: dominantTags.length > 2 ? [] : dominantTags, counts };
}

export function evaluateCondition(condition, run, content) {
  if (condition === undefined || condition === null) return true;
  assert(object(condition) && Object.keys(condition).length === 1, '条件の形式が不正です。');
  const [key, value] = Object.entries(condition)[0];
  if (key === 'all' || key === 'any') {
    assert(Array.isArray(value) && value.length > 0, '複合条件が空です。');
    // Evaluate every branch to reject malformed data even in a short-circuited branch.
    const results = value.map(item => evaluateCondition(item, run, content));
    return key === 'all' ? results.every(Boolean) : results.some(Boolean);
  }
  const dictionaries = { commanderIs: content.commanders, partyHas: content.characters, conversationHeard: content.conversations, infoAcquired: content.information, trialResolved: content.trials, regionCompleted: content.regions, eventCompleted: content.storyEvents };
  assert(own(dictionaries, key) && string(value) && own(dictionaries[key], value), '不明な条件または参照IDです。');
  switch (key) {
    case 'commanderIs': return run.commanderId === value;
    case 'partyHas': return run.partyIds.includes(value);
    case 'conversationHeard': return run.heardConversationIds.includes(value);
    case 'infoAcquired': return own(run.acquiredInformation, value);
    case 'trialResolved': return own(run.trialResults, value);
    case 'regionCompleted': return run.chapterProgress[value]?.status === 'completed';
    case 'eventCompleted': return run.storyEvents[value]?.status === 'completed';
    default: return false;
  }
}

function roleAssignments(run, content) {
  const party = orderedCharacters(content).filter(character => run.partyIds.includes(character.id));
  const melee = party.filter(character => character.role === 'melee');
  return { melee1: melee[0], melee2: melee[1], ranged: party.find(character => character.role === 'ranged'), healer: party.find(character => character.role === 'healer') };
}

export function getCrisisAssignments(run, choice, content) {
  if (!choice?.crisisRoleFallbacks) return [];
  return Object.entries(roleAssignments(run, content)).filter(([, character]) => character).map(([role, character]) => ({
    characterId: character.id, role,
    text: choice.crisisRoleTextByActor?.[character.id] || choice.crisisRoleFallbacks[role] || '',
  }));
}

function blockIdsFor(run, content) {
  const position = run.position;
  if (position.phase === 'conversation') return content.conversations[position.conversationId]?.blockIds || [];
  if (position.phase === 'theoReport') return content.investigations[position.investigationId]?.reportBlockIds || [];
  if (position.phase === 'trialResult') {
    const trial = content.trials[position.trialId];
    const result = run.trialResults[position.trialId];
    return trial?.choices.find(choice => choice.id === result?.choiceId)?.feedbackBlockIds || [];
  }
  return position.sceneId ? content.scenes[position.sceneId]?.blocks || [] : [];
}

export function getCurrentText(run, content) {
  const position = run.position;
  const id = blockIdsFor(run, content)[position.blockIndex];
  const block = content.textBlocks[id];
  if (!block || !evaluateCondition(block.condition, run, content)) return null;
  const roles = roleAssignments(run, content);
  const replacements = Object.fromEntries(Object.entries(roles).map(([role, character]) => [role, character?.name || '同行者']));
  replacements.commander = content.commanders[run.commanderId]?.name || '指揮官';
  replacements.rival = Object.values(content.commanders).find(commander => commander.id !== run.commanderId)?.name || 'もう一人の指揮官';
  let text = block.text.replace(/\{(melee1|melee2|ranged|healer|commander|rival)\}/g, (_, key) => replacements[key]);
  if (block.crisisAssignments && position.trialId) {
    const result = run.trialResults[position.trialId];
    const choice = content.trials[position.trialId].choices.find(item => item.id === result?.choiceId);
    text += '\n' + getCrisisAssignments(run, choice, content).map(item => `${content.characters[item.characterId].name}：${item.text}`).join('\n');
  }
  // A changed substitution must never inherit another party's read status.
  const variant = text === block.text ? '' : `:${encodeURIComponent(text)}`;
  return { ...block, text, readKey: `${block.id}@${block.textRevision}${variant}` };
}

export function getAvailableChoices(run, content) {
  if (run.position.phase !== 'trial' || run.position.stage !== 'decision' || getCurrentText(run, content)) return [];
  if (own(run.trialResults, run.position.trialId)) return [];
  return content.trials[run.position.trialId].choices.filter(choice => evaluateCondition(choice.condition, run, content));
}

export function getAvailableConversations(run, content) {
  const position = run.position;
  if (!(position.phase === 'map' || (position.phase === 'trial' && position.stage === 'decision' && !getCurrentText(run, content)))) return [];
  const sceneId = position.sceneId || 'map';
  const candidates = position.phase === 'map'
    ? Object.values(content.conversations).filter(conversation => conversation.sceneIds.includes('map'))
    : (content.scenes[sceneId]?.conversationIds || []).map(id => content.conversations[id]);
  return candidates.filter(conversation => conversation && !run.heardConversationIds.includes(conversation.id) &&
    conversation.participantIds.every(id => run.partyIds.includes(id) || id === run.commanderId || id === 'support.theo') &&
    evaluateCondition(conversation.condition, run, content));
}

export function canUseTheo(run, content) {
  const position = run.position;
  const trial = content.trials[position.trialId];
  const region = content.regions[position.regionId];
  return position.phase === 'trial' && position.stage === 'decision' && !getCurrentText(run, content) &&
    trial?.kind === 'major' && !run.trialResults[trial.id] && !!content.investigations[region?.theoInvestigationId] &&
    !run.theoInvestigations[region.id] && getTheoRemaining(run) > 0;
}

export function canManualSave(run) {
  const p = run.position;
  return p.phase === 'map' || p.phase === 'trialResult' ||
    (p.phase === 'trial' && ((p.stage === 'intro' && p.blockIndex === 0) || p.stage === 'decision'));
}

function addInformation(run, informationId, source, content) {
  assert(own(content.information, informationId), '情報IDが不明です。');
  const entry = run.acquiredInformation[informationId] ||= { sources: [], acquiredAtSceneId: source.sceneId };
  if (!entry.sources.some(existing => existing.kind === source.kind && existing.id === source.id && existing.sceneId === source.sceneId)) entry.sources.push(source);
}

function beginTrial(run, trial, content, useRegionEntry = false) {
  run.position = { phase: 'trial', stage: 'intro', regionId: trial.regionId, trialId: trial.id,
    sceneId: useRegionEntry ? content.regions[trial.regionId].entrySceneId || trial.entrySceneId : trial.entrySceneId, blockIndex: 0 };
}

function enterMap(run, content) {
  const inProgress = Object.entries(run.storyEvents).find(([, event]) => event.status === 'inProgress');
  assert(!inProgress, '進行中イベントを地図で上書きできません。');
  run.position = { phase: 'map' };
  // These triggers are data extensions for independent full-game fixtures; absent in Alba.
  const count = completedCount(run, content);
  const candidates = Object.values(content.storyEvents).sort((a, b) => (a.trigger === 'afterTwoRegions' ? 0 : 1) - (b.trigger === 'afterTwoRegions' ? 0 : 1));
  const event = candidates.find(item => !run.storyEvents[item.id] &&
    ((item.trigger === 'afterTwoRegions' && count >= 2) || (item.trigger === 'beforeFinal' && count >= 4)));
  if (event) {
    run.storyEvents[event.id] = { status: 'inProgress' };
    run.position = { phase: 'storyEvent', eventId: event.id, sceneId: event.entrySceneId, blockIndex: 0 };
  }
}

function finishBlockSequence(run, content) {
  const p = run.position;
  if (!['conversation', 'theoReport', 'trialResult'].includes(p.phase) && content.scenes[p.sceneId]?.nextSceneId) {
    p.sceneId = content.scenes[p.sceneId].nextSceneId;
    p.blockIndex = 0;
    return true;
  }
  switch (p.phase) {
    case 'intro': run.position = { phase: 'commanderSelection' }; return false;
    case 'departure': enterMap(run, content); return true;
    case 'trial':
      if (p.stage === 'decision') return false;
      if (p.sceneId === content.regions[p.regionId].entrySceneId && p.sceneId !== content.trials[p.trialId].entrySceneId) {
        p.sceneId = content.trials[p.trialId].entrySceneId; p.blockIndex = 0; return true;
      }
      p.stage = 'decision'; p.sceneId = content.trials[p.trialId].decisionSceneId; p.blockIndex = 0; return true;
    case 'conversation': {
      const conversation = content.conversations[p.conversationId];
      if (!run.heardConversationIds.includes(conversation.id)) run.heardConversationIds.push(conversation.id);
      if (conversation.kind === 'trialOpinion') {
        for (const id of conversation.informationIdsOnComplete || []) addInformation(run, id, { kind: 'conversation', id: conversation.id, sceneId: p.sceneId }, content);
      }
      run.position = p.returnPosition; return false;
    }
    case 'theoReport': run.position = p.returnPosition; return false;
    case 'trialResult': p.stage = 'done'; return false;
    case 'chapterClosing': {
      run.chapterProgress[p.regionId] = { status: 'completed' };
      if (content.regions[p.regionId].kind === 'final') {
        run.position = content.endingSceneId ? { phase: 'ending', sceneId: content.endingSceneId, blockIndex: 0 } : { phase: 'ending' };
      } else enterMap(run, content);
      return true;
    }
    case 'storyEvent': {
      const event = content.storyEvents[p.eventId];
      if (event.completionSceneId && p.sceneId !== event.completionSceneId) {
        p.sceneId = event.completionSceneId; p.blockIndex = 0; return true;
      }
      run.storyEvents[p.eventId] = { status: 'completed' };
      enterMap(run, content); return true;
    }
    default: return false;
  }
}

function normalize(run, content) {
  for (let guard = 0; guard < 500; guard++) {
    const p = run.position;
    if (!Number.isInteger(p.blockIndex)) return;
    const ids = blockIdsFor(run, content);
    while (p.blockIndex < ids.length && !evaluateCondition(content.textBlocks[ids[p.blockIndex]].condition, run, content)) p.blockIndex++;
    if (p.blockIndex < ids.length || !finishBlockSequence(run, content)) return;
  }
  throw new Error('場面遷移が循環しています。');
}

export function createRun(content, { runId = globalThis.crypto.randomUUID(), now = new Date().toISOString() } = {}) {
  const run = {
    schemaVersion: 1, contentVersion: content.contentVersion, mode: content.mode || 'albaPrototype', runId, startedAt: now,
    commanderId: null, partyIds: [], visitOrder: [],
    position: { phase: 'intro', sceneId: content.introSceneId, blockIndex: 0 },
    chapterProgress: Object.fromEntries(Object.keys(content.regions).map(id => [id, { status: 'notStarted' }])),
    trialResults: {}, heardConversationIds: [], acquiredInformation: {}, theoInvestigations: {}, storyEvents: {}, recentDialogueLog: [],
  };
  normalize(run, content);
  validateRun(run, content);
  return run;
}

export function transition(current, action, content) {
  validateRun(current, content);
  assert(object(action) && string(action.type), '操作が不正です。');
  const run = clone(current);
  const p = run.position;
  switch (action.type) {
    case 'ACK_TEXT': {
      const block = getCurrentText(run, content);
      assert(block, '確認する文章がありません。');
      run.recentDialogueLog.push({ textId: block.id, textRevision: block.textRevision, readKey: block.readKey, speakerId: block.speakerId || null, text: block.text, sceneId: p.sceneId });
      run.recentDialogueLog = run.recentDialogueLog.slice(-200);
      // Travel chatter is deliberately free of gameplay effects, even with malformed data.
      const travel = p.phase === 'conversation' && content.conversations[p.conversationId].kind !== 'trialOpinion';
      assert(!travel || !(block.informationIdsOnAcknowledge || []).length, '旅の雑談には情報効果を設定できません。');
      for (const id of block.informationIdsOnAcknowledge || []) addInformation(run, id, { kind: 'text', id: block.id, sceneId: p.sceneId }, content);
      p.blockIndex++;
      normalize(run, content);
      break;
    }
    case 'SELECT_COMMANDER':
      assert(['commanderSelection', 'draft'].includes(p.phase) && own(content.commanders, action.commanderId), '指揮官を選べません。');
      run.commanderId = action.commanderId; run.position = { phase: 'draft' }; break;
    case 'TOGGLE_PARTY': {
      assert(p.phase === 'draft' && own(content.characters, action.characterId), '同行者を変更できません。');
      if (run.partyIds.includes(action.characterId)) run.partyIds = run.partyIds.filter(id => id !== action.characterId);
      else {
        const role = content.characters[action.characterId].role;
        assert(run.partyIds.filter(id => content.characters[id].role === role).length < ROLE_LIMITS[role], 'この役割の枠は満員です。先に選択済みの人物を外してください。');
        run.partyIds.push(action.characterId);
      }
      run.partyIds.sort((a, b) => content.characters[a].displayOrder - content.characters[b].displayOrder);
      break;
    }
    case 'CONFIRM_PARTY':
      assert(p.phase === 'draft' && isLegalParty(run.partyIds, content), '近接2人・遠隔1人・回復1人を選んでください。');
      run.position = { phase: 'partyConfirmation' }; break;
    case 'BACK_TO_DRAFT':
      assert(p.phase === 'partyConfirmation', '選抜へ戻れません。'); run.position = { phase: 'draft' }; break;
    case 'DEPART':
      assert(p.phase === 'partyConfirmation' && isLegalParty(run.partyIds, content), '出発できません。');
      run.position = { phase: 'departure', sceneId: content.departureSceneId, blockIndex: 0 }; normalize(run, content); break;
    case 'START_REGION': {
      assert(p.phase === 'map', '地図から地域を選んでください。');
      const region = content.regions[action.regionId];
      assert(region?.implemented, 'この地域は準備中です。');
      const progress = run.chapterProgress[region.id];
      assert(progress.status !== 'completed', '完了済み地域の再挑戦はできません。');
      assert(!activeRegionId(run) || activeRegionId(run) === region.id, '攻略中の地域を先に終えてください。');
      if (region.kind === 'final') {
        assert(run.mode === 'full' && completedCount(run, content) === 4, '王都最終章はまだ解放されていません。');
        assert(Object.values(content.storyEvents).filter(event => event.trigger === 'beforeFinal').every(event => run.storyEvents[event.id]?.status === 'completed'), '再集合を終えてください。');
      }
      if (progress.status === 'active') {
        assert(progress.resumePosition, '再開位置がありません。');
        run.position = progress.resumePosition; delete progress.resumePosition;
      } else {
        progress.status = 'active';
        if (region.kind === 'normal') run.visitOrder.push(region.id);
        beginTrial(run, content.trials[region.trialIds[0]], content, true);
      }
      normalize(run, content); break;
    }
    case 'OPEN_CONVERSATION': {
      const conversation = getAvailableConversations(run, content).find(item => item.id === action.conversationId);
      assert(conversation, 'この会話は今は聞けません。');
      assert(conversation.kind === 'trialOpinion' || !(conversation.informationIdsOnComplete || []).length, '旅の雑談には情報効果を設定できません。');
      run.position = { phase: 'conversation', conversationId: conversation.id, sceneId: p.sceneId || 'map', blockIndex: 0, returnPosition: clone(p) };
      normalize(run, content); break;
    }
    case 'REQUEST_THEO': {
      if (p.phase === 'theoReport' || (p.phase === 'trial' && run.theoInvestigations[p.regionId])) break;
      assert(canUseTheo(run, content), 'テオへ調査を依頼できません。');
      const investigation = content.investigations[content.regions[p.regionId].theoInvestigationId];
      run.theoInvestigations[p.regionId] = investigation.id;
      addInformation(run, investigation.informationId, { kind: 'investigation', id: investigation.id, sceneId: p.sceneId }, content);
      run.position = { phase: 'theoReport', regionId: p.regionId, trialId: p.trialId, investigationId: investigation.id, sceneId: p.sceneId, blockIndex: 0, returnPosition: clone(p) };
      normalize(run, content); break;
    }
    case 'RESOLVE_TRIAL': {
      if (run.trialResults[action.trialId]) {
        assert(run.trialResults[action.trialId].choiceId === action.choiceId, '確定済みの判断は上書きできません。'); break;
      }
      assert(p.phase === 'trial' && p.trialId === action.trialId && p.stage === 'decision', '現在の試練と一致しません。');
      const trial = content.trials[p.trialId];
      const choice = getAvailableChoices(run, content).find(item => item.id === action.choiceId);
      assert(choice, 'この選択肢は選べません。');
      validateAward(trial, choice.points, choice.governanceTags || []);
      run.trialResults[trial.id] = { choiceId: choice.id, awardedPoints: choice.points, governanceTags: clone(choice.governanceTags || []), contentVersion: content.contentVersion,
        ...(choice.policyId ? { policyId: choice.policyId, labelAtDecision: choice.label } : {}) };
      run.position = { phase: 'trialResult', stage: 'reading', trialId: trial.id, regionId: trial.regionId, sceneId: trial.decisionSceneId, blockIndex: 0 };
      normalize(run, content); break;
    }
    case 'RETURN_MAP':
      if (p.phase === 'map') { enterMap(run, content); normalize(run, content); break; }
      assert((p.phase === 'trial' && p.stage === 'decision' && !getCurrentText(run, content)) || (p.phase === 'trialResult' && p.stage === 'done'), '試練の区切りで地図へ戻れます。');
      run.chapterProgress[p.regionId].resumePosition = clone(p); enterMap(run, content); normalize(run, content); break;
    case 'CONTINUE_TRIAL': {
      assert(p.phase === 'trialResult' && p.stage === 'done', '結果文を読み終えてください。');
      const region = content.regions[p.regionId];
      const index = region.trialIds.indexOf(p.trialId);
      if (index + 1 < region.trialIds.length) beginTrial(run, content.trials[region.trialIds[index + 1]], content);
      else run.position = { phase: 'chapterClosing', regionId: region.id, sceneId: region.closingSceneId, blockIndex: 0 };
      normalize(run, content); break;
    }
    default: throw new Error(`不明な操作です: ${action.type}`);
  }
  validateRun(run, content);
  return run;
}

function validateAward(trial, points, tags) {
  assert(trial && trial.maxPoints === (trial.kind === 'major' ? 10 : 5), '試練の満点が不正です。');
  assert(Number.isInteger(points) && points >= 0 && points <= trial.maxPoints, '得点が範囲外です。');
  assert(unique(tags) && tags.length <= 2 && tags.every(tag => GOVERNANCE_TAGS.includes(tag)) && (trial.kind === 'major' || tags.length === 0), '統治タグが不正です。');
}

function sceneInChain(sceneId, startId, content) {
  const visited = new Set();
  let id = startId;
  while (id && !visited.has(id)) {
    if (id === sceneId) return true;
    visited.add(id); id = content.scenes[id]?.nextSceneId;
  }
  return false;
}

// A valid ID alone does not prove that this run has reached its source scene.
// Keep this independent of global reading and of the bounded dialogue log.
function trialWasReached(trialId, run, content, decision = false) {
  const trial = content.trials[trialId];
  const progress = trial && run.chapterProgress[trial.regionId];
  if (!progress || progress.status === 'notStarted') return false;
  if (run.trialResults[trialId]) return true;
  const p = progress.resumePosition || mainPosition(run);
  if (p.regionId !== trial.regionId || p.trialId !== trialId || p.phase !== 'trial') return false;
  return !decision || p.stage === 'decision';
}

function sceneWasReached(sceneId, run, content) {
  if (sceneId === 'map') return !SETUP_PHASES.has(run.position.phase) && run.position.phase !== 'departure';
  if (sceneInChain(sceneId, content.introSceneId, content)) return true;
  if (sceneInChain(sceneId, content.departureSceneId, content)) return !SETUP_PHASES.has(run.position.phase);
  for (const region of Object.values(content.regions)) {
    if (run.chapterProgress[region.id]?.status === 'notStarted') continue;
    if (sceneInChain(sceneId, region.entrySceneId, content)) return true;
    if (sceneInChain(sceneId, region.closingSceneId, content)) {
      return run.chapterProgress[region.id]?.status === 'completed' || mainPosition(run).phase === 'chapterClosing' && mainPosition(run).regionId === region.id;
    }
    for (const trialId of region.trialIds) {
      const trial = content.trials[trialId];
      if (sceneInChain(sceneId, trial.entrySceneId, content)) return trialWasReached(trialId, run, content);
      if (sceneInChain(sceneId, trial.decisionSceneId, content)) return trialWasReached(trialId, run, content, true);
    }
  }
  for (const event of Object.values(content.storyEvents)) {
    if (run.storyEvents[event.id] && (sceneInChain(sceneId, event.entrySceneId, content) || sceneInChain(sceneId, event.completionSceneId, content))) return true;
  }
  return ['ending', 'completed'].includes(run.position.phase) && sceneInChain(sceneId, content.endingSceneId, content);
}

function textBelongsToSourceScene(textId, sceneId, run, content) {
  if (content.scenes[sceneId]?.blocks.includes(textId)) return true;
  if (Object.values(content.conversations).some(conversation => conversation.sceneIds.includes(sceneId) && conversation.blockIds.includes(textId)
    && (run.heardConversationIds.includes(conversation.id) || run.position.conversationId === conversation.id))) return true;
  if (Object.values(content.investigations).some(investigation => investigation.reportBlockIds.includes(textId)
    && run.theoInvestigations[investigation.regionId] === investigation.id
    && Object.values(content.trials).some(trial => trial.regionId === investigation.regionId && trial.kind === 'major' && trial.decisionSceneId === sceneId))) return true;
  return Object.values(content.trials).some(trial => trial.decisionSceneId === sceneId
    && trial.choices.some(choice => choice.id === run.trialResults[trial.id]?.choiceId && choice.feedbackBlockIds.includes(textId)));
}

function validatePosition(position, run, content, nested = false) {
  assert(object(position) && PHASES.has(position.phase), '進行位置が不正です。');
  const p = position;
  const allowed = {
    intro: ['sceneId', 'blockIndex'], commanderSelection: [], draft: [], partyConfirmation: [],
    departure: ['sceneId', 'blockIndex'], map: [],
    trial: ['stage', 'regionId', 'trialId', 'sceneId', 'blockIndex'],
    trialResult: ['stage', 'regionId', 'trialId', 'sceneId', 'blockIndex'],
    chapterClosing: ['regionId', 'sceneId', 'blockIndex'],
    conversation: ['conversationId', 'sceneId', 'blockIndex', 'returnPosition'],
    theoReport: ['regionId', 'trialId', 'investigationId', 'sceneId', 'blockIndex', 'returnPosition'],
    storyEvent: ['eventId', 'sceneId', 'blockIndex'], ending: ['sceneId', 'blockIndex'], completed: [],
  };
  assert(Object.keys(p).every(key => key === 'phase' || allowed[p.phase].includes(key)), '進行位置に不要な項目があります。');
  if (p.phase === 'ending') assert((p.sceneId === undefined) === (p.blockIndex === undefined), '終幕の本文位置が不正です。');
  const textPhases = ['intro', 'departure', 'trial', 'trialResult', 'chapterClosing', 'conversation', 'theoReport', 'storyEvent'];
  if (textPhases.includes(p.phase) || (p.phase === 'ending' && p.sceneId)) {
    assert(sceneKnown(p.sceneId, content) && Number.isInteger(p.blockIndex) && p.blockIndex >= 0, '本文の再開位置が不正です。');
    const probe = { ...run, position: p };
    const ids = blockIdsFor(probe, content);
    assert(p.blockIndex <= ids.length, '本文の再開位置が範囲外です。');
    if (p.blockIndex < ids.length) assert(getCurrentText(probe, content), '表示条件を満たさない文章位置です。');
    else assert((p.phase === 'trial' && p.stage === 'decision') || (p.phase === 'trialResult' && p.stage === 'done') || p.phase === 'ending', '完了済み文章に停止しています。');
  }
  if (['trial', 'trialResult', 'chapterClosing'].includes(p.phase)) {
    const region = content.regions[p.regionId];
    assert(region?.implemented && run.chapterProgress[p.regionId].status === 'active', '攻略中の地域と現在位置が一致しません。');
    if (p.phase === 'chapterClosing') {
      assert(region.trialIds.every(id => run.trialResults[id]) && sceneInChain(p.sceneId, region.closingSceneId, content), '章終了位置が不正です。');
    } else {
      const trial = content.trials[p.trialId];
      assert(trial && trial.regionId === p.regionId && region.trialIds.includes(p.trialId), '試練の参照先が不正です。');
      const index = region.trialIds.indexOf(trial.id);
      assert(region.trialIds.slice(0, index).every(id => run.trialResults[id]) && region.trialIds.slice(index + 1).every(id => !run.trialResults[id]), '試練の順序が不正です。');
      if (p.phase === 'trial') {
        assert(['intro', 'decision'].includes(p.stage) && !run.trialResults[trial.id], '判断前の位置が不正です。');
        assert(p.stage === 'intro' ? sceneInChain(p.sceneId, trial.entrySceneId, content) || (index === 0 && sceneInChain(p.sceneId, region.entrySceneId, content)) : sceneInChain(p.sceneId, trial.decisionSceneId, content), '試練の場面が不正です。');
      } else {
        assert(run.trialResults[trial.id] && ['reading', 'done'].includes(p.stage) && p.sceneId === trial.decisionSceneId, '判断結果の位置が不正です。');
        assert((p.stage === 'done') === (p.blockIndex === blockIdsFor({ ...run, position: p }, content).length), '結果の読了状態が不正です。');
      }
    }
  }
  if (['conversation', 'theoReport'].includes(p.phase)) {
    assert(!nested && object(p.returnPosition) && ['trial', 'map'].includes(p.returnPosition.phase), '会話の復帰位置が不正です。');
    validatePosition(p.returnPosition, run, content, true);
    assert(p.sceneId === (p.returnPosition.sceneId || 'map'), '会話の場面と復帰位置が一致しません。');
    if (p.phase === 'conversation') {
      assert(getAvailableConversations({ ...run, position: p.returnPosition }, content).some(item => item.id === p.conversationId), '開始できない会話が保存されています。');
    } else {
      const investigation = content.investigations[p.investigationId];
      assert(investigation && investigation.regionId === p.regionId && run.theoInvestigations[p.regionId] === investigation.id &&
        p.returnPosition.trialId === p.trialId && content.trials[p.trialId]?.kind === 'major', 'テオ報告の位置が不正です。');
    }
  } else assert(!p.returnPosition, '不要な会話復帰位置です。');
  if (p.phase === 'intro') assert(sceneInChain(p.sceneId, content.introSceneId, content), '導入場面が不正です。');
  if (p.phase === 'departure') assert(sceneInChain(p.sceneId, content.departureSceneId, content), '出発場面が不正です。');
  if (p.phase === 'storyEvent') {
    const event = content.storyEvents[p.eventId];
    assert(event && run.storyEvents[p.eventId]?.status === 'inProgress' && (sceneInChain(p.sceneId, event.entrySceneId, content) || sceneInChain(p.sceneId, event.completionSceneId, content)), 'イベント位置が不正です。');
  }
}

export function validateRun(run, content) {
  assert(object(run) && run.schemaVersion === 1, '非対応の保存形式です。');
  assert(run.contentVersion === content.contentVersion, '内容版が異なるため読み込めません。');
  assert(run.mode === (content.mode || 'albaPrototype') && string(run.runId) && string(run.startedAt) && Number.isFinite(Date.parse(run.startedAt)), '周回の識別情報が不正です。');
  for (const key of ['chapterProgress', 'trialResults', 'acquiredInformation', 'theoInvestigations', 'storyEvents']) assert(object(run[key]), `${key} が不正です。`);
  assert(object(run.position) && PHASES.has(run.position.phase), '進行位置が不正です。');
  assert(unique(run.partyIds) && run.partyIds.length <= 4 && run.partyIds.every(id => own(content.characters, id)), '同行者IDが不正です。');
  for (const [role, limit] of Object.entries(ROLE_LIMITS)) assert(run.partyIds.filter(id => content.characters[id].role === role).length <= limit, '役割の人数が不正です。');
  assert(run.commanderId === null || own(content.commanders, run.commanderId), '指揮官IDが不正です。');
  if (!['intro', 'commanderSelection'].includes(run.position.phase)) assert(own(content.commanders, run.commanderId), '指揮官が未選択です。');
  if (!SETUP_PHASES.has(run.position.phase) || run.position.phase === 'partyConfirmation') assert(isLegalParty(run.partyIds, content), '編成が不正です。');
  if (['intro', 'commanderSelection'].includes(run.position.phase)) assert(run.commanderId === null && run.partyIds.length === 0, '選抜前の状態が不正です。');
  assert(unique(run.visitOrder) && run.visitOrder.every(id => content.regions[id]?.kind === 'normal' && content.regions[id].implemented), '訪問順が不正です。');
  assert(Object.keys(run.chapterProgress).length === Object.keys(content.regions).length && Object.keys(content.regions).every(id => own(run.chapterProgress, id)), '地域進行の参照先が不正です。');
  let activeCount = 0;
  for (const [id, progress] of Object.entries(run.chapterProgress)) {
    const region = content.regions[id];
    assert(object(progress) && ['notStarted', 'active', 'completed'].includes(progress.status), '地域の状態が不正です。');
    assert(region.implemented || progress.status === 'notStarted', '準備中地域に進行記録があります。');
    if (region.kind === 'normal') assert(run.visitOrder.includes(id) === (progress.status !== 'notStarted'), '訪問順と地域進行が一致しません。');
    if (region.kind === 'final' && progress.status !== 'notStarted') assert(run.mode === 'full' && completedCount(run, content) === 4, '未解放の王都に進行しています。');
    const results = region.trialIds.map(trialId => own(run.trialResults, trialId));
    if (progress.status === 'notStarted') assert(results.every(value => !value), '未訪問地域に得点があります。');
    if (progress.status === 'completed') assert(results.length === 3 && results.every(Boolean), '完了地域の試練結果が不足しています。');
    if (progress.status === 'active') {
      activeCount++;
      assert(!results.some((value, index) => value && results.slice(0, index).some(previous => !previous)), '試練結果に順序の飛び越しがあります。');
      if (region.kind === 'normal') assert(run.visitOrder.at(-1) === id, '攻略中地域が訪問順の最後ではありません。');
    } else assert(!progress.resumePosition, '未攻略・完了地域に再開位置があります。');
    if (progress.resumePosition) {
      assert(['map', 'storyEvent'].includes(mainPosition(run).phase) && progress.resumePosition.regionId === id, '地域再開位置が不正です。');
      validatePosition(progress.resumePosition, run, content, true);
      assert((progress.resumePosition.phase === 'trial' && progress.resumePosition.stage === 'decision') || (progress.resumePosition.phase === 'trialResult' && progress.resumePosition.stage === 'done'), '区切り以外の地域再開位置です。');
    }
  }
  assert(activeCount <= 1, '複数地域を同時攻略しています。');
  const active = activeRegionId(run);
  if (active) {
    const p = mainPosition(run);
    if (['map', 'storyEvent'].includes(p.phase)) assert(run.chapterProgress[active].resumePosition, '攻略中地域の再開位置がありません。');
    else assert(p.regionId === active && ['trial', 'trialResult', 'chapterClosing'].includes(p.phase), '攻略中地域の現在位置が不正です。');
  }
  if (SETUP_PHASES.has(run.position.phase) || run.position.phase === 'departure') assert(!active && run.visitOrder.length === 0 && Object.keys(run.trialResults).length === 0, '出発前に進行記録があります。');
  for (const [trialId, result] of Object.entries(run.trialResults)) {
    const trial = content.trials[trialId];
    assert(trial && object(result) && result.contentVersion === run.contentVersion, '試練結果の参照または版が不正です。');
    const choice = trial.choices.find(item => item.id === result.choiceId);
    assert(choice && evaluateCondition(choice.condition, run, content), '試練結果の選択肢が不正です。');
    validateAward(trial, result.awardedPoints, result.governanceTags);
    assert((result.policyId || null) === (choice.policyId || null), '政策IDが不正です。');
  }
  assert(getTotalScore(run) <= (run.mode === 'albaPrototype' ? 20 : 100), '継承点合計が範囲外です。');
  assert(unique(run.heardConversationIds) && run.heardConversationIds.every(id => own(content.conversations, id)), '会話記録が不正です。');
  for (const id of run.heardConversationIds) {
    const conversation = content.conversations[id];
    assert(conversation.participantIds.every(actor => run.partyIds.includes(actor) || actor === run.commanderId || actor === 'support.theo') && evaluateCondition(conversation.condition, run, content), '同行していない人物・条件外の会話記録です。');
    assert(conversation.sceneIds.some(sceneId => sceneWasReached(sceneId, run, content)), '未到達の場面に会話記録があります。');
    if (conversation.kind !== 'trialOpinion') assert(!(conversation.informationIdsOnComplete || []).length, '旅の雑談に情報効果があります。');
  }
  assert(Object.keys(run.theoInvestigations).length <= 2, 'テオの調査回数が不正です。');
  for (const [regionId, investigationId] of Object.entries(run.theoInvestigations)) {
    const region = content.regions[regionId];
    const investigation = content.investigations[investigationId];
    assert(region?.implemented && region.theoInvestigationId === investigationId && investigation?.regionId === regionId && run.chapterProgress[regionId].status !== 'notStarted', 'テオの調査履歴が不正です。');
    assert(region.trialIds.slice(0, 2).every(id => run.trialResults[id]), '大試練前にテオを使用しています。');
    assert(run.acquiredInformation[investigation.informationId]?.sources.some(source => source.kind === 'investigation' && source.id === investigationId), 'テオの情報が不足しています。');
  }
  for (const [infoId, entry] of Object.entries(run.acquiredInformation)) {
    assert(own(content.information, infoId) && object(entry) && sceneKnown(entry.acquiredAtSceneId, content) && Array.isArray(entry.sources) && entry.sources.length > 0, '情報記録が不正です。');
    const information = content.information[infoId];
    if (information.regionId) assert(run.chapterProgress[information.regionId]?.status !== 'notStarted' && content.regions[information.regionId], '未訪問地域に情報記録があります。');
    if (information.trialId) assert(trialWasReached(information.trialId, run, content), '未到達の試練に情報記録があります。');
    assert(entry.sources.some(source => source.sceneId === entry.acquiredAtSceneId), '情報の初回取得場面と出典が一致しません。');
    const sourceKeys = [];
    for (const source of entry.sources) {
      assert(object(source) && sceneKnown(source.sceneId, content) && sceneWasReached(source.sceneId, run, content), '情報の出典場面が不正です。');
      sourceKeys.push(`${source.kind}:${source.id}:${source.sceneId}`);
      if (source.kind === 'text') {
        const block = content.textBlocks[source.id];
        assert(block?.informationIdsOnAcknowledge?.includes(infoId) && evaluateCondition(block.condition, run, content)
          && textBelongsToSourceScene(source.id, source.sceneId, run, content), '文章由来の情報出典が不正です。');
      } else if (source.kind === 'conversation') {
        const conversation = content.conversations[source.id];
        assert(conversation?.kind === 'trialOpinion' && run.heardConversationIds.includes(source.id) && conversation.informationIdsOnComplete?.includes(infoId) && conversation.sceneIds.includes(source.sceneId), '会話由来の情報出典が不正です。');
      } else if (source.kind === 'investigation') {
        const investigation = content.investigations[source.id];
        assert(investigation?.informationId === infoId && run.theoInvestigations[investigation.regionId] === source.id, 'テオ由来の情報出典が不正です。');
      } else throw new Error('情報の出典種別が不正です。');
    }
    assert(unique(sourceKeys), '情報の出典が重複しています。');
  }
  for (const id of run.heardConversationIds) {
    for (const infoId of content.conversations[id].informationIdsOnComplete || []) assert(run.acquiredInformation[infoId]?.sources.some(source => source.kind === 'conversation' && source.id === id), '完了会話の情報が不足しています。');
  }
  let eventsInProgress = 0;
  for (const [id, eventState] of Object.entries(run.storyEvents)) {
    const event = content.storyEvents[id];
    assert(event && object(eventState) && ['inProgress', 'completed'].includes(eventState.status), 'イベント状態が不正です。');
    if (event.trigger === 'afterTwoRegions') assert(completedCount(run, content) >= 2, '遭遇の発生条件を満たしていません。');
    if (event.trigger === 'beforeFinal') assert(completedCount(run, content) >= 4, '再集合の発生条件を満たしていません。');
    if (eventState.status === 'inProgress') {
      eventsInProgress++; assert(run.position.phase === 'storyEvent' && run.position.eventId === id, '進行中イベントの位置がありません。');
    }
  }
  assert(eventsInProgress <= 1, '複数イベントが進行中です。');
  assert(Array.isArray(run.recentDialogueLog) && run.recentDialogueLog.length <= 200, '会話ログが不正です。');
  for (const entry of run.recentDialogueLog) assert(object(entry) && content.textBlocks[entry.textId] && Number.isInteger(entry.textRevision) && entry.textRevision > 0 && string(entry.readKey) && entry.readKey.startsWith(`${entry.textId}@${entry.textRevision}`) && string(entry.text) && sceneKnown(entry.sceneId, content), '会話ログの参照が不正です。');
  if (['ending', 'completed'].includes(run.position.phase)) {
    assert(run.mode === 'full' && Object.keys(content.regions).length === 5 && Object.values(run.chapterProgress).every(progress => progress.status === 'completed'), '全章未完了で継承判定へ到達しています。');
  }
  if (run.endingSnapshot !== undefined) assert(object(run.endingSnapshot) && ['ending', 'completed'].includes(run.position.phase), '終幕記録が不正です。');
  if (run.completionKey !== undefined) assert(string(run.completionKey) && run.endingSnapshot && ['ending', 'completed'].includes(run.position.phase), '完了キーが不正です。');
  for (const key of ['totalScore', 'theoRemaining', 'opponentParty', 'readTextKeys', 'readerProfile', 'chronicles']) assert(!own(run, key), '周回と共通保存、導出値は分離してください。');
  validatePosition(run.position, run, content);
  return true;
}
