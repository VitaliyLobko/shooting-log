// Тур з підсвіткою: картка з поясненням біля елемента, решта екрана під завісою.
// Крок може спершу перейти в інший розділ (before) — елементи шукаємо вже після переходу.
import { t } from './i18n.js';

const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text ? { textContent: text } : {});
const visible = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** Прямокутник, що охоплює всі елементи кроку. */
function boxOf(nodes) {
  const rs = nodes.map((n) => n.getBoundingClientRect());
  const l = Math.min(...rs.map((r) => r.left)); const tp = Math.min(...rs.map((r) => r.top));
  return { left: l, top: tp, width: Math.max(...rs.map((r) => r.right)) - l, height: Math.max(...rs.map((r) => r.bottom)) - tp };
}

/**
 * Кроки { sel: [селектори], title, text, before? } — ключі перекладу; крок без видимих елементів пропускається.
 * onClose(дійшов до кінця) — після «Зрозуміло», «Пропустити» чи Escape. Повертає false, якщо показати нічого.
 */
export async function runTour(steps, { onClose } = {}) {
  if (document.querySelector('.tour-hole')) return false;
  const shield = el('div', 'tour-shield');
  const hole = el('div', 'tour-hole');
  const card = el('div', 'tour-card');
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
  const count = el('div', 'tour-count'); const title = el('h3'); const text = el('p');
  const skip = el('button', 'tour-skip', t('Пропустити'));
  const back = el('button', 'tour-skip', t('Назад'));
  const next = el('button', 'btn primary tour-next');
  skip.type = 'button'; back.type = 'button'; next.type = 'button';
  const nav = el('div', 'tour-nav'); const right = el('div', 'tour-right');
  right.append(back, next); nav.append(skip, right);
  card.append(count, title, text, nav);
  let i = -1;
  let nodes = [];
  let busy = false;

  const place = () => {
    if (!nodes.length) return;
    const b = boxOf(nodes); const pad = 6;
    Object.assign(hole.style, { left: `${b.left - pad}px`, top: `${b.top - pad}px`, width: `${b.width + pad * 2}px`, height: `${b.height + pad * 2}px` });
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
  // Екран під туром перемалювали — шукаємо елементи кроку знову; зникли зовсім (закрили редактор, «Назад») — тур закривається
  const watch = new MutationObserver(() => {
    if (busy || i < 0 || nodes.every((n) => n.isConnected)) return;
    const found = steps[i].sel.flatMap((s) => [...document.querySelectorAll(s)]).filter(visible);
    if (found.length) { nodes = found; follow(); } else close(false);
  });
  const close = (done) => {
    window.removeEventListener('scroll', follow, true); window.removeEventListener('resize', follow);
    document.removeEventListener('keydown', onKey, true);
    watch.disconnect();
    shield.remove(); hole.remove(); card.remove();
    onClose?.(done);
  };

  /** Крок k, а як у ньому нічого не видно — наступний у напрямку dir. */
  const show = async (k, dir = 1) => {
    if (busy) return;
    busy = true;
    for (let j = k; j >= 0 && j < steps.length; j += dir) {
      const step = steps[j];
      if (step.before) { await step.before(); await tick(); }
      const found = step.sel.flatMap((s) => [...document.querySelectorAll(s)]).filter(visible);
      if (!found.length) continue;
      i = j; nodes = found;
      count.textContent = `${j + 1} / ${steps.length}`;
      title.textContent = t(step.title); text.textContent = t(step.text);
      next.textContent = j === steps.length - 1 ? t('Зрозуміло') : t('Далі');
      back.hidden = j === 0;
      if (!card.isConnected) { document.body.append(shield, hole, card); watch.observe(document.body, { childList: true, subtree: true }); }
      nodes[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
      place(); setTimeout(place, 350);
      next.focus({ preventScroll: true });
      busy = false;
      return true;
    }
    busy = false;
    if (dir > 0) close(i >= 0);
    return false;
  };
  // Клавіші — лише туру: Escape інакше закрив би й редактор під ним (той теж слухає document)
  const onKey = (e) => {
    if (!['Escape', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    e.stopPropagation();
    if (e.key === 'Escape') close(false);
    else if (e.key === 'ArrowRight') next.click();
    else if (i > 0) show(i - 1, -1);
  };
  next.addEventListener('click', () => (i < steps.length - 1 ? show(i + 1) : close(true)));
  back.addEventListener('click', () => show(i - 1, -1));
  skip.addEventListener('click', () => close(false));
  window.addEventListener('scroll', follow, true); window.addEventListener('resize', follow);
  document.addEventListener('keydown', onKey, true);
  return show(0);
}
