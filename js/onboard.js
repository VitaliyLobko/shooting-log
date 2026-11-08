// Помічник першого запуску: свій ствол, приціл і набій за три кроки — і одразу «Поправки зараз».
// Пише ті самі записи, що й повні форми (ствол з прицілом, набій), тож далі все уточнюється в картках.
import { h, sheet, form, chips, fieldError } from './ui.js';
import { t } from './i18n.js';
import * as M from './model.js';
import { parseTwist } from './stability.js';

const CALIBERS = ['.223 Rem', '.308 Win', '7.62×39', '5.45×39', '12 кал'];
const OTHER = 'other';
const NONE = 'none';
// Лише набої, балістика яких уже є в застосунку (таблиці тренажера): BC G7 за Litz, швидкість — з тестового ствола
const PRESETS = [
  { cal: '.223 Rem', name: 'M855 62 gr', bulletWeight: 62, bc: 0.151, mv: 948, testBarrel: 20, bulletLength: 23 },
  { cal: '.223 Rem', name: 'M193 55 gr', bulletWeight: 55, bc: 0.121, mv: 990, testBarrel: 20, bulletLength: null },
  { cal: '.308 Win', name: '175 gr HPBT', bulletWeight: 175, bc: 0.243, mv: 815, testBarrel: 24, bulletLength: null },
];
const KIND_NAME = { optic: 'Оптика', red: 'Коліматор' };
const num = (v) => Math.max(0, Number(String(v ?? '').replace(',', '.')) || 0);
const numInput = (placeholder, value = '') => {
  const el = h('input', { type: 'number', inputmode: 'decimal', step: 'any', min: 0, placeholder });
  el.value = value;
  return el;
};
const field = (label, input, hint = null) => h('label', { class: 'field wide' }, h('span', { class: 'field-label' }, label), input,
  hint ? h('small', { class: 'muted' }, hint) : null);
const chipField = (label, el, hint = null) => h('div', { class: 'field wide' }, h('span', { class: 'field-label' }, label), el,
  hint ? h('small', { class: 'muted' }, hint) : null);

/**
 * ctx: save(store, obj) — записати; findCartridge(name, caliber) — такий набій уже є; done(weaponId, cartridgeId) — що відкрити після збереження.
 */
export function onboard(ctx) {
  const d = {
    caliber: '', calOther: '', name: '', barrel: '', twist: '',
    kind: 'optic', scopeName: '', reticle: 'mil', click: 'mil0.1', zero: '100', sh: '',
    preset: '', ammo: { name: '', bulletWeight: '', bc: '', dragModel: 'G7', mv: '', testBarrel: '' },
  };
  const caliber = () => (d.caliber === OTHER ? d.calOther.trim() : d.caliber);
  const smooth = () => !!M.barrelLifeFor(caliber())?.smooth;
  const presets = () => PRESETS.filter((p) => M.sameCaliber(p.cal, caliber()));
  let step = 0;
  const body = h('div', { class: 'onboard' });

  // Крок 1: зброя — калібр, назва, ствол
  const gunStep = () => {
    const other = h('input', { type: 'text', class: 'onboard-cal-other', placeholder: '6.5 Creedmoor', autocomplete: 'off', hidden: d.caliber !== OTHER });
    other.value = d.calOther;
    // Свій калібр може виявитися гладким («20 кал») — тоді «Далі» стає «Готово»
    other.addEventListener('input', () => { d.calOther = other.value; rifled.hidden = smooth(); next().textContent = smooth() ? t('Готово') : t('Далі'); });
    // Калібр змінює решту кроку (гладкий — без ствола й прицілу, «Готово» замість «Далі») — малюємо крок заново
    const cal = chips([...CALIBERS.map((c) => [c, c]), [OTHER, t('Інший')]], d.caliber, (v) => {
      d.caliber = v; paint();
      if (v === OTHER) body.querySelector('.onboard-cal-other')?.focus();
    });
    const name = h('input', { type: 'text', placeholder: 'AR-15 16″', autocomplete: 'off' });
    name.value = d.name;
    name.addEventListener('input', () => { d.name = name.value; });
    const barrel = numInput('16', d.barrel); barrel.addEventListener('input', () => { d.barrel = barrel.value; });
    const twist = h('input', { type: 'text', placeholder: '1:7', autocomplete: 'off' });
    twist.value = d.twist; twist.addEventListener('input', () => { d.twist = twist.value; });
    const rifled = h('div', { class: 'form', hidden: smooth() },
      field(t('Довжина ствола, ″'), barrel, t('З паспорта чи сайту. Від неї залежить швидкість кулі.')),
      field(t('Крок нарізів'), twist, t('Як на стволі: 1:7, 1:8, 1:10. Можна пропустити.')));
    return [
      h('p', { class: 'muted' }, t('Три короткі кроки, і застосунок покаже поправки саме для вашої зброї. Усе потім можна уточнити в картках.')),
      h('div', { class: 'form' }, chipField(t('Калібр'), h('div', {}, cal, other, h('p', { class: 'warn-text small onboard-err', hidden: true }))), field(t('Назва'), name)),
      rifled,
    ];
  };

  // Крок 2: приціл — головне для поправок: на скільки пристріляний і висота над стволом
  const scopeStep = () => {
    const kind = chips([['optic', t('Оптика')], ['red', t('Коліматор')]], d.kind, (v) => {
      d.kind = v;
      if (v === 'red') {
        d.reticle = 'dot'; ret.value = 'dot'; ret.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.value === 'dot'));
        // У коліматорів клік зазвичай ½ MOA
        if (d.click === 'mil0.1') { d.click = 'moa0.5'; click = clickChips(); clickBox.replaceChildren(click); }
      }
    });
    const name = h('input', { type: 'text', placeholder: d.kind === 'red' ? 'Aimpoint PRO' : 'Vortex Strike Eagle 1-6×24', autocomplete: 'off' });
    name.value = d.scopeName; name.addEventListener('input', () => { d.scopeName = name.value; });
    const clickChips = () => chips([['mil0.1', '0,1 MRAD'], ['moa0.25', '¼ MOA'], ['moa0.5', '½ MOA'], ['', t('Не знаю')]], d.click, (v) => { d.click = v; });
    let click = clickChips();
    const clickBox = h('div', {}, click);
    const ret = chips([['mil', 'MRAD'], ['moa', 'MOA'], ['dot', t('Точка')]], d.reticle, (v) => {
      d.reticle = v;
      // Ціна кліку зазвичай у тих самих одиницях, що й сітка
      if (v === 'mil' && !/^mil/.test(d.click)) d.click = 'mil0.1';
      if (v === 'moa' && !/^moa/.test(d.click)) d.click = 'moa0.25';
      click = clickChips(); clickBox.replaceChildren(click);
    });
    const zero = numInput('100', d.zero); zero.addEventListener('input', () => { d.zero = zero.value; zq.value = zero.value; zq.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.value === zero.value)); });
    const zq = chips(['25', '50', '100', '200'].map((z) => [z, `${z} ${t('м')}`]), d.zero, (v) => { d.zero = v; zero.value = v; });
    const sh = numInput(String(M.SIGHT_H), d.sh); sh.addEventListener('input', () => { d.sh = sh.value; });
    return [
      h('div', { class: 'form' },
        chipField(t('Що стоїть'), kind), field(t('Модель'), name),
        chipField(t('Сітка'), ret), chipField(t('Ціна кліку'), clickBox, t('Написано на барабані чи в інструкції: «1 click = 0.1 MRAD».')),
        chipField(t('Пристріляний на, м'), h('div', {}, zq, zero)),
        field(t('Над стволом, см'), sh, t('Від центру ствола до центру прицілу: пів товщини ствола + проміжок + пів труби прицілу. Для AR з оптикою — близько 7. Від цього числа залежать нулі на 50–300 м.'))),
    ];
  };

  // Крок 3: набій — готовий з балістикою або свій
  const ammoStep = () => {
    const list = presets();
    // Калібр змінили, повернувшись назад, — готовий набій старого калібру вже не підходить
    if (!d.preset || (![OTHER, NONE].includes(d.preset) && !list.some((p) => p.name === d.preset))) d.preset = list[0]?.name ?? OTHER;
    const own = form([
      { name: 'name', label: t('Назва'), value: d.ammo.name, placeholder: 'GGG 77 gr OTM', wide: true },
      { name: 'bulletWeight', label: t('Вага кулі, gr'), type: 'number', step: 'any', value: d.ammo.bulletWeight, placeholder: '62', half: true },
      { name: 'mv', label: t('Швидкість, м/с'), type: 'number', step: 'any', value: d.ammo.mv, placeholder: '915', half: true },
      { name: 'bc', label: t('BC'), type: 'number', step: 'any', value: d.ammo.bc, placeholder: '0,151', half: true },
      { name: 'dragModel', label: t('Модель BC'), type: 'chips', options: [['G7', 'G7'], ['G1', 'G1']], value: d.ammo.dragModel, half: true },
      { name: 'testBarrel', label: t('Тестовий ствол, ″'), type: 'number', step: 'any', value: d.ammo.testBarrel, placeholder: '20', wide: true,
        hint: t('На якому стволі виробник міряв швидкість (з коробки чи сайту). Можна пропустити.') },
    ]);
    own.el.addEventListener('input', () => { d.ammo = { ...d.ammo, ...own.values(), dragModel: own.inputs.dragModel.value }; });
    own.el.addEventListener('click', () => queueMicrotask(() => { d.ammo.dragModel = own.inputs.dragModel.value; }));
    own.el.hidden = d.preset !== OTHER;
    own.read = () => ({ ...own.values(), dragModel: own.inputs.dragModel.value });
    ammoForm = own;
    const info = h('p', { class: 'muted small' });
    const paintInfo = () => {
      const p = list.find((x) => x.name === d.preset);
      info.textContent = p ? t('G7 {bc} · {mv} м/с зі ствола {b}″ — швидкість перерахуємо під ваш ствол.', { bc: String(p.bc).replace('.', ','), mv: p.mv, b: p.testBarrel })
        : d.preset === NONE ? t('Збережемо лише ствол. Поправки з’являться, коли на «Складі» буде набій цього калібру з BC і швидкістю.')
          : t('BC і швидкість — з коробки чи сайту виробника. Без них поправки не порахувати, але облік набоїв працюватиме.');
    };
    const pick = chips([...list.map((p) => [p.name, p.name]), [OTHER, t('Свій набій')], [NONE, t('Поки без набою')]], d.preset, (v) => { d.preset = v; own.el.hidden = v !== OTHER; paintInfo(); });
    paintInfo();
    return [pick, info, own.el];
  };
  let ammoForm = null;

  const STEPS = [
    { title: t('Ваша зброя'), render: gunStep },
    { title: t('Приціл'), render: scopeStep },
    { title: t('Набій'), render: ammoStep },
  ];
  const last = () => (smooth() ? 0 : STEPS.length - 1);
  const next = () => body.querySelector('.onboard-nav .primary');

  const paint = () => {
    const s = STEPS[step];
    const back = h('button', { type: 'button', class: 'btn', onclick: () => { step -= 1; paint(); } }, t('Назад'));
    const next = h('button', { type: 'button', class: 'btn primary', onclick: () => go() }, step === last() ? t('Готово') : t('Далі'));
    body.replaceChildren(
      h('div', { class: 'onboard-head' }, h('b', {}, s.title), h('span', { class: 'muted small' }, t('Крок {n} з {m}', { n: step + 1, m: last() + 1 }))),
      ...s.render().filter(Boolean),
      h('div', { class: 'btn-row onboard-nav' }, step > 0 ? back : null, next));
  };

  const go = async () => {
    if (step === 0) {
      // Помилка — під калібром, а не спливаючим повідомленням: воно лягло б на заголовок шторки
      if (!caliber()) { const e = body.querySelector('.onboard-err'); e.textContent = d.caliber === OTHER ? t('Впишіть калібр') : t('Виберіть калібр'); e.hidden = false; return; }
      if (d.twist.trim() && !parseTwist(d.twist)) { fieldError(body.querySelector('input[placeholder="1:7"]'), t('Крок нарізів — дюймів на оберт, як на стволі: 1:7, 1:8, 1:10')); return; }
    }
    if (step < last()) { step += 1; paint(); return; }
    await finish();
  };

  const finish = async () => {
    const cal = caliber();
    const wid = ctx.uid();
    const scope = smooth() ? null : {
      id: ctx.uid(), name: d.scopeName.trim() || t(KIND_NAME[d.kind]), kind: d.kind, reticle: d.reticle || null,
      zero: num(d.zero) || null, sh: num(d.sh) || null, weight: null, click: d.click || null, note: '', default: true,
    };
    const weapon = {
      id: wid, created: Date.now(), name: d.name.trim() || cal, caliber: cal, initialShots: 0,
      size: { barrel: num(d.barrel) ? Math.round(num(d.barrel) * 25.4) : null, twist: parseTwist(d.twist) },
      scopes: scope ? [scope] : [],
    };
    let ammo = null; let cid = null;
    if (!smooth() && d.preset !== NONE) {
      const p = presets().find((x) => x.name === d.preset);
      const a = p ?? ammoForm?.read() ?? {};
      const known = p ? ctx.findCartridge?.(p.name, cal) : null;
      if (known) cid = known.id;
      // Назву забули, а вагу чи балістику вписали — набій не губимо, називаємо за калібром і вагою
      else if (p || a.name?.trim() || num(a.bc) || num(a.mv) || num(a.bulletWeight)) {
        const name = p ? p.name : a.name?.trim() || [cal, num(a.bulletWeight) ? `${num(a.bulletWeight)} gr` : null].filter(Boolean).join(' ');
        ammo = {
          id: ctx.uid(), created: Date.now(), name, caliber: cal, bulletWeight: num(a.bulletWeight) || null, weightUnit: 'gr',
          bc: num(a.bc) || null, dragModel: num(a.bc) ? (a.dragModel || 'G7') : null, mv: num(a.mv) || null,
          bulletLength: num(a.bulletLength) || null, testBarrel: num(a.testBarrel) || null, note: '',
        };
      }
    }
    close();
    await ctx.save('weapons', weapon);
    if (ammo) { await ctx.save('cartridges', ammo); cid = ammo.id; }
    ctx.done(wid, cid);
  };

  paint();
  const close = sheet(t('Свій ствол за хвилину'), body, { full: true });
}
