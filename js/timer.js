// Таймер пострілів: гудок після затримки, мікрофон ловить постріли, час — від гудка.
// Звук і детектор живуть на одному годиннику AudioContext, тож час пострілу точний до семпла.
import { t, plural } from './i18n.js';
import { h, chips, toast } from './ui.js';
import * as M from './model.js';
import { num } from './target.js';

const BEEP = 0.25; // с — стартовий гудок
const PAR_BEEP = 0.15; // с — гудок пар-тайму
const SILENCE_STOP = 10; // с без пострілів — серія закінчилась
const MAX_RUN = 180; // с — запобіжник, якщо забули зупинити
const DELAYS = [['random', 'Случайная 2–4 с'], ['3', '3 с'], ['0', 'Без задержки']];

function recall(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function remember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* приватне вікно — налаштування не збережеться */ }
}

/** Чутливість 0–100 → поріг амплітуди: 0 — лише найгучніше (1,0), 100 — майже шепіт (0,01). */
const thresholdOf = (s) => 10 ** (-(s / 100) * 2);
/** Амплітуда → позиція на індикаторі 0–1 у тій самій логарифмічній шкалі. */
const levelPos = (a) => Math.max(0, Math.min(1, Math.log10(Math.max(a, 0.01)) / 2 + 1));

/**
 * Аудіо: контекст, worklet-детектор і джерело. source — функція (ctx) → AudioNode замість мікрофона
 * (для перевірки без мікрофона); без неї — мікрофон без автопідсилення й шумодаву: вони глушать постріли.
 */
export function createEngine() {
  let ctx = null;
  let node = null;
  let src = null;
  let stream = null;
  const on = { shot: null, level: null };
  return {
    on(event, fn) { on[event] = fn; },
    async open(source = null) {
      ctx ??= new AudioContext({ latencyHint: 'interactive' });
      await ctx.resume();
      if (!node) {
        await ctx.audioWorklet.addModule(new URL('./shot-detector.js', import.meta.url));
        node = new AudioWorkletNode(ctx, 'shot-detector');
        node.port.onmessage = ({ data }) => {
          if (data.shot != null) on.shot?.(data.shot);
          if (data.level != null) on.level?.(data.level);
        };
        // Вихід у тишу: worklet обробляє звук, лише коли під'єднаний до графа
        const sink = ctx.createGain();
        sink.gain.value = 0;
        node.connect(sink).connect(ctx.destination);
      }
      if (!src) {
        if (source) src = source(ctx);
        else {
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
          src = ctx.createMediaStreamSource(stream);
        }
        src.connect(node);
      }
    },
    now: () => ctx.currentTime,
    setThreshold(v) { node?.port.postMessage({ threshold: v }); },
    reset() { node?.port.postMessage({ reset: true }); },
    /** Гудок у момент at (час контексту); детектор на цей час глухий. */
    beep(at, duration = BEEP, freq = 2400) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.9, at + 0.005);
      gain.gain.setValueAtTime(0.9, at + duration - 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration + 0.02);
      node.port.postMessage({ mute: [at - 0.02, at + duration + 0.06] });
    },
    /** Відпустити мікрофон (індикатор запису в системі гасне). */
    release() {
      src?.disconnect();
      stream?.getTracks().forEach((tr) => tr.stop());
      src = null;
      stream = null;
    },
  };
}

let engine = null;
let panel = null;

/**
 * Панель таймера. Створюється один раз і переживає перемальовування вкладки — інакше синхронізація
 * чи будь-яка зміна даних посеред серії знищила б запущений таймер.
 * weapons — [id, назва] для вибору ствола; onSave(drill) — зберегти серію.
 */
export function timerPanel({ weapons, onSave, source = null }) {
  if (!panel) panel = buildPanel(source);
  panel.update({ weapons, onSave });
  return panel.el;
}

function buildPanel(source) {
  engine ??= createEngine();
  let mode = 'idle'; // idle | check | wait | run | done
  let t0 = 0;
  let shots = [];
  let frame = 0;
  let lock = null;
  let onSave = null;
  let stopTimer = 0;

  const time = h('div', { class: 'tm-time' }, num(0, 2));
  const status = h('div', { class: 'tm-status muted' }, t('Нажмите «Старт» и ждите сигнал'));
  const fill = h('div', { class: 'tm-level-fill' });
  const mark = h('div', { class: 'tm-level-mark' });
  const sens = h('input', { type: 'range', min: 0, max: 100, step: 1, class: 'tm-sens', 'aria-label': t('Чувствительность') });
  sens.value = recall('shooting-log:timer-sens', '40');
  const placeMark = () => {
    mark.style.left = `${levelPos(thresholdOf(Number(sens.value))) * 100}%`;
    engine.setThreshold(thresholdOf(Number(sens.value)));
  };
  sens.addEventListener('input', () => { remember('shooting-log:timer-sens', sens.value); placeMark(); });

  let delay = recall('shooting-log:timer-delay', 'random');
  const delayChips = chips(DELAYS.map(([k, label]) => [k, t(label)]), delay, (v) => { delay = v; remember('shooting-log:timer-delay', v); });
  const par = h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 0.1, placeholder: '—', class: 'tm-par' });
  par.value = recall('shooting-log:timer-par', '');
  par.addEventListener('input', () => remember('shooting-log:timer-par', par.value));
  const weapon = h('select', { class: 'tm-weapon' });
  const note = h('input', { type: 'text', placeholder: t('Упражнение: «Билл-дрил», 2 цели…'), autocomplete: 'off', class: 'tm-note' });

  const list = h('div', { class: 'tm-shots' });
  const startBtn = h('button', { type: 'button', class: 'btn primary tm-start' }, t('Старт'));
  const checkBtn = h('button', { type: 'button', class: 'btn' }, t('Проверить микрофон'));
  const saveBtn = h('button', { type: 'button', class: 'btn primary' }, t('Сохранить серию'));
  const resetBtn = h('button', { type: 'button', class: 'btn' }, t('Сбросить'));
  const after = h('div', { class: 'btn-row', hidden: true }, resetBtn, saveBtn);

  engine.on('level', (a) => { fill.style.width = `${levelPos(a) * 100}%`; });
  engine.on('shot', (at) => {
    if (mode === 'check') {
      status.textContent = t('Слышу выстрел — так и оставьте');
      fill.classList.add('hit');
      setTimeout(() => fill.classList.remove('hit'), 300);
      return;
    }
    // Перехід «чекаємо → вогонь» — за часом пострілу, а не за кадром анімації (кадри можуть стояти)
    if ((mode !== 'run' && mode !== 'wait') || at < t0) return;
    mode = 'run';
    shots.push(at - t0);
    drawShots();
    armSilence();
  });

  const parValue = () => { const v = Number(String(par.value).replace(',', '.')); return v > 0 ? v : null; };

  function drawShots() {
    const s = M.drillStats(shots);
    list.replaceChildren(...shots.map((x, i) => h('div', { class: `tm-shot ${i === 0 ? 'first' : ''}` },
      h('span', { class: 'tm-n' }, String(i + 1)),
      h('span', { class: 'tm-at' }, num(x, 2)),
      h('span', { class: 'tm-split muted' }, i ? `+${num(x - shots[i - 1], 2)}` : t('первый')),
      // Чужий постріл із сусідньої лінії — прибрати
      mode === 'done' ? h('button', { type: 'button', class: 'icon-btn tm-del', 'aria-label': t('Удалить'), onclick: () => { shots.splice(i, 1); drawShots(); } }, '✕') : null)));
    if (mode === 'done' || mode === 'run') {
      status.textContent = shots.length
        ? `${shots.length} ${plural(shots.length, [t('выстрел'), t('выстрела'), t('выстрелов')])}${s.avg ? ` · ${t('сплит')} ${num(s.avg, 2)}` : ''}`
        : t('Выстрелов не услышал');
    }
    after.hidden = mode !== 'done' || !shots.length;
  }

  function tick() {
    const el = engine.now() - t0;
    if (mode === 'wait' && el >= 0) { mode = 'run'; status.textContent = t('Огонь!'); }
    time.textContent = mode === 'wait' ? '—' : num(Math.max(0, el), 2);
    time.classList.toggle('over', mode === 'run' && parValue() !== null && el > parValue());
    if (mode === 'run' && el > MAX_RUN) { stop(); return; }
    frame = requestAnimationFrame(tick);
  }

  function armSilence() {
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => { if (mode === 'run') stop(); }, SILENCE_STOP * 1000);
  }

  async function openAudio() {
    try {
      await engine.open(source);
      placeMark();
      return true;
    } catch (err) {
      toast(err?.name === 'NotAllowedError' ? t('Нет доступа к микрофону — разрешите его в настройках браузера') : t('Микрофон недоступен: {e}', { e: err?.message ?? err }));
      return false;
    }
  }

  async function start() {
    // Аудіо й мікрофон — лише з натискання: інакше браузер не дасть звуку
    if (!(await openAudio())) return;
    engine.reset();
    shots = [];
    const wait = delay === 'random' ? 2 + Math.random() * 2 : Number(delay);
    t0 = engine.now() + Math.max(0.15, wait);
    engine.beep(t0);
    if (parValue()) engine.beep(t0 + parValue(), PAR_BEEP, 1600);
    mode = 'wait';
    status.textContent = t('Приготовьтесь…');
    startBtn.textContent = t('Стоп');
    startBtn.classList.add('stop');
    checkBtn.hidden = true;
    checkBtn.textContent = t('Проверить микрофон');
    drawShots();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
    // Тиша рахується від сигналу; кожен постріл відкладає зупинку (armSilence)
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => { if (mode === 'run') stop(); }, (Math.max(0.15, wait) + SILENCE_STOP) * 1000);
    lock = await navigator.wakeLock?.request('screen').catch(() => null);
  }

  function stop() {
    cancelAnimationFrame(frame);
    clearTimeout(stopTimer);
    const was = mode;
    mode = was === 'wait' ? 'idle' : 'done';
    engine.release();
    lock?.release().catch(() => {});
    lock = null;
    startBtn.textContent = t('Старт');
    startBtn.classList.remove('stop');
    checkBtn.hidden = false;
    fill.style.width = '0';
    if (mode === 'idle') { time.textContent = num(0, 2); status.textContent = t('Остановлено до сигнала'); }
    else time.textContent = num(shots.at(-1) ?? 0, 2);
    drawShots();
  }

  async function toggleCheck() {
    if (mode === 'check') {
      mode = 'idle';
      engine.release();
      checkBtn.textContent = t('Проверить микрофон');
      fill.style.width = '0';
      status.textContent = t('Нажмите «Старт» и ждите сигнал');
      return;
    }
    if (!(await openAudio())) return;
    engine.reset();
    mode = 'check';
    checkBtn.textContent = t('Закончить проверку');
    status.textContent = t('Хлопните или щёлкните спуском: красная метка — порог, выстрел должен заходить за неё');
  }

  function reset() {
    mode = 'idle';
    shots = [];
    time.textContent = num(0, 2);
    status.textContent = t('Нажмите «Старт» и ждите сигнал');
    note.value = '';
    drawShots();
  }

  startBtn.addEventListener('click', () => (mode === 'wait' || mode === 'run' ? stop() : start()));
  checkBtn.addEventListener('click', toggleCheck);
  resetBtn.addEventListener('click', reset);
  saveBtn.addEventListener('click', async () => {
    remember('shooting-log:timer-weapon', weapon.value);
    await onSave?.({
      date: M.today(), weaponId: weapon.value || null, note: note.value.trim() || null,
      delay, par: parValue(), shots: shots.map((x) => Math.round(x * 1000) / 1000),
    });
    reset();
  });
  // Вкладку сховали посеред серії — мікрофон і екран усе одно зупиняться, тож зупиняємо чесно
  document.addEventListener('visibilitychange', () => { if (document.hidden && (mode === 'wait' || mode === 'run')) stop(); });

  const el = h('div', { class: 'timer' },
    h('div', { class: 'tm-face' }, time, status),
    startBtn,
    list,
    after,
    h('fieldset', { class: 'box' }, h('legend', {}, t('Настройки таймера')),
      h('div', { class: 'tm-set' },
        h('span', { class: 'field-label' }, t('Задержка сигнала')), delayChips,
        h('label', { class: 'tm-row' }, h('span', { class: 'field-label' }, t('Пар-тайм, с')), par,
          h('small', { class: 'muted' }, t('Второй сигнал — уложиться до него'))),
        h('label', { class: 'tm-row' }, h('span', { class: 'field-label' }, t('Оружие')), weapon),
        h('label', { class: 'tm-row' }, h('span', { class: 'field-label' }, t('Примечание')), note),
        h('span', { class: 'field-label' }, t('Чувствительность')),
        h('div', { class: 'tm-level' }, fill, mark), sens, checkBtn)));
  placeMark();

  return {
    el,
    update(opts) {
      onSave = opts.onSave;
      const keep = weapon.value || recall('shooting-log:timer-weapon', '');
      weapon.replaceChildren(...[['', t('— не указывать —')], ...opts.weapons].map(([id, name]) => h('option', { value: id, selected: id === keep }, name)));
    },
  };
}
