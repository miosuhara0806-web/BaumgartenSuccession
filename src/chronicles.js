// Read-only projections of saved completion snapshots. Never regrade a past run.
import { defaultContent, contentForRun } from './content/catalog.js';

const ranks = { high:'高評価', normal:'通常評価', other:'もう一方の双子が即位',
  highSuccess:'高評価（旧版）', success:'成功（旧版）', failure:'失敗（旧版）' };
const tags = { people:'民意', reform:'改革', stability:'安定', coordination:'調整', fairness:'公正' };
const text = value => typeof value === 'string' ? value : '';
const dictionary = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const timestamp = record => Number.isFinite(Date.parse(record.recordedAt)) ? Date.parse(record.recordedAt) : -Infinity;

export function sortChronicles(records) {
  return [...records].sort((a, b) => timestamp(b) - timestamp(a) || a.completionKey.localeCompare(b.completionKey));
}

export function chronicleView(record) {
  let pack;
  try { pack = contentForRun(record); } catch { pack = defaultContent; }
  const person = id => pack.commanders[id]?.name || pack.characters[id]?.name || text(id) || '記録なし';
  const policies = dictionary(record.submittedPolicies), governance = dictionary(record.governance);
  const dominant = Array.isArray(governance.dominantTags) ? governance.dominantTags.map(id => tags[id] || text(id)) : [];
  // Older records may contain an outcome but no sovereign ID. Do not infer one from points.
  const sovereign = text(record.sovereignId) || Object.values(pack.commanders).find(c => c.name === record.outcome)?.id;
  const date = Number.isFinite(timestamp(record)) ? new Intl.DateTimeFormat('ja-JP', {
    timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23',
  }).format(new Date(record.recordedAt)) + '（日本時間）' : '記録なし';
  return {
    date, commander:person(record.commanderId), sovereign:sovereign ? person(sovereign) : '記録なし',
    score:Number.isFinite(record.finalScore) ? `${record.finalScore}／100` : '記録なし',
    rank:ranks[record.rank] || text(record.rank) || '記録なし',
    outcome:text(record.outcome) || '記録なし',
    party:(Array.isArray(record.partyIds) ? record.partyIds : []).map(id => ({ id, name:person(id) })),
    policies:Object.entries(policies).sort(([a], [b]) => (pack.regions[a]?.displayOrder || 99) - (pack.regions[b]?.displayOrder || 99) || a.localeCompare(b))
      .map(([id, policy]) => ({ city:pack.regions[id]?.name || id,
        label:text(policy?.labelAtCompletion) || text(policy?.policyId) || text(policy) || '記録なし' })),
    governance:governance.kind === 'balanced' ? '3種類以上が同率最多'
      : dominant.length ? `${dominant.join('・')}（${governance.kind === 'dual' ? '同率最多' : '単独最多'}）` : '記録なし',
    counts:Object.entries(dictionary(governance.counts)).filter(([, count]) => Number.isFinite(count))
      .map(([id, count]) => ({ label:tags[id] || id, count })),
    epilogue:text(record.epilogueSnapshot), ensemble:text(record.ensembleAfterwordSnapshot),
    afterwords:Object.entries(dictionary(record.companionAfterwordSnapshots)).filter(([, value]) => text(value))
      .map(([id, value]) => ({ name:person(id), text:value })),
  };
}
