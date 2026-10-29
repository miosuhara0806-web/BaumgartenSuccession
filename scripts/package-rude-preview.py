#!/usr/bin/env python3
"""Build a self-contained PC acceptance HTML with a separate preview database."""
from pathlib import Path
import base64
import hashlib
import json
import mimetypes
import re
import zipfile

root = Path(__file__).resolve().parents[1]
out = root.parent / 'preview' / 'rude-20261028'
out.mkdir(parents=True, exist_ok=True)
stem = 'Baumgarten_Rude_Preview_20261028'
db_name = 'baumgarten-succession-rude-review-20261028'
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
    if name == 'catalog':
        # Freeze the four-city review edition as the default catalog advances.
        code = """import { content as current } from './rude.js';
import { content as anchoring } from './anchoring.js';
import { content as hexerei } from './hexerei.js';
import { content as albaFinal } from './alba-final.js';
import { content as previous } from './alba.js';
import { content as legacy } from './legacy.js';

export const defaultContent = current;

// Never migrate, regrade, or erase a saved run implicitly.
export function contentForRun(run) {
  if (run?.contentVersion === legacy.contentVersion) return legacy;
  if (run?.contentVersion === current.contentVersion) return current;
  if (run?.contentVersion === anchoring.contentVersion) return anchoring;
  if (run?.contentVersion === hexerei.contentVersion) return hexerei;
  if (run?.contentVersion === albaFinal.contentVersion) return albaFinal;
  if (run?.contentVersion === previous.contentVersion) return previous;
  throw new Error('この内容版の保存には対応していません。既存の保存は保持しています。');
}
"""
    exports = re.findall(r'^export (?:async )?(?:const|function|class) (\w+)', code, re.M)
    code = re.sub(r'^export ', '', imports(code, path), flags=re.M)
    if name == 'storage':
        assert "dbName = 'baumgarten-succession-v1'" in code
        code = code.replace("dbName = 'baumgarten-succession-v1'", f"dbName = '{db_name}'")
    bundled.append('__previewModules.' + name + '=(()=>{\n' + code + '\nreturn {' + ','.join(exports) + '};})();')

app = imports((root / 'src/app.js').read_text(), root / 'src/app.js')
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
const page = fs.readFileSync(path.join(__dirname, 'Baumgarten_Rude_Preview_20261028.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(page);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4202, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4202/'));
""")
instructions = """ルード3試練・PC検収版（2026-10-28）

ZIPをPCへ保存し、すべて展開してから Baumgarten_Rude_Preview_20261028.html を
ChromeまたはEdgeで開いてください。画像・フォント内蔵。単体HTMLでも起動できます。
以前の検収ファイルは残してください。公開版・旧検収版とは異なる専用DBに保存します。
公開版の実セーブは自動取り込みしません。旧内容版の周回へルードを追加しません。

1. はじめから→指揮官→任意4人→出発→地図→ルード。
   サンドロ・オリヴェル・マディアン・リゼットで全7会話を確認できます。
2. 導入3本・結果9本・評価理由・会話は正式原稿全文です。
   大試練Cの指定された一文だけを現王への提言に変更しています。
   主人公表記は表示時に指揮官名へ差し込みます。
3. 会話は1会話1枠。原稿どおりの括弧と段落順を保ち、地の文を色分けしています。
   オリヴェル小①は地の文から始まります。話者名と会話タイトルも確認してください。
   枠内を縦スクロールすると末尾まで読めます。「確認して戻る」で全段落をまとめて既読にし、
   固有メモを取得します。開いただけでは既読・メモを確定しません。
   先に保存し、未確認状態へのロードや、確認後の会話ログでも全文を確認してください。
4. 通常ABCは会話・メモ・テオを利用しなくても常時選択可能。ルードに追加Dはありません。
   小①→小②→大試練の順に B→A→Cで14点、A→C→Bで20点、C→B→Aで17点。
5. 共通メモは選んだ結果を確認した時に1件ずつ、1周3件だけ取得します。
   固有7件とテオ1件をすべて取得した場合、ルードのメモは合計11件です。
   小①の固有メモ名はサンドロ「薬の使い分けと管理」、オリヴェル「森の知恵と外来薬」です。
6. テオの報告名は「森の取り決め、その外側で」、取得メモは「森の外から生まれる圧力」。
   4都市共有で1周2回、同都市1回、加点なし。依頼取消は消費なし。
7. 大試練のタグはA民意＋安定、B調整＋公正、C改革＋安定。
   政策は現王への提言です。最終的な王位判定やエンディングはありません。
8. 章完了後は地図のルード「完了・記録を開く」で点数・提出政策・メモを確認できます。
   アルバ・ヘクセレイ・アンカリングもプレイ可能。4都市合計は最低53点／最高80点。
   エーレンフェルス、正式序章、正式エンディング等は今回の範囲外です。

HTMLの直接起動が制限される場合はNode.js導入済みPCで node start-preview.cjs を実行し、
http://127.0.0.1:4202/ を開いてください。停止はCtrl+C。同じブラウザ・同じURLで再開してください。
技術的な検証結果と制限はREPORT.mdを参照してください。
PR作成・mainへの統合・GitHub Pages公開は行っていません。美桜のPC実機検収はこれからです。
"""
(out / 'README.txt').write_text(instructions)
(out / 'REPORT.md').write_text((root / 'docs/rude-implementation-20261028.md').read_text())
files = [out / (stem + '.html'), out / 'start-preview.cjs', out / 'README.txt', out / 'REPORT.md']
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
