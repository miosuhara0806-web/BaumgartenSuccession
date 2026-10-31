// New-run content only: all historical packs and city definitions stay intact.
import { content as previous } from './companion-dialogue-unified.js';
import { companionProfiles, portraits, manuscript } from './prologue-manuscript.js';

export function createPrologueContent() {
  const content = structuredClone(previous);
  content.contentVersion = 'alba-hexerei-anchoring-rude-ehrenfels-prologue-reunion-2026-10-31';
  content.subtitle = '正式序章・同行者選抜・中盤再会';
  content.fixtureNotice = '序章と5都市・15試練を実装しています。正式終幕は準備中です。';
  content.companionProfiles = structuredClone(companionProfiles);
  content.portraits = structuredClone(portraits);
  content.speakers = {
    'support.king': { name: '現王' }, 'support.overseer': { name: '監督官' },
    'support.chancellor': { name: '宰相' }, 'support.theo': { name: 'テオ' },
  };
  function scene(id, title, rows, nextSceneId) {
    const blocks = rows.map((row, index) => {
      const blockId = `text.${id}.${index + 1}`;
      content.textBlocks[blockId] = { id: blockId, textRevision: 1, contentStatus: 'reviewed',
        informationIdsOnAcknowledge: [], ...row };
      return blockId;
    });
    content.scenes[id] = { id, title, blocks, ...(nextSceneId ? { nextSceneId } : {}) };
    return id;
  }
  const narration = text => ({ speakerId: null, text });
  const speech = (speakerId, text) => ({ speakerId, text });
  // Expand protagonist variants into immutable blocks: read keys cannot cross speakers.
  function variant(rows, commanderId) {
    return rows.map(row => ({ ...row, condition: { commanderIs: commanderId },
      speakerId: row.speakerId === 'commander' ? commanderId : row.speakerId,
      text: row.text.replace('{tutorialReply}', commanderId.endsWith('alphonse') ? '分かった' : '分かりました')
        .replace('{departureReply}', commanderId.endsWith('alphonse') ? 'ああ' : 'ええ'),
    }));
  }
  const both = rows => ['commander.alphonse', 'commander.rosemond'].flatMap(id => variant(rows, id));
  content.introSceneId = scene('prologue.declaration', '継承戦の宣言', manuscript.intro);
  const locations = Object.fromEntries([
    ['warehouse', '王城倉庫', '銀製の式典飾りは確かに保管されていた。しかし前日に「西棟へ運ぶよう指示され、すでに倉庫から搬出済み」であることが判明する。記録にも搬出先として西棟が記されている。'],
    ['servants', '使用人詰所', '使用人は「倉庫から西棟まで飾りを運び、西棟の保管担当者へ渡した」と証言する。ただし「その後、式典準備室へ運ぶようには指示されていない」。'],
    ['preparation', '式典準備室', '式典準備室には飾りは届いていない。担当者は「西棟から届けられるものだと思っていた」と証言する。'],
  ].map(([id, name, text]) => [id, { id, name, sceneId: scene(`prologue.tutorial.${id}`, name, [narration(text)]) }]));
  const feedbackSceneIds = {
    a: scene('prologue.tutorial.retry-a', 'もう一度考える', [speech('support.overseer', '倉庫に残っている可能性は低そうです。これまでに確認した“その後の流れ”をもう一度考えてみましょう。')]),
    c: scene('prologue.tutorial.retry-c', 'もう一度考える', [speech('support.overseer', '式典会場まで届いた形跡は確認できていません。途中のどこかで止まっていないか考えてみましょう。')]),
  };
  const afterSceneId = scene('prologue.tutorial.after', 'これからの判断', both(manuscript.afterTutorial));
  const successSceneId = scene('prologue.tutorial.success', '西棟の保管場所', [
    ...both(['西棟だ', '倉庫から西棟までは運ばれている', 'だが、そこから式典準備室へ届ける指示が伝わっていない', 'なら、西棟の保管場所で止まっているはずだ'].map(text => speech('commander', `「${text}」`))),
    narration('監督官が判断を認める。その後、実際に西棟で式典飾りが発見されたことが確認される。'),
  ], afterSceneId);
  content.prologue = { tutorial: {
    entrySceneId: scene('prologue.tutorial.opening', '消えた式典の飾り', [
      narration('アルフォンスとローズモンドには、それぞれ別の監督官が同行する。監督官は旅に同行し、現地情報の整理、進行補助、判断理由の記録と王都への報告を担う。候補者の代わりに答えを決めたり、正解を教えたりはしない。宰相は王都で現王を補佐し、制度面の説明や評価・報告の実務を担う。'),
      narration('銀製の式典飾りが見当たらない。王城倉庫、使用人詰所、式典準備室で情報を集め、どこにあるのかを判断しよう。'),
    ]), locations, feedbackSceneIds, successSceneId,
  } };
  const departureId = scene('prologue.departure', '王都出発', both(manuscript.departure));
  content.departureSceneId = scene('prologue.court', '双方の一行が決まる', [
    narration('主人公側四名と相手側四名が、それぞれの候補の後方に並ぶ。'),
    ...manuscript.courtCommon,
    ...variant(manuscript.courtAlphonse, 'commander.alphonse'),
    ...variant(manuscript.courtRosemond, 'commander.rosemond'),
  ], departureId);
  const eventId = 'event.midgame-reunion';
  content.storyEvents[eventId] = { id: eventId, trigger: 'afterTwoRegions',
    entrySceneId: scene('prologue.midgame-reunion', '双子の再会 — 街道沿いの宿場', [
      ...variant(manuscript.reunionAlphonse, 'commander.alphonse'),
      ...variant(manuscript.reunionRosemond, 'commander.rosemond'),
    ]),
  };
  return content;
}
export const content = createPrologueContent();
