// Add only the capital trials; keep each historical edition intact.
import { content as previous } from './rude.js';
import { ehrenfelsManuscript as manuscript } from './ehrenfels-manuscript.js';

export function createEhrenfelsContent() {
  const ids = manuscript.trials.map(row => `ehrenfels.${row.key}`);
  const content = structuredClone(previous);
  content.contentVersion = 'alba-hexerei-anchoring-rude-ehrenfels-2026-10-29';
  // The existing final-region gate requires full mode and all four normal cities.
  // This is a trials review edition, not the finished story or ending.
  content.mode = 'full';
  content.finalChapterCompletion = 'map';
  content.subtitle = 'エーレンフェルス3試練・正式原稿検収版';
  content.fixtureNotice = '通常4都市とエーレンフェルスの各3試練を反映した検収版です。正式序章・都市間イベント・正式終幕・同行者後日談・王国史への完成記録は未実装です。王位の判定は行いません。';
  content.completionNotice = 'エーレンフェルスの3試練が完了しました。正式な最終判断・継承結果・エンディング・同行者後日談・王国史への完成記録は未実装です。地図から各都市の記録を確認でき、セーブ・ロードも引き続き利用できます。';
  Object.assign(content.textBlocks['text.intro.notice'], { text: content.fixtureNotice, textRevision: 7 });

  function block(id, text, extra = {}) {
    content.textBlocks[id] = {
      id, text: text.replaceAll('【主人公】', '{commander}'), textRevision: 1, speakerId: null, contentStatus: 'reviewed',
      informationIdsOnAcknowledge: [], ...extra,
    };
    return id;
  }
  Object.assign(content.regions.ehrenfels, {
    implemented: true, trialIds: ids, entrySceneId: 'ehrenfels.small1.introduction',
    closingSceneId: 'ehrenfels.closing', theoInvestigationId: 'investigation.ehrenfels',
  });
  content.scenes['ehrenfels.closing'] = {
    id: 'ehrenfels.closing', title: 'エーレンフェルスの記録', blocks: [], conversationIds: [], contentStatus: 'reviewed',
  };

  for (const row of manuscript.trials) {
    const id = `ehrenfels.${row.key}`, introId = `${id}.introduction`, decisionId = `${id}.decision`;
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
      id, regionId: 'ehrenfels', kind: major ? 'major' : 'small', ordinal: major ? 3 : row.key === 'small1' ? 1 : 2,
      title: row.title, contentStatus: 'reviewed', interaction: 'decision', maxPoints: major ? 10 : 5,
      entrySceneId: introId, introductionSceneId: introId, decisionSceneId: decisionId,
      choices: row.choices.map(choice => {
        const memo = row.commonMemos.find(item => item.letter === choice.letter);
        const infoId = `info.${id}.result.${choice.letter}`;
        content.information[infoId] = {
          id: infoId, title: memo.title, summary: memo.summary, regionId: 'ehrenfels', trialId: id,
          sourceKind: 'local', sourceActorId: null, sourceSceneId: decisionId, contentStatus: 'reviewed',
        };
        return {
          id: `choice.${id}.${choice.letter}`, label: `${choice.letter.toUpperCase()}：${choice.label}`,
          description: choice.description, points: choice.points, contentStatus: 'reviewed', evaluationReason: choice.evaluationReason,
          feedbackBlockIds: [block(`text.choice.${id}.${choice.letter}.feedback`, choice.reaction, { informationIdsOnAcknowledge: [infoId] })],
          governanceTags: major ? [...manuscript.governanceTags[choice.letter]] : [],
          ...(major ? { policyId: `policy.ehrenfels.${choice.letter}` } : {}),
        };
      }),
    };
    for (const dialogue of row.conversations) {
      const actorId = `char.${dialogue.actor}`, conversationId = `conversation.${id}.${dialogue.actor}`;
      const infoId = `info.${id}.${dialogue.actor}`;
      const memo = row.companionMemos.find(item => item.actor === dialogue.actor);
      content.information[infoId] = {
        id: infoId, title: memo.title, summary: memo.summary, regionId: 'ehrenfels', trialId: id,
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
  content.information['info.ehrenfels.theo'] = {
    id: 'info.ehrenfels.theo', title: manuscript.theo.title, summary: manuscript.theo.summary,
    regionId: 'ehrenfels', trialId: 'ehrenfels.major', sourceKind: 'theo', sourceActorId: 'support.theo',
    sourceSceneId: 'ehrenfels.major.decision', contentStatus: 'reviewed',
  };
  content.investigations['investigation.ehrenfels'] = {
    id: 'investigation.ehrenfels', regionId: 'ehrenfels', title: manuscript.theo.reportTitle, contentStatus: 'reviewed', informationId: 'info.ehrenfels.theo',
    reportBlockIds: [block('text.ehrenfels.theo.report', manuscript.theo.report, { speakerId: 'support.theo' })],
  };
  return content;
}

export const content = createEhrenfelsContent();
