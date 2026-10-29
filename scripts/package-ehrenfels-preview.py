#!/usr/bin/env python3
"""Build a self-contained PC acceptance HTML with a separate preview database."""
from pathlib import Path
import base64
import hashlib
import json
import mimetypes
import re
import zipfile
import subprocess

root = Path(__file__).resolve().parents[1]
out = root.parent / 'preview' / 'ehrenfels-20261029'
out.mkdir(parents=True, exist_ok=True)
stem = 'Baumgarten_Ehrenfels_Preview_20261029'
db_name = 'baumgarten-succession-ehrenfels-review-20261029'
modules = [
    ('introductions', 'src/content/alba-introductions.js'),
    ('fixture', 'src/content/fixture.js'),
    ('legacy', 'src/content/legacy.js'),
    ('alba', 'src/content/alba.js'),
    ('albaManuscript', 'src/content/alba-final-manuscript.js'),
    ('albaFinal', 'src/content/alba-final.js'),
    ('hexereiManuscript', 'src/content/hexerei-manuscript.js'),
    ('hexerei', 'src/content/hexerei.js'),
    ('anchoringIntroductions', 'src/content/anchoring-introductions.js'),
    ('anchoringManuscript', 'src/content/anchoring-manuscript.js'),
    ('anchoring', 'src/content/anchoring.js'),
    ('rudeManuscript', 'src/content/rude-manuscript.js'),
    ('rude', 'src/content/rude.js'),
    ('ehrenfelsManuscript', 'src/content/ehrenfels-manuscript.js'),
    ('ehrenfels', 'src/content/ehrenfels.js'),
    ('catalog', 'src/content/catalog.js'),
    ('engine', 'src/engine.js'),
    ('storage', 'src/storage.js'),
]
names = {str((root / path).resolve()): name for name, path in modules}


def imports(code, path):
    def replace(match):
        specifiers, relative = match.groups()
        name = names[str((path.parent / relative).resolve())]
        return 'const {' + re.sub(r'\s+as\s+', ': ', specifiers) + '}=__previewModules.' + name + ';'
    return re.sub(r"import \{([\s\S]*?)\} from '([^']+)';", replace, code)


def data_url(path):
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode()


bundled = []
for name, relative in modules:
    path = root / relative
    code = path.read_text()
    exports = re.findall(r'^export (?:async )?(?:const|function|class) (\w+)', code, re.M)
    code = re.sub(r'^export ', '', imports(code, path), flags=re.M)
    if name == 'storage':
        assert "dbName = 'baumgarten-succession-v1'" in code
        code = code.replace("dbName = 'baumgarten-succession-v1'", f"dbName = '{db_name}'")
    bundled.append('__previewModules.' + name + '=(()=>{\n' + code + '\nreturn {' + ','.join(exports) + '};})();')

# These are separate review runs, built by the actual four-city route.
seeds = subprocess.run(['node', '--input-type=module', '-e',
    "import {createReviewSeeds} from './scripts/ehrenfels-review-seeds.js'; process.stdout.write(JSON.stringify(createReviewSeeds()));"],
    cwd=root, check=True, capture_output=True, text=True).stdout
app = imports((root / 'src/app.js').read_text(), root / 'src/app.js')
# Add checkpoint launchers only to the standalone acceptance HTML.
app = app.replace("${fixtureNote()}<p class=\"small muted\" style=\"margin-top:15px\">", """<section class="panel" style="margin-top:18px"><h2>王都のPC検収</h2><p class="small">通常4都市を完了した専用周回から始めます。エーレンフェルス未着手・テオ残り2回。通常の「はじめから」でも解放を確認できます。</p>${button('検収A：アルフォンス／フレデリカ同行','review-capital','data-id="a"')}${button('検収B：ローズモンド／マディアン同行','review-capital','data-id="b"')}</section>${fixtureNote()}<p class="small muted" style="margin-top:15px">""")
app = app.replace("    case 'new':", """    case 'review-capital':
      if(!ready || !reviewSeeds[id]) break;
      await refreshSlots();
      confirmDialog('王都の検収周回をはじめる','<p>通常4都市を完了した検収用の新規周回で、オートセーブを置き換えます。手動セーブと既読は保持します。王都の解放条件を変更する機能ではありません。</p>',async()=>{
        modal=null;
        const next=structuredClone(reviewSeeds[id]);
        next.runId=crypto.randomUUID(); next.startedAt=new Date().toISOString();
        validateRun(next,defaultContent);
        const expectedRevision=slotsRevision;
        await transact(()=>storage.commitAuto(next,{expectedRevision}),{after:()=>{content=defaultContent;run=next;title=false;},message:'王都の検収周回を開始しました。'});
      },'検収周回をはじめる');
      break;
    case 'new':""")
app = 'const reviewSeeds=' + seeds + ';\n' + app
for asset in ['kingdom-emblem.svg', 'kingdom-map.png', 'portraits/commander-alphonse.png', 'portraits/commander-rosemond.png']:
    app = app.replace('./src/assets/' + asset, data_url(root / 'src/assets' / asset))
css = (root / 'src/styles.css').read_text()
css = re.sub(r"url\(['\"]?(\./assets/[^)'\"]+)['\"]?\)", lambda m: 'url("' + data_url(root / 'src' / m[1]) + '")', css)
script = '(async()=>{\nconst __previewModules={};\n' + '\n'.join(bundled) + '\n' + app + '\n})();'
assert not re.search(r'^import ', script, re.M)
assert '</script' not in script.lower()
html = re.sub(r'\s*<link[^>]+>', '', (root / 'index.html').read_text())
html = html.replace('<script type="module" src="./src/app.js"></script>', '<style>' + css + '</style>')
html = html.replace('</body>', '<script>' + script + '</script>\n</body>')
(out / (stem + '.html')).write_text(html)
(out / 'start-preview.cjs').write_text("""const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const page = fs.readFileSync(path.join(__dirname, 'Baumgarten_Ehrenfels_Preview_20261029.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(page);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4203, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4203/'));
""")
instructions = """エーレンフェルス3試練・Windows PC検収版（2026-10-29）

【起動】
ZIPを保存→右クリック「すべて展開」→Baumgarten_Ehrenfels_Preview_20261029.html を
Chrome／Edgeで開いてください。画像・フォント内蔵、通信不要です。旧検収版は残してください。
専用DB baumgarten-succession-ehrenfels-review-20261029 を使用します。
公開版・ルード版の実セーブは読み込まず、変更しません。
直接起動が制限される場合：Node.js 22以上を導入済みのPCで START_PREVIEW.cmd を実行し、
http://127.0.0.1:4203/ を開いてください。停止はCtrl+C。
同じブラウザ・同じ起動方法・同じURLを使って再開してください。

【すぐ王都を検収する】
タイトルの「検収A」「検収B」から始めます。どちらも通常4都市を実際のゲーム処理で
満点完了した新規検収周回（80点）、エーレンフェルス未着手、テオ残り2回です。
オートセーブを置き換える確認が出ます。残したい地点は先に手動へ保存してください。
検収用の起動補助だけに付く入口で、本編の解放条件は変更していません。

検収A：アルフォンス＋ハイデマリー／フレデリカ／ハロルド／リゼット
  小①2会話、小②3会話、大2会話。全7会話。
検収B：ローズモンド＋ハイデマリー／ハロルド／マディアン／リゼット
  小①1会話、小②3会話、大3会話。全7会話。
AとBの2周で正式8会話すべてを確認できます。1周の途中での交代はありません。

1. 地図で通常4都市が完了、王都が解放されていることを確認→エーレンフェルスへ。
2. 小①「栄華の陰で」→小②「紙の上の王国」→大「王の見る景色」。
   導入・結果・評価理由は正式全文。ABCは会話やテオなしでも選べ、Dはありません。
   小①→小②→大をC→B→Cで14点、B→A→Aで20点、A→C→Bで17点。
   検収用80点と合わせて94／100／97点になります。結果を分けて保存し全9択を見られます。
3. 同行者会話は枠内を縦スクロールして末尾まで確認してください。
   地の文と台詞・引用符・段落順を保持しています。「確認して戻る」で既読と固有メモを確定。
   開いただけ・ログを見ただけでは取得しません。確認前後を手動保存・ロードで比べられます。
   全体既読はロードで戻りませんが、周回の会話・メモは保存地点へ戻ります。
4. 共通メモは選択結果の確認時に1件、1周3件。未選択の6候補は取得しません。
   固有メモは同行者に応じて最大7件／周。テオも使うと王都メモは最大11件／周。
   定義上は共通9＋固有8＋テオ1＝18件です。
5. 小②Aは「遠い地区」。大試練マディアンは「正しい報告の、その先」の修正版全文。
6. 大試練のテオ：報告「王城へ届かない報告」、メモ「報告からこぼれる情報」。
   依頼取消は消費なし、確定で1回。5都市共有2回・同都市1回、加点や追加案開放はありません。
   報告中の再読込・ロード・取得後のログ／メモ閲覧で再消費しないことも確認してください。
7. 大試練のタグはA公正＋調整／B民意＋改革／C安定＋公正。
8. 完了後は地図へ戻り、王都「完了・記録を開く」で結果・政策・メモを見られます。
   正式な最終判断・継承結果・終幕・後日談・王国史の完成記録は未実装と表示します。
   継承点がいくつでも旧判定の結末は発火しません。完了状態を保存して再開できます。

【通常の解放経路も確認する場合】
「はじめから」で自由4人を選び、アルバ／ヘクセレイ／アンカリング／ルードを任意順で完了。
4都市完了前は王都へ入れず、4都市完了で解放します。
満点経路はアルバACB、ヘクセレイAAB、アンカリングBAB、ルードACB。
テオを先の2都市で使うと王都では使えません。使わなくても通常ABCは常に選べます。

検収結果・環境上の制限・全変更ファイルはREPORT.mdを参照してください。
美桜のWindows実機検収はこれからです。PR／push／main統合／GitHub Pages公開は未実施です。
"""
(out / 'START_PREVIEW.cmd').write_bytes(b'@echo off\r\ncd /d "%~dp0"\r\nnode start-preview.cjs\r\npause\r\n')
(out / 'README.txt').write_text(instructions)
(out / 'REPORT.md').write_text((root / 'docs/ehrenfels-implementation-20261029.md').read_text())
files = [out / (stem + '.html'), out / 'start-preview.cjs', out / 'START_PREVIEW.cmd', out / 'README.txt', out / 'REPORT.md']
(out / 'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in files))
files.append(out / 'SHA256SUMS.txt')
archive = out / (stem + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files:
        info = zipfile.ZipInfo(p.name)
        info.create_system = 0
        info.external_attr = 0x20
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, p.read_bytes())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
print(json.dumps({'html': str(out / (stem + '.html')), 'zip': str(archive), 'bytes': archive.stat().st_size}, ensure_ascii=False))
