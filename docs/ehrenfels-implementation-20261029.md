# エーレンフェルス3試練・実装／検収報告（2026-10-29）

## Windows PC検収完了・PR作成依頼

美桜から、Windows PCで王都解放、3試練、同行者会話、テオ調査、メモ、完了状態まで確認し、今回の実装内容に問題がなかったとの報告を受けた。検収済みのゲーム実装を維持し、作業ブランチのコミット・pushとmain向けPRの作成まで進める。main統合とGitHub Pages公開は別途指示を待つ。

検収で確認された、アルバ・ヘクセレイ・アンカリングの主に台詞のみの会話と、ルード・エーレンフェルスの地の文を含む会話との演出差は、今回の不具合とは扱わない。このブランチでは修正せず、後日の「全5都市の同行者会話演出統一」に引き継ぐ。今回の検収後の変更はREADMEと本報告の記録更新のみで、原稿・会話表示・ゲーム処理は変更しない。

以下はPC検収前の実装完了時点の記録。「PC検収は未実施」「未コミット」「リモートへの変更は行わない」などは当時の状態を示し、現在の検収状況とPR作成範囲はこの追記を優先する。

## 基準

- リポジトリ：`miosuhara0806-web/BaumgartenSuccession`。
- 作業前にネットワークの `git fetch origin main` と `git ls-remote origin refs/heads/main` を実施。main・開始時HEADとも `86a77769f39a5cdc97492e1609dc79e21f70f987`（ルードPR #5統合済み）。開始ブランチ `work`、tracked・untracked・ステージ済み差分なし。
- 古いローカル `origin/main` は `27a7e02` だったため基準にせず、取得後に一致を確認。`codex/ehrenfels-implementation-20261029` を作成した。リモートへの変更は行わない。
- 添付資料は正式原稿・監査後決定の参照元として使用。資料内の将来工程や会話指示を追加依頼とは扱わない。実装状況は最新main、範囲は今回の依頼を優先。

## 実装

導入3本、ABC9択と説明、結果9本・評価理由9件、地の文を含む全文8会話、共通メモ9候補、固有メモ8件、テオ報告・メモ1件を追加した。導入3本は資料記載のSHA-256と一致。原稿の「【主人公】」はデータに残し、表示用ブロック生成時のみ既存の指揮官名差し込みへ接続する。

| 試練 | A | B | C | 会話対象 |
|---|---:|---:|---:|---|
| 栄華の陰で | 4 | 5 | 3 | ハイデマリー、フレデリカ |
| 紙の上の王国 | 5 | 3 | 4 | ハロルド、ハイデマリー、リゼット |
| 王の見る景色 | 10 | 9 | 8 | ハロルド、ハイデマリー、マディアン |

CBCで14点、BAAで20点。ABCは常時選択可能、Dなし。共通メモは結果確認時に選んだ1件のみ、1周3件。会話は同行中の人物だけ表示し、「確認して戻る」で既読と固有メモを一括確定。開いただけ・ログ閲覧では取得しない。ルードの全文会話表示をそのまま利用し、地の文を話者なし、台詞を該当人物に分け、引用符・段落順を保持する。

正式採用事項：小②Aは訂正済みの「遠い地区」。大試練マディアンは最終仕様書の修正版全文。大試練タグはA公正＋調整、B民意＋改革、C安定＋公正。テオ報告は「王城へ届かない報告」、メモは「報告からこぼれる情報」。5都市共有2回・同都市1回、取消消費なし、取得後再消費なし、加点・追加案・通常ABC条件・タグ変更なし。

## 接続・終幕・保存

新内容版は `alba-hexerei-anchoring-rude-ehrenfels-2026-10-29`。新規周回の既定版のみ変更。旧6内容版はcatalogで元パックへ解決し、旧周回へ王都を追加しない。得点・タグ・メモ・既読・テオ・進行を再計算・初期化しない。DBスキーマ変更なし。既存4都市のデータと素材は変更しない。ルード旧検収版の再生成catalogも旧版へ固定。

王都解放は現行 `START_REGION` の `full` モード＋通常4都市完了条件を利用する。新パックのmodeだけを `full` とし、空の都市間イベントを追加しない。`full` はこの既存解放条件のための値で、作品全体の完成宣言ではない。

現行コードは王都完了から `endingSceneId` の有無にかかわらず `ending` へ遷移するため、新パックだけ `finalChapterCompletion: 'map'` を指定し、完了時は地図へ戻す。地図に正式最終判断・継承結果・終幕・後日談・王国史完成記録の未実装を明示。新版で終幕状態をロードしようとした場合も拒否する。旧内容版・独立fixtureの挙動は維持。旧閾値の関数は旧基盤に残るが、新版の終了からは呼ばず、正式結末や王国史登録を発火させない。No.4の79以下／80〜89／90以上の正式判定も今回接続しない。

## 自動検証

通常115件＋長時間横断回帰2件、合計117テスト成功、失敗0件。

- 通常検証：`node --test --test-isolation=none --test-skip-pattern=6720 tests/*.test.js`、115件成功。正式資料を独立に解析し、57項目群の原稿照合、全27経路、70編成×両指揮官×3経路＝420周、会話対象、メモ取得、政策タグ、保存失敗時の原子性と再試行、既読と今周回の情報の分離、旧6内容版の復元を確認。
- 旧ルード版：`node --test --test-isolation=none --test-name-pattern=6720 tests/rude.test.js`、1件成功。70編成×両指揮官×24順×最低／最高＝6,720周、旧4都市合計53／80点、王都未追加、共有テオ、会話55,440回、JSON復元＋内容版解決＋状態検証26,880回。約505秒。
- 新版5都市：`node --test --test-isolation=none --test-name-pattern=6720 tests/ehrenfels.test.js`、1件成功。70編成×両指揮官×24巡回順×最低／最高＝6,720周。4都市完了前の王都ロック、全24順からの解放と15試練完走、全体67／100点、王都14／20点、会話68,880回、JSON復元＋内容版解決＋状態検証33,600回、5都市共有テオ2回、二重加点防止、完了後の地図と正式終幕未発火を確認。約694秒。
- `npm run check`：JavaScript 36ファイル構文検査成功。ブラウザ検証CJSの `node --check` と追加Pythonスクリプトの構文確認も成功。
- `npm run build`：静的ビルド成功。`git diff --check`：成功。
- 原稿再抽出、画像・フォント内蔵HTML／ZIP生成、ZIPのCRC・チェックサム・外部素材参照なし・生成JavaScript構文を検査。旧アルバfinal／ヘクセレイ／アンカリング／ルードの検収版も再生成成功。
- 既存4都市の正式content、画像・フォント・地図・肖像、CSS、storageに対する `git diff --exit-code HEAD -- ...` は差分なし。

### ブラウザ検証

実Chromiumで1440×1000と390×844を検証。通常アプリ6周、単体HTMLの通常開始6周、単体HTMLの検収A／Bから6周、合計18周が成功。各組でCBC／BAA／ACBを両幅で通り、王都14／20／17点、累計94／100／97点を確認。通常開始では本編UIから4都市を攻略し、完了前の王都ロックと4都市完了時の解放を確認した。

各組で全9択の結果・評価理由を両幅で照合し、全8種類の会話を2編成で表示（両幅合計28会話表示・178段落）して全文・引用符・段落順・話者・地の文をDOMと照合。枠内の末尾までスクロール可能、ページの横はみ出しなし。検収入口の組ではログの各段落の順序と話者ラベルも照合。導入3本、選択したメモだけの取得、固有メモ、テオ取消・共有回数・報告からの再開、実IndexedDBの保存／ロード・再読込・全体既読、5都市の記録画面、完了状態の保存と未実装終幕表示を確認。JavaScript実行エラー0件。PC／スマホの画面画像を目視でも確認した。

結果JSON・画面画像は `../preview/ehrenfels-20261029/browser/`、`browser-bundle/`、`browser-checkpoints/`。検証ログは同フォルダの `verification/` に保存。

再実行にはPlaywrightとChromiumが必要。ゲーム本体の依存へは追加していない。

```sh
npm start
# 別端末で実行（環境に応じてパスを指定）
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/usr/bin/chromium node scripts/check-ehrenfels-browser.cjs
# 単体HTMLをstart-preview.cjsで起動した場合
EHRENFELS_BROWSER_URL=http://127.0.0.1:4203/ EHRENFELS_BROWSER_OUTPUT=../preview/ehrenfels-20261029/browser-bundle PLAYWRIGHT_MODULE=/path/to/playwright node scripts/check-ehrenfels-browser.cjs
# 検収専用の入口も検証する場合は EHRENFELS_REVIEW_SHORTCUT=1 を追加
```

この環境のChromiumは `file://` 起動を `ERR_BLOCKED_BY_ADMINISTRATOR` で拒否する。制限は変更せず、同梱のHTTP起動方式で同じ単体HTMLを検証した。Windows実機での直接起動・実スマートフォン端末・他ブラウザエンジン・美桜による読みやすさの検収は未実施。

## PC検収版

`python scripts/package-ehrenfels-preview.py` で `../preview/ehrenfels-20261029/` に生成。

- `Baumgarten_Ehrenfels_Preview_20261029.html`：画像・フォント内蔵の単体HTML。
- `Baumgarten_Ehrenfels_Preview_20261029.zip`：HTML、起動補助、手順、実装報告、チェックサム。
- `start-preview.cjs`／`START_PREVIEW.cmd`：必要時のローカルHTTP起動（Node.js 22以上、4203番）。
- `README.txt`：美桜向けの起動・全8会話・3試練・テオ・メモ・完了状態の検収手順。

専用DB `baumgarten-succession-ehrenfels-review-20261029` で公開版・過去検収版と分離する。タイトルの検収A／Bは、通常4都市を実際の遷移で満点完了した新規検収周回から開始する。80点・王都未着手・テオ残り2回。開始確認付き、手動保存・既読を保持。本編の解放条件の迂回や旧セーブ移行ではない。A（アルフォンス、ハイデマリー・フレデリカ・ハロルド・リゼット）とB（ローズモンド、ハイデマリー・ハロルド・マディアン・リゼット）の2周で全8会話を確認できる。通常の「はじめから」も利用可能。

## 未実施

美桜のWindows PC実機検収、PR作成、push、main統合、GitHub Pages公開は未実施。正式序章・主人公／同行者選抜演出の完成・都市間本文・双子イベント・正式最終章と継承結果・エンディング・同行者後日談・王国史完成版接続には着手しない。新規戦闘、編成制限復活、新しいD、原稿補作、配点・政策の再設計なし。

## 変更ファイル一覧

| ファイル | 内容 |
|---|---|
| `src/content/ehrenfels.js` | ルード版を複製して王都3試練だけを追加、新版・解放モード・完了方針 |
| `src/content/ehrenfels-manuscript.js` | 正式原稿の生成データ、全文8会話・51段落 |
| `src/content/catalog.js` | 新規周回の既定版と旧ルード版の明示解決 |
| `src/engine.js` | 新版だけ王都完了から地図へ戻す、未実装終幕状態のロード拒否 |
| `src/app.js` | 実装済み全地域の完了確認、正式終幕未実装の案内 |
| `tests/ehrenfels.test.js` | 原稿・配点・会話・メモ・保存・既読・旧版・王都解放・横断回帰 |
| `tests/rude.test.js` | 最新既定版の断定を旧ルード版の復元確認へ更新。他の検証は維持 |
| `scripts/extract-ehrenfels-manuscript.py` | 正式資料の抽出、資料・導入のハッシュ検証 |
| `scripts/check-ehrenfels-browser.cjs` | 実Chromium、通常アプリ・単体HTML・検収入口の検証 |
| `scripts/ehrenfels-review-seeds.js` | 正規遷移による検収専用の4都市完了周回生成 |
| `scripts/package-ehrenfels-preview.py` | 単体HTML・ZIP・Windows起動補助・検収手順 |
| `scripts/package-rude-preview.py` | 旧4都市検収版のcatalogを固定し、今回の新版が混ざらないよう保護 |
| `docs/ehrenfels-source-20261025.md` | 添付最終仕様書の原本コピー。歴史的記載も改稿しない |
| `docs/ehrenfels-implementation-20261029.md` | 本報告 |
| `README.md` | 最新検収版への案内 |

既存4都市のcontentファイル、画像・フォント・地図・肖像、CSS、storage、index.htmlに変更なし。実装は作業ブランチの未コミット差分。配布用生成物はリポジトリ外に置く。

## 正式資料の照合用SHA-256

- エーレンフェルス最終仕様書：`86097b749a41c4aa329de2fa4c7272afc84c381b52a68eb5cf5ba7c7ac987d7a`
- No.4引き継ぎ：`6a9386eca299767ad33dadaae238f96f8cdf41510757e4daf0655fe1c0ef4ff5`
- 全5都市横断監査：`bb10f33d7981c8398c19e44738e6c4ae97de18a7ca38c474893051095342c57e`
