#!/usr/bin/env python3
"""Extract the final approved Ehrenfels manuscript verbatim, excluding editorial metadata."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parents[1]
source = (root / 'docs/ehrenfels-source-20261025.md').read_text()
assert hashlib.sha256(source.encode()).hexdigest() == '86097b749a41c4aa329de2fa4c7272afc84c381b52a68eb5cf5ba7c7ac987d7a'

def section(number):
    match = re.search(r'^### ' + re.escape(number) + r'．[^\n]*\n([\s\S]*?)(?=^### |^## |\Z)', source, re.M)
    assert match, number
    return match[1].strip()

def rows(text):
    return list(re.finditer(r'^#### ([^\n]*)\n([\s\S]*?)(?=^#### |\Z)', text, re.M))

def prose(text):
    # Remove editorial provenance only, never narrative paragraphs.
    return '\n\n'.join(p for p in text.strip().split('\n\n') if not p.startswith(('出典：', '会話出典：', 'メモ出典：', 'メモ名：')))

actors = {'ハイデマリー': 'heidemarie', 'フレデリカ': 'frederica', 'ハロルド': 'harold', 'マディアン': 'madian', 'リゼット': 'lisette'}
titles = ['栄華の陰で', '紙の上の王国', '王の見る景色']
hashes = ['f17eb91af25d026e7207df8ddad50cb39aaf4295faf661b783aa6ef2c4758f94', 'f8242115bd97c7ea6a65d0b42b521ad43341efeaf21bd5e51561bb3537652b5f', 'fe3e2a56328fc212bcf62299b7cf6e6e729ce1efdab34eaf8d5e391d4a037b80']
trials = []
for number, key, title, digest in zip([4, 5, 6], ['small1', 'small2', 'major'], titles, hashes):
    intro = prose(section(f'{number}.1'))
    assert hashlib.sha256(intro.encode()).hexdigest() == digest
    choices = []
    results = rows(section(f'{number}.3'))
    for index, match in enumerate(rows(section(f'{number}.2'))):
        letter, points = re.fullmatch(r'([ABC])（(\d+)点）', match[1]).groups()
        parts = prose(match[2]).split('\n\n', 1)
        result = results[index]
        assert result[1].startswith(letter + '：') and result[1].endswith(f'（{points}点）')
        reaction, reason = result[2].split('**結果文章【原文】**\n\n')[1].split('\n\n**評価理由【原文】**\n\n')
        choices.append(dict(letter=letter.lower(), label=parts[0], description=parts[1], points=int(points), reaction=reaction.strip(), evaluationReason=reason.strip()))
    conversations, companion_memos = [], []
    for match in rows(section(f'{number}.4')):
        actor_name, conversation_title = re.fullmatch(r'\d+．([^／]+)／(.+)', match[1]).groups()
        actor = actors[actor_name]
        body, memo = match[2].split('**会話本文【原文】**\n\n')[1].split('\n\n**対応する取得メモ【原文】**\n\n')
        memo_title = re.search(r'^メモ名：(.+)$', memo, re.M)[1]
        lines = body.strip().split('\n\n')
        assert len(lines) > 3
        conversations.append(dict(actor=actor, title=conversation_title, lines=lines))
        companion_memos.append(dict(actor=actor, title=memo_title, summary=prose(memo)))
    common_memos = []
    for match in rows(section(f'{number}.5')):
        letter, points, memo_title = re.fullmatch(r'([ABC])（(\d+)点）／(.+)', match[1]).groups()
        common_memos.append(dict(letter=letter.lower(), title=memo_title, summary=prose(match[2])))
    trials.append(dict(key=key, title=title, introduction=intro, choices=choices, conversations=conversations, companionMemos=companion_memos, commonMemos=common_memos))
assert '遠い地区' in trials[1]['choices'][0]['reaction']
assert '森側の地区' not in trials[1]['choices'][0]['reaction']
assert len([c for t in trials for c in t['conversations']]) == 8
text = section('6.6')
report, memo = text.split('**報告本文【原文】**\n\n')[1].split('\n\n**取得メモ【原文】**\n\n')
report_title = re.search(r'^報告名：(.+)$', text, re.M)[1]
memo_title = re.search(r'^メモ名：(.+)$', memo, re.M)[1]
manuscript = dict(trials=trials, governanceTags={'a':['fairness','coordination'], 'b':['people','reform'], 'c':['stability','fairness']}, theo=dict(reportTitle=report_title, report=report.strip(), title=memo_title, summary=prose(memo)))
output = '// Generated from docs/ehrenfels-source-20261025.md by scripts/extract-ehrenfels-manuscript.py.\n// Final source includes the approved small2-A district correction and full revised Madian dialogue.\nexport const ehrenfelsManuscript = ' + json.dumps(manuscript, ensure_ascii=False, indent=2) + ';\n'
(root / 'src/content/ehrenfels-manuscript.js').write_text(output)
print('Ehrenfels: 3 novels (SHA-256 verified), 9 choices/results/reasons, 8 full conversations, 18 memos, Theo report.')
