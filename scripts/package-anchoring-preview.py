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
out = root.parent / 'preview' / 'anchoring-20261024'
out.mkdir(parents=True, exist_ok=True)
stem = 'Baumgarten_Ankaring_Preview_20261024'
db_name = 'baumgarten-succession-anchoring-review-20261024'
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
        # Keep this historical edition independent of future catalog extensions.
        code = """import { content as current } from './anchoring.js';
import { content as hexerei } from './hexerei.js';
import { content as albaFinal } from './alba-final.js';
import { content as previous } from './alba.js';
import { content as legacy } from './legacy.js';

export const defaultContent = current;

// Never migrate, regrade, or erase a saved run implicitly.
export function contentForRun(run) {
  if (run?.contentVersion === legacy.contentVersion) return legacy;
  if (run?.contentVersion === current.contentVersion) return current;
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
const page = fs.readFileSync(path.join(__dirname, 'Baumgarten_Ankaring_Preview_20261024.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(page);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4198, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4198/'));
""")
instructions = """アンカリング3試練・PC検収版（2026-10-24）

ZIPをPCへ保存し、すべて展開してから Baumgarten_Ankaring_Preview_20261024.html を
ChromeまたはEdgeで開いてください。単体HTMLにも画像とフォントを内蔵しています。
以前の検収ファイルは削除・上書きしないでください。
本検収版の保存は専用DBです。公開版や旧検収版のセーブは自動取り込みしません。
旧セーブの周回は旧内容版のまま読み込む設計です。アンカリングは新規周回で開始します。

1. はじめから→指揮官→任意4人→出発→地図→アンカリング。
   マディアン・オリヴェル・サンドロ・ヴァンタルトで全8会話を確認できます。
2. 導入小説3本は10月17日完成本文をそのまま掲載しています。
   主人公プレースホルダーは指揮官名で表示されます。全文を縦スクロールし「読了して進む」。
3. 通常3択は会話・テオの有無に関係なく選択可能。追加Dはありません。
   B→A→Bで20点、A→B→Cで13点、C→C→Aで17点です。
4. 原稿指定により、共通メモは選んだルートの1件だけ、結果文の確認後に取得します。
   導入読了時や他ルートの閲覧では取得しません。データ全体には共通9＋固有8＋テオ1＝18件ありますが、
   1周で取得する共通メモは3件です。上記4人の全会話＋テオなら合計12件になります。
5. 吹き出しは対象同行者だけ。3段落を1枠で読み「確認して戻る」で固有メモを取得します。
   会話を開いたまま再読込しても未確認のまま。ログ閲覧だけでは取得しません。
   会話前に手動1、会話後に手動2へ保存し、ロードによるメモと既読の違いも確認してください。
6. テオは大試練のみ。最終採用の「認可商人の規模による格差」を報告します。
   3都市共通で1周2回、同じ都市は1回。取り消しは消費なし、再読込で二重消費なし。
   政策3択の配点とタグは調査によって変わりません。
7. 章完了後、地図のアンカリングで「完了・記録を開く」から点数・提出政策・メモを確認。
   アルバとヘクセレイも従来の正式内容で遊べ、3都市の満点は60点です。王位判定は発生しません。

HTMLの直接起動が制限される場合はNode.js導入済みPCで node start-preview.cjs を実行し、
http://127.0.0.1:4198/ を開いてください。停止はCtrl+C。同じブラウザ・同じURLで再開してください。
詳細な変更内容・テスト結果・未確認事項はREPORT.mdを参照してください。

mainへのマージ・GitHub Pages公開は行っていません。
"""
(out / 'README.txt').write_text(instructions)
(out / 'REPORT.md').write_text((root / 'docs/anchoring-implementation-20261024.md').read_text())
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
