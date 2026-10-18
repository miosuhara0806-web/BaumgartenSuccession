import { content as fixture } from './fixture.js';
import { albaIntroductions } from './alba-introductions.js';

// Preserve the 2026-10-16 content version, IDs, fragments and read keys.
export const content = structuredClone(fixture);
for (const introduction of albaIntroductions) {
  const trial = content.trials[introduction.trialId];
  const id = `${trial.id}.introduction.review`;
  trial.introductionSceneId = id;
  content.scenes[id] = {
    id, title: introduction.title, contentStatus: 'reviewPending', conversationIds: [],
    nextSceneId: trial.entrySceneId,
    blocks: introduction.fragments.map((body, index) => {
      const textId = `text.${id}.${index + 1}`;
      content.textBlocks[textId] = { id: textId, textRevision: 1, speakerId: null, text: body,
        contentStatus: 'reviewPending', informationIdsOnAcknowledge: [] };
      return textId;
    }),
  };
}
