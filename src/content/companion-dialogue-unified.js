// New runs only. Preserve every historical edition and every existing speech block.
import { content as previous } from './ehrenfels.js';
import { companionDialogueManuscript as manuscript } from './companion-dialogue-manuscript.js';

export function createCompanionDialogueUnifiedContent() {
  const content = structuredClone(previous);
  content.contentVersion = 'alba-hexerei-anchoring-rude-ehrenfels-dialogue-unified-2026-10-30';
  for (const row of manuscript) {
    const conversation = content.conversations[row.id];
    const speechIds = [...conversation.blockIds];
    let speechIndex = 0, narrationIndex = 0;
    conversation.title = row.title;
    conversation.presentation = 'manuscript';
    conversation.blockIds = row.lines.map(text => {
      if (text.startsWith('「') && text.endsWith('」')) {
        const id = speechIds[speechIndex++];
        if (content.textBlocks[id]?.text !== text) throw new Error(`Existing speech differs: ${row.id}`);
        return id;
      }
      const id = `text.dialogue-unified.${row.id.slice('conversation.'.length)}.narration.${++narrationIndex}`;
      content.textBlocks[id] = {
        id, text, textRevision: 1, speakerId: null, contentStatus: 'reviewed', informationIdsOnAcknowledge: [],
      };
      return id;
    });
    if (speechIndex !== speechIds.length) throw new Error(`Missing existing speech: ${row.id}`);
  }
  return content;
}

export const content = createCompanionDialogueUnifiedContent();
