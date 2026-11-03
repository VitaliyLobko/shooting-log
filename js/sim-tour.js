// Знайомство з тренажером: тур із підсвіткою кнопок (сам — при першому відкритті) і «За 30 секунд» угорі довідки «i»
import { t } from './i18n.js';

const SEEN = 'shooters-log:sim-tour';

// [селектори — підсвітка охоплює всі, заголовок, текст, жест пальцем по першому: swipe | drag, режим тренажера на кроці]
// Режими — на ділі: тур сам перемикає прицілювання й далекомір, наприкінці повертає той, що був
const STEPS = [
  [['.sim-frame'], 'Прицел', 'Так цель выглядит в прицеле. Свайп вверх — дальше, вниз — ближе; вправо — больше кратность, влево — меньше.', 'swipe'],
  [['.sim-badge.bl', '.sim-badge.br'], 'Дистанция и кратность', 'Тап по плашке — ползунок: дистанция слева, кратность справа.'],
  [['.sim-mode'], 'Два режима', 'Два вопроса стрелка. Прицеливание: дистанция известна — куда держать? Дальномер: дистанция неизвестна — сколько до цели?', null, 'aim'],
  [['#m-aim', '.sim-frame'], 'Прицеливание', 'Кольцо на сетке — риска, которую наводишь на цель: в ней уже падение пули, снос ветром и упреждение, рядом — сколько выносить. Ещё тап по кнопке — куда целиться: центр масс или голова.', null, 'aim'],
  [['.sim-tools'], 'Цель, ветер, движение', 'Тап — выбор, свайп по кнопке вбок — соседнее значение. Цели — фото с учений, в ленте есть и схемы.', null, 'aim'],
  [['.sim-gun'], 'Винтовка и патрон', 'Набор, пристрелка, погода. Сверху — своё оружие из Арсенала с его сеткой и таблицей.', null, 'aim'],
  [['#sim-out'], 'Где держать', 'Поправка в милах и кликах барабана, тап — разбор: падение, ветер, упреждение.', null, 'aim'],
  [['.sim-frame', '#m-range'], 'Дальномер', 'Теперь цель рядом с сеткой. Тяни прицел пальцем и приложи шкалу к цели: сколько делений от низа до верха. Ещё тап по кнопке — чем мерить: рост, голова, плечи. Ветер и движение здесь не нужны — их кнопки спрятаны.', 'drag', 'range'],
  [['#sim-out'], 'Дистанция', 'Деления → метры: размер цели × 1000 ÷ милы. Рост 1,7 м на 2 мила — 850 м. Узнал дистанцию — переключайся на прицеливание.', null, 'range'],
  [['.quiz-box'], 'Проверь себя', 'Упражнения с оценкой: определи дистанцию, возьми поправку на ветер и движение. В «Выносе» и «Выстреле» прицел ведёшь пальцем, как винтовку.'],
  [['#sim-i'], 'Справка', 'Коротко и подробно о каждой кнопке и этот тур ещё раз.'],
];

const seen = () => { try { return localStorage.getItem(SEEN) === '1'; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN, '1'); } catch { /* приватний режим — покажемо ще раз */ } };

const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text ? { textContent: text } : {});
const visible = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

/** Прямокутник, що охоплює всі видимі елементи кроку. */
function boxOf(nodes) {
  const rs = nodes.map((n) => n.getBoundingClientRect());
  const l = Math.min(...rs.map((r) => r.left)); const tp = Math.min(...rs.map((r) => r.top));
  return { left: l, top: tp, width: Math.max(...rs.map((r) => r.right)) - l, height: Math.max(...rs.map((r) => r.bottom)) - tp };
}

/** Тур по тренажеру в root; кроки без видимих елементів пропускаються. */
export function simTour(root) {
  const steps = STEPS.map(([sels, title, text, gesture, mode]) => [sels.flatMap((s) => [...root.querySelectorAll(s)]).filter(visible), title, text, gesture, mode])
    .filter(([nodes]) => nodes.length);
  if (!steps.length || document.querySelector('.tour-hole')) return;
  // Тап по вже ввімкненому режиму має свою дію (точка, «чим міряти») — тиснемо лише невибраний
  const modeBtn = (m) => root.querySelector(m === 'range' ? '#m-range' : '#m-aim');
  const was = modeBtn('range')?.getAttribute('aria-pressed') === 'true' ? 'range' : 'aim';
  const setMode = (m) => { const b = modeBtn(m); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); };
  const shield = el('div', 'tour-shield');
  const hole = el('div', 'tour-hole');
  const finger = el('div', 'tour-finger');
  finger.setAttribute('aria-hidden', 'true');
  const card = el('div', 'tour-card');
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
  const count = el('div', 'tour-count'); const title = el('h3'); const text = el('p');
  const skip = el('button', 'tour-skip', t('Пропустить'));
  const next = el('button', 'btn primary tour-next');
  skip.type = 'button'; next.type = 'button';
  const nav = el('div', 'tour-nav'); nav.append(skip, next);
  card.append(count, title, text, nav);
  document.body.append(shield, hole, finger, card);
  let i = 0;

  const place = () => {
    const b = boxOf(steps[i][0]); const pad = 6;
    Object.assign(hole.style, { left: `${b.left - pad}px`, top: `${b.top - pad}px`, width: `${b.width + pad * 2}px`, height: `${b.height + pad * 2}px` });
    const f = boxOf(steps[i][0].slice(0, 1));
    Object.assign(finger.style, { left: `${f.left + f.width / 2}px`, top: `${f.top + f.height / 2}px` });
    const vw = document.documentElement.clientWidth; const vh = window.innerHeight;
    const cw = card.offsetWidth; const ch = card.offsetHeight;
    // Картка — під підсвіткою, якщо влазить, інакше над нею; у великого елемента — поверх його низу
    const below = b.top + b.height + pad + 12; const above = b.top - pad - 12 - ch;
    const top = below + ch <= vh - 8 ? below : above >= 8 ? above : vh - ch - 16;
    card.style.left = `${Math.min(Math.max(16, b.left + b.width / 2 - cw / 2), vw - cw - 16)}px`;
    card.style.top = `${top}px`;
  };
  let raf = 0;
  const follow = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
  const close = () => {
    markSeen(); setMode(was);
    window.removeEventListener('scroll', follow, true); window.removeEventListener('resize', follow);
    document.removeEventListener('keydown', onKey);
    shield.remove(); hole.remove(); finger.remove(); card.remove();
  };
  const show = (k) => {
    i = k;
    const [nodes, ttl, txt, gesture, mode] = steps[i];
    if (mode) setMode(mode);
    // Жест — з початку на кожному кроці; без жесту палець схований
    finger.className = 'tour-finger'; void finger.offsetWidth;
    if (gesture) finger.classList.add(gesture);
    count.textContent = `${i + 1} / ${steps.length}`;
    title.textContent = t(ttl); text.textContent = t(txt);
    next.textContent = i === steps.length - 1 ? t('Понятно') : t('Дальше');
    nodes[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    place(); setTimeout(place, 350); next.focus({ preventScroll: true });
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next.click();
    else if (e.key === 'ArrowLeft' && i > 0) show(i - 1);
  };
  next.addEventListener('click', () => (i < steps.length - 1 ? show(i + 1) : close()));
  skip.addEventListener('click', close);
  window.addEventListener('scroll', follow, true); window.addEventListener('resize', follow);
  document.addEventListener('keydown', onKey);
  show(0);
}

/** «За 30 секунд» і «Показати тур» — угорі довідки тренажера; auto — тур сам при першому відкритті. */
export function simIntro(root, { auto = false } = {}) {
  const help = root.querySelector('#sim-help');
  if (help && !help.querySelector('.sim-quick')) {
    const quick = el('div', 'sim-quick');
    const ol = el('ol');
    [
      'Свайп по прицелу: вверх-вниз — дистанция, вбок — кратность.',
      'Прицеливание — куда держать на известной дистанции; дальномер — сколько до цели: меряй её сеткой.',
      'Под прицелом — цель, ветер и движение; ниже — готовая поправка.',
      '«Проверь себя» — упражнения с оценкой.',
    ].forEach((s) => ol.append(el('li', '', t(s))));
    const again = el('button', 'btn mini sim-tour-btn', t('Показать тур'));
    again.type = 'button';
    again.addEventListener('click', () => { help.hidden = true; root.querySelector('#sim-i')?.setAttribute('aria-expanded', 'false'); simTour(root); });
    quick.append(el('h4', '', t('За 30 секунд')), ol, again);
    help.prepend(quick);
  }
  if (auto && !seen()) setTimeout(() => { if (root.isConnected && visible(root)) simTour(root); }, 700);
}
