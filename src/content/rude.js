// Extend the approved three-city pack without changing any earlier edition.
import { content as previous } from './anchoring.js';
import { rudeManuscript as manuscript } from './rude-manuscript.js';

export function createRudeContent() {
  const ids = manuscript.trials.map(row => `rude.${row.key}`);
  const content = structuredClone(previous);
  content.contentVersion = 'alba-hexerei-anchoring-rude-2026-10-28';
  content.subtitle = 'アルバ・ヘクセレイ・アンカリング・ルード章・正式原稿検収版';
  content.fixtureNotice = 'アルバ・ヘクセレイ・アンカリング・ルードの各3試練を正式原稿で反映した検収版です。序章・出発・アルバ帰還には仮内容が残り、エーレンフェルスは準備中です。王位の判定は行いません。';
  Object.assign(content.textBlocks['text.intro.notice'], { text: content.fixtureNotice, textRevision: 6 });

  function block(id, text, extra = {}) {
    content.textBlocks[id] = {
      id, text: text.replaceAll('【主人公】', '{commander}'), textRevision: 1, speakerId: null, contentStatus: 'reviewed',
      informationIdsOnAcknowledge: [], ...extra,
    };
    return id;
  }
  Object.assign(content.regions.rude, {
    implemented: true, trialIds: ids, entrySceneId: 'rude.small1.introduction',
    closingSceneId: 'rude.closing', theoInvestigationId: 'investigation.rude',
  });
  content.scenes['rude.closing'] = {
    id: 'rude.closing', title: 'ルードの記録', blocks: [], conversationIds: [], contentStatus: 'reviewed',
  };

  for (const row of manuscript.trials) {
    const id = `rude.${row.key}`, introId = `${id}.introduction`, decisionId = `${id}.decision`;
    const major = row.key === 'major';
    content.scenes[introId] = {
      id: introId, title: row.title, presentation: 'novel', introductionLabel: '導入小説 · 正式原稿',
      contentStatus: 'reviewed', conversationIds: [],
      blocks: [block(`text.${introId}`, row.introduction)],
    };
    content.scenes[decisionId] = {
      id: decisionId, title: major ? '現王へ提出する政策案' : '判断を選ぶ',
      blocks: [], conversationIds: [], contentStatus: 'reviewed',
    };
    content.trials[id] = {
      id, regionId: 'rude', kind: major ? 'major' : 'small', ordinal: major ? 3 : row.key === 'small1' ? 1 : 2,
      title: row.title, contentStatus: 'reviewed', interaction: 'decision', maxPoints: major ? 10 : 5,
      entrySceneId: introId, introductionSceneId: introId, decisionSceneId: decisionId,
      choices: row.choices.map(choice => {
        const memo = row.commonMemos.find(item => item.letter === choice.letter);
        const infoId = `info.${id}.result.${choice.letter}`;
        content.information[infoId] = {
          id: infoId, title: memo.title, summary: memo.summary, regionId: 'rude', trialId: id,
          sourceKind: 'local', sourceActorId: null, sourceSceneId: decisionId, contentStatus: 'reviewed',
        };
        return {
          id: `choice.${id}.${choice.letter}`, label: `${choice.letter.toUpperCase()}：${choice.label}`,
          description: choice.description, points: choice.points, contentStatus: 'reviewed', evaluationReason: choice.evaluationReason,
          feedbackBlockIds: [block(`text.choice.${id}.${choice.letter}.feedback`, choice.reaction, { informationIdsOnAcknowledge: [infoId] })],
          governanceTags: major ? [...manuscript.governanceTags[choice.letter]] : [],
          ...(major ? { policyId: `policy.rude.${choice.letter}` } : {}),
        };
      }),
    };
    for (const dialogue of row.conversations) {
      const actorId = `char.${dialogue.actor}`, conversationId = `conversation.${id}.${dialogue.actor}`;
      const infoId = `info.${id}.${dialogue.actor}`;
      const memo = row.companionMemos.find(item => item.actor === dialogue.actor);
      content.information[infoId] = {
        id: infoId, title: memo.title, summary: memo.summary, regionId: 'rude', trialId: id,
        sourceKind: 'companion', sourceActorId: actorId, sourceSceneId: decisionId, contentStatus: 'reviewed',
      };
      content.conversations[conversationId] = {
        id: conversationId, kind: 'trialOpinion', presentation: 'manuscript', title: dialogue.title, participantIds: [actorId], sceneIds: [decisionId],
        condition: { partyHas: actorId }, informationIdsOnComplete: [infoId], contentStatus: 'reviewed',
        blockIds: dialogue.lines.map((line, index) => block(`text.${id}.${dialogue.actor}.${index + 1}`, line, { speakerId: line.startsWith('「') && line.endsWith('」') ? actorId : null })),
      };
      content.scenes[decisionId].conversationIds.push(conversationId);
    }
  }
  content.information['info.rude.theo'] = {
    id: 'info.rude.theo', title: manuscript.theo.title, summary: manuscript.theo.summary,
    regionId: 'rude', trialId: 'rude.major', sourceKind: 'theo', sourceActorId: 'support.theo',
    sourceSceneId: 'rude.major.decision', contentStatus: 'reviewed',
  };
  content.investigations['investigation.rude'] = {
    id: 'investigation.rude', regionId: 'rude', title: manuscript.theo.reportTitle, contentStatus: 'reviewed', informationId: 'info.rude.theo',
    reportBlockIds: [block('text.rude.theo.report', manuscript.theo.report, { speakerId: 'support.theo' })],
  };
  return content;
}

export const content = createRudeContent();
