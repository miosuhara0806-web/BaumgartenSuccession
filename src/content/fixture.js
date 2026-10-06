// Approved profiles and region outlines follow v0.3 section 17.
// All Alba dialogue, choices, information, scoring and tags below are fixtures.
// Replacing these does not require changing the progression engine.
const characters = {
  'char.harold': {
    id: 'char.harold', name: 'ハロルド', role: 'melee', profession: '拳闘士', age: 20, gender: '男性',
    originRegionId: 'alba', activityRegionIds: ['alba'],
    profile: '代々防衛勤務の名家で最も才能がある拳闘士。生真面目で、誇りと重圧を抱えている。酒豪で、酒席では陽気。',
    expertise: ['軍事', '防衛'],
    relationships: ['両親は幼い双子の護衛を務めた。本人と両親は王家から厚く信頼されている。', 'リゼットの幼馴染。'],
    portraitAssetId: null, displayOrder: 1,
  },
  'char.frederica': {
    id: 'char.frederica', name: 'フレデリカ', role: 'melee', profession: '剣闘士', age: 18, gender: '女性',
    originRegionId: 'hexerei', activityRegionIds: ['alba'],
    profile: '流浪の剣士の父と魔導士の母の間に生まれた。魔力がなく、母方の祖父母に追われる形で商業都市へ移住。父譲りの剣技を持ち、13歳からアルバで住み込み勤務をしている。クールで人を寄せ付けにくいが、甘いものを食べると柔らかく笑う。',
    expertise: ['非魔法適性者の視点', '魔法社会', '剣士としての勤務経験'],
    relationships: ['父は流浪の剣士、母は魔導士。魔力がないことから母方の祖父母に追われた。'],
    portraitAssetId: null, displayOrder: 2,
  },
  'char.madian': {
    id: 'char.madian', name: 'マディアン', role: 'melee', profession: '魔導騎士', age: 23, gender: '男性',
    originRegionId: 'anchoring', activityRegionIds: ['anchoring'],
    profile: '魔力のない商人の両親のもとに生まれ、父方の祖父から魔力を隔世継承した。専門魔導士には足りない魔力を剣術とともに活かす。普段は陽気で気さくだが、戦闘では情に流されず冷徹な判断をする。',
    expertise: ['商業', '外交', '対人交渉'],
    relationships: ['両親は王家御用達商人。幼い双子の兄替わりだった。'],
    portraitAssetId: null, displayOrder: 3,
  },
  'char.olivel': {
    id: 'char.olivel', name: 'オリヴェル', role: 'melee', profession: 'アマゾネス', age: 25, gender: '女性',
    originRegionId: 'rude', activityRegionIds: ['rude'],
    profile: '「開かれたルード」を作った酋長の娘。父譲りに大らかで、姉御肌のお節介な相談役。料理が上手で、小猿のバーニーを常に連れている。',
    expertise: ['自然', '暮らし', '文化', '慣習'],
    relationships: ['ルードの酋長の娘。小猿のバーニーを連れている。', 'リゼットからこっそり恋愛相談を受けている。'],
    portraitAssetId: null, displayOrder: 4,
  },
  'char.lisette': {
    id: 'char.lisette', name: 'リゼット', role: 'ranged', profession: '弓使い', age: 20, gender: '女性',
    originRegionId: 'alba', activityRegionIds: ['alba'],
    profile: '防衛勤務の名家で最も才能がある弓使い。寡黙だが向上心が高く、境遇に甘えず努力する。ハロルドに幼馴染以上の感情を持つようだが、表には出しにくい。',
    expertise: ['若者の視点', '軍人家系', '現場で努力する者の視点'],
    relationships: ['ハロルドの幼馴染。彼への感情について、オリヴェルにこっそり相談している。'],
    portraitAssetId: null, displayOrder: 5,
  },
  'char.vantalt': {
    id: 'char.vantalt', name: 'ヴァンタルト', role: 'ranged', profession: '魔導士', age: 22, gender: '男性',
    originRegionId: 'hexerei', activityRegionIds: ['hexerei'],
    profile: '都市の長の息子で、桁外れの魔力を持つ。戦闘より研究に熱心。魔導には偏屈で融通が利かないが、ほかのことでは柔らかく誠実な口調で話し、話術・交渉に長ける。',
    expertise: ['魔導研究', '学術', '交渉', '話術'],
    relationships: ['ヘクセレイの長の息子。'],
    portraitAssetId: null, displayOrder: 6,
  },
  'char.sandro': {
    id: 'char.sandro', name: 'サンドロ', role: 'healer', profession: '薬師', age: 32, gender: '男性',
    originRegionId: 'anchoring', activityRegionIds: ['hexerei'],
    profile: '世界を巡る名高い薬師で、各地に得意先を持ち、持たない薬はないと言われる。金持ちにはがめついが、貧しい人から無理に金を取らない。年の離れた妹の難病に自分の薬が効かず、回復魔法による治療を研究するためヘクセレイに住む。',
    expertise: ['薬', '医療', '商売', '人脈'],
    relationships: ['年の離れた妹の難病を治すため、回復魔法による治療を研究している。', '各地に得意先を持つ。'],
    portraitAssetId: null, displayOrder: 7,
  },
  'char.heidemarie': {
    id: 'char.heidemarie', name: 'ハイデマリー', role: 'healer', profession: 'シスター', age: 17, gender: '女性',
    originRegionId: 'ehrenfels', activityRegionIds: ['ehrenfels'],
    profile: '名門貴族の次女。おっとりして社交界に馴染まず、両親が本人の希望を聞いて教会へ預けた。献身的で人々の癒しとなる。回復魔法の才能に優れている。',
    expertise: ['福祉', '治癒', '王都の民情'],
    relationships: ['双子の幼馴染。両親は本人の希望を聞いて教会へ預けた。'],
    portraitAssetId: null, displayOrder: 8,
  },
};

const commanders = {
  'commander.alphonse': {
    id: 'commander.alphonse', name: 'アルフォンス', fullName: 'アルフォンス・バウムガルテン',
    age: 17, gender: '男性', profession: '聖騎士', displayOrder: 1, portraitAssetId: null,
    profile: '情熱的な聖騎士。民思いで情に厚く、絆されやすい。信じたことに一直線で暴走しがちだが、気さくで人に好かれる。今年18歳になる。',
    perspective: '感情、本音、人間関係、当事者が言葉にできない事情に目を向ける。',
    relationships: ['双子の妹ローズモンドを人目も憚らず溺愛し、表向きには煙たがられている。'],
  },
  'commander.rosemond': {
    id: 'commander.rosemond', name: 'ローズモンド', fullName: 'ローズモンド・バウムガルテン',
    age: 17, gender: '女性', profession: '姫騎士', displayOrder: 2, portraitAssetId: null,
    profile: '冷静な姫騎士。常に冷静な頭脳派。一見プライドが高く冷たそうに見えるが、兄と同じく民を大切にする。今年18歳になる。',
    perspective: '制度、構造、利害、仕組みの歪みに目を向ける。',
    relationships: ['双子の兄アルフォンスの溺愛を表向きは呆れて嫌がるが、人目を気にしている面があり、内心では嬉しく思っている。'],
  },
};

const regions = {
  alba: {
    id: 'alba', name: 'アルバ', kind: 'normal', implemented: true, displayOrder: 1,
    description: '王都を囲む環状の防衛都市。各都市から戦士が集まる。',
    trialIds: ['alba.small1', 'alba.small2', 'alba.major'],
    entrySceneId: 'alba.small1.intro', closingSceneId: 'alba.closing', theoInvestigationId: 'investigation.alba',
  },
  hexerei: {
    id: 'hexerei', name: 'ヘクセレイ', kind: 'normal', implemented: false, displayOrder: 2,
    description: '古くから魔導士が集う都市。', trialIds: [], entrySceneId: null, closingSceneId: null, theoInvestigationId: null,
  },
  anchoring: {
    id: 'anchoring', name: 'アンカリング', kind: 'normal', implemented: false, displayOrder: 3,
    description: '商業と物流の拠点。王都との取引・通行に御用達商人の認可制度が関わる。',
    trialIds: [], entrySceneId: null, closingSceneId: null, theoInvestigationId: null,
  },
  rude: {
    id: 'rude', name: 'ルード', kind: 'normal', implemented: false, displayOrder: 4,
    description: '深い森のアマゾネスの集落。新しい酋長が物流と交流を受け入れた。',
    trialIds: [], entrySceneId: null, closingSceneId: null, theoInvestigationId: null,
  },
  ehrenfels: {
    id: 'ehrenfels', name: 'エーレンフェルス', kind: 'final', implemented: false, displayOrder: 5,
    description: '王城があり、王族・貴族など富豪層が住む中央都市。',
    trialIds: [], entrySceneId: null, closingSceneId: null, theoInvestigationId: null,
  },
};

const textBlocks = {};
function text(id, speakerId, body, extra = {}) {
  textBlocks[id] = { id, textRevision: 1, speakerId, text: body, contentStatus: 'fixture', informationIdsOnAcknowledge: [], ...extra };
  return id;
}

text('text.intro.notice', null, 'これは「バウムガルテン王国の継承戦」のアルバまでの縦切り試作です。ここからの台本・選択肢・情報・配点・評価理由は、機能確認用の仮データです。正式な物語や政策評価ではありません。');
text('text.intro.chancellor', 'support.chancellor', '同行者の話を聞くことで、別の案が見える場合があります。ただし、追加案が常に最善とは限りません。誰を選んでも、試練は最後まで進められます。');
text('text.departure', null, '両陣営が決まり、王都から旅へ出る。試作で進めるのはアルバの三つの試練まで。相手陣営の旅や成績は、この試作では生成しない。');

text('text.alba.small1.situation', null, '【仮の状況】防衛家系の若者が、家の期待と自分の進路の間で迷っている。まずは現場で、どのように話を進めるかを判断する。家系の期待を、法による世襲強制とは扱わない。', { informationIdsOnAcknowledge: ['info.alba.small1.local'] });
text('text.alba.small1.alphonse', 'commander.alphonse', '【仮の気づき】「期待に応えたい」と「別の道へ進みたい」が、同時にあるのかもしれない。どちらか一つに決めつけず、本人の言葉を聞きたい。', { condition: { commanderIs: 'commander.alphonse' }, informationIdsOnAcknowledge: ['info.alba.commander.alphonse'] });
text('text.alba.small1.rosemond', 'commander.rosemond', '【仮の気づき】家の期待と、防衛を支える人材の確保は、分けて考えたい。本人の選択を支える仕組みがどこにあるか、確かめましょう。', { condition: { commanderIs: 'commander.rosemond' }, informationIdsOnAcknowledge: ['info.alba.commander.rosemond'] });
text('text.alba.small1.harold', 'char.harold', '【仮会話】家の誇りは支えにもなる。それでも、期待を背負う本人が何を望んでいるかは、家の評判だけでは分からない。');
text('text.alba.small1.frederica', 'char.frederica', '【仮会話】生まれで道を決められる息苦しさは、私にも覚えがある。本人が口にしにくい希望も、聞く場があれば変わるかもしれない。');

text('text.alba.small2.situation', null, '【仮の危機】熟練兵の経験知が受け継がれず、防衛の現場で連携が乱れている。同行する四人へ役割を振り、三つの作戦セットから対応を選ぶ。', { informationIdsOnAcknowledge: ['info.alba.small2.local'] });
text('text.alba.small2.lisette', 'char.lisette', '【仮会話】合図を見ても、その後に誰が何をするかが伝わらなければ動けません。遠くを見る役と、近くで道を作る役をつなぐ必要があります。');
text('text.alba.small2.sandro', 'char.sandro', '【仮会話】受け入れる場所を先に整えておけば、現場の手が止まりにくい。四人が一か所へ集まるだけでは足りないだろうね。');

text('text.alba.major.situation', null, '【仮の政策判断】進路を選ぶ自由と、防衛の伝統・技術継承をどう両立するか。小試練で見た問題を踏まえ、現王に提出する政策案を選ぶ。この場で制度は実施しない。', { informationIdsOnAcknowledge: ['info.alba.major.local'] });
text('text.alba.major.harold', 'char.harold', '【仮会話】経験を教える役と、家を継ぐ役を同じ人に限る必要はない。教え手を担える人がいるか、本人の意思も含めて確かめる案を考えられる。');
text('text.alba.major.heidemarie', 'char.heidemarie', '【仮会話】新しい道を選んだ後も、相談できる場所が必要だと思います。案を提出しただけで、迷いがすべて消えるとは言えません。');
text('text.alba.theo.report', 'support.theo', '【仮調査報告】保管された直近の申し送り帳を照合した。交代時の合図の手順だけ、三冊とも記入欄が空白だった。これは試作のために置いた具体的事実だ。誰の責任か、どの政策が正解かまでは示していない。');
text('text.alba.closing', 'support.chancellor', 'アルバの三つの判断を記録しました。今回提出したのは政策案であり、実施結果ではありません。ここで縦切り試作は終了です。地図でアルバの記録と保存を確認できます。継承判定や正式な王国史への登録は行いません。');

// Optional travel dialogue deliberately has no information or gameplay effect.
text('text.travel.olivel', 'char.olivel', '【効果なしの仮雑談】ひと息つこうか。考えごとの途中でも、休めるときには休んでおこう。');

function choice(id, label, points, feedback, extra = {}) {
  const feedbackId = text(`text.${id}.feedback`, 'support.chancellor', feedback, extra.crisisRoleFallbacks ? { crisisAssignments: true } : {});
  return { id, label, points, contentStatus: 'fixture', feedbackBlockIds: [feedbackId], governanceTags: [], ...extra };
}

const trials = {
  'alba.small1': {
    id: 'alba.small1', regionId: 'alba', kind: 'small', ordinal: 1, interaction: 'decision', maxPoints: 5,
    title: '小試練① — 進路と家の期待', contentStatus: 'fixture',
    entrySceneId: 'alba.small1.intro', decisionSceneId: 'alba.small1.decision',
    choices: [
      choice('choice.alba.small1.a', '仮案A：家族の説明から話を進める', 0, '【仮評価・0点】家族が重ねた経験を聞く入口になる。一方、本人の希望を別に確認する機会が残る。この点数は動作確認用であり、正式な善悪評価ではない。'),
      choice('choice.alba.small1.b', '仮案B：若者本人の希望から話を進める', 3, '【仮評価・3点】本人の希望を言葉にする入口になる。一方、家族との対話や引き継ぎの扱いはまだ残る。正式配点は未決。'),
      choice('choice.alba.small1.c', '仮案C：本人と家族の聞き取りを別々に設ける', 5, '【仮評価・5点】それぞれの考えを分けて確かめる段取りを示した。ただし、聞き取りに時間がかかり、両者の希望が一致する保証もない。正式配点は未決。'),
    ],
  },
  'alba.small2': {
    id: 'alba.small2', regionId: 'alba', kind: 'small', ordinal: 2, interaction: 'crisisPlan', maxPoints: 5,
    title: '小試練② — 失われた経験知', contentStatus: 'fixture',
    entrySceneId: 'alba.small2.intro', decisionSceneId: 'alba.small2.decision',
    choices: [
      choice('choice.alba.small2.a', '作戦A：入口の維持を優先する', 0, '【仮評価・0点】入口を支える分担を選んだ。一方、現場全体の合図の共有には課題が残る。四人の関与と採点を確かめるための仮結果。', {
        crisisRoleFallbacks: { melee1: '入口を支えて防衛の線を保つ。', melee2: '入口までの通路を確保する。', ranged: '遠方の動きを見て入口へ合図を送る。', healer: '入口の後方で受け入れ場所を整える。' },
      }),
      choice('choice.alba.small2.b', '作戦B：住民の誘導を優先する', 3, '【仮評価・3点】誘導と受け入れの分担を選んだ。一方、防衛側と誘導側の連絡を維持する課題が残る。正式配点は未決。', {
        crisisRoleFallbacks: { melee1: '誘導路の先頭で通行を整える。', melee2: '後方から人の流れを支える。', ranged: '高所から混雑を確認して合図する。', healer: '誘導先で休息と手当ての準備をする。' },
      }),
      choice('choice.alba.small2.c', '作戦C：合図を共有して持ち場をつなぐ', 5, '【仮評価・5点】担当を分け、合図で各所をつなぐ案を選んだ。共有のための時間が必要で、今回の対応だけでは経験知の継承までは解決しない。正式配点は未決。', {
        crisisRoleFallbacks: { melee1: '入口で共有した合図に合わせて対応する。', melee2: '入口と誘導路の間をつなぎ、伝達を確かめる。', ranged: '離れた持ち場へ共通の合図を伝える。', healer: '受け入れ場所の状況を合図で返す。' },
      }),
    ],
  },
  'alba.major': {
    id: 'alba.major', regionId: 'alba', kind: 'major', ordinal: 3, interaction: 'decision', maxPoints: 10,
    title: '大試練 — 継ぐこと、選ぶこと', contentStatus: 'fixture',
    entrySceneId: 'alba.major.intro', decisionSceneId: 'alba.major.decision',
    choices: [
      choice('choice.alba.major.a', '仮政策A：家系を通じた技術継承を支える', 0, '【仮評価・0点】既存のつながりを支える政策案として記録した。本人の進路選択をどう守るかが残る。政策は未実施で、配点・評価理由とも正式決定ではない。', { policyId: 'policy.alba.fixture.a', governanceTags: ['stability'] }),
      choice('choice.alba.major.b', '仮政策B：希望者に技術を学ぶ機会を開く', 6, '【仮評価・6点】家系の外からも学ぶ入口を作る政策案として記録した。教え手の負担と、防衛を続ける人材の確保が残る。政策は未実施。正式配点は未決。', { policyId: 'policy.alba.fixture.b', governanceTags: ['people', 'reform'] }),
      choice('choice.alba.major.c', '仮政策C：継承の役割と進路相談を分けて整える', 10, '【仮評価・10点】技術を受け継ぐ仕組みと、本人の進路を支える仕組みを整理する案として記録した。調整の手間が増え、必要な担い手が集まる保証はない。政策は未実施。正式配点は未決。', { policyId: 'policy.alba.fixture.c', governanceTags: ['coordination', 'fairness'] }),
      choice('choice.alba.major.extra', '仮追加案：限られた範囲で継承方法の検証を先行する', 6, '【仮評価・6点】取得した情報をもとに、継承方法を限定した範囲で確かめる案を記録した。検証できる範囲は狭く、都市全体への対応は先送りになる。追加案を選んでも満点にはならない。正式配点は未決。', {
        policyId: 'policy.alba.fixture.extra', governanceTags: ['reform', 'coordination'],
        condition: { any: [
          { all: [{ partyHas: 'char.harold' }, { conversationHeard: 'conversation.alba.major.harold' }, { infoAcquired: 'info.alba.major.harold' }] },
          { infoAcquired: 'info.alba.theo' },
        ] },
      }),
    ],
  },
};

const scenes = {
  intro: { id: 'intro', title: '歴史書の扉', blocks: ['text.intro.notice', 'text.intro.chancellor'], conversationIds: [] },
  departure: { id: 'departure', title: '王都出発', blocks: ['text.departure'], conversationIds: [] },
  'alba.small1.intro': { id: 'alba.small1.intro', title: '進路と家の期待', blocks: ['text.alba.small1.situation', 'text.alba.small1.alphonse', 'text.alba.small1.rosemond'], conversationIds: [] },
  'alba.small1.decision': { id: 'alba.small1.decision', title: '現場での対応を選ぶ', blocks: [], conversationIds: ['conversation.alba.small1.harold', 'conversation.alba.small1.frederica'] },
  'alba.small2.intro': { id: 'alba.small2.intro', title: '失われた経験知', blocks: ['text.alba.small2.situation'], conversationIds: [] },
  'alba.small2.decision': { id: 'alba.small2.decision', title: '三つの作戦セット', blocks: [], conversationIds: ['conversation.alba.small2.lisette', 'conversation.alba.small2.sandro'] },
  'alba.major.intro': { id: 'alba.major.intro', title: '継ぐこと、選ぶこと', blocks: ['text.alba.major.situation'], conversationIds: [] },
  'alba.major.decision': { id: 'alba.major.decision', title: '現王へ提出する政策案', blocks: [], conversationIds: ['conversation.alba.major.harold', 'conversation.alba.major.heidemarie'] },
  'alba.closing': { id: 'alba.closing', title: 'アルバの判断記録', blocks: ['text.alba.closing'], conversationIds: [] },
  map: { id: 'map', title: '地図ホーム', blocks: [], conversationIds: ['conversation.travel.olivel'] },
};

const conversations = {};
function conversation(id, actorId, sceneId, blockId, informationId) {
  conversations[id] = {
    id, contentStatus: 'fixture', kind: 'trialOpinion', participantIds: [actorId], sceneIds: [sceneId],
    condition: { partyHas: actorId }, blockIds: [blockId], informationIdsOnComplete: informationId ? [informationId] : [],
  };
}
conversation('conversation.alba.small1.harold', 'char.harold', 'alba.small1.decision', 'text.alba.small1.harold', 'info.alba.small1.harold');
conversation('conversation.alba.small1.frederica', 'char.frederica', 'alba.small1.decision', 'text.alba.small1.frederica', 'info.alba.small1.frederica');
conversation('conversation.alba.small2.lisette', 'char.lisette', 'alba.small2.decision', 'text.alba.small2.lisette', 'info.alba.small2.lisette');
conversation('conversation.alba.small2.sandro', 'char.sandro', 'alba.small2.decision', 'text.alba.small2.sandro', 'info.alba.small2.sandro');
conversation('conversation.alba.major.harold', 'char.harold', 'alba.major.decision', 'text.alba.major.harold', 'info.alba.major.harold');
conversation('conversation.alba.major.heidemarie', 'char.heidemarie', 'alba.major.decision', 'text.alba.major.heidemarie', 'info.alba.major.heidemarie');
conversations['conversation.travel.olivel'] = {
  id: 'conversation.travel.olivel', kind: 'travelSolo', contentStatus: 'fixture',
  participantIds: ['char.olivel'], sceneIds: ['map'], condition: { partyHas: 'char.olivel' },
  blockIds: ['text.travel.olivel'], informationIdsOnComplete: [],
};

const information = {};
function info(id, trialId, summary, sourceKind, sourceActorId, sourceSceneId) {
  information[id] = { id, regionId: 'alba', trialId, summary, sourceKind, sourceActorId, sourceSceneId, contentStatus: 'fixture' };
}
info('info.alba.small1.local', 'alba.small1', '【仮】防衛家系の若者が家の期待と自分の進路の間で迷っている。法的な世襲強制を前提にしない。', 'local', null, 'alba.small1.intro');
info('info.alba.commander.alphonse', 'alba.small1', '【仮】期待に応える気持ちと別の道を望む気持ちは、同時にありうる。', 'commander', 'commander.alphonse', 'alba.small1.intro');
info('info.alba.commander.rosemond', 'alba.small1', '【仮】家の期待と人材確保の仕組みを分けて考え、本人の選択を支える手段を確かめる。', 'commander', 'commander.rosemond', 'alba.small1.intro');
info('info.alba.small1.harold', 'alba.small1', '【仮】家の誇りは支えにも重圧にもなる。本人の希望は家の評判だけでは分からない。', 'companion', 'char.harold', 'alba.small1.decision');
info('info.alba.small1.frederica', 'alba.small1', '【仮】生まれで道を決められる息苦しさがある。口にしにくい希望も聞く機会が必要。', 'companion', 'char.frederica', 'alba.small1.decision');
info('info.alba.small2.local', 'alba.small2', '【仮】熟練兵の経験知が受け継がれず、現場の連携が乱れている。', 'local', null, 'alba.small2.intro');
info('info.alba.small2.lisette', 'alba.small2', '【仮】合図だけでなく、その後の役割の共有が必要。', 'companion', 'char.lisette', 'alba.small2.decision');
info('info.alba.small2.sandro', 'alba.small2', '【仮】受け入れ場所を先に整え、四人の役割を分けることを考える。', 'companion', 'char.sandro', 'alba.small2.decision');
info('info.alba.major.local', 'alba.major', '【仮】防衛の技術継承と個人の進路選択を扱う政策案を現王へ提出する。その場で制度は実施しない。', 'local', null, 'alba.major.intro');
info('info.alba.major.harold', 'alba.major', '【仮】経験を教える役と家を継ぐ役を分け、教え手の意思を確かめる案。', 'companion', 'char.harold', 'alba.major.decision');
info('info.alba.major.heidemarie', 'alba.major', '【仮】進路を選んだ後も相談できる場所を考える。提出だけで迷いが消えるとは限らない。', 'companion', 'char.heidemarie', 'alba.major.decision');
info('info.alba.theo', 'alba.major', '【仮調査】直近の申し送り帳三冊すべてで、交代時の合図の手順欄が空白だった。出典：テオによる保管帳の照合。', 'theo', 'support.theo', 'alba.major.decision');

export const content = {
  title: 'バウムガルテン王国の継承戦', subtitle: 'アルバまでの縦切り試作',
  contentVersion: 'alba-fixture-0.3.1', contentStatus: 'fixture', mode: 'albaPrototype',
  fixtureNotice: '台本・選択肢・情報・配点・評価理由・統治タグは機能確認用の仮データです。正式な内容や政策評価ではありません。',
  introSceneId: 'intro', departureSceneId: 'departure', mapSceneId: 'map',
  commanders, characters, regions, trials, scenes, textBlocks, conversations, information,
  investigations: {
    'investigation.alba': {
      id: 'investigation.alba', regionId: 'alba', contentStatus: 'fixture',
      reportBlockIds: ['text.alba.theo.report'], informationId: 'info.alba.theo',
    },
  },
  storyEvents: {},
};
