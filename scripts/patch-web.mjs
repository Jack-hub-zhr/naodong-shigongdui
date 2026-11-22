import { readFileSync, writeFileSync } from 'node:fs';

const file = 'dist/index.html';
let html = readFileSync(file, 'utf8');

if (!html.includes('nd-dark-base')) {
  const style = '<style id="nd-dark-base">html,body{background:#060A14;color-scheme:dark}</style>';
  html = html.replace('</style>', `</style>${style}`);
  writeFileSync(file, html);
}
