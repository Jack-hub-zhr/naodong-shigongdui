import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const src = resolve(root, 'web');
const out = resolve(root, 'dist');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(src, out, { recursive: true });

// write one index.html per route so deep links still resolve
// when the host has no rewrite rule.
const index = await readFile(resolve(out, 'index.html'), 'utf8');
for (const route of ['idea', 'build', 'review', 'profile', '我的', '脑洞', '施工', '验收']) {
  const dir = resolve(out, route);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'index.html'), index);
}

if (!existsSync(resolve(out, 'js/main.js'))) {
  throw new Error('构建失败：js/main.js 未拷贝');
}

// Bust the module cache with the same version as index.html, not just main.js.
// Without this, store/i18n/config can stay stale in a returning browser.
const version = index.match(/[?&]v=([A-Za-z0-9]+)/)?.[1] || String(Date.now());
const { readdir } = await import('node:fs/promises');
for (const name of await readdir(resolve(out, 'js'))) {
  if (!name.endsWith('.js')) continue;
  const file = resolve(out, 'js', name);
  const code = await readFile(file, 'utf8');
  const patched = code.replace(/from\s+['"](\.[^'"]*?\.js)['"]/g, (m, spec) => `from '${spec}?v=${version}'`);
  if (patched !== code) await writeFile(file, patched);
}

console.log('[build-web] dist ready →', out);
