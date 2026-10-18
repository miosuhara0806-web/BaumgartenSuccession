#!/usr/bin/env python3
"""Package the actual application as a self-contained offline acceptance preview."""
from pathlib import Path
import re, base64, mimetypes, zipfile, json, hashlib, argparse

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--edition', choices=['chapter', 'conversation', 'final'], default='chapter')
edition = parser.parse_args().edition
conversation_edition = edition == 'conversation'
final_edition = edition == 'final'
settings = {
    'chapter': ('BaumgartenSuccession_AlbaAcceptance_20261018', 'alba-20261018', 'baumgarten-succession-alba-approved-review-20261018', 4178, 'alba-implementation-20261018.md'),
    'conversation': ('BaumgartenSuccession_AlbaConversationPreview_20261018', 'alba-conversation-20261018', 'baumgarten-succession-alba-conversation-review-20261018', 4180, 'alba-conversation-display-20261018.md'),
    'final': ('BaumgartenSuccession_AlbaFinalPreview_20261018', 'alba-final-20261018', 'baumgarten-succession-alba-final-review-20261018', 4184, 'alba-final-implementation-20261018.md'),
}
stem, directory, db_name, port, report = settings[edition]

root = Path(__file__).resolve().parents[1]
out = root.parent / 'preview' / directory
out.mkdir(parents=True, exist_ok=True)

def data_url(path):
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode()

module_files = [
    ('introductions', 'src/content/alba-introductions.js'),
    ('fixture', 'src/content/fixture.js'),
    ('legacy', 'src/content/legacy.js'),
    ('alba', 'src/content/alba.js'),
    ('finalManuscript', 'src/content/alba-final-manuscript.js'),
    ('albaFinal', 'src/content/alba-final.js'),
    ('catalog', 'src/content/catalog.js'),
    ('engine', 'src/engine.js'),
    ('storage', 'src/storage.js'),
]
module_names = {str((root / file).resolve()): name for name, file in module_files}

def replace_imports(code, path):
    def replace(match):
        specifiers, relative = match.groups()
        target = str((path.parent / relative).resolve())
        name = module_names[target]
        destructure = re.sub(r'\s+as\s+', ': ', specifiers)
        return 'const {' + destructure + '}=__previewModules.' + name + ';'
    return re.sub(r"import \{([\s\S]*?)\} from '([^']+)';", replace, code)

modules = []
for name, file in module_files:
    path = root / file
    code = path.read_text()
    exports = re.findall(r'^export (?:async )?(?:const|function|class) (\w+)', code, re.M)
    code = replace_imports(code, path)
    code = re.sub(r'^export ', '', code, flags=re.M)
    if name == 'storage':
        code = code.replace("dbName = 'baumgarten-succession-v1'", "dbName = '" + db_name + "'")
    modules.append('__previewModules.' + name + '=(()=>{\n' + code + '\nreturn {' + ','.join(exports) + '};})();')

app = replace_imports((root / 'src/app.js').read_text(), root / 'src/app.js')
app = app.replace('./src/assets/kingdom-emblem.svg', data_url(root / 'src/assets/kingdom-emblem.svg'))
css = (root / 'src/styles.css').read_text()
css = re.sub(r"url\(['\"]?(\./assets/[^)'\"]+)['\"]?\)", lambda m: 'url("' + data_url(root / 'src' / m[1]) + '")', css)
html = (root / 'index.html').read_text()
html = re.sub(r'\s*<link[^>]+>', '', html)
html = html.replace('<script type="module" src="./src/app.js"></script>', '<style>' + css + '</style>')
script = '(async()=>{\nconst __previewModules={};\n' + '\n'.join(modules) + '\n' + app + '\n})();'
assert not re.search(r'^import ', script, re.M)
assert '</script' not in script.lower()
html = html.replace('</body>', '<script>' + script + '</script>\n</body>')
file = out / (stem + '.html')
file.write_text(html)
(out / 'start-preview.cjs').write_text("""const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const page = fs.readFileSync(path.join(__dirname, 'BaumgartenSuccession_AlbaAcceptance_20261018.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(page);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4178, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4178/'));
""".replace('BaumgartenSuccession_AlbaAcceptance_20261018.html', file.name).replace('4178', str(port)))
instructions = """アルバ章・正式データ検収版（2026-10-18）
ZIPをすべて展開し、中のHTMLをChromeまたはEdgeで開いてください。
前回の10月16日版は削除・上書きしないでください。本版の保存は専用の別DBです。
「はじめから」→主人公→8人から任意4人→出発→地図→アルバ。
導入は10月16日版と同じ全文縦スクロール。末尾の「読了して進む」から共通情報、判断へ進みます。
小①A→小②C→大試練Bで20点。小①B→小②A→大試練Aで13点。
リゼット同行で小②の会話を最後まで聞くとDが出ます。会話前や不在ではDの表示はありません。
小②の会話前に手動1へ保存→読了後に手動2へ保存→ロードしDの有無を確認できます。
Dは4点、4段落の正式本文と評価理由があります。
通常9択の反応本文・評価理由は原稿待ちです。旧fixtureの反応は使っていません。
同行者固有メモは未提供のため作成していません。共通メモ12件は各試練で説明を読んだ時だけ取得します。
章完了後も地図のアルバ記録・情報メモを参照できます。
序章・出発・帰還・テオの調査には仮内容が残ります。正式王国史とエンディングの調整は対象外です。
HTMLが開けない場合、Node.js導入済みPCで node start-preview.cjs を実行し、
http://127.0.0.1:4178/ を同じブラウザで開いてください。停止はCtrl+C。
実スマートフォン・Safariは美桜の端末で最終確認してください。
"""
if conversation_edition:
    instructions = """同行者会話・表示改善検収版（2026-10-18）
ZIPをすべて展開し、中のHTMLをChromeまたはEdgeで開いてください。
前回のアルバ章検収版と10月16日版は削除・上書きしないでください。
この版は別名・専用の別DBで保存します。前回版からセーブを自動取り込みしません。

「はじめから」→主人公→ハロルド・フレデリカ・リゼット・サンドロを選ぶ→出発→アルバ。
導入小説は従来の全文縦スクロールのままです。
吹き出しを押すと、その人物の3発言が1つの枠に表示されます。
長い場合は枠内をスクロールし、「確認して戻る」を1回押します。
開いただけでは既読・D開放になりません。「会話ログ」から再確認できます。

小②のリゼット会話前に手動1へ保存します。
会話を開き、確認せず再読み込み→「つづきから」で、未確認の会話へ戻ることを確認します。
「確認して戻る」→リゼットの吹き出しが消え、Dが出ます。手動2へ保存します。
手動1をロード→Dは未開放。リゼット会話で「既読スキップ」すると再開放します。
手動2をロード→Dと会話の確認済み状態が維持されます。
話を聞くだけでは継承点は増えません。

HTMLを直接開けない場合、Node.js導入済みPCで node start-preview.cjs を実行し、
http://127.0.0.1:4180/ を開いてください。停止はCtrl+C。
実スマートフォン・Safariは未検証です。
GitHubプッシュ・main反映・Pages公開は行っていません。
"""
if final_edition:
    instructions = """アルバ3試練・正式原稿検収版（2026-10-18）
ZIPをすべて展開し、中のHTMLをChromeまたはEdgeで開いてください。
10月16日版・以前の各検収版は残してください。この版は別名・専用の別DBで保存します。
以前の版のセーブは自動で取り込みません。通常のゲームの保存形式や内容版の互換処理は維持しています。

「はじめから」→主人公→任意4人→出発→アルバ。
通常9択の正式反応・評価理由を実装しました。
A→C→Bで20点、B→A→Aで13点。リゼットDの点数は4点のままです。
同行者の会話は1人1画面・外側の括弧なし。「確認して戻る」で固有メモを取得します。
会話を開いただけでは取得しません。分類「同行者の見解」と出典を確認してください。
リゼット小②の確認完了でDを開放します。会話前の手動セーブに戻ると、メモとDも未取得に戻ります。

大試練の政策提出前にテオを依頼できます。正式な調査報告とメモを確認してください。
同じ都市で1回、1周2回のままです。調査で加点や追加選択肢の開放はありません。
タグは大試練のみ、点数とは別の隠し集計です。
ハロルド・フレデリカ・リゼット・サンドロ同行で会話10件を聞き、テオを依頼すると、完了時のメモは共通12＋同行者10＋テオ1＝23件です。
同行者やテオを使わなくても通常の選択肢で満点を取れます。

導入小説3本・縦スクロール・通常の保存処理は維持しています。
序章・出発・帰還の正式台本、他都市、エンディング、画像・地図は今回の完成対象外です。

HTMLを開けない場合、Node.js導入済みPCで node start-preview.cjs を実行し、
http://127.0.0.1:4184/ を開いてください。停止はCtrl+C。
実スマートフォン・Safariは未検証です。GitHub・PR・main・Pagesには反映していません。
"""
(out / '確認方法.txt').write_text(instructions)
(out / '実装報告.md').write_text((root / 'docs' / report).read_text())
files = [file, out/'start-preview.cjs', out/'確認方法.txt', out/'実装報告.md']
(out / 'SHA256SUMS.txt').write_text('\n'.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name for p in files)+'\n')
files.append(out/'SHA256SUMS.txt')
archive = out/(stem + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files: z.write(p, p.name)
with zipfile.ZipFile(archive) as z: assert z.testzip() is None
print(json.dumps({'html':str(file),'zip':str(archive),'bytes':archive.stat().st_size},ensure_ascii=False))
