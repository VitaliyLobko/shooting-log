// Погода на день виїзду для розрахунку поправок: місце (назвою чи з телефона), дата й година →
// прогноз температури й висота місця над морем з Open-Meteo, без ключа.
import { h, form, toast, fieldError, toolBtn } from './ui.js';
import { t } from './i18n.js';
import { today } from './model.js';

const PLACE_KEY = 'shooters-log:trip-place';
const DAY = 86_400_000;
// Прогноз Open-Meteo — 16 днів уперед; старше двох місяців — лише в архіві
const AHEAD_DAYS = 15;

const recall = () => { try { return JSON.parse(localStorage.getItem(PLACE_KEY)) ?? null; } catch { return null; } };
const keep = (p) => { try { localStorage.setItem(PLACE_KEY, JSON.stringify(p)); } catch { /* приватний режим */ } };

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json();
}

/** Населені пункти за назвою: [{ label, lat, lon }], до п'яти. */
export async function searchPlace(name) {
  const q = new URLSearchParams({ name, count: 5, language: 'uk', format: 'json' });
  const json = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
  return (json.results ?? []).map((r) => ({
    label: [r.name, r.admin1, r.country_code === 'UA' ? null : r.country].filter(Boolean).join(', '),
    lat: r.latitude, lon: r.longitude,
  }));
}

/**
 * Температура о годині hour (0–23) дня date (ISO) і висота точки над морем.
 * Далі за прогноз — RangeError: архів минулого тут не підміняє прогнозу.
 */
export async function forecastAt({ lat, lon }, date, hour) {
  const days = Math.round((Date.parse(date) - Date.parse(today())) / DAY);
  if (days > AHEAD_DAYS) throw new RangeError('far');
  const host = days < -60 ? 'archive-api.open-meteo.com/v1/archive' : 'api.open-meteo.com/v1/forecast';
  const q = new URLSearchParams({ latitude: lat.toFixed(2), longitude: lon.toFixed(2), hourly: 'temperature_2m', start_date: date, end_date: date, timezone: 'auto' });
  const json = await getJson(`https://${host}?${q}`);
  const i = json.hourly?.time?.indexOf(`${date}T${String(hour).padStart(2, '0')}:00`) ?? -1;
  const temp = i >= 0 ? json.hourly.temperature_2m[i] : null;
  if (temp === null || temp === undefined) throw new Error('Open-Meteo: no data');
  return { temp, elevation: json.elevation ?? null };
}

/**
 * Блок «Погода на день виїзду»: дата, година, місце → onWeather({ temp, elevation, place, date, time }).
 * locate() — координати пристрою { lat, lon } або null (причину вже показано).
 */
export function tripWeather({ locate, onWeather }) {
  const f = form([
    { name: 'date', label: t('Дата виїзду'), type: 'dmy', value: today(), half: true },
    { name: 'time', label: t('Година'), type: 'time', value: '12:00', half: true },
    { name: 'place', label: t('Місце'), placeholder: t('Назва села чи міста'), wide: true },
  ]);
  let place = recall();
  if (place) f.inputs.place.value = place.label;
  const found = h('div', { class: 'chips tw-found' });
  const info = h('p', { class: 'muted small tw-info' });
  const choose = (p) => { place = p; keep(p); f.inputs.place.value = p.label; found.replaceChildren(); };
  const find = async () => {
    const name = f.inputs.place.value.trim();
    if (name.length < 2) { fieldError(f.inputs.place, t('Введіть назву або візьміть місце з телефона')); return; }
    info.textContent = t('Шукаю…');
    try {
      const list = await searchPlace(name);
      info.textContent = list.length ? '' : t('Нічого не знайдено — спробуйте інакше написати');
      found.replaceChildren(...list.map((p) => h('button', { type: 'button', onclick: () => choose(p) }, p.label)));
    } catch {
      info.textContent = '';
      toast(t('Не вдалося знайти місце — перевірте інтернет'));
    }
  };
  const here = toolBtn('locate', t('Моє місце'), async () => {
    here.disabled = true;
    try {
      const pos = await locate();
      if (pos) choose({ label: t('Моє місце ({lat}, {lon})', { lat: pos.lat.toFixed(3), lon: pos.lon.toFixed(3) }), lat: pos.lat, lon: pos.lon });
    } finally { here.disabled = false; }
  });
  f.inputs.place.addEventListener('input', () => { place = null; });
  f.inputs.place.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
  const placeField = f.inputs.place.closest('.field');
  placeField.append(h('div', { class: 'tw-place' }, h('button', { type: 'button', class: 'btn mini', onclick: find }, t('Знайти')), here));
  const pull = h('button', { type: 'button', class: 'btn' }, t('Взяти прогноз'));
  pull.addEventListener('click', async () => {
    const v = f.values();
    if (!v.date || Number.isNaN(v.date)) { fieldError(f.inputs.date, t('Дата — ДД.ММ.РРРР')); return; }
    if (!place) { fieldError(f.inputs.place, t('Виберіть місце зі списку або візьміть з телефона')); return; }
    const hour = v.time ? Math.min(23, Math.round(Number(v.time.slice(0, 2)) + Number(v.time.slice(3, 5)) / 60)) : 12;
    pull.disabled = true;
    info.textContent = t('Беру прогноз…');
    try {
      const w = await forecastAt(place, v.date, hour);
      info.textContent = '';
      onWeather({ ...w, place: place.label, date: v.date, time: v.time || '12:00' });
    } catch (e) {
      info.textContent = e instanceof RangeError ? t('Прогноз є лише на 16 днів уперед — ближче до виїзду спробуйте ще раз') : '';
      if (!(e instanceof RangeError)) toast(t('Не вдалося отримати прогноз'));
    } finally { pull.disabled = false; }
  });
  return h('div', { class: 'trip-weather' }, f.el, found, h('div', { class: 'btn-row' }, pull), info);
}
