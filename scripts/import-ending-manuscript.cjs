// Deterministic authoring step; the browser uses the generated static module.
const {readFileSync,writeFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const source=readFileSync('docs/Baumgarten_ending_script_v2.txt','utf8');
const packs=[...source.matchAll(/```text\n([\s\S]*?)```/g)].map(m=>m[1].trim().split(/\n\s*\n/));
if(packs.length!==4)throw new Error('Expected four official manuscript sections');
const actors={'主人公':'commander','現王':'support.king','宰相':'support.chancellor','監督官':'support.overseer',
  'アルフォンス':'commander.alphonse','ローズモンド':'commander.rosemond','ハロルド':'char.harold',
  'フレデリカ':'char.frederica','マディアン':'char.madian','オリヴェル':'char.olivel','リゼット':'char.lisette',
  'ヴァンタルト':'char.vantalt','サンドロ':'char.sandro','ハイデマリー':'char.heidemarie','一同':'support.ensemble'};
function segment(pack,start,end){const a=pack.indexOf(start),b=end?pack.indexOf(end,a+1):pack.length;
  if(a<0||b<0)throw new Error(`Missing manuscript boundary: ${start}/${end}`);return pack.slice(a+1,b);}
function rows(parts){return parts.filter(p=>!p.startsWith('※')&&!Object.hasOwn(actors,p)).map(p=>{
  const m=p.match(/^([^\n]+)\n(「[\s\S]*」)$/);
  if(m&&!actors[m[1]])throw new Error(`Unknown speaker: ${m[1]}`);
  if(p.startsWith('【'))throw new Error('Unexpected stage direction');
  return {speakerId:m?actors[m[1]]:null,text:m?m[2]:p};
});}
const [a,b,c]=packs;
const governanceLabels=['民意が単独最多','安定が単独最多','改革が単独最多','公正が単独最多','調整が単独最多',
  '民意＋安定','民意＋改革','民意＋公正','民意＋調整','安定＋改革','安定＋公正','安定＋調整','改革＋公正','改革＋調整','公正＋調整','3種類以上が同率最多'];
const tagNames={'民意':'people','安定':'stability','改革':'reform','公正':'fairness','調整':'coordination'};
const governance={};
for(let i=0;i<governanceLabels.length;i++){
  const label=governanceLabels[i];const key=i===15?'balanced':label.replace('が単独最多','').split('＋').map(t=>tagNames[t]).sort().join('+');
  governance[key]=rows(segment(a,label,governanceLabels[i+1]||'総合評定'));
}
const declarations=['アルフォンス主人公／継承点80以上','ローズモンド主人公／継承点80以上','アルフォンス主人公／継承点79以下','ローズモンド主人公／継承点79以下'];
const verdicts={};for(let i=0;i<4;i++)verdicts[['alphonse-win','rosemond-win','alphonse-other','rosemond-other'][i]]=rows(segment(a,declarations[i],declarations[i+1]||'継承戦の終わり'));
const commonStart=a.indexOf('互いがどこで何を見て、何を選んだのか。');
const endReunion=a.indexOf('最終評定');
const result={
  return:rows(segment(a,'王都帰還','双子の再会')),
  reunionIntro:rows(segment(a,'双子の再会','アルフォンス主人公の場合')),
  reunionAlphonse:rows(segment(a,'アルフォンス主人公の場合','ローズモンド主人公の場合')),
  reunionRosemond:rows(a.slice(a.indexOf('ローズモンド主人公の場合')+1,commonStart)),
  reunionCommon:rows(a.slice(commonStart,endReunion)),
  assessment:rows(segment(a,'最終評定','統治傾向の評定')),governance,
  ranks:{high:rows(segment(a,'継承点90〜100','継承点80〜89')),normal:rows(segment(a,'継承点80〜89','継承点79以下')),other:rows(segment(a,'継承点79以下','王位宣言'))},
  verdictIntro:rows(segment(a,'王位宣言',declarations[0])),verdicts,
  endWar:rows(segment(a,'継承戦の終わり')),
  coronationIntro:rows(segment(b,'戴冠式','アルフォンスが即位する場合')),
  coronations:{alphonse:rows(segment(b,'アルフォンスが即位する場合','【イベントCG：アルフォンス戴冠式】')),
    rosemond:rows(segment(b,'ローズモンドが即位する場合','【イベントCG：ローズモンド戴冠式】'))},
  coronationAfter:rows(segment(b,'戴冠式のあと')),
  ensemble:rows(segment(c,'八人の談話')).slice(0,-1),farewell:rows(segment(c,'八人の談話')).slice(-1),
};
const digest=createHash('sha256').update(source).digest('hex');
writeFileSync('src/content/ending-manuscript.js',`// Generated from docs/Baumgarten_ending_script_v2.txt; do not edit by hand.\nexport const manuscriptSha256 = '${digest}';\nexport const endingManuscript = ${JSON.stringify(result,null,2)};\n`);
console.log('Official ending manuscript imported; 16 governance variants.');
