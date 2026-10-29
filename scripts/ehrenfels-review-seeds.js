// Offline acceptance checkpoints only. Build through the same public transitions
// as a normal run; never fabricate completion flags or alter the capital gate.
import { content } from '../src/content/ehrenfels.js';
import { createRun, transition, getCurrentText, getTotalScore, validateRun } from '../src/engine.js';

export function createReviewSeeds() {
  const seeds = {};
  const routes = { alba: 'acb', hexerei: 'aab', anchoring: 'bab', rude: 'acb' };
  for (const [key, commanderId, party] of [
    ['a', 'commander.alphonse', ['heidemarie', 'frederica', 'harold', 'lisette']],
    ['b', 'commander.rosemond', ['heidemarie', 'harold', 'madian', 'lisette']],
  ]) {
    let run = createRun(content, { runId: `review-seed-${key}`, now: '2026-10-29T00:00:00.000Z' });
    const act = (type, args = {}) => { run = transition(run, { type, ...args }, content); };
    const read = () => { while (getCurrentText(run, content)) act('ACK_TEXT'); };
    read(); act('SELECT_COMMANDER', { commanderId });
    for (const actor of party) act('TOGGLE_PARTY', { characterId: `char.${actor}` });
    act('CONFIRM_PARTY'); act('DEPART'); read();
    for (const [regionId, letters] of Object.entries(routes)) {
      act('START_REGION', { regionId }); read();
      for (const letter of letters) {
        const trialId = run.position.trialId;
        act('RESOLVE_TRIAL', { trialId, choiceId: `choice.${trialId}.${letter}` }); read();
        act('CONTINUE_TRIAL'); read();
      }
    }
    validateRun(run, content);
    if (run.position.phase !== 'map' || getTotalScore(run) !== 80 || Object.keys(run.theoInvestigations).length) throw new Error('Invalid review checkpoint');
    seeds[key] = run;
  }
  return seeds;
}
