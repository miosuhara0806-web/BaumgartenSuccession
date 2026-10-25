// Content assembly only. The three approved introductions must be supplied verbatim.
import { content as previous } from './hexerei.js';
import { anchoringManuscript as manuscript } from './anchoring-manuscript.js';
import { anchoringIntroductions } from './anchoring-introductions.js';

export function createAnchoringContent(introductions) {
  const ids = manuscript.trials.map(row => `anchoring.${row.key}`);
  if (!Array.isArray(introductions) || introductions.length !== 3 ||
      ids.some(id => introductions.filter(row => row.trialId === id && typeof row.text === 'string' && row.text.trim()).length !== 1)) {
    throw new Error('アンカリングの正式な導入小説3本が必要です。概要文を代用することはできません。');
  }
  const content = structuredClone(previous);
  content.contentVersion = 'alba-hexerei-anchoring-2026-10-24';
  content.subtitle = 'アルバ・ヘクセレイ・アンカリング章・正式原稿検収版';
  content.fixtureNotice = 'アルバ・ヘクセレイ・アンカリングの3試練ずつを正式原稿で反映した検収版です。序章・出発・アルバ帰還には仮内容が残り、他都市は準備中です。王位の判定は行いません。';
  Object.assign(content.textBlocks['text.intro.notice'], { text: content.fixtureNotice, textRevision: 5 });

  function block(id, text, extra = {}) {
    content.textBlocks[id] = {
      id, text: text.replaceAll('【主人公】', '{commander}'), textRevision: 1, speakerId: null, contentStatus: 'reviewed',
      informationIdsOnAcknowledge: [], ...extra,
    };
    return id;
  }
  Object.assign(content.regions.anchoring, {
    implemented: true, trialIds: ids, entrySceneId: 'anchoring.small1.introduction',
    closingSceneId: 'anchoring.closing', theoInvestigationId: 'investigation.anchoring',
  });
  content.scenes['anchoring.closing'] = {
    id: 'anchoring.closing', title: 'アンカリングの記録', blocks: [], conversationIds: [], contentStatus: 'reviewed',
  };

  for (const row of manuscript.trials) {
    const id = `anchoring.${row.key}`, introId = `${id}.introduction`, decisionId = `${id}.decision`;
    const major = row.key === 'major';
    content.scenes[introId] = {
      id: introId, title: row.title, presentation: 'novel', introductionLabel: '導入小説 · 正式原稿',
      contentStatus: 'reviewed', conversationIds: [],
      blocks: [block(`text.${introId}`, introductions.find(intro => intro.trialId === id).text)],
    };
    content.scenes[decisionId] = {
      id: decisionId, title: major ? '現王へ提出する政策案' : '判断を選ぶ',
      blocks: [], conversationIds: [], contentStatus: 'reviewed',
    };
    content.trials[id] = {
      id, regionId: 'anchoring', kind: major ? 'major' : 'small', ordinal: major ? 3 : row.key === 'small1' ? 1 : 2,
      title: row.title, contentStatus: 'reviewed', interaction: 'decision', maxPoints: major ? 10 : 5,
      entrySceneId: introId, introductionSceneId: introId, decisionSceneId: decisionId,
      choices: row.choices.map(choice => {
        const memo = row.commonMemos.find(item => item.letter === choice.letter);
        const infoId = `info.${id}.result.${choice.letter}`;
        content.information[infoId] = {
          id: infoId, title: memo.title, summary: memo.summary, regionId: 'anchoring', trialId: id,
          sourceKind: 'local', sourceActorId: null, sourceSceneId: decisionId, contentStatus: 'reviewed',
        };
        return {
          id: `choice.${id}.${choice.letter}`, label: `${choice.letter.toUpperCase()}：${choice.label}`,
          points: choice.points, contentStatus: 'reviewed', evaluationReason: choice.evaluationReason,
          feedbackBlockIds: [block(`text.choice.${id}.${choice.letter}.feedback`, choice.reaction, { informationIdsOnAcknowledge: [infoId] })],
          governanceTags: major ? [...manuscript.governanceTags[choice.letter]] : [],
          ...(major ? { policyId: `policy.anchoring.${choice.letter}` } : {}),
        };
      }),
    };
    for (const dialogue of row.conversations) {
      const actorId = `char.${dialogue.actor}`, conversationId = `conversation.${id}.${dialogue.actor}`;
      const infoId = `info.${id}.${dialogue.actor}`;
      const memo = row.companionMemos.find(item => item.actor === dialogue.actor);
      content.information[infoId] = {
        id: infoId, title: memo.title, summary: memo.summary, regionId: 'anchoring', trialId: id,
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
  content.information['info.anchoring.theo'] = {
    id: 'info.anchoring.theo', title: manuscript.theo.title, summary: manuscript.theo.summary,
    regionId: 'anchoring', trialId: 'anchoring.major', sourceKind: 'theo', sourceActorId: 'support.theo',
    sourceSceneId: 'anchoring.major.decision', contentStatus: 'reviewed',
  };
  content.investigations['investigation.anchoring'] = {
    id: 'investigation.anchoring', regionId: 'anchoring', contentStatus: 'reviewed', informationId: 'info.anchoring.theo',
    reportBlockIds: [block('text.anchoring.theo.report', manuscript.theo.report, { speakerId: 'support.theo' })],
  };
  return content;
}

export const content = createAnchoringContent(anchoringIntroductions);
