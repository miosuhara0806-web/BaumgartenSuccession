import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, transition, getCurrentTextPage } from '../src/engine.js';
import { content } from '../src/content/prologue.js';

test('連続する同一話者の短い文章を一つの表示ページにまとめる', () => {
  let run=createRun(content,{runId:'reading-page-test',now:'2026-11-01T00:00:00.000Z'});
  const firstPage=getCurrentTextPage(run,content);
  assert.equal(firstPage.length,2);
  assert.ok(firstPage.every(block=>block.speakerId===null));
  run=transition(run,{type:'ACK_TEXT'},content);
  run=transition(run,{type:'ACK_TEXT'},content);
  const kingPage=getCurrentTextPage(run,content);
  assert.equal(kingPage.length,1);
  assert.equal(kingPage[0].speakerId,'support.king');
});

test('監督官の主人公への直接呼びかけは敬称付きで出力される', () => {
  const directWithoutHonorific=Object.values(content.textBlocks)
    .filter(block=>/「\{commander\}(?:、|。|ご覧)/.test(block.text))
    .map(block=>block.id);
  assert.deepEqual(directWithoutHonorific,[]);
  const respectful=Object.values(content.textBlocks)
    .filter(block=>block.text.includes('{commander}様'))
    .map(block=>block.id);
  assert.ok(respectful.length>=6);
});
