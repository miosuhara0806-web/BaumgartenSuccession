#!/usr/bin/env python3
"""Extract the reviewed Rude prose verbatim; apply only the explicit post-audit sentence/name decisions."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parents[1]
source = (root / 'docs/rude-source-20261025.md').read_text()
assert hashlib.sha256(source.encode()).hexdigest() == 'f9f7f7e3d7732e5a836292b078051c94fc8669f51164ff532fd462eccc0171bb'

def section(number):
    match = re.search(r'^### ' + re.escape(number) + r'．[^\n]*\n([\s\S]*?)(?=^### |^## |\Z)', source, re.M)
    assert match, number
    return match[1].strip()

def rows(text):
    return list(re.finditer(r'^#### ([^\n]*)\n([\s\S]*?)(?=^#### |\Z)', text, re.M))

def prose(text):
    # Remove editorial provenance only, never narrative paragraphs.
    return '\n\n'.join(p for p in text.strip().split('\n\n') if not p.startswith(('出典：', '会話出典：', 'メモ出典：', 'メモ名：')))

actors = {'サンドロ': 'sandro', 'オリヴェル': 'olivel', 'マディアン': 'madian', 'リゼット': 'lisette'}
titles = ['森の薬、遠くの薬', '森の恵みの値段', '開かれた森の、その先へ']
hashes = ['eabba110fc5f09fa7f91fe9a61ca94bc97249fb77a16bd2d2fa197179bb02df7', '2673f327f4dc9421c697c487748ca839b85d5e8ec6189bb1795ff358143e82e0', '7d09e65c7d483120c71ef3725edc002329f19c72f13ab77bd37907101086887a']
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
        if key == 'major' and letter == 'C':
            before = '自然保護についても、王国共通の規則を適用することになった。'
            after = '自然保護についても、王国共通の規則を適用する方針を、現王に提言した。'
            assert reaction.count(before) == 1
            reaction = reaction.replace(before, after)
        choices.append(dict(letter=letter.lower(), label=parts[0], description=parts[1], points=int(points), reaction=reaction.strip(), evaluationReason=reason.strip()))
    conversations, companion_memos = [], []
    for match in rows(section(f'{number}.4')):
        actor_name, conversation_title = re.fullmatch(r'\d+．([^／]+)／(.+)', match[1]).groups()
        actor = actors[actor_name]
        body, memo = match[2].split('**会話本文【原文】**\n\n')[1].split('\n\n**対応する取得メモ【原文】**\n\n')
        memo_title = re.search(r'^メモ名：(.+)$', memo, re.M)[1]
        if key == 'small1':
            memo_title = {'sandro': '薬の使い分けと管理', 'olivel': '森の知恵と外来薬'}[actor]
        lines = body.strip().split('\n\n')
        assert len(lines) > 3
        conversations.append(dict(actor=actor, title=conversation_title, lines=lines))
        companion_memos.append(dict(actor=actor, title=memo_title, summary=prose(memo)))
    common_memos = []
    for match in rows(section(f'{number}.5')):
        letter, points, memo_title = re.fullmatch(r'([ABC])（(\d+)点）／(.+)', match[1]).groups()
        common_memos.append(dict(letter=letter.lower(), title=memo_title, summary=prose(match[2])))
    trials.append(dict(key=key, title=title, introduction=intro, choices=choices, conversations=conversations, companionMemos=companion_memos, commonMemos=common_memos))
text = section('6.6')
report, memo = text.split('**報告本文【原文】**\n\n')[1].split('\n\n**取得メモ【原文】**\n\n')
report_title = re.search(r'^報告名：(.+)$', text, re.M)[1]
memo_title = re.search(r'^メモ名：(.+)$', memo, re.M)[1]
manuscript = dict(trials=trials, governanceTags={'a':['people','stability'], 'b':['coordination','fairness'], 'c':['reform','stability']}, theo=dict(reportTitle=report_title, report=report.strip(), title=memo_title, summary=prose(memo)))
output = '// Generated from docs/rude-source-20261025.md by scripts/extract-rude-manuscript.py.\n// Post-audit decisions: approved tags, two memo names, and the one major-C sentence only.\nexport const rudeManuscript = ' + json.dumps(manuscript, ensure_ascii=False, indent=2) + ';\n'
(root / 'src/content/rude-manuscript.js').write_text(output)
print('Rude: 3 novels (SHA-256 verified), 9 choices/results/reasons, 7 full conversations, 17 memos, Theo report.')
