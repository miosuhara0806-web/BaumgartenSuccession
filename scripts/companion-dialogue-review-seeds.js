// Offline review only: reach each city through normal engine transitions.
import { content } from '../src/content/companion-dialogue-unified.js';
import { createRun, transition, getCurrentText, validateRun } from '../src/engine.js';

export const reviewParties = {
  alba: ['harold', 'lisette', 'frederica', 'sandro'],
  hexerei: ['frederica', 'vantalt', 'sandro', 'heidemarie'],
  anchoring: ['olivel', 'madian', 'sandro', 'vantalt'],
};
export function createReviewSeeds() {
  return Object.fromEntries(Object.entries(reviewParties).map(([regionId, party], i) => {
    let run = createRun(content, { runId: `dialogue-review-${regionId}`, now: '2026-10-30T00:00:00.000Z' });
    const act = (type, args = {}) => { run = transition(run, { type, ...args }, content); };
    const read = () => { while (getCurrentText(run, content)) act('ACK_TEXT'); };
    read(); act('SELECT_COMMANDER', { commanderId: i === 1 ? 'commander.rosemond' : 'commander.alphonse' });
    for (const actor of party) act('TOGGLE_PARTY', { characterId: `char.${actor}` });
    act('CONFIRM_PARTY'); act('DEPART'); read(); act('START_REGION', { regionId }); read();
    validateRun(run, content);
    return [regionId, run];
  }));
}
