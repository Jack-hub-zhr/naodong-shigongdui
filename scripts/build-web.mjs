import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const src = resolve(root, 'web');
const out = resolve(root, 'dist');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(src, out, { recursive: true });

// 静态站点 SPA 回退：把四个路由写成独立 index.html 副本，
// 即使托管端 rewrite 失效，深链接也能 200。
const index = await readFile(resolve(out, 'index.html'), 'utf8');
for (const route of ['idea', 'build', 'review', 'profile', '我的', '脑洞', '施工', '验收']) {
  const dir = resolve(out, route);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'index.html'), index);
}

if (!existsSync(resolve(out, 'js/main.js'))) {
  throw new Error('构建失败：js/main.js 未拷贝');
}

console.log('[build-web] dist ready →', out);
