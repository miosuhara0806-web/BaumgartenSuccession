// New edition only. All accepted prologue/trial data and historical packs remain registered.
import {content as previous} from './prologue.js';
import {endingManuscript as script} from './ending-manuscript.js';

export const ENDING_RULES = 'succession-2026-11-01';
export function createEndingContent() {
  const content=structuredClone(previous);
  content.contentVersion='baumgarten-complete-ending-2026-11-01';
  content.subtitle='バウムガルテン王国の継承戦';
  content.fixtureNotice='5都市の旅から、王国の新たな時代へ。';
  content.contentStatus='reviewed';
  content.finalChapterCompletion='ending';
  content.officialEnding={rulesVersion:ENDING_RULES,governanceKeys:Object.keys(script.governance)};
  content.speakers['support.ensemble']={name:'一同'};
  content.scenes['prologue.reunion-comic.parties'].nextLabel='再会の場面へ →';
  const conditional=(rows,condition)=>rows.map(row=>({...row,condition}));
  const commanderRows=rows=>rows.flatMap(row=>{
    if(row.speakerId!=='commander')return [{...row,text:row.text.replaceAll('主人公','{commander}')}];
    return ['commander.alphonse','commander.rosemond'].map(id=>({...row,speakerId:id,condition:{commanderIs:id},
      text:id.endsWith('rosemond')&&row.text==='「……終わったのか」'?'「……終わったのですね」':row.text}));
  });
  const scenes=[];
  function scene(key,title,chunks) {
    const id=`ending.${key}`,blocks=[];
    chunks.forEach((rows,chunk)=>rows.forEach((row,index)=>{
      const blockId=`text.${id}.${blocks.length+1}`;
      content.textBlocks[blockId]={id:blockId,textRevision:1,contentStatus:'reviewed',informationIdsOnAcknowledge:[],
        ...row,text:row.text.replaceAll('主人公','{commander}'),pageGroup:`${id}.${chunk}.${Math.floor(index/3)}`};
      blocks.push(blockId);
    }));
    content.scenes[id]={id,title,blocks,allowManualSave:true};scenes.push(id);return id;
  }
  content.endingSceneId=scene('return','王城への帰還',[commanderRows(script.return)]);
  scene('reunion','双子の再会',[script.reunionIntro,
    conditional(script.reunionAlphonse,{commanderIs:'commander.alphonse'}),
    conditional(script.reunionRosemond,{commanderIs:'commander.rosemond'}),script.reunionCommon]);
  scene('assessment','最終評定',[script.assessment]);
  scene('governance','旅を振り返って',Object.entries(script.governance).map(([key,rows])=>conditional(rows,{governanceIs:key})));
  scene('rank','総合評定',Object.entries(script.ranks).map(([key,rows])=>conditional(rows,{endingRankIs:key})));
  scene('verdict','次代の王',[script.verdictIntro,...Object.entries(script.verdicts).map(([key,rows])=>{
    const [name,outcome]=key.split('-');return conditional(rows,{all:[{commanderIs:`commander.${name}`},{sovereigntyIs:outcome}]});
  })]);
  scene('end-war','継承戦の終わり',[script.endWar]);
  scene('coronation-intro','数週間後の戴冠式',[script.coronationIntro]);
  scene('coronation','戴冠式',Object.entries(script.coronations).map(([name,rows])=>conditional(rows,{sovereignIs:`commander.${name}`})));
  const cgId=scene('coronation-cg','新たな王',[script.coronationAfter.slice(0,1)]);
  content.textBlocks[content.scenes[cgId].blocks[0]].readBySovereign=true;
  const asset=name=>({src:`./src/assets/戴冠式${name}.png`,width:1130,height:753,alt:`${name}の戴冠式。`});
  content.scenes[cgId].eventCgBySovereign={'commander.alphonse':asset('アルフォンス'),'commander.rosemond':asset('ローズモンド')};
  scene('coronation-after','戴冠式のあと',[script.coronationAfter.slice(1)]);
  scene('ensemble','八人の談話',[script.ensemble]);
  scene('farewell','物語の、その先へ',[script.farewell]);
  for(let i=0;i<scenes.length-1;i++)content.scenes[scenes[i]].nextSceneId=scenes[i+1];
  content.officialEnding.lastSceneId=scenes.at(-1);
  // Author-approved copy fixes, 2026-11-02: preserve saved positions and old logs.
  for(const [id,text]of [
    ['text.ending.return.1','エーレンフェルスで最後の判断を終え、一行は王城へ戻った。'],
    ['text.ending.ensemble.12','「同じじゃない？」'],
    ['text.ending.ensemble.22','「変えたくない人もいる」'],
  ]) {
    if(content.textBlocks[id]?.text!==text)throw new Error(`Approved ending copy no longer matches ${id}`);
    content.textBlocks[id].textRevision=2;
  }
  return content;
}
export const content=createEndingContent();
