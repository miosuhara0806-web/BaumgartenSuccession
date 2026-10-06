import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes:true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? walk(join(dir,e.name)) : [join(dir,e.name)]))).flat();
}
let count = 0;
for (const file of (await Promise.all(['src','scripts','tests'].map(walk))).flat().filter(f => f.endsWith('.js'))) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  if (check.status !== 0) { process.stderr.write(check.stderr); process.exitCode = 1; }
  count++;
}
if (!process.exitCode) console.log(`${count} JavaScript files: syntax OK`);
