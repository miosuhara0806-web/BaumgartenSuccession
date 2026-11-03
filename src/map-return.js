// A run's random UUID seeds independent draws for each eligible boundary.
// Keeping the seed + boundary stable also prevents rerolls from a pre-return save.
function sample(runId, key, stream) {
  let hash = 2166136261;
  for (const char of `${runId}\0${key}\0${stream}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000;
}

export function drawMapReturn(run, key) {
  if (sample(run.runId, key, 'occurrence') >= 1 / 3) return null;
  return {
    speakerId: run.partyIds[Math.floor(sample(run.runId, key, 'speaker') * run.partyIds.length)],
    lineIndex: Math.floor(sample(run.runId, key, 'line') * 2),
  };
}

export function getMapReturnChatter(run, content) {
  if (run.position.phase !== 'map' || !content.mapReturnLines) return null;
  const draw = run.mapReturnChatter?.draws[run.mapReturnChatter.currentKey];
  return draw && run.partyIds.includes(draw.speakerId)
    ? { ...draw, text: content.mapReturnLines[draw.speakerId][draw.lineIndex] } : null;
}
