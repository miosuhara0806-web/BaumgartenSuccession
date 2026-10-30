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
out = root.parent / 'preview' / 'companion-dialogue-20261030'
out.mkdir(parents=True, exist_ok=True)
stem = 'Baumgarten_CompanionDialogue_Preview_20261030'
db_name = 'baumgarten-succession-companion-dialogue-review-20261030'
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
    ('companionDialogueManuscript', 'src/content/companion-dialogue-manuscript.js'),
    ('companionDialogueUnified', 'src/content/companion-dialogue-unified.js'),
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

# Review runs enter the requested city through normal engine transitions.
seeds = subprocess.run(['node', '--input-type=module', '-e',
    "import {createReviewSeeds} from './scripts/companion-dialogue-review-seeds.js'; process.stdout.write(JSON.stringify(createReviewSeeds()));"],
    cwd=root, check=True, capture_output=True, text=True).stdout
app = imports((root / 'src/app.js').read_text(), root / 'src/app.js')
# Add checkpoint launchers only to the standalone acceptance HTML.
app = app.replace("${fixtureNote()}<p class=\"small muted\" style=\"margin-top:15px\">", """<section class="panel" style="margin-top:18px"><h2>前半3都市・同行者会話のPC検収</h2><p class="small">各都市の小試練①の判断画面から開始します。指定の同行者で全26会話を確認できます。残したい地点は手動保存してください。</p>${button('アルバ検収：10会話','review-dialogue','data-id="alba"')}${button('ヘクセレイ検収：8会話','review-dialogue','data-id="hexerei"')}${button('アンカリング検収：8会話','review-dialogue','data-id="anchoring"')}</section>${fixtureNote()}<p class="small muted" style="margin-top:15px">""")
app = app.replace("    case 'new':", """    case 'review-dialogue':
      if(!ready || !reviewSeeds[id]) break;
      await refreshSlots();
      confirmDialog('同行者会話の検収周回をはじめる','<p>対象都市の小試練①から始める新規検収周回で、オートセーブを置き換えます。手動セーブと既読は保持します。</p>',async()=>{
        modal=null;
        const next=structuredClone(reviewSeeds[id]);
        next.runId=crypto.randomUUID(); next.startedAt=new Date().toISOString();
        validateRun(next,defaultContent);
        const expectedRevision=slotsRevision;
        await transact(()=>storage.commitAuto(next,{expectedRevision}),{after:()=>{content=defaultContent;run=next;title=false;},message:'同行者会話の検収周回を開始しました。'});
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
const page = fs.readFileSync(path.join(__dirname, 'Baumgarten_CompanionDialogue_Preview_20261030.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(page);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4204, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4204/'));
""")
instructions = """前半3都市・同行者会話 演出統一 Windows PC検収版（2026-10-30）

【起動】
ZIPを保存→右クリック「すべて展開」→Baumgarten_CompanionDialogue_Preview_20261030.html を
Chrome／Edgeで開いてください。画像・フォント内蔵、通信不要です。
専用DB baumgarten-succession-companion-dialogue-review-20261030 を使用します。
公開版と過去の検収版の保存領域から分離されています。旧ファイルは残してください。
直接起動が制限される場合：Node.js 22以上があるPCで START_PREVIEW.cmd を実行し、
http://127.0.0.1:4204/ を開いてください。停止はCtrl+C。
同じブラウザ・起動方法・URLで再開してください。

【検収専用入口】
通常の「はじめから」とは別に、タイトルに3つの検収入口があります。
小試練①の判断画面から開始します。他都市・王都の攻略は不要です。
・アルバ検収：アルフォンス＋ハロルド／リゼット／フレデリカ／サンドロ。3＋4＋3＝10会話。
・ヘクセレイ検収：ローズモンド＋フレデリカ／ヴァンタルト／サンドロ／ハイデマリー。2＋3＋3＝8会話。
・アンカリング検収：アルフォンス＋オリヴェル／マディアン／サンドロ／ヴァンタルト。2＋3＋3＝8会話。
入口を選ぶと、この検収版のオートセーブ置き換え確認が出ます。
残したい地点は手動保存してください。手動セーブと共通既読は保持します。
別都市へ切り替えるには左上の作品名をクリックしてタイトルへ戻り、次の入口を選んでください。

【各都市の確認手順】
1. 同行者を選び、会話タイトル・地の文・引用符付きのセリフを確認。
   地の文は話者なし、セリフは同行者。長文は会話枠内を縦スクロールしてください。
2. 開いただけでは既読・同行者メモは取得しません。末尾まで確認して
   「確認して戻る」で取得します。得点・タグや選択肢の定義は変化しません。
   アルバ小試練②Dは従来どおり、リゼット同行＋同試練のリゼット会話完了で出現します。
3. 各会話を開く前に手動保存→最後まで確認→その手動保存をロードし、
   会話を再度開くと「既読スキップ」を確認できます。メモは重複しません。
   共通既読はロードで戻らず、周回メモ・会話の完了状況は保存地点へ戻ります。
4. 会話ログで本文と「地の文」／同行者名の区別、メモで取得内容を確認してください。
5. その試練の全会話を確認したら、任意の通常選択肢を選択・確認して次の試練へ。
   小①→小②→大の順です。大試練完了後は地図へ戻ります。
6. PC幅と狭いウィンドウ幅の両方で、横はみ出しや操作不能がないことを確認。

【内容版と保護】
新規周回：alba-hexerei-anchoring-rude-ehrenfels-dialogue-unified-2026-10-30。
過去の内容版は変更していません。セーブの移行・再採点・リセットはしません。
保存／得点／試練／全メモ／テオ／解放条件の処理は既存のままです。
正式原稿を SOURCE.md、実装・検証報告を REPORT.md に同梱しています。
Windows実機での操作確認は利用者の検収対象です。
PR作成／push／main統合／GitHub Pages公開は行っていません。
"""
(out / 'START_PREVIEW.cmd').write_bytes(b'@echo off\r\ncd /d "%~dp0"\r\nnode start-preview.cjs\r\npause\r\n')
(out / 'README.txt').write_text(instructions)
(out / 'REPORT.md').write_text((root / 'docs/companion-dialogue-implementation-20261030.md').read_text())
(out / 'SOURCE.md').write_bytes((root / 'docs/companion-dialogue-source-20261030.md').read_bytes())
files = [out / 'SOURCE.md', out / (stem + '.html'), out / 'start-preview.cjs', out / 'START_PREVIEW.cmd', out / 'README.txt', out / 'REPORT.md']
files.extend(sorted(p for p in (out / 'validation').rglob('*') if p.is_file()))
(out / 'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.relative_to(out).as_posix() + '\n' for p in files))
files.append(out / 'SHA256SUMS.txt')
archive = out / (stem + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files:
        info = zipfile.ZipInfo(p.relative_to(out).as_posix())
        info.create_system = 0
        info.external_attr = 0x20
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, p.read_bytes())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
print(json.dumps({'html': str(out / (stem + '.html')), 'zip': str(archive), 'bytes': archive.stat().st_size}, ensure_ascii=False))
