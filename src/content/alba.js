// Approved Alba data supplied on 2026-10-18. Missing scripts stay explicitly pending.
// The frozen fixture pack remains available only for saved prototype runs.
import { content as legacy } from './legacy.js';

export const content = structuredClone(legacy);
content.contentVersion = 'alba-approved-2026-10-18';
content.contentStatus = 'partial';
content.partySelection = 'free';
content.enforceChoiceScores = true;
content.subtitle = 'アルバ章・正式データ検収版';
content.fixtureNotice = '同行者会話・共通情報・選択肢・配点・リゼットDは正式データです。通常9択の選択後本文は原稿待ちです。導入小説と縦スクロール表示は10月16日版を維持。序章・出発・帰還・テオの報告には既存の仮内容が残ります。';

// This is a status notice, not newly authored scenario prose.
content.textBlocks['text.intro.notice'].text = content.fixtureNotice;
content.textBlocks['text.intro.notice'].textRevision = 2;
content.textBlocks['text.intro.notice'].contentStatus = 'partial';

// Do not promote old prototype dialogue, information or reactions to approved scripts.
for (const id of Object.keys(content.conversations)) if (id.startsWith('conversation.alba.')) delete content.conversations[id];
for (const id of Object.keys(content.information)) if (id !== 'info.alba.theo') delete content.information[id];
for (const id of Object.keys(content.textBlocks)) {
  if (id.startsWith('text.alba.') && !id.includes('.introduction.review.') && !['text.alba.theo.report', 'text.alba.closing'].includes(id)) delete content.textBlocks[id];
  if (id.startsWith('text.choice.alba.')) delete content.textBlocks[id];
}

const dialogues = {
  "small1": {
    "harold": [
      "……私も、代々この街を守ってきた家の生まれです",
      "受け継いできたものには誇りがあります。ですが、それを次の世代にも同じように背負わせるべきかと問われると……簡単には答えられません",
      "ただ、長い年月をかけて培われた技術まで失われるのは、惜しいと思います"
    ],
    "lisette": [
      "……家族の期待に応えたい気持ちは、分かります",
      "私自身は弓を選んで、ここまで努力してきました。でも……誰もが同じ道を望むとは限りません",
      "家の誇りを大切にすることと、自分の進む道を選ぶこと。両方できれば、いいのですが……"
    ],
    "frederica": [
      "私はアルバの生まれじゃない。でも、今はこの街を守る側にいる",
      "この街には、ほかの都市から来て働いている者もいるわ。家柄だけで守りが成り立っているわけじゃない",
      "ただ、名家にしか伝わっていない経験もあるでしょうね。それをどう残すかは、別に考える必要があると思う"
    ]
  },
  "small2": {
    "harold": [
      "……年配の兵士が話していた道は、昔から防衛隊が利用してきた経路です",
      "長くこの街を守ってきた者だからこそ、知っていることもあるでしょう",
      "ただ、街の様子は年々変わっています。過去の経験だけで、今の状況を判断するのは危険かもしれません"
    ],
    "frederica": [
      "昔の道を知っていることと、今の街を知っていることは別よ",
      "新しい建物が増えて、人の流れも変わっている。避難させるなら、今の通りの状況を確かめないと",
      "特に住民が集中する場所は気をつけた方がいい。魔物を避けても、逃げる途中で混乱が起きたら意味がないわ"
    ],
    "sandro": [
      "おいおい、魔物を追い払うだけで終わりじゃねえぞ",
      "怪我人が出たら、どこで手当てするかも考えとけ。戦ってる連中のすぐ後ろじゃ、落ち着いて治療もできねえ",
      "動けねえ奴を運ぶ人手も必要だ。そこんところ、忘れんなよ"
    ],
    "lisette": [
      "……見張り台からなら、魔物の動きを先に追えます",
      "進路を見極めて迎撃地点を絞れば、兵を広く散らさずに済むはずです",
      "ただ……予測が外れた時は、別の通りへの対応が遅れるかもしれません"
    ]
  },
  "major": {
    "harold": [
      "……我が家でも、防衛の技術は親から子へと受け継がれてきました",
      "ですが、先ほどの魔物への対応を見て、改めて思ったのです。長年の経験は確かに大切ですが、それだけでは守れないものもあるのだと",
      "家の誇りを残すことと、アルバの守りを未来へつなぐこと。必ずしも同じ方法である必要はないのかもしれません"
    ],
    "lisette": [
      "……私が弓を学び始めた時、家族は喜んでくれました",
      "でも、あの青年のように別の道を望んでいたら……同じように応援してもらえたでしょうか",
      "……防衛の技術を学びたい人が、家柄に関係なく学べるようになれば。家を継ぐ人にとっても、少しは選択の自由が生まれるかもしれません"
    ],
    "frederica": [
      "私はこの街の名家に生まれたわけじゃない。でも、アルバを守る仕事をしている",
      "防衛の技術を学ぶ道が広がるのはいいことだと思う。ただ、教科書を読んだだけで現場の判断ができるようになるわけじゃない",
      "昔からの経験をどう伝えるか。そして、新しく入ってくる人を誰が育てるのか。そこまで考えないと、仕組みだけ作っても続かないわ"
    ]
  }
};
const memos = {
  "small1": [
    [
      "youth",
      "防衛家系の青年",
      "アルバの防衛を代々担ってきた家に生まれた青年。\n家族の仕事に誇りを持つ一方で、自身は職人になる道を望んでいる。"
    ],
    [
      "succession",
      "防衛職の継承",
      "アルバには防衛職を世襲する法的義務はない。\nしかし、代々防衛を担ってきた家では、家業を継ぐことへの期待が根強い。"
    ],
    [
      "concern",
      "年長兵士の懸念",
      "青年の希望を否定したいわけではない。\nただ、長年の防衛活動で培われた経験や技術が、後の世代へ伝わらなくなることを心配している。"
    ]
  ],
  "small2": [
    [
      "incursion",
      "魔物の侵入",
      "アルバ市街に魔物が侵入し、防衛隊による迎撃と住民の避難が必要になっている。"
    ],
    [
      "experience",
      "年配兵士の経験",
      "長年アルバを守ってきた兵士は、古くから使われてきた防衛経路や市街の特徴を熟知している。\nただし、現在の街並みとは異なる部分もある。"
    ],
    [
      "current",
      "若手兵士の情報",
      "若い兵士は、建物や道路の変化を含む現在の街の状況を把握している。\n年配兵士の経験と合わせることで、より正確に状況を判断できる。"
    ],
    [
      "rescue",
      "避難と救護",
      "魔物を食い止めるだけでなく、住民の避難誘導や負傷者の救護も考える必要がある。\n限られた人員をどう配分するかが課題となる。"
    ]
  ],
  "major": [
    [
      "freedom",
      "防衛家系と個人の進路",
      "アルバには防衛職の世襲を義務づける法律はない。\nしかし、代々防衛を担う家系には、家業を継ぐことへの強い期待が残っている。\n\n別の職業を望む若者もおり、伝統の継承と個人の自由をどう両立させるかが課題となっている。"
    ],
    [
      "skills",
      "防衛技術の継承",
      "防衛家系には、長年の実戦経験を通じて培われた知識や技術が蓄積されている。\n\n一方、そうした経験の一部は特定の家系や個人に頼っており、後継者がいなくなれば失われるおそれがある。"
    ],
    [
      "change",
      "変化するアルバの街",
      "魔物の侵入への対応では、年配兵士の経験と、若手兵士が把握していた現在の街の情報が、それぞれ役立った。\n\n古くからの知恵を残すだけでなく、街の変化に応じて情報を更新することも必要とされている。"
    ],
    [
      "defenders",
      "防衛の担い手",
      "アルバでは、防衛家系の出身者だけでなく、ほかの都市から来た戦士たちも働いている。\n\n今後、貴重な防衛技術を誰が、どのような方法で受け継いでいくのかが問われている。"
    ],
    [
      "purpose",
      "大試練の目的",
      "二つの小試練で明らかになった課題を踏まえ、アルバの防衛を将来にわたって支えるための政策を考える。\n\n選んだ政策は、現王に提案として提出する。"
    ]
  ]
};

function block(id, speakerId, text, extra = {}) {
  content.textBlocks[id] = { id, speakerId, text, textRevision: 1, contentStatus: 'reviewed', informationIdsOnAcknowledge: [], ...extra };
  return id;
}
const specifications = {
  small1: { title: '小試練①「選ばれた道、選びたい道」', choices: [
    ['a', 'A「青年が望む職人の道を支持する」', 5],
    ['b', 'B「まず家業の訓練を続けるよう勧める」', 3],
    ['c', 'C「職人修業と防衛訓練の両立を提案する」', 4],
  ] },
  small2: { title: '小試練②「警鐘の鳴る場所」', choices: [
    ['a', 'A「魔物の封じ込めを優先する」', 3],
    ['b', 'B「住民の避難を優先する」', 3],
    ['c', 'C「古参兵の経験と若手兵の最新情報を合わせ、防衛・避難・救護を並行させる」', 5],
  ] },
  major: { title: '大試練「守り継ぐもの」', choices: [
    ['a', 'A「防衛家系の継承を尊重しつつ、個人の自由を保障する」', 7],
    ['b', 'B「家柄を問わず学べる公的な防衛教育制度を整備する」', 10],
    ['c', 'C「経験を記録・共有し、防衛技術の継承方法を多様化する」', 9],
  ] },
};
for (const [key, specification] of Object.entries(specifications)) {
  const trialId = `alba.${key}`;
  const trial = content.trials[trialId];
  trial.title = specification.title;
  trial.contentStatus = 'partial';
  trial.interaction = 'decision';
  trial.choices = specification.choices.map(([letter, label, points]) => ({
    id: `choice.${trialId}.${letter}`, label, points, contentStatus: 'reviewed',
    feedbackBlockIds: [], feedbackPending: true, governanceTags: [],
    ...(key === 'major' ? { policyId: `policy.alba.${letter}` } : {}),
  }));
  const intro = content.scenes[trial.entrySceneId];
  intro.title = trial.title;
  intro.blocks = memos[key].map(([key, title, summary]) => {
    const infoId = `info.${trialId}.${key}`;
    content.information[infoId] = {
      id: infoId, title, summary, regionId: 'alba', trialId, sourceKind: 'local',
      sourceActorId: null, sourceSceneId: intro.id, contentStatus: 'reviewed',
    };
    // Use only supplied facts as the temporary briefing; do not invent an introduction novel.
    return block(`text.${trialId}.briefing.${key}`, null, `${title}\n\n${summary}`, { informationIdsOnAcknowledge: [infoId] });
  });
  const decision = content.scenes[trial.decisionSceneId];
  decision.title = key === 'major' ? '現王へ提出する政策案' : '判断を選ぶ';
  decision.conversationIds = Object.entries(dialogues[key]).map(([actor, lines]) => {
    const id = `conversation.${trialId}.${actor}`;
    const actorId = `char.${actor}`;
    content.conversations[id] = {
      id, kind: 'trialOpinion', contentStatus: 'reviewed', participantIds: [actorId],
      sceneIds: [decision.id], condition: { partyHas: actorId }, informationIdsOnComplete: [],
      blockIds: lines.map((line, i) => block(`text.${trialId}.${actor}.${i + 1}`, actorId, `「${line}」`)),
    };
    return id;
  });
}

content.trials['alba.small2'].choices.push({
  id: 'choice.alba.small2.d',
  label: 'D「高所から魔物の進路を見極め、少人数で迎撃地点を絞る」',
  points: 4, contentStatus: 'reviewed', governanceTags: [],
  condition: { all: [{ partyHas: 'char.lisette' }, { conversationHeard: 'conversation.alba.small2.lisette' }] },
  feedbackBlockIds: [
    'リゼットの観測をもとに、防衛隊は魔物の進路を予測し、迎撃地点へ兵を集中させた。',
    '狙いは的中し、魔物の主力を効率よく食い止めることに成功する。',
    'しかし、一部の魔物は予測とは異なる路地へ入り込み、周辺の避難誘導に混乱が生じた。',
    '大きな被害は防げたものの、警戒の薄くなった場所への対応には課題が残った。',
  ].map((line, i) => block(`text.choice.alba.small2.d.feedback.${i + 1}`, null, line)),
  evaluationReason: '魔物の動きを観測し、限られた戦力を効果的に運用した。\n一方、予測外の事態への備えが十分ではなく、一部地域の避難に混乱が生じた。',
});
