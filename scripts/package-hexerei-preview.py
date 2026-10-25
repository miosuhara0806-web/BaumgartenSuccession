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
out = root.parent / 'preview' / 'hexerei-20261022'
out.mkdir(parents=True, exist_ok=True)
stem = 'Baumgarten_Hexerei_Preview_20261022'
db_name = 'baumgarten-succession-hexerei-review-20261022'
modules = [
    ('introductions', 'src/content/alba-introductions.js'),
    ('fixture', 'src/content/fixture.js'),
    ('legacy', 'src/content/legacy.js'),
    ('alba', 'src/content/alba.js'),
    ('albaManuscript', 'src/content/alba-final-manuscript.js'),
    ('albaFinal', 'src/content/alba-final.js'),
    ('hexereiManuscript', 'src/content/hexerei-manuscript.js'),
    ('hexerei', 'src/content/hexerei.js'),
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
        # Reproducing an older acceptance edition must keep its original scope.
        code = """import { content as current } from './hexerei.js';
import { content as albaFinal } from './alba-final.js';
import { content as previous } from './alba.js';
import { content as legacy } from './legacy.js';
export const defaultContent = current;
export function contentForRun(run) {
  if (run?.contentVersion === legacy.contentVersion) return legacy;
  if (run?.contentVersion === current.contentVersion) return current;
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
const page = fs.readFileSync(path.join(__dirname, 'Baumgarten_Hexerei_Preview_20261022.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(page);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4190, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4190/'));
""")
instructions = """ヘクセレイ章・PC検収版（2026-10-22）

ZIPをPCへ保存し、すべて展開してから Baumgarten_Hexerei_Preview_20261022.html を
ChromeまたはEdgeで開いてください。単体HTMLだけでも動作し、画像・フォントも内蔵しています。
以前の検収ファイルは削除・上書きしないでください。
この検収版は専用DBを使用します。公開版や以前の検収版のセーブを自動取り込みしません。
通常ゲームの旧セーブは内容版を維持してロードできます。旧周回はアルバまでです。
ヘクセレイの検収は「はじめから」で新しい周回を開始してください。

1. はじめから→導入→指揮官→任意4人→出発→地図→ヘクセレイ。
   フレデリカ・ヴァンタルト・サンドロ・ハイデマリーなら8会話すべてを確認できます。
   別の4人でも完走できます。肖像2人と王国地図が従来どおり表示されることも確認してください。
2. 各導入小説は全文を縦スクロールして確認。「読了して進む」で共通メモ3件を取得します。
   小②の末尾は原文を維持し、後続の「事故現場への指示」画面で正式な現場対応3択を選びます。
3. 吹き出しは同行者だけ。3段落が1枠に表示され、「確認して戻る」で固有メモを取得します。
   開いただけ・ログを見ただけでは取得しません。会話前に手動1、確認後に手動2へ保存できます。
   手動1へ戻ると今周回のメモは戻り、既読は残ります。既読スキップによる再確認も試してください。
4. 大試練のみテオを依頼できます。取消時は消費せず、確定時に全都市共通2回のうち1回を消費します。
   報告途中に再読み込み→つづきからでも、先頭から再開して二重消費しません。
5. A→A→Bで20点、C→B→Cで13点、B→C→Aで17点。テオ無し・会話無しでも20点にできます。
   結果文と評価理由、【主人公】の指揮官名置換を確認してください。追加Dはありません。
6. 章完了後、地図のヘクセレイから3試練の点数・提出政策・取得情報を開けます。
   上記4人＋テオなら共通9＋固有8＋調査1＝18件です。大試練タグは隠し集計です。
7. アルバも続けて遊べ、両章満点は40点。テオの回数は両都市で共有します。
   未実装都市と王位判定は今回対象外です。アルバの正式本文・配点・リゼットDは従来どおりです。

HTMLを直接開けない場合は、Node.js導入済みPCで node start-preview.cjs を実行し、
http://127.0.0.1:4190/ を開いてください。停止はCtrl+C。
保存は同じファイル・同じブラウザ、HTTP利用なら同じURLで確認してください。

検証の詳細と未確認事項はREPORT.mdを参照してください。
このファイルをPCへ保存する操作と、Codex環境内に生成したことは別です。
Git push・PR作成・mainマージ・GitHub Pages公開は行っていません。
"""
(out / 'README.txt').write_text(instructions)
(out / 'REPORT.md').write_text((root / 'docs/hexerei-implementation-20261022.md').read_text())
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
