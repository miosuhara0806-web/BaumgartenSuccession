#!/usr/bin/env python3
"""Extract only the 26 dialogue headings and paragraphs from the approved source."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]
source = (root / 'docs/companion-dialogue-source-20261030.md').read_text()
cities = {'アルバ': 'alba', 'ヘクセレイ': 'hexerei', 'アンカリング': 'anchoring'}
trials = {'小試練①': 'small1', '小試練②': 'small2', '大試練': 'major'}
actors = {'ハロルド': 'harold', 'リゼット': 'lisette', 'フレデリカ': 'frederica', 'サンドロ': 'sandro', 'ヴァンタルト': 'vantalt', 'ハイデマリー': 'heidemarie', 'オリヴェル': 'olivel', 'マディアン': 'madian'}
rows = []
city = trial = None
for section in re.split(r'(?=^#{1,3} )', source, flags=re.M):
    heading, _, body = section.partition('\n')
    if heading.startswith('# '):
        city = cities.get(heading[2:])
    elif city and heading.startswith('## '):
        trial = trials[heading[3:].split('「')[0]]
    elif city and heading.startswith('### '):
        match = re.fullmatch(r'### (.+)「(.+)」', heading)
        actor, title = match.groups()
        lines = body.split('\n---')[0].strip().split('\n\n')
        assert len(lines) == 5 and sum(line.startswith('「') and line.endswith('」') for line in lines) == 3
        rows.append({'id': f'conversation.{city}.{trial}.{actors[actor]}', 'title': title, 'lines': lines})
assert len(rows) == 26
(root / 'src/content/companion-dialogue-manuscript.js').write_text(
    '// Generated from docs/companion-dialogue-source-20261030.md; do not paraphrase.\n'
    + 'export const companionDialogueManuscript = ' + json.dumps(rows, ensure_ascii=False, indent=2) + ';\n')
