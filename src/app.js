import { content } from './content/fixture.js';
import { createRun, transition, getCurrentText, getAvailableConversations, getAvailableChoices,
  isLegalParty, getOpponentParty, getCrisisAssignments, getTotalScore, getTheoRemaining,
  canUseTheo, canManualSave, validateRun } from './engine.js';
import { createStorage } from './storage.js';

const app = document.querySelector('#app');
const roles = { melee:'近接', ranged:'遠隔', healer:'回復' };
const sourceLabels = { local:'現地の事実', commander:'指揮官の気づき', companion:'同行者の情報', theo:'テオの情報' };
const slotLabels = { auto:'オートセーブ', manual1:'手動セーブ 1', manual2:'手動セーブ 2', manual3:'手動セーブ 3' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const values = object => Object.values(object || {});
const sortedCharacters = () => values(content.characters).sort((a,b) => a.displayOrder-b.displayOrder);
const nameOf = id => content.characters[id]?.name || content.commanders[id]?.name || ({'support.theo':'テオ','support.chancellor':'宰相'}[id]) || '記録';
const regionName = id => content.regions[id]?.name || '王都出発前';
const character = id => content.characters[id];
const storage = createStorage({ validateRun:run => validateRun(run, content) });
let run = null;
let reader = { schemaVersion:1, readTextKeys:[] };
let slots = { auto:null, manual1:null, manual2:null, manual3:null };
let revision;
let slotsRevision;
let title = true;
let ready = false;
let busy = false;
let error = '';
let pending = null;
let modal = null;
let toast = '';
let toastTimer;

function button(label, action, extra='', kind='') {
  return `<button type="button" class="button ${kind}" data-action="${action}" ${extra}>${label}</button>`;
}
function fixtureNote() {
  return '<div class="fixture-note"><strong>アルバまでの試作</strong>本文・選択肢・配点は機能確認用の仮データです。正式な物語・評価ではありません。</div>';
}
function portrait(person, cls='') {
  return `<div class="portrait ${cls}" aria-label="${esc(person.name)}の仮画像枠"><span aria-hidden="true">${esc(person.name.slice(0,1))}</span><small>肖像 準備中</small></div>`;
}
function member(person) {
  return `<div class="member"><span class="member-avatar" aria-hidden="true">${esc(person.name.slice(0,1))}</span><span>${esc(person.name)}</span></div>`;
}
function notify(message) {
  toast=message;
  document.querySelector('#status').textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(() => { toast=''; render(); },3500);
}
function positionLabel(state) {
  if (!state?.position) return '保存位置を確認できません';
  const p=state.position;
  const labels={ intro:'旅の導入',commanderSelection:'指揮官選択',draft:'同行者選抜',partyConfirmation:'両陣営確認',departure:'王都出発',map:'地図ホーム',chapterClosing:'地域の帰還会話',conversation:'同行者との会話',theoReport:'テオの調査報告',trialResult:'判断結果',storyEvent:'物語イベント' };
  if (p.phase==='trial') return `${regionName(p.regionId)} / ${content.trials[p.trialId]?.title || '試練'}`;
  return labels[p.phase] || p.phase;
}
function header() {
  return `<header class="app-header"><button class="brand" data-action="title"><span class="seal" aria-hidden="true">樹</span><span>バウムガルテン王国の継承戦</span></button><div class="header-tools"><span class="save-light">${busy?'保存中…':pending?'未保存':run?'自動保存済み':'ALBA / PROTOTYPE'}</span><button class="text-button" data-action="saves" ${!ready?'disabled':''}>${title?'ロード':'セーブ / ロード'}</button></div></header>`;
}
function treeArt() {
  return `<svg viewBox="0 0 500 500" fill="none" aria-hidden="true"><circle cx="250" cy="233" r="155" stroke="#c1ac73" stroke-width=".8"/><circle cx="250" cy="233" r="168" stroke="#c1ac73" stroke-width=".6" stroke-dasharray="2 12"/><path d="M250 372V160M250 270l-69-50-31-67M250 230l69-64 24-48M250 310l92-60 39-57M250 198l-32-51-1-52M250 289l-93 1-48-31M250 335l-40 37m40-37 40 37" stroke="#c1ac73" stroke-width="2"/><g stroke="#c1ac73"><ellipse cx="153" cy="153" rx="26" ry="46" transform="rotate(-30 153 153)"/><ellipse cx="217" cy="106" rx="26" ry="43" transform="rotate(-6 217 106)"/><ellipse cx="334" cy="133" rx="26" ry="46" transform="rotate(36 334 133)"/><ellipse cx="377" cy="198" rx="24" ry="43" transform="rotate(47 377 198)"/><ellipse cx="123" cy="265" rx="24" ry="43" transform="rotate(-65 123 265)"/><ellipse cx="193" cy="216" rx="23" ry="38" transform="rotate(-40 193 216)"/><ellipse cx="302" cy="260" rx="23" ry="38" transform="rotate(50 302 260)"/></g><path d="M170 375h160M198 389h104M223 403h54" stroke="#c1ac73"/><path d="m250 36 5 9-5 9-5-9zm0 397 5 9-5 9-5-9z" fill="#c1ac73"/></svg>`;
}
function titlePage() {
  return `<main class="title-page"><div class="title-copy"><p class="eyebrow">王国史の、一頁へ。</p><h1>バウムガルテン王国の<br>継承戦</h1><p class="lead">誰を連れているかで、<br>同じ国でも、見えるものが変わる。</p><p class="small muted">ふたりの指揮官、八人の同行候補。<br>編成と情報、現場での判断から紡ぐストラテジーADV。</p><nav class="title-menu" aria-label="タイトルメニュー">${button('<span>はじめから</span><span>→</span>','new',!ready?'disabled':'','primary')}${button('<span>つづきから</span><span>オートセーブ</span>','continue',!slots.auto||!ready?'disabled':'')}${button('<span>ロード</span><span>保存した旅を開く</span>','saves',!ready?'disabled':'')}</nav>${fixtureNote()}<p class="small muted" style="margin-top:15px">操作の目安：名前のカードを開き、詳細から同行者を選びます。</p></div><div class="title-art"><div class="title-art-top">BAUMGARTEN · KINGDOM CHRONICLE</div>${treeArt()}<div class="title-art-label">第一の訪問地　アルバ</div></div></main>`;
}
function pageHeading(kicker, heading, body='', actions='') {
  return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${heading}</h1>${body?`<p class="muted small">${body}</p>`:''}</div>${actions?`<div class="button-row">${actions}</div>`:''}</div>`;
}
function stepStrip(active) {
  return `<div class="step-strip">${['指揮官を選ぶ','同行者を選ぶ','両陣営を確認'].map((x,i)=>`<span class="${i===active?'current':''}">${String(i+1).padStart(2,'0')}　${x}</span>`).join('')}</div>`;
}
function commanderPage() {
  return `<main class="page">${stepStrip(0)}${pageHeading('旅を導く者','指揮官を選ぶ','ふたりは同じ問題を異なる角度から見つめます。能力値や、同じ判断への得点の差はありません。')}<div class="commander-grid">${values(content.commanders).map(c=>`<article class="panel commander-card">${portrait(c,'commander')}<div><p class="eyebrow">${c.id.endsWith('alphonse')?'人の心に、目を向ける':'国の仕組みに、目を向ける'}</p><h2>${esc(c.name)}</h2><p class="small muted">17歳 / ${c.id.endsWith('alphonse')?'聖騎士':'姫騎士'}</p><p class="small">${esc(c.profile)}</p><p class="small muted">${esc(c.perspective || '')}</p>${button('この指揮官で進む','select-commander',`data-id="${c.id}"`,'primary')}</div></article>`).join('')}</div></main>`;
}
function roleCounts() {
  const counts={melee:0,ranged:0,healer:0};
  run.partyIds.forEach(id=>counts[character(id).role]++);
  return counts;
}
function draftPage() {
  const counts=roleCounts();
  return `<main class="page">${stepStrip(1)}${pageHeading('固定パーティの選抜','四人の同行者を選ぶ','カードをタップして人物を知り、詳細の「選ぶ」で編成します。枠が埋まったら、先に選んだ人物を外してください。')}<div class="draft-toolbar"><div class="role-counts">${Object.entries(roles).map(([id,label])=>`<span>${label}<b>${counts[id]} / ${id==='melee'?2:1}</b></span>`).join('')}</div>${button('両陣営を確認 →','confirm-party',!isLegalParty(run.partyIds,content)?'disabled':'')}</div><div class="card-grid">${sortedCharacters().map(c=>`<button type="button" class="character-card ${run.partyIds.includes(c.id)?'selected':''}" data-action="profile" data-id="${c.id}" aria-label="${esc(c.name)}のプロフィール${run.partyIds.includes(c.id)?'・選択済み':''}">${portrait(c)}<div class="character-card-info"><div><h3>${esc(c.name)}</h3><span class="role">${roles[c.role]} / ${c.age}歳</span></div>${run.partyIds.includes(c.id)?'<span class="selected-mark">同行</span>':''}</div></button>`).join('')}</div><p class="small muted" style="margin-top:22px">選ばれなかった四人は、もう一方の指揮官と旅立ちます。出発後は同行者を変更できません。</p></main>`;
}
function campPage() {
  const rival=values(content.commanders).find(c=>c.id!==run.commanderId);
  const camp=(label,leader,members)=>`<section class="panel"><p class="eyebrow">${label}</p><h2>${esc(leader.name)}</h2>${members.map(c=>`<div class="member-row">${member(c)}<span class="small muted">${roles[c.role]}</span></div>`).join('')}</section>`;
  return `<main class="page">${stepStrip(2)}${pageHeading('出発の前に','両陣営の確認','それぞれ近接二人、遠隔一人、回復一人。同行者はこの旅の間、固定されます。')}<div class="camp-grid">${camp('あなたの陣営',content.commanders[run.commanderId],sortedCharacters().filter(c=>run.partyIds.includes(c.id)))}${camp('もう一方の陣営',rival,getOpponentParty(run,content))}</div><div class="button-row end">${button('選抜に戻る','back-draft')}${button('この編成で出発する →','depart','','primary')}</div></main>`;
}
function mapArt() {
  return `<svg class="map-art" viewBox="0 0 700 550" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="map-grid" width="35" height="35" patternUnits="userSpaceOnUse"><path d="M35 0H0V35" fill="none" stroke="#94a58a" stroke-opacity=".13"/></pattern></defs><rect width="700" height="550" fill="url(#map-grid)"/><path d="M-20 290Q80 175 169 229T320 263T470 365T730 342" fill="none" stroke="#b6c9be" stroke-width="24"/><path d="M-20 290Q80 175 169 229T320 263T470 365T730 342" fill="none" stroke="#ccd9c9" stroke-width="10"/><ellipse cx="350" cy="246" rx="124" ry="102" stroke="#9da888" fill="#dbe0ce88"/><ellipse cx="350" cy="246" rx="133" ry="111" stroke="#9da888" stroke-dasharray="3 7" fill="none"/><path d="M174 126 310 214M537 130 385 210M359 361 360 246M158 454 334 357" stroke="#b0ab8b" stroke-width="2" stroke-dasharray="5 7"/><g fill="none" stroke="#a4b295" stroke-width="1.5" opacity=".65"><path d="m34 377 15-24 15 24m-26-9h22m13 26 15-24 15 24m-26-9h22m-63 21 15-24 15 24m-26-9h22M592 402l15-24 15 24m-26-9h22m4 37 15-24 15 24m-26-9h22M26 92l33-45 33 45 23-31 29 41M554 492l32-45 32 45 23-31 28 41"/></g><path d="M30 30h45M30 30v45m640-45h-45m45 0v45M30 520h45m-45 0v-45m640 45h-45m45 0v-45" stroke="#9da888"/></svg>`;
}
function chapterStatus(id) { return run.chapterProgress[id]?.status || 'notStarted'; }
function mapPage() {
  const albaDone=chapterStatus('alba')==='completed';
  const active=Object.entries(run.chapterProgress).find(([,p])=>p.status==='active')?.[0];
  const completed=values(content.regions).filter(r=>r.kind==='normal'&&chapterStatus(r.id)==='completed').length;
  const regionButtons=values(content.regions).map(r=>{
    const status=chapterStatus(r.id);
    const available=r.implemented && (r.kind!=='final'||completed===4) && (!active||active===r.id||status==='completed');
    const sub=!r.implemented?'準備中':status==='completed'?'完了 · 記録を開く':status==='active'?'攻略中 · 続きへ':'未訪問 · 試練を開始';
    return `<button type="button" class="map-place ${available&&status!=='completed'?'ready':''} ${status==='completed'?'complete':''}" data-region="${r.id}" data-action="${status==='completed'?'record':'region'}" data-id="${r.id}" ${!available?'disabled':''}><strong>${esc(r.name)}</strong><small>${sub}</small></button>`;
  }).join('');
  return `<main class="page">${pageHeading('旅の現在地','王国を見渡す','地図から訪問地へ。旅の記録と、これまでに得た情報を確かめられます。')}${albaDone?'<div class="notice"><strong>アルバの三つの試練が終了しました。</strong><br>今回の試作はここまでです。アルバの記録確認と、セーブ・ロードを続けて試せます。王位の判定は行いません。</div>':''}<div class="map-layout"><section class="map-board" aria-label="バウムガルテン王国の五地域">${mapArt()}<span class="map-caption">バウムガルテン王国</span><div class="map-compass">N<span>✧</span></div>${regionButtons}<span class="map-legend">位置は画面配置用の仮レイアウト</span></section><aside class="map-sidebar"><section class="panel"><p class="eyebrow">${esc(nameOf(run.commanderId))}の旅</p><div class="stats"><div><div class="stat-label">継承点 · 仮配点</div><div class="stat-value">${getTotalScore(run)}<span>/ 100</span></div></div><div><div class="stat-label">テオの調査</div><div class="stat-value">${getTheoRemaining(run)}<span>/ 2 回</span></div></div></div><p class="small muted">通常地域　${completed} / 4 完了</p></section><section class="panel"><h3>旅の同行者</h3>${sortedCharacters().filter(c=>run.partyIds.includes(c.id)).map(c=>`<div class="member-row">${member(c)}<button class="text-button small" data-action="profile" data-id="${c.id}">詳細</button></div>`).join('')}</section><section class="panel"><div class="info-tools">${button('情報メモ','memo')}${button('会話ログ','log')}${button('セーブ / ロード','saves')}</div>${getAvailableConversations(run,content).length?`<p class="section-label">ひと休み</p>${conversationButtons()}`:''}</section></aside></div><div style="margin-top:22px">${fixtureNote()}</div></main>`;
}
function conversationButtons() {
  return getAvailableConversations(run,content).map(c=>`<button class="bubble-button" data-action="conversation" data-id="${c.id}"><span class="member-avatar" aria-hidden="true">${esc(nameOf(c.participantIds[0]).slice(0,1))}</span><span class="opinion-name">${esc(c.participantIds.map(nameOf).join('・'))}</span><span class="bubble-icon">話す</span></button>`).join('');
}
function trialSidebar() {
  const decision=run.position.phase==='trial'&&run.position.stage==='decision';
  return `<aside class="trial-sidebar"><section class="panel"><h3>同行者の声</h3>${decision?`<div class="opinion-list">${conversationButtons() || '<p class="small muted">この場面で聞ける話はありません。</p>'}</div><p class="small muted">話を聞かずに判断へ進むこともできます。</p>`:`<div class="roster">${run.partyIds.map(id=>member(character(id))).join('')}</div>`}</section><section class="panel"><h3>旅の手帳</h3><div class="info-tools">${button('情報メモ','memo')}${button('会話ログ','log')}</div></section><section class="panel"><h3>テオの調査</h3><p class="small muted">残り ${getTheoRemaining(run)} / 2 回<br>各地域の大試練で一度だけ。</p>${decision&&content.trials[run.position.trialId]?.kind==='major'?(canUseTheo(run,content)?button('調査を頼む','theo','','wide'):`<p class="small">${run.theoInvestigations[run.position.regionId]?'この地域は調査済みです。報告は情報メモとログから確認できます。':'この旅の調査回数を使い切りました。'}</p>`):''}</section></aside>`;
}
function dialoguePanel(block) {
  const read=reader.readTextKeys.includes(block.readKey);
  return `<section class="dialogue-panel"><div class="speaker">${esc(nameOf(block.speakerId))}</div><div class="dialogue-text">${esc(block.text)}</div><div class="dialogue-actions"><span class="read-indicator">${read?'既読':'未読'}</span><div class="button-row"><button class="text-button small" data-action="skip" ${!read?'disabled':''}>既読スキップ</button>${button('次へ →','ack','','primary')}</div></div></section>`;
}
function assignments(choice) {
  const list=getCrisisAssignments(run,choice,content);
  return list.length?`<div class="assignment-list">${list.map(a=>`<div><b>${esc(nameOf(a.characterId))}</b>${esc(a.text)}</div>`).join('')}</div>`:'';
}
function choicesPanel() {
  const trial=content.trials[run.position.trialId];
  return `<section><div class="panel"><h2>${trial.interaction==='crisisPlan'?'作戦を組む':'判断を選ぶ'}</h2><p class="small muted">${trial.interaction==='crisisPlan'?'三つの作戦は、いずれも四人全員が関与します。同行者の情報を確認し、作戦を一つ選んでください。':'同行者の声や情報メモを確認できます。選んだ案は、次の確認画面で確定します。'}</p>${trial.kind==='major'?'<p class="small">ここで選ぶ政策は、現王への提出案です。この場で制度を実施するものではありません。</p>':''}</div><p class="section-label">${trial.interaction==='crisisPlan'?'作戦セット · 3 択':'提出できる案'}</p><div class="choice-list">${getAvailableChoices(run,content).map((c,i)=>`<button class="choice" data-action="choice" data-id="${c.id}"><span class="choice-head"><span class="choice-number">${String(i+1).padStart(2,'0')}</span><span class="choice-title">${esc(c.label)}</span></span>${c.description?`<div class="choice-description">${esc(c.description)}</div>`:''}${trial.interaction==='crisisPlan'?assignments(c):''}</button>`).join('')}</div></section>`;
}
function trialPage() {
  const p=run.position;
  const trial=content.trials[p.trialId || p.returnPosition?.trialId];
  const block=getCurrentText(run,content);
  const regionId=p.regionId || p.returnPosition?.regionId || trial?.regionId;
  const result=run.trialResults[p.trialId];
  const heading=p.phase==='theoReport'?'テオの調査報告':p.phase==='conversation'?'同行者の声':p.phase==='chapterClosing'?'アルバからの帰還':trial?.title || '王都からの旅立ち';
  let body='';
  if(p.phase==='trialResult') {
    body+=`<div class="result-score"><div class="number">${result.awardedPoints}<small> / ${trial.maxPoints}</small></div><div><p>今回の継承点 <span class="small muted">（仮配点）</span></p><p class="small muted">旅の合計 ${getTotalScore(run)} / 100 · 確定済み</p></div></div>`;
  }
  if(block) body+=dialoguePanel(block);
  else if(p.phase==='trial'&&p.stage==='decision') body+=choicesPanel();
  else if(p.phase==='trialResult'&&p.stage==='done') {
    body+=`<section class="panel"><h2>判断を記録しました</h2><p class="small muted">評価の再表示で得点が増えることはありません。この区切りでセーブするか、次へ進めます。</p>${trial.interaction==='crisisPlan'?assignments(trial.choices.find(c=>c.id===result.choiceId)):''}<div class="button-row" style="margin-top:24px">${button(trial.kind==='major'?'帰還の会話へ →':'次の試練へ →','next-trial','','primary')}${button('セーブ / ロード','saves')}</div></section>`;
  }
  const canReturn=(p.phase==='trial'&&p.stage==='decision')||(p.phase==='trialResult'&&p.stage==='done');
  return `<main class="page">${pageHeading(regionId?`${esc(regionName(regionId))} / 試練の記録`:'旅のはじまり',esc(heading),'',canReturn?button('地図へ一時帰還','return-map','', 'compact'):'')}${trial?`<div class="chapter-path">${content.regions[trial.regionId].trialIds.map((id,i)=>`<span class="${id===trial.id?'active':''}">${i<2?`小試練 ${i+1}`:'大試練'}</span>`).join('')}</div>`:''}<div class="trial-layout"><div class="trial-main">${body}<div style="margin-top:20px">${fixtureNote()}</div></div>${trialSidebar()}</div></main>`;
}
function storyPage() {
  const block=getCurrentText(run,content);
  return `<main class="page" style="max-width:850px">${pageHeading('継承戦の序章',run.position.phase==='intro'?'旅のはじまり':'王都を発つ')} ${block?dialoguePanel(block):'<p>次の場面を準備しています。</p>'}<div class="button-row" style="margin-top:18px">${button('会話ログ','log')}</div><div style="margin-top:28px">${fixtureNote()}</div></main>`;
}
function profileModal(id) {
  const c=character(id), selected=run?.partyIds.includes(id);
  const choosing=!title&&run?.position.phase==='draft';
  const full=choosing&&roleCounts()[c.role]>=(c.role==='melee'?2:1)&&!selected;
  return { title:c.name, body:`<div class="profile-layout">${portrait(c)}<div><p class="eyebrow">${roles[c.role]} / ${c.age}歳 / ${esc(c.gender)}</p><dl class="profile-meta"><dt>出身</dt><dd>${esc(regionName(c.originRegionId))}</dd><dt>活動地域</dt><dd>${esc(c.activityRegionIds.map(regionName).join('・'))}</dd><dt>得意分野</dt><dd>${esc(c.expertise.join('・'))}</dd></dl></div></div><p class="profile-text">${esc(c.profile)}</p><h3 class="section-label">主な関係性</h3><p class="small">${esc(c.relationships.join(' / '))}</p>${full?'<div class="notice">この役割の枠は埋まっています。先に選択済みの人物を外してください。</div>':''}`, footer:choosing?button(selected?'同行者から外す':'同行者に選ぶ','toggle-party',`data-id="${id}" ${full?'disabled':''}`,selected?'':'primary'):button('閉じる','close-modal') };
}
function memoBody(regionId) {
  const acquired=Object.keys(run?.acquiredInformation || {}).map(id=>content.information[id]).filter(i=>i&&(!regionId||i.regionId===regionId));
  if(!acquired.length) return '<p class="empty">この周回では、まだ情報を取得していません。</p>';
  return Object.entries(sourceLabels).map(([kind,label])=>{
    const items=acquired.filter(i=>i.sourceKind===kind);
    return items.length?`<section class="info-group"><h3>${label}</h3>${items.map(i=>{
      const sources=run.acquiredInformation[i.id].sources || [];
      const sourceNames=sources.map(s=>{
        const convo=content.conversations[s.id];
        const block=content.textBlocks[s.id];
        return convo?convo.participantIds.map(nameOf).join('・'):s.kind==='investigation'?'テオ':block?.speakerId?nameOf(block.speakerId):i.sourceActorId?nameOf(i.sourceActorId):'現地';
      });
      return `<article class="info-item">${esc(i.summary)}<small>出典：${esc([...new Set(sourceNames.length?sourceNames:[i.sourceActorId?nameOf(i.sourceActorId):'現地の確認'])].join(' / '))} · ${esc(regionName(i.regionId))}</small></article>`;
    }).join('')}</section>`:'';
  }).join('');
}
function recordModal(id) {
  const region=content.regions[id];
  const major=region.trialIds.map(t=>content.trials[t]).find(t=>t.kind==='major');
  const r=run.trialResults[major.id];
  const policy=major.choices.find(c=>c.id===r.choiceId);
  return { title:`${region.name}の記録`, large:true, body:`${fixtureNote()}<div class="record-summary">${region.trialIds.map((trialId,i)=>`<section class="panel"><h3>${i<2?`小試練 ${i+1}`:'大試練'}</h3><strong>${run.trialResults[trialId].awardedPoints}</strong><span class="muted small"> / ${content.trials[trialId].maxPoints}</span><p class="small" style="margin-top:8px">${esc(content.trials[trialId].choices.find(c=>c.id===run.trialResults[trialId].choiceId).label)}</p></section>`).join('')}</div><section class="record-policy"><h3>現王への提出政策</h3><p>${esc(policy.label)}</p><p class="small muted">政策を提出した記録です。制度の実施や、王位の継承を確定するものではありません。</p></section><h3>この地域で得た情報</h3>${memoBody(id)}`, footer:button('地図に戻る','close-modal') };
}
function logModal() {
  const entries=[...(run?.recentDialogueLog || [])];
  const current=run?getCurrentText(run,content):null;
  if(current && entries.at(-1)?.readKey!==current.readKey) entries.push(current);
  return { title:'会話ログ', body:entries.length?`<p class="small muted">この周回の直近200発言。閲覧では情報の取得や採点を行いません。</p>${entries.slice(-200).map(e=>`<article class="log-entry"><strong>${esc(nameOf(e.speakerId))}</strong><p>${esc(e.text)}</p></article>`).join('')}`:'<p class="empty">まだ表示された会話はありません。</p>',footer:button('閉じる','close-modal') };
}
function slotSummary(slot) {
  if(!slot) return '<p class="muted">空のスロット</p>';
  try {
    validateRun(slot.run,content);
    const state=slot.run;
    return `<p>${esc(nameOf(state.commanderId))} / ${esc(positionLabel(state))}</p><p class="muted">同行者：${state.partyIds.length?esc(state.partyIds.map(nameOf).join('・')):'選抜前'}</p><p class="muted">継承点 ${getTotalScore(state)} / 100　·　テオ ${getTheoRemaining(state)} / 2 回</p>`;
  } catch { return '<p class="muted">この保存データは確認が必要です。ロード時に検証します。</p>'; }
}
function savesModal() {
  const canSave=!title&&run&&canManualSave(run)&&!pending;
  return { title:title?'旅の記録をロード':'セーブ / ロード', large:true, body:`<p class="small muted">このブラウザに保存します。手動セーブは地図や試練の区切りで使えます。ロードすると選んだ地点へ戻り、オートセーブも更新されます。</p>${Object.entries(slotLabels).map(([id,label])=>`<section class="save-slot"><div class="save-slot-header"><h3>${label} ${id==='auto'?'<span class="save-badge">AUTO</span>':''}</h3><time class="small muted">${slots[id]?.savedAt?esc(new Date(slots[id].savedAt).toLocaleString('ja-JP')):''}</time></div>${slotSummary(slots[id])}<div class="button-row">${id!=='auto'?button('ここに保存','save-slot',`data-id="${id}" ${!canSave?'disabled':''}`,'compact'):''}${button('ロード','load-slot',`data-id="${id}" ${!slots[id]?'disabled':''}`,'compact')}${button('削除','delete-slot',`data-id="${id}" ${!slots[id]?'disabled':''}`,'compact danger')}</div></section>`).join('')}`, footer:button('閉じる','close-modal') };
}
function modalMarkup() {
  if(!modal) return '';
  return `<div class="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="modal-title" class="modal ${modal.large?'large':''}"><header class="modal-header"><h2 id="modal-title">${esc(modal.title)}</h2><button class="modal-close" data-action="close-modal" aria-label="閉じる">×</button></header><div class="modal-body">${modal.body}</div><footer class="modal-footer">${modal.footer||button('閉じる','close-modal')}</footer></section></div>`;
}
function render() {
  const active=document.activeElement;
  const focusData=active?.dataset?.action?{action:active.dataset.action,id:active.dataset.id}:null;
  let body='';
  if(title||!run) body=titlePage();
  else {
    switch(run.position.phase) {
      case 'commanderSelection': body=commanderPage(); break;
      case 'draft': body=draftPage(); break;
      case 'partyConfirmation': body=campPage(); break;
      case 'map': body=mapPage(); break;
      case 'intro': case 'departure': body=storyPage(); break;
      default: body=trialPage();
    }
  }
  app.innerHTML=header()+(error?`<div class="error-banner" role="alert"><p>${esc(error)}</p><div class="button-row">${button('再試行','retry','', 'compact')}${ready?button('保存済みをロード','saves','','compact'):''}</div></div>`:'')+body+(!title?'<footer class="footer-note">バウムガルテン王国の継承戦 / v0.3 基盤試作 · 正式な王国史は作成されません。</footer>':'')+modalMarkup()+(toast?`<div class="toast" role="status">${esc(toast)}</div>`:'')+(busy?'<div class="busy-corner" role="status">保存しています…</div>':'');
  if(busy) app.querySelectorAll('button').forEach(b=>b.disabled=true);
  if(modal) {
    app.querySelectorAll(':scope > :not(.modal-backdrop):not(.toast):not(.busy-corner)').forEach(el=>el.inert=true);
    const dialog=app.querySelector('[role="dialog"]');
    const selector=focusData?`[data-action="${CSS.escape(focusData.action)}"]${focusData.id?`[data-id="${CSS.escape(focusData.id)}"]`:''}`:'';
    (selector&&dialog.querySelector(selector) || dialog.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});
  } else if(focusData) {
    app.querySelector(`[data-action="${CSS.escape(focusData.action)}"]${focusData.id?`[data-id="${CSS.escape(focusData.id)}"]`:''}`)?.focus({preventScroll:true});
  }
}
function confirmDialog(heading,body,onConfirm,label='確定する') {
  const previous=modal;
  modal={title:heading,body,footer:button('取り消す','cancel-confirm')+button(label,'accept-confirm','','primary'),onConfirm,onCancel:()=>{modal=previous;render();}};
  render();
}
async function refreshSlots() {
  // A displayed slot list has its own observed revision. Loading may deliberately
  // replace the active run, but must never silently adopt a newer database on retry.
  const observed=await storage.getRevision();
  const latest=await storage.listSlots();
  slots=latest; slotsRevision=observed;
}
async function transact(work, {after,message}={}) {
  if(busy) return;
  busy=true; error=''; render();
  let result;
  try {
    result=await work();
  } catch(e) {
    error=`保存・読込みを完了できませんでした。${e.message}\n${/revision|conflict|競合|別のタブ/i.test(e.message)||e.code==='REVISION_CONFLICT'?'別のタブで更新された可能性があります。保存済みをロードしてから操作を再開してください。':'画面と進行は保持しています。再試行できます。'}`;
    pending={work,after,message};
    busy=false;render();return;
  }
  // Past this point the write has committed. A view-refresh failure must never
  // turn the completed write into another mutation/retry.
  pending=null;
  try {
    if(result?.revision!==undefined) revision=result.revision;
    if(result?.readerProfile) reader=result.readerProfile;
    if(after) after(result);
    if(message) notify(message);
    await refreshSlots();
    if(!result?.readerProfile) reader=await storage.getReaderProfile();
  } catch(e) {
    error=`保存処理は完了しましたが、一覧・既読の表示更新に失敗しました。${e.message}\n再試行では表示だけを更新します。`;
  } finally { busy=false; render(); }
}
async function perform(action) {
  if(busy||pending) return;
  const oldPhase=run.position.phase;
  const block=action.type==='ACK_TEXT'?getCurrentText(run,content):null;
  let next;
  try { next=transition(run,action,content); }
  catch(e) { notify(e.message); render(); return; }
  run=next;
  const expectedRevision=revision;
  await transact(()=>storage.commitAuto(next,{expectedRevision,readTextKeys:block?[block.readKey]:[]}));
  if(oldPhase!==run.position.phase) window.scrollTo({top:0,behavior:'instant'});
}
async function load(id) {
  modal=null;
  const expectedRevision=slotsRevision;
  await transact(()=>storage.loadSlot(id,{expectedRevision}),
    {after:result=>{run=result.run;title=false;},message:'保存した地点から再開しました。'});
}
async function openSaves() {
  try { await refreshSlots(); modal=savesModal(); render(); }
  catch(e) { error=e.message; render(); }
}
async function startNew() {
  modal=null;
  const next=createRun(content);
  const expectedRevision=slotsRevision;
  await transact(()=>storage.commitAuto(next,{expectedRevision}),
    {after:()=>{run=next;title=false;},message:'新しい旅を記録しました。'});
}
async function skipRead() {
  if(busy||pending) return;
  const initialPhase=run.position.phase;
  let skipped=0;
  while(!pending && run.position.phase===initialPhase) {
    const block=getCurrentText(run,content);
    if(!block||!reader.readTextKeys.includes(block.readKey)) break;
    await perform({type:'ACK_TEXT'});
    skipped++;
    if(skipped>=200) break;
  }
  notify('既読の文章を進めました。未読の文章・新しい場面・選択では止まります。'); render();
}
async function handle(action,id) {
  if(busy) return;
  if(pending&&!['saves','load-slot','accept-confirm','cancel-confirm','close-modal','retry','memo','log','profile'].includes(action)) return;
  switch(action) {
    case 'new':
      await refreshSlots();
      if(slots.auto) confirmDialog('新しい旅をはじめる','<p>現在のオートセーブを、新しい周回で置き換えます。</p><p class="small muted">手動セーブ三枠、周回をまたぐ既読、王国史は保持されます。</p>',startNew,'新しい旅をはじめる');
      else await startNew();
      break;
    case 'continue':
      confirmDialog('つづきから','<p>オートセーブした地点から旅を再開します。</p>',()=>load('auto'),'再開する'); break;
    case 'title':
      if(!title) confirmDialog('タイトルへ戻る','<p>現在の進行はオートセーブされています。タイトルへ戻りますか。</p>',()=>{modal=null;title=true;render();},'タイトルへ'); break;
    case 'select-commander': await perform({type:'SELECT_COMMANDER',commanderId:id}); break;
    case 'profile': modal=profileModal(id); render(); break;
    case 'toggle-party': await perform({type:'TOGGLE_PARTY',characterId:id}); modal=null; render(); break;
    case 'confirm-party': await perform({type:'CONFIRM_PARTY'}); break;
    case 'back-draft': await perform({type:'BACK_TO_DRAFT'}); break;
    case 'depart': await perform({type:'DEPART'}); break;
    case 'ack': await perform({type:'ACK_TEXT'}); break;
    case 'skip': await skipRead(); break;
    case 'region': await perform({type:'START_REGION',regionId:id}); break;
    case 'return-map': await perform({type:'RETURN_MAP'}); break;
    case 'conversation': await perform({type:'OPEN_CONVERSATION',conversationId:id}); break;
    case 'choice': {
      const trialId=run.position.trialId;
      const choice=getAvailableChoices(run,content).find(c=>c.id===id);
      if(!choice) break;
      confirmDialog(content.trials[trialId].kind==='major'?'政策案を提出する':'この判断を確定する',`<p class="choice-confirm">${esc(choice.label)}</p><p class="small muted">確定すると、この試練の判断結果を記録します。確定前なら取り消して情報を確認できます。</p>`,async()=>{modal=null;await perform({type:'RESOLVE_TRIAL',trialId,choiceId:id});},'この案で確定する');
      break;
    }
    case 'theo':
      confirmDialog('テオに調査を頼む',`<p>対象：${esc(regionName(run.position.regionId))}</p><p>残り ${getTheoRemaining(run)} 回のうち、1 回を使います。</p><p class="small muted">取り消した場合は消費しません。調査報告は情報メモにも残ります。</p>`,async()=>{modal=null;await perform({type:'REQUEST_THEO'});},'1 回使って調査する'); break;
    case 'next-trial': await perform({type:'CONTINUE_TRIAL'}); break;
    case 'record': modal=recordModal(id); render(); break;
    case 'memo': modal={title:'情報メモ',body:memoBody(),footer:button('閉じる','close-modal')}; render(); break;
    case 'log': modal=logModal(); render(); break;
    case 'saves': await openSaves(); break;
    case 'save-slot': {
      if(!run||!canManualSave(run)||id==='auto') break;
      const save=async()=>{
        const snapshot=structuredClone(run),expectedRevision=revision;
        modal=null;
        await transact(()=>storage.saveManual(id,snapshot,{expectedRevision}),{message:`${slotLabels[id]}に保存しました。`});
      };
      if(slots[id]) confirmDialog('セーブを上書きする',`<p>${slotLabels[id]}を、現在の旅の記録で置き換えます。</p>`,save,'上書きする');
      else await save();
      break;
    }
    case 'load-slot': confirmDialog('保存した地点へ戻る',`<p>${slotLabels[id]}を読み込みます。現在の進行とオートセーブは、この保存地点の状態に置き換わります。</p>`,()=>load(id),'ロードする'); break;
    case 'delete-slot': confirmDialog('スロットを削除する',`<p>${slotLabels[id]}のデータを削除します。他のスロット、既読、王国史は保持されます。</p>`,async()=>{
      const expectedRevision=revision; modal=null;
      await transact(()=>storage.deleteSlot(id,{expectedRevision}),{message:`${slotLabels[id]}を削除しました。`});
    },'削除する'); break;
    case 'accept-confirm': { const callback=modal?.onConfirm; if(callback) { modal=null; await callback(); } break; }
    case 'cancel-confirm': if(modal?.onCancel) modal.onCancel(); break;
    case 'close-modal': if(modal?.onCancel) modal.onCancel(); else {modal=null;render();} break;
    case 'retry':
      if(pending) {const saved=pending;await transact(saved.work,saved);}
      else if(!ready) await init();
      else { await refreshSlots();reader=await storage.getReaderProfile();error='';render(); }
      break;
  }
}
app.addEventListener('click', event=>{
  const target=event.target.closest('button[data-action]');
  if(!target||target.disabled) return;
  handle(target.dataset.action,target.dataset.id).catch(e=>{error=e.message;busy=false;render();});
});
document.addEventListener('keydown',event=>{
  if(!modal||busy) return;
  if(event.key==='Escape') {event.preventDefault();handle('close-modal');}
  if(event.key==='Tab') {
    const controls=[...app.querySelectorAll('[role="dialog"] button:not(:disabled),[role="dialog"] a[href]')];
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first) {event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last) {event.preventDefault();first?.focus();}
  }
});
async function init() {
  try {
    await storage.open();
    revision=await storage.getRevision();
    reader=await storage.getReaderProfile();
    await refreshSlots();
    ready=true;error='';
  } catch(e) {error=`保存領域を開けませんでした。${e.message}`;ready=false;}
  render();
}
await init();
