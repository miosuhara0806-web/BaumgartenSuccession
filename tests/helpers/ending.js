import {content} from '../../src/content/ending.js';
import * as engine from '../../src/engine.js';
import {createHelpers} from './prologue.js';
const h=createHelpers(content);
export const cities=['alba','hexerei','anchoring','rude','ehrenfels'];
export function scorePath(target) {
  let paths=new Map([[0,[]]]);
  for(const city of cities)for(const trialId of content.regions[city].trialIds) {
    const next=new Map();
    for(const [score,path]of paths)for(const choice of content.trials[trialId].choices.filter(c=>!c.condition)) {
      if(!next.has(score+choice.points))next.set(score+choice.points,[...path,choice.id]);
    }
    paths=next;
  }
  if(!paths.has(target))throw new Error(`No legal ABC route for score ${target}`);
  return paths.get(target);
}
export function endingRun(score,commanderId='commander.alphonse') {
  const path=scorePath(score);let index=0,r=h.start(undefined,commanderId);
  for(const city of cities) {
    r=h.read(h.act(r,'START_REGION',{regionId:city}));
    for(let i=0;i<3;i++) {
      r=h.read(h.act(r,'RESOLVE_TRIAL',{trialId:r.position.trialId,choiceId:path[index++]}));
      r=h.act(r,'CONTINUE_TRIAL');
      r=h.read(r,content,s=>s.position.phase==='ending');
    }
  }
  engine.validateRun(r,content);return r;
}
