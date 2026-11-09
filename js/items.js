// Речі на зброю — приціли й тюнінг — окремі записи сховища items: покупка, фото, вага, продаж;
// у прицілу ще тип, сітка й ціна кліку. weaponId — на якому стволі стоїть (null — знято), forId — для якого куплено.
// У стволі w.scopes лишається налаштування пари «приціл × ствол»: пристрілка, висота над стволом, основний.
// Застосунок бачить ствол «зібраним», як раніше (scopes з даними речі й mods), а запис розкладає його назад.
export const ITEMS_V = 1;

// Поля речі; решта полів прицілу в стволі — налаштування пари
const ITEM_KEYS = ['name', 'kind', 'reticle', 'click', 'weight', 'price', 'date', 'usdRate', 'place', 'links', 'specs', 'note',
  'soldDate', 'soldPrice', 'soldPlace', 'soldUsdRate', 'created'];
// Службове речі, якого в «зібраному» стволі не видно
const HIDDEN = new Set(['type', 'weaponId', 'forId', 'ord', 'updated']);

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const omit = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const shown = (it) => Object.fromEntries(Object.entries(it).filter(([k]) => !HIDDEN.has(k)));
/** Річ так, як її бачить ствол: без службових полів (для пари прицілу, що переїжджає на ствол). */
export const itemView = shown;
// Копія в парі для старих версій застосунку (до речей): без назви їхня форма ствола викинула б приціл разом із пристрілкою.
// Нова версія цю копію не читає — дані речі беруться з речі.
const MIRROR = ['name', 'kind', 'click', 'reticle'];
const pairOf = (s) => ({ ...omit(s, [...ITEM_KEYS, 'on', 'pairs']), ...pick(s, MIRROR) });
const same = (a, b) => JSON.stringify(omit(a ?? {}, ['updated'])) === JSON.stringify(omit(b ?? {}, ['updated']));

/** Назва без «приціл/оптика…», регістру, лапок і різниці «x/×» у кратності — щоб упізнати той самий приціл. */
export const scopeKey = (s) => String(s ?? '').toLowerCase()
  .replace(/(\d)\s*[x×х]\s*(\d)/g, '$1x$2')
  .replace(/(^|\s)(приціл|прицел|оптика|оптичний приціл|коліматор|коллиматор|scope)(?=\s|$)/g, ' ')
  .replace(/[«»"″'’“”()]/g, '').replace(/\s+/g, ' ').trim();

/** Приціл зі списку, який дублює тюнінг m: та сама назва без «приціл/оптика…»; часткового збігу мало. */
export function twinOf(scopes, m) {
  if (m?.soldDate) return null;
  const mk = scopeKey(m?.name);
  if (mk.length < 4) return null;
  return (scopes ?? []).find((sc) => scopeKey(sc.name) === mk) ?? null;
}

/**
 * Стан із бази → стволи «зібрані»: scopes — пари з даними речі й on; mods — тюнінг, куплений для ствола,
 * той, що стоїть на ньому, і той, що є в його наборах (свій — першим, за порядком; чужий — далі).
 */
export function hydrate(raw) {
  const items = raw.items ?? [];
  const byId = new Map(items.map((x) => [x.id, x]));
  const weapons = (raw.weapons ?? []).map((w) => {
    if (!w.itemsV) return w;
    const scopes = (w.scopes ?? []).map((p) => {
      const it = byId.get(p.id);
      // Поля речі — лише з речі: стара версія застосунку могла дописати в пару порожню назву
      return it?.type === 'scope' ? { ...shown(it), ...omit(p, ITEM_KEYS), on: it.weaponId === w.id } : null;
    }).filter(Boolean);
    const sets = new Set((w.setups ?? []).flatMap((s) => s.on ?? []));
    const rank = (x) => (x.forId === w.id ? 0 : 1);
    const mods = items.filter((x) => x.type === 'part' && (x.forId === w.id || x.weaponId === w.id || sets.has(x.id)))
      .sort((a, b) => rank(a) - rank(b) || (a.ord ?? 0) - (b.ord ?? 0))
      .map((it) => ({ ...shown(it), on: it.weaponId === w.id }));
    return { ...w, scopes, mods, pairs: w.scopes ?? [] };
  });
  return { ...raw, weapons, items };
}

/**
 * «Зібраний» ствол → запис ствола (пари) і зміни речей. items — речі з бази; elsewhere — id прицілів, що мають пару
 * в інших стволах (таку річ не видаляємо, лише знімаємо з цього). Без поля scopes чи mods — ту частину не чіпаємо.
 */
export function splitWeapon(view, items, elsewhere = new Set()) {
  const wid = view.id;
  const prev = new Map(items.map((x) => [x.id, x]));
  const put = [];
  const del = [];
  const keep = (it) => { if (!same(it, prev.get(it.id))) put.push(it); };
  const mount = (it0, on) => (on ? wid : it0?.weaponId === wid ? null : it0?.weaponId ?? null);
  const forOf = (it0) => (it0 ? it0.forId ?? null : wid);
  // Без поля scopes — пари як були; пара, чия річ ще не прийшла (синхронізація), — лишається
  let pairs = view.scopes ? null : view.pairs;
  if (view.scopes) {
    pairs = view.scopes.map((s) => {
      const it0 = prev.get(s.id);
      keep({ ...(it0 ?? {}), ...pick(s, ITEM_KEYS), id: s.id, type: 'scope', forId: forOf(it0), weaponId: mount(it0, s.on !== false) });
      return pairOf(s);
    });
    const ids = new Set(pairs.map((p) => p.id));
    for (const p of view.pairs ?? []) if (!ids.has(p.id) && !prev.has(p.id)) { pairs.push(p); ids.add(p.id); }
    for (const it of items) {
      if (it.type !== 'scope' || ids.has(it.id)) continue;
      // Прибрали з прицілів ствола: куплений для нього й ніде більше не налаштований — видаляємо, інакше лише знімаємо
      if (it.forId === wid && !elsewhere.has(it.id)) del.push(it.id);
      else if (it.weaponId === wid) keep({ ...it, weaponId: null });
    }
  }
  if (view.mods) {
    view.mods.forEach((m, i) => {
      const it0 = prev.get(m.id);
      // Порядок — лише свого тюнінгу: у чужого він від ствола, для якого куплено
      const own = !it0 || it0.forId === wid;
      keep({ ...(it0 ?? {}), ...omit(m, ['on', 'off']), id: m.id, type: 'part', forId: forOf(it0), weaponId: mount(it0, !!m.on), ...(own ? { ord: i } : {}) });
    });
    const ids = new Set(view.mods.map((m) => m.id));
    for (const it of items) {
      if (it.type !== 'part' || ids.has(it.id)) continue;
      // Прибрали свій — видаляємо; чужий, що стояв тут, — лише знімаємо
      if (it.forId === wid) del.push(it.id);
      else if (it.weaponId === wid) keep({ ...it, weaponId: null });
    }
  }
  const base = omit(view, ['mods', 'scopes', 'pairs']);
  const weapon = { ...base, ...(pairs ? { scopes: pairs } : {}), itemsV: ITEMS_V };
  return { weapon, put, del: del.filter((id) => !put.some((x) => x.id === id)) };
}

/** Видалили ствол: речі, куплені для нього й ніде більше не налаштовані, — теж; що стояло на ньому з чужого — знято. */
export function dropWeapon(wid, items, elsewhere = new Set()) {
  const put = []; const del = [];
  for (const it of items) {
    if (it.forId === wid && !(it.type === 'scope' && elsewhere.has(it.id)) && (!it.weaponId || it.weaponId === wid)) del.push(it.id);
    else if (it.weaponId === wid) put.push({ ...it, weaponId: null });
  }
  return { put, del };
}

const filled = (v) => v !== undefined && v !== null && v !== '';
const photoKey = (type) => (type === 'scope' ? 'scopeId' : 'modId');
const photoOf = (photos, id) => (photos ?? []).find((p) => p.modId === id || p.scopeId === id) ?? null;
const rekey = (p, type, id) => ({ ...omit(p, ['modId', 'scopeId']), [photoKey(type)]: id });
const changed = (list, before) => list.filter((x) => !same(x, before.find((y) => y.id === x.id)));

/**
 * Приціл ↔ тюнінг (raw — стан із бази). Став прицілом — пара в стволі, для якого куплено, і в тому, де стоїть;
 * став тюнінгом — пари прибрано, у кінці тюнінгу свого ствола. Фото переходить під новий тип.
 */
export function retype(id, type, raw) {
  const it = raw.items.find((x) => x.id === id);
  const out = { items: { put: [] }, weapons: { put: [] }, photos: { put: [] } };
  if (!it || it.type === type) return out;
  if (type === 'scope') {
    out.items.put.push({ ...omit(it, ['ord']), type });
    for (const w of raw.weapons) {
      if (!w.itemsV || (w.id !== it.forId && w.id !== it.weaponId) || (w.scopes ?? []).some((p) => p.id === id)) continue;
      out.weapons.put.push({ ...w, scopes: [...(w.scopes ?? []), pairOf(shown(it))] });
    }
  } else {
    const ord = Math.max(-1, ...raw.items.filter((x) => x.type === 'part' && x.forId === it.forId).map((x) => x.ord ?? 0)) + 1;
    out.items.put.push({ ...it, type, ord });
    for (const w of raw.weapons) {
      if ((w.scopes ?? []).some((p) => p.id === id)) out.weapons.put.push({ ...w, scopes: w.scopes.filter((p) => p.id !== id) });
    }
  }
  const p = photoOf(raw.photos, id);
  if (p) out.photos.put.push(rekey(p, type, id));
  return out;
}

/**
 * «Це та сама річ»: src зливається в dst і зникає. У dst лишається своє, порожнє — з src; стоїть — де стояла
 * будь-яка з двох (dst — першою). Набори посилаються на dst. Приціл у приціл: пари, DOPE, стрільби й мішені
 * переходять на dst (пара dst у тому самому стволі важливіша). Фото src — dst, якщо в нього свого нема;
 * інакше drop — id фото, які застосунок прибирає разом із копією на Диску.
 */
export function mergeItems(srcId, dstId, raw) {
  const src = raw.items.find((x) => x.id === srcId);
  const dst = raw.items.find((x) => x.id === dstId);
  const out = { items: { put: [], del: [] }, weapons: { put: [] }, movements: { put: [] }, targets: { put: [] }, photos: { put: [] }, drop: [] };
  if (!src || !dst || src.id === dst.id) return out;
  const scopes = src.type === 'scope' && dst.type === 'scope';
  const m = { ...dst };
  for (const k of ITEM_KEYS) if (!['name', 'created', 'weight'].includes(k) && !k.startsWith('sold') && !filled(m[k]) && filled(src[k])) m[k] = src[k];
  if (!(m.weight > 0) && src.weight > 0) m.weight = src.weight;
  if (!m.weaponId && src.weaponId) m.weaponId = src.weaponId;
  if (!m.forId && src.forId) m.forId = src.forId;
  out.items.put.push(m);
  out.items.del.push(src.id);
  const to = (id) => (id === src.id ? dst.id : id);
  out.weapons.put = changed((raw.weapons ?? []).filter((w) => w.itemsV).map((w) => {
    let pairs = w.scopes ?? [];
    const hasDst = pairs.some((p) => p.id === dst.id);
    if (scopes) pairs = hasDst ? pairs.filter((p) => p.id !== src.id) : pairs.map((p) => (p.id === src.id ? { ...p, id: dst.id, ...pick(m, MIRROR) } : p));
    // Тюнінг злили в приціл, що тепер стоїть на стволі без його пари, — пара потрібна
    if (dst.type === 'scope' && m.weaponId === w.id && !pairs.some((p) => p.id === dst.id)) pairs = [...pairs, pairOf(shown(m))];
    return {
      ...w,
      scopes: pairs,
      ...(w.setups ? { setups: w.setups.map((s) => ({ ...s, on: [...new Set(s.on.map(to))], ...(s.main ? { main: to(s.main) } : {}) })) } : {}),
      ...(scopes && w.dope ? { dope: w.dope.map((d) => (d.scopeId === src.id ? { ...d, scopeId: dst.id } : d)) } : {}),
    };
  }), raw.weapons ?? []);
  if (scopes) {
    out.movements.put = (raw.movements ?? []).filter((x) => x.scopeId === src.id).map((x) => ({ ...x, scopeId: dst.id }));
    out.targets.put = (raw.targets ?? []).filter((x) => x.scopeId === src.id).map((x) => ({ ...x, scopeId: dst.id }));
  }
  const sp = photoOf(raw.photos, src.id);
  if (sp && photoOf(raw.photos, dst.id)) out.drop.push(sp.id);
  else if (sp) out.photos.put.push(rekey(sp, dst.type, dst.id));
  return out;
}

/**
 * Разовий перенос старих стволів (scopes з покупкою, mods) у речі. Наявні речі не перезаписує й нічого не видаляє:
 * запис ствола зі старого пристрою, що прийшов після переносу, не відкотить новіших правок.
 * Тюнінг-дубль прицілу з тією самою назвою зливається в приціл: покупка, вага, фото; у наборах його id стає id прицілу.
 */
export function migrateWeapons(legacy, raw) {
  const have = new Set((raw.items ?? []).map((x) => x.id));
  const photos = raw.photos ?? [];
  const out = { weapons: { put: [] }, items: { put: [] }, photos: { put: [], del: [] } };
  for (const w of legacy) {
    const scopes = (w.scopes ?? []).map((s) => ({ ...s }));
    const mods = w.mods ?? [];
    const into = new Map();
    for (const m of mods) {
      const sc = twinOf(scopes, m);
      if (!sc) continue;
      into.set(m.id, sc.id);
      for (const k of ['price', 'date', 'usdRate', 'place']) if (filled(m[k])) sc[k] = m[k];
      if (m.weight > 0) sc.weight = m.weight;
      for (const k of ['specs', 'note', 'links']) if (!filled(sc[k]) && filled(m[k])) sc[k] = m[k];
      const mp = photos.find((p) => p.modId === m.id);
      if (mp && !photos.some((p) => p.scopeId === sc.id) && !out.photos.put.some((p) => p.scopeId === sc.id)) {
        const { modId, ...rest } = mp;
        out.photos.put.push({ ...rest, scopeId: sc.id });
      } else if (mp) out.photos.del.push(mp.id);
    }
    for (const s of scopes) {
      if (have.has(s.id)) continue;
      out.items.put.push({ ...pick(s, ITEM_KEYS), id: s.id, type: 'scope', forId: w.id, weaponId: s.on !== false ? w.id : null });
    }
    mods.filter((m) => !into.has(m.id)).forEach((m, i) => {
      if (have.has(m.id)) return;
      out.items.put.push({ ...omit(m, ['on', 'off']), id: m.id, type: 'part', forId: w.id, weaponId: m.on ? w.id : null, ord: i });
    });
    const setups = w.setups?.map((s) => ({ ...s, on: [...new Set(s.on.map((id) => into.get(id) ?? id))] }));
    out.weapons.put.push({
      ...omit(w, ['mods']),
      scopes: scopes.map(pairOf),
      ...(setups ? { setups } : {}),
      itemsV: ITEMS_V,
    });
  }
  return out;
}
