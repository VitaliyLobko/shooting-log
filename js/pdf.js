// Текст із PDF без бібліотек: вистачає для таблиць, які друкує Chromium (Skia) — так їх віддає «Стрілець».
// Шрифти з /ToUnicode, потоки FlateDecode (розпаковує сам браузер), текст — оператори Tf/Tm/Td/Tj/TJ.
// Не повноцінний розбір PDF: шифровані файли, потоки об'єктів і сторінки-скани не підтримуються.

const latin1 = (bytes) => new TextDecoder('latin1').decode(bytes);

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Об'єкти файлу: номер → { dict (текст словника), data (байти потоку, вже розпаковані) }. */
async function readObjects(bytes) {
  const text = latin1(bytes);
  const objects = new Map();
  const re = /(\d+) 0 obj\b/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endobj', start);
    if (end < 0) break;
    const body = text.slice(start, end);
    const at = body.search(/\bstream\r?\n/);
    const dict = at < 0 ? body : body.slice(0, at);
    let data = null;
    if (at >= 0) {
      const from = start + at + body.slice(at).match(/^stream\r?\n/)[0].length;
      const len = dict.match(/\/Length (\d+)(?! \d+ R)/);
      const to = len ? from + Number(len[1]) : start + body.lastIndexOf('endstream');
      data = bytes.subarray(from, to);
      if (/\/FlateDecode/.test(dict)) data = await inflate(data).catch(() => null);
    }
    objects.set(Number(m[1]), { dict, data });
    re.lastIndex = end;
  }
  return objects;
}

const ref = (dict, key) => Number(dict.match(new RegExp(`/${key}\\s+(\\d+) 0 R`))?.[1]);

/** /ToUnicode: код гліфа → символи. Коди 1 або 2 байти — як у bfchar/bfrange. */
function readCmap(text) {
  const map = new Map();
  const hex = (s) => parseInt(s, 16);
  const uni = (s) => String.fromCodePoint(...(s.match(/.{4}/g) ?? []).map(hex));
  for (const block of text.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const [, code, u] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(hex(code), uni(u));
  }
  for (const block of text.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const [, a, b, rest] of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g)) {
      const list = rest.startsWith('[') ? [...rest.matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => x[1]) : null;
      for (let c = hex(a); c <= hex(b); c += 1) {
        if (list) map.set(c, uni(list[c - hex(a)] ?? ''));
        else map.set(c, String.fromCodePoint(hex(rest.slice(1, -1)) + c - hex(a)));
      }
    }
  }
  const bytes = /<([0-9A-Fa-f]{4})>/.test(text.match(/begincodespacerange([\s\S]*?)endcodespacerange/)?.[1] ?? '') ? 2 : 1;
  return { map, bytes };
}

/** Шрифт сторінки: таблиця символів і ширини гліфів (у тисячних кегля, як каже /FontMatrix). */
function readFont(objects, dict) {
  const cmapObj = objects.get(ref(dict, 'ToUnicode'));
  const cmap = cmapObj?.data ? readCmap(latin1(cmapObj.data)) : { map: new Map(), bytes: 1 };
  const first = Number(dict.match(/\/FirstChar (\d+)/)?.[1] ?? 0);
  const widths = (dict.match(/\/Widths\s*\[([^\]]*)\]/)?.[1] ?? '').trim().split(/\s+/).map(Number);
  const scale = Number(dict.match(/\/FontMatrix\s*\[\s*([\d.eE+-]+)/)?.[1] ?? 0.001);
  return { ...cmap, width: (code) => (widths[code - first] || 0) * scale };
}

/** Рядок PDF (hex <..> чи літеральний (..)) → коди гліфів. */
function codes(token, bytes) {
  let raw;
  if (token.startsWith('<')) {
    const hex = token.slice(1, -1).replace(/\s+/g, '');
    raw = (hex.match(/.{1,2}/g) ?? []).map((x) => parseInt(x.padEnd(2, '0'), 16));
  } else {
    raw = [];
    const s = token.slice(1, -1);
    for (let i = 0; i < s.length; i += 1) {
      if (s[i] !== '\\') { raw.push(s.charCodeAt(i)); continue; }
      const next = s[++i];
      const oct = s.slice(i).match(/^[0-7]{1,3}/)?.[0];
      if (oct) { raw.push(parseInt(oct, 8)); i += oct.length - 1; } else raw.push({ n: 10, r: 13, t: 9, b: 8, f: 12 }[next] ?? next.charCodeAt(0));
    }
  }
  if (bytes === 1) return raw;
  const out = [];
  for (let i = 0; i + 1 < raw.length; i += 2) out.push(raw[i] * 256 + raw[i + 1]);
  return out;
}

const TOKEN = /\/[^\s/[\]<>()]+|<[0-9A-Fa-f\s]*>|\((?:\\.|[^\\)])*\)|\[|\]|[+-]?(?:\d+\.?\d*|\.\d+)|[A-Za-z'"*]+/g;

/** Шматки тексту сторінки з координатами: { x0, x1, y, size, text }. Розрив — новий BT, перенос рядка чи широкий проміжок. */
function pageRuns(content, fonts) {
  const runs = [];
  const stack = [];
  let font = null;
  let size = 0;
  let lineX = 0;
  let lineY = 0;
  let x = 0;
  let run = null;
  const flush = () => { if (run?.text.trim()) runs.push({ ...run, text: run.text.trim() }); run = null; };
  for (const [tok] of content.matchAll(TOKEN)) {
    if (/^[A-Za-z'"*]+$/.test(tok) && !['true', 'false', 'null'].includes(tok)) {
      const args = stack.splice(0);
      if (tok === 'BT') { flush(); lineX = 0; lineY = 0; x = 0; }
      else if (tok === 'ET') flush();
      else if (tok === 'Tf') { font = fonts.get(args[0]) ?? null; size = Number(args[1]) || 0; }
      else if (tok === 'Tm') { flush(); lineX = Number(args[4]); lineY = Number(args[5]); x = lineX; }
      else if (tok === 'Td' || tok === 'TD') {
        const tx = Number(args[0]);
        const ty = Number(args[1]);
        lineX += tx;
        lineY += ty;
        // новий рядок або помітна дірка між гліфами — інша комірка
        if (ty !== 0 || (run && lineX - run.x1 > size * 0.9)) flush();
        x = lineX;
      } else if (tok === 'Tj' || tok === 'TJ' || tok === "'" || tok === '"') {
        if (!font) continue;
        // TJ — масив рядків і зсувів (у тисячних кегля, мінус — вправо)
        const parts = tok === 'TJ' && Array.isArray(args.at(-1)) ? args.at(-1) : [args.at(-1)];
        for (const part of parts) {
          if (typeof part !== 'string' || !/^[<(]/.test(part)) { x -= (Number(part) / 1000) * size || 0; continue; }
          for (const code of codes(part, font.bytes)) {
            const ch = font.map.get(code) ?? '';
            run ??= { x0: x, x1: x, y: lineY, size, text: '' };
            run.text += ch;
            x += font.width(code) * size;
            run.x1 = Math.max(run.x1, x);
          }
        }
      }
      continue;
    }
    if (tok === ']') {
      const i = stack.lastIndexOf('[');
      stack.push(stack.splice(i).slice(1));
    } else stack.push(tok);
  }
  flush();
  return runs;
}

/**
 * Усі шматки тексту PDF по сторінках: [{ page, x0, x1, y, size, text }].
 * y — як у самому файлі (у Skia росте донизу); порівнювати можна лише в межах сторінки.
 */
export async function pdfRuns(buffer) {
  const objects = await readObjects(new Uint8Array(buffer));
  const out = [];
  let page = 0;
  for (const { dict } of objects.values()) {
    if (!/\/Type\s*\/Page\b(?!s)/.test(dict)) continue;
    page += 1;
    let resources = dict.match(/\/Resources\s*<<([\s\S]*)>>/)?.[1];
    if (!resources && ref(dict, 'Resources')) resources = objects.get(ref(dict, 'Resources'))?.dict;
    const fontBlock = resources?.match(/\/Font\s*<<([^>]*)>>/)?.[1] ?? '';
    const fonts = new Map([...fontBlock.matchAll(/\/(\S+)\s+(\d+) 0 R/g)]
      .map(([, name, n]) => [`/${name}`, readFont(objects, objects.get(Number(n))?.dict ?? '')]));
    const contentRefs = dict.match(/\/Contents\s*\[([^\]]*)\]/)?.[1].match(/\d+(?= 0 R)/g) ?? [ref(dict, 'Contents')];
    const content = contentRefs.map((n) => objects.get(Number(n))?.data).filter(Boolean).map(latin1).join('\n');
    for (const r of pageRuns(content, fonts)) out.push({ page, ...r });
  }
  return out;
}

/** Шматки → лінії { page, y, runs }: однакова y з допуском, усередині — зліва направо. */
function groupLines(runs) {
  const lines = [];
  for (const r of [...runs].sort((a, b) => a.page - b.page || a.y - b.y || a.x0 - b.x0)) {
    const line = lines.at(-1);
    if (line && line.page === r.page && Math.abs(line.y - r.y) <= Math.max(2, r.size * 0.3)) line.runs.push(r);
    else lines.push({ page: r.page, y: r.y, runs: [r] });
  }
  lines.forEach((l) => l.runs.sort((a, b) => a.x0 - b.x0));
  return lines;
}

/** Рядки тексту: комірки через табуляцію — для вставки в поле, якщо таблицю не розпізнано. */
export function runsToLines(runs) {
  return groupLines(runs).map((l) => l.runs.map((r) => r.text).join('\t'));
}

const isNumber = (s) => /^[+-]?\d+(?:[.,]\d+)?$/.test(s);

/**
 * Таблиця з PDF: рядки, де всі комірки — числа; підписи колонок — шапка над ними (текст, що стоїть
 * над центром колонки); meta — пари «підпис → значення» з решти рядків (параметри розрахунку).
 */
export function pdfTable(runs) {
  const lines = groupLines(runs);
  const numeric = lines.filter((l) => l.runs.length >= 3 && l.runs.every((r) => isNumber(r.text)));
  if (!numeric.length) return null;
  const n = numeric[0].runs.length;
  const data = numeric.filter((l) => l.runs.length === n);
  const centers = Array.from({ length: n }, (_, i) => data.reduce((s, l) => s + (l.runs[i].x0 + l.runs[i].x1) / 2, 0) / data.length);
  const step = Math.min(...centers.slice(1).map((c, i) => c - centers[i]));
  // Шапка — щільний блок ліній над першим рядком даних; вище — параметри розрахунку
  const first = data[0];
  const size = first.runs[0].size || 12;
  const above = lines.filter((l) => l.page === first.page && l.y < first.y && !numeric.includes(l)).reverse();
  const header = [];
  let bottom = first.y;
  for (const l of above) {
    if (bottom - l.y > (header.length ? 1.8 : 3) * size) break;
    header.push(l);
    bottom = l.y;
  }
  const labels = centers.map((c) => header.flatMap((l) => l.runs)
    .filter((r) => Math.abs((r.x0 + r.x1) / 2 - c) < step / 2)
    .sort((a, b) => a.y - b.y || a.x0 - b.x0).map((r) => r.text).join(' '));
  const meta = {};
  for (const l of lines) {
    if (numeric.includes(l) || header.includes(l)) continue;
    for (let i = 0; i + 1 < l.runs.length; i += 2) meta[l.runs[i].text] = l.runs[i + 1].text;
  }
  return { labels, rows: data.map((l) => l.runs.map((r) => Number(r.text.replace(',', '.')))), meta };
}
