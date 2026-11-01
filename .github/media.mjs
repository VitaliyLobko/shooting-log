// Відбитки картинок для service worker'а: `node .github/media.mjs` переписує media.js.
// Картинки з ASSETS лежать в окремому кеші й качаються заново лише тоді, коли змінився їхній відбиток
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Лише двійкові файли: текстові (svg) git на Windows зберігає з CRLF — відбиток розійшовся б із перевіркою на GitHub
const BIN = /\.(webp|png|jpe?g|woff2|mp4)$/;

export function mediaJs() {
  const assets = readFileSync('sw.js', 'utf8').match(/const ASSETS = \[([\s\S]*?)\];/)[1];
  const rows = [...assets.matchAll(/'\.\/([^']+)'/g)].map(([, path]) => path)
    .filter((path) => BIN.test(path) && existsSync(path))
    .map((path) => `  '${path}': '${createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12)}',`);
  return `// Згенеровано .github/media.mjs — руками не правити, а запустити: node .github/media.mjs
// Відбиток кожної картинки з ASSETS: service worker качає заново лише ті, де він змінився
self.MEDIA = {
${rows.join('\n')}
};
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync('media.js', mediaJs());
  console.log('media.js оновлено');
}
