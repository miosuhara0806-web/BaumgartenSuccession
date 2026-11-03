// Presentation-only edition. Keep every historical block, read key and branch intact.
import { content as previous } from './map-return.js';
import { endingManuscript as script } from './ending-manuscript.js';

export const content = structuredClone(previous);
content.contentVersion = 'baumgarten-ending-reading-2026-11-03';
content.hideMapRest = true;
content.endingReading = true;

// One-based inclusive ends in the original scene block order, before condition filtering.
// Explicit topic boundaries also keep a saved position independent of viewport width.
function pages(name, ends) {
  const scene = content.scenes[`ending.${name}`];
  if (ends.at(-1) !== scene.blocks.length || ends.some((end, i) => !Number.isInteger(end) || end <= (ends[i - 1] || 0))) {
    throw new Error(`Ending reading boundaries no longer match ${name}`);
  }
  scene.readingPageEnds = ends;
}
function chunkedPages(name, chunks) {
  let end = 0;
  pages(name, chunks.flatMap(sizes => sizes.map(size => end += size)));
}

pages('return', [3, 9, 15, 18]);
pages('reunion', [2, 8, 13, 21, 25, 27]);
pages('assessment', [6, 10, 18, 21]);
chunkedPages('governance', Object.values(script.governance).map(rows => rows.length === 6 ? [3, 3] : [rows.length]));
chunkedPages('rank', [[5, 3], [5, 3], [4, 4]]);
// The current king's declaration is always a page of its own, in all four branches.
chunkedPages('verdict', [[2], [1, 4, 6, 4], [1, 4, 7, 3], [1, 3, 7, 4, 6], [1, 3, 4, 6, 6]]);
pages('end-war', [6, 10, 16, 18]);
pages('coronation-intro', [5]);
chunkedPages('coronation', [[5, 5, 3, 4, 5, 7], [5, 7, 4, 5, 7, 4]]);
pages('coronation-cg', [1]);
pages('coronation-after', [3]);
// Arrival / banter / the changing kingdom / proposal / agreement / naming / farewell.
pages('ensemble', [5, 9, 13, 19, 27, 33, 41, 46, 52, 60, 66, 71, 76, 81, 88, 94, 99, 105, 110]);
pages('farewell', [1]);

content.scenes['ending.ensemble'].ensembleCg = {
  src: './src/assets/八人の仲間たち_陽だまりの談話会.png',
  width: 1672, height: 941,
  alt: '陽だまりの一室で、八人の仲間たちが茶菓子を囲んで談笑している。',
  blockIds: content.scenes['ending.ensemble'].blocks.slice(0, 5),
};
