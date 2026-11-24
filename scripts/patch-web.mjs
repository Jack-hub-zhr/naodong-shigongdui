import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = 'dist/index.html';
let html = readFileSync(file, 'utf8');

if (!html.includes('nd-dark-base')) {
  const style = '<style id="nd-dark-base">html,body{background:#060A14;color-scheme:dark}</style>';
  html = html.replace('</style>', `</style>${style}`);
  writeFileSync(file, html);
}

// 部署平台禁止产物路径中出现 node_modules，将导航图标目录改名并同步引用
const legacyAssets = 'dist/assets/node_modules';
if (existsSync(legacyAssets)) {
  renameSync(legacyAssets, 'dist/assets/modules');
}

function patchBundle(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      patchBundle(full);
    } else if (entry.name.endsWith('.js')) {
      const code = readFileSync(full, 'utf8');
      if (code.includes('/assets/node_modules/')) {
        writeFileSync(full, code.replaceAll('/assets/node_modules/', '/assets/modules/'));
      }
    }
  }
}

patchBundle('dist/_expo/static/js/web');
