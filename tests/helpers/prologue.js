import { content } from '../../src/content/prologue.js';
import * as engine from '../../src/engine.js';
export const act = (r, type, args = {}, pack = content) => engine.transition(r, { type, ...args }, pack);
export function read(r, pack = content, stop = () => false) {
  for (let i = 0; engine.getCurrentText(r, pack) && !stop(r); i++) {
    if (i > 250) throw new Error('Reading did not stop');
    r = act(r, 'ACK_TEXT', {}, pack);
  }
  return r;
}
export const defaultParty = ['char.harold', 'char.frederica', 'char.lisette', 'char.sandro'];
export function tutorial(commanderId = 'commander.alphonse') {
  return read(act(read(engine.createRun(content)), 'SELECT_COMMANDER', { commanderId }));
}
export function draft(commanderId = 'commander.alphonse') {
  let r = tutorial(commanderId);
  for (const locationId of Object.keys(content.prologue.tutorial.locations)) r = read(act(r, 'INSPECT_TUTORIAL_LOCATION', { locationId }));
  return read(act(r, 'DECIDE_TUTORIAL', { choiceId: 'b' }));
}
export function start(party = defaultParty, commanderId = 'commander.alphonse') {
  let r = draft(commanderId);
  for (const characterId of party) r = act(r, 'TOGGLE_PARTY', { characterId });
  return read(act(act(r, 'CONFIRM_PARTY'), 'DEPART'));
}
export function choose(r, letter = 'a', pack = content) {
  return act(r, 'RESOLVE_TRIAL', { trialId: r.position.trialId, choiceId: `choice.${r.position.trialId}.${letter}` }, pack);
}
export function finishCity(r, city, { stopBeforeClosing = false, pack = content } = {}) {
  r = read(act(r, 'START_REGION', { regionId: city }, pack), pack);
  for (let i = 0; i < 3; i++) {
    r = read(choose(r, 'a', pack), pack);
    r = act(r, 'CONTINUE_TRIAL', {}, pack);
    if (i < 2 || !stopBeforeClosing) r = read(r, pack);
  }
  return r;
}
export function permutations(list) {
  return list.length ? list.flatMap((v, i) => permutations(list.filter((_, j) => i !== j)).map(rest => [v, ...rest])) : [[]];
}
