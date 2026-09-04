import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(d, acc = []) {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === 'dist') continue;
    const p = join(d, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(n)) acc.push(p);
  }
  return acc;
}

const pat = /@openai\/|@anthropic\/|from ['"]codex|from ['"]acp-|@anthropic-ai/;
const hits = [];
for (const f of walk('apps/web/src')) {
  if (pat.test(readFileSync(f, 'utf8'))) hits.push(f);
}
if (hits.length) {
  console.log('VENDOR_HITS', hits.join('\n'));
  process.exit(1);
}
console.log('VENDOR_SDK_SCAN: clean');
