// Markdown статей (заголовки, списки, таблиці, цитати, жирний/курсив, код, посилання, картинки) — одразу в DOM, без innerHTML.

// Картинка ![підпис](photo:id) — вузол малює застосунок: фото лежать у його сховищі, не за URL
let image = null;
const IMAGE_LINE = /^\s*!\[([^\]]*)\]\(photo:([\w-]+)\)\s*$/;

function picture(id, alt) {
  return image?.(id, alt) ?? document.createTextNode(alt ? `[${alt}]` : '');
}

/** Рядок → вузли: **жирний**, *курсив*, `код`, [текст](https://…), ![підпис](photo:id). */
function inline(text) {
  const out = [];
  const re = /(!\[([^\]]*)\]\(photo:([\w-]+)\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    let el;
    if (m[3] !== undefined) el = picture(m[3], m[2]);
    else if (m[4] !== undefined) { el = document.createElement('strong'); el.append(...inline(m[4])); }
    else if (m[5] !== undefined) { el = document.createElement('em'); el.append(...inline(m[5])); }
    else if (m[6] !== undefined) { el = document.createElement('code'); el.textContent = m[6]; }
    else {
      el = document.createElement('a');
      el.href = m[8];
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.textContent = m[7];
    }
    out.push(el);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

const make = (tag, text) => {
  const el = document.createElement(tag);
  el.append(...inline(text));
  return el;
};

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isRule = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

/**
 * Текст статті → фрагмент DOM. «#» і «##» — h3 (h2 зайнятий назвою статті), «###» — h4, «####» — h5.
 * image(id, alt) → вузол картинки; без нього на місці картинки лишається підпис.
 */
export function renderMarkdown(src, { image: draw = null } = {}) {
  const prev = image;
  image = draw;
  try {
    return blocks(src);
  } finally {
    image = prev;
  }
}

function blocks(src) {
  const frag = document.createDocumentFragment();
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const head = line.match(/^(#{1,4})\s+(.*)$/);
    if (head) { frag.append(make(`h${Math.max(head[1].length, 2) + 1}`, head[2])); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { frag.append(document.createElement('hr')); i++; continue; }
    const pic = line.match(IMAGE_LINE);
    if (pic) {
      // Окремий рядок — картинка на всю ширину з підписом
      const fig = document.createElement('figure');
      fig.append(picture(pic[2], ''));
      if (pic[1]) fig.append(make('figcaption', pic[1]));
      frag.append(fig);
      i++;
      continue;
    }
    if (line.trimStart().startsWith('```')) {
      const pre = document.createElement('pre');
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) body.push(lines[i++]);
      i++;
      pre.textContent = body.join('\n');
      frag.append(pre);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isRule(lines[i + 1])) {
      const table = document.createElement('table');
      const tr = table.createTHead().insertRow();
      for (const c of cells(line)) tr.append(make('th', c));
      const tbody = table.createTBody();
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const row = tbody.insertRow();
        for (const c of cells(lines[i++])) row.append(make('td', c));
      }
      const wrap = document.createElement('div');
      wrap.className = 'md-table';
      wrap.append(table);
      frag.append(wrap);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote = document.createElement('blockquote');
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      quote.append(blocks(body.join('\n')));
      frag.append(quote);
      continue;
    }
    const bullet = /^\s*[-*+]\s+/;
    const number = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || number.test(line)) {
      const re = bullet.test(line) ? bullet : number;
      const list = document.createElement(re === bullet ? 'ul' : 'ol');
      while (i < lines.length && re.test(lines[i])) {
        let text = lines[i++].replace(re, '');
        // Продовження пункту — рядок з відступом
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i])) text += ` ${lines[i++].trim()}`;
        list.append(make('li', text));
      }
      frag.append(list);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*+]\s|\s*\d+[.)]\s|\s*>|```)/.test(lines[i])
      && !IMAGE_LINE.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isRule(lines[i + 1]))) para.push(lines[i++].trim());
    const p = document.createElement('p');
    para.forEach((text, n) => {
      if (n) p.append(document.createElement('br'));
      p.append(...inline(text));
    });
    frag.append(p);
  }
  return frag;
}

/** Перший змістовний рядок без розмітки — для підпису в списку статей. */
export function excerpt(src, max = 120) {
  const line = String(src ?? '').split('\n').map((l) => l.trim())
    .find((l) => l && !/^(#|```|\||-{3,}|>)/.test(l) && !IMAGE_LINE.test(l)) ?? '';
  const plain = line.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/^[-*+]\s+|^\d+[.)]\s+/, '').replace(/\*\*|`|\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
