// Extend the approved Alba pack. Old runs keep their original immutable catalog entry.
import { content as alba } from './alba-final.js';
import { hexereiManuscript as manuscript } from './hexerei-manuscript.js';

export const content = structuredClone(alba);
content.contentVersion = 'alba-hexerei-2026-10-22';
content.mode = 'regionalPreview';
content.subtitle = 'アルバ・ヘクセレイ章・正式原稿検収版';
content.fixtureNotice = 'アルバとヘクセレイの3試練ずつを正式原稿で実装した検収版です。序章・出発・アルバ帰還には仮内容が残り、他都市は準備中です。王位の判定は行いません。';
Object.assign(content.textBlocks['text.intro.notice'], { text: content.fixtureNotice, textRevision: 4 });

function block(id, body, extra = {}) {
  content.textBlocks[id] = {
    id, text: body.replaceAll('【主人公】', '{commander}'), textRevision: 1,
    speakerId: null, contentStatus: 'reviewed', informationIdsOnAcknowledge: [], ...extra,
  };
  return id;
}

Object.assign(content.regions.hexerei, {
  implemented: true,
  trialIds: manuscript.trials.map(row => `hexerei.${row.key}`),
  entrySceneId: 'hexerei.small1.introduction',
  closingSceneId: 'hexerei.closing', theoInvestigationId: 'investigation.hexerei',
});
// No new return narrative: the existing chapter-completion mechanism returns to the map.
content.scenes['hexerei.closing'] = {
  id: 'hexerei.closing', title: 'ヘクセレイの記録', blocks: [], conversationIds: [], contentStatus: 'reviewed',
};

for (const row of manuscript.trials) {
  const id = `hexerei.${row.key}`;
  const introductionId = `${id}.introduction`;
  const decisionId = `${id}.decision`;
  const major = row.key === 'major';
  const title = `${major ? '大試練' : row.key === 'small1' ? '小試練①' : '小試練②'}「${row.title}」`;
  const memoIds = row.commonMemos.map((memo, index) => {
    const infoId = `info.${id}.common.${index + 1}`;
    content.information[infoId] = {
      id: infoId, ...memo, regionId: 'hexerei', trialId: id, sourceKind: 'local',
      sourceActorId: null, sourceSceneId: introductionId, contentStatus: 'reviewed',
    };
    return infoId;
  });
  content.scenes[introductionId] = {
    id: introductionId, title, presentation: 'novel', introductionLabel: '導入小説 · 正式原稿',
    contentStatus: 'reviewed', conversationIds: [],
    blocks: [block(`text.${introductionId}`, row.introduction, { informationIdsOnAcknowledge: memoIds })],
  };
  content.scenes[decisionId] = {
    id: decisionId, title: major ? '現王へ提出する政策案' : '判断を選ぶ',
    blocks: [], conversationIds: [], contentStatus: 'reviewed',
  };
  content.trials[id] = {
    id, regionId: 'hexerei', kind: major ? 'major' : 'small', ordinal: major ? 3 : row.key === 'small1' ? 1 : 2,
    title, contentStatus: 'reviewed', interaction: 'decision', maxPoints: major ? 10 : 5,
    entrySceneId: introductionId, introductionSceneId: introductionId, decisionSceneId: decisionId,
    ...(row.key === 'small2' ? { decisionHeading: '事故現場への指示' } : {}),
    choices: row.choices.map(choice => ({
      id: `choice.${id}.${choice.letter}`, label: `${choice.letter.toUpperCase()}：${choice.label}`,
      points: choice.points, contentStatus: 'reviewed', evaluationReason: choice.evaluationReason,
      feedbackBlockIds: [block(`text.choice.${id}.${choice.letter}.feedback`, choice.reaction)],
      governanceTags: major ? [...manuscript.governanceTags[choice.letter]] : [],
      ...(major ? { policyId: `policy.hexerei.${choice.letter}` } : {}),
    })),
  };
  for (const dialogue of row.conversations) {
    const actorId = `char.${dialogue.actor}`;
    const conversationId = `conversation.${id}.${dialogue.actor}`;
    const infoId = `info.${id}.${dialogue.actor}`;
    const memo = row.companionMemos.find(item => item.actor === dialogue.actor);
    content.information[infoId] = {
      id: infoId, title: memo.title, summary: memo.summary, regionId: 'hexerei', trialId: id,
      sourceKind: 'companion', sourceActorId: actorId, sourceSceneId: decisionId, contentStatus: 'reviewed',
    };
    content.conversations[conversationId] = {
      id: conversationId, kind: 'trialOpinion', participantIds: [actorId], sceneIds: [decisionId],
      condition: { partyHas: actorId }, informationIdsOnComplete: [infoId], contentStatus: 'reviewed',
      blockIds: dialogue.lines.map((line, index) => block(`text.${id}.${dialogue.actor}.${index + 1}`, line, { speakerId: actorId })),
    };
    content.scenes[decisionId].conversationIds.push(conversationId);
  }
}

content.information['info.hexerei.theo'] = {
  id: 'info.hexerei.theo', title: manuscript.theo.title, summary: manuscript.theo.summary,
  sourceLabel: manuscript.theo.sourceLabel, regionId: 'hexerei', trialId: 'hexerei.major',
  sourceKind: 'theo', sourceActorId: 'support.theo', sourceSceneId: 'hexerei.major.decision', contentStatus: 'reviewed',
};
content.investigations['investigation.hexerei'] = {
  id: 'investigation.hexerei', regionId: 'hexerei', contentStatus: 'reviewed',
  informationId: 'info.hexerei.theo',
  reportBlockIds: [block('text.hexerei.theo.report', manuscript.theo.report, { speakerId: 'support.theo' })],
};
