// Add only the supplied final Alba manuscript. Earlier packs remain immutable.
import { content as previous } from './alba.js';
import { finalManuscript } from './alba-final-manuscript.js';

export const content = structuredClone(previous);
content.contentVersion = 'alba-final-2026-10-18';
content.subtitle = 'アルバ3試練・正式原稿検収版';
// The prologue/departure/closing and other cities remain outside this delivery.
content.fixtureNotice = 'アルバ3試練の本文・評価理由・配点、同行者会話・情報メモ、テオの調査を正式原稿で反映した検収版です。導入小説と同行者会話の表示は維持。序章・出発・帰還には仮内容が残り、他都市は準備中です。';
content.informationSourceLabels = { companion:'同行者の見解', theo:'テオの調査' };
Object.assign(content.textBlocks['text.intro.notice'], {
  text:content.fixtureNotice, textRevision:3,
});

for (const row of finalManuscript.reactions) {
  const trial = content.trials[row.trialId];
  const choice = trial.choices.find(c=>c.id===`choice.${row.trialId}.${row.letter}`);
  if (!choice || choice.points!==row.points) throw new Error('正式原稿と既存選択肢の配点が一致しません。');
  const id = `text.choice.${row.trialId}.${row.letter}.feedback.final`;
  content.textBlocks[id] = {
    id, speakerId:null, text:row.reaction, textRevision:1,
    contentStatus:'reviewed', informationIdsOnAcknowledge:[],
  };
  choice.feedbackBlockIds = [id];
  choice.evaluationReason = row.evaluationReason;
  delete choice.feedbackPending;
  if (trial.kind==='major') choice.governanceTags = [...finalManuscript.governanceTags[row.letter]];
  trial.contentStatus = 'reviewed';
}

for (const memo of finalManuscript.companionMemos) {
  const actor = memo.actorId.slice('char.'.length);
  const conversation = content.conversations[`conversation.${memo.trialId}.${actor}`];
  const id = `info.${memo.trialId}.${actor}`;
  content.information[id] = {
    id, title:memo.title, summary:memo.summary,
    regionId:'alba', trialId:memo.trialId, sourceKind:'companion',
    sourceActorId:memo.actorId, sourceSceneId:conversation.sceneIds[0], contentStatus:'reviewed',
  };
  conversation.informationIdsOnComplete = [id];
}

// Preserve the existing atomic investigation and memo acquisition mechanism.
Object.assign(content.textBlocks['text.alba.theo.report'], {
  text:finalManuscript.theo.report, textRevision:2, contentStatus:'reviewed',
});
Object.assign(content.information['info.alba.theo'], {
  title:finalManuscript.theo.title, summary:finalManuscript.theo.summary,
  sourceLabel:finalManuscript.theo.sourceLabel, contentStatus:'reviewed',
});
content.investigations['investigation.alba'].contentStatus = 'reviewed';
