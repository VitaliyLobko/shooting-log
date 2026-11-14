// Місце на карті (Leaflet, лежить у vendor): супутник Esri або схема OpenStreetMap — як у Fishing Log.
// Бібліотека й стилі вантажаться лише тоді, коли карту вперше відкрили; сам модуль — ленивим import().
import { h, sheet, chips, toast, icon } from './ui.js';
import { t } from './i18n.js';

const LAYER_KEY = 'shooters-log:map-layer';
const LAST_KEY = 'shooters-log:map-last';

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, v) => { try { localStorage.setItem(key, v); } catch { /* приватний режим */ } };

let loading = null;

/** Leaflet — одним завантаженням на сесію; без мережі файли беруться з кешу service worker. */
export function loadLeaflet() {
  loading ??= new Promise((resolve, reject) => {
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: './css/leaflet.css' }));
    const s = Object.assign(document.createElement('script'), { src: './js/vendor/leaflet.js' });
    s.onload = () => resolve(window.L);
    s.onerror = () => { loading = null; s.remove(); reject(new Error('map')); };
    document.head.append(s);
  });
  return loading;
}

const LAYERS = {
  sat: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 18,
    // Гібрид: прозорий шар назв населених пунктів і меж поверх знімка
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
    maxNativeZoom: 19,
  },
};

/** Україна цілком — коли ще немає жодної точки. */
const UA = { lat: 48.6, lon: 31.2, zoom: 6 };

const mapLayer = () => (read(LAYER_KEY) === 'osm' ? 'osm' : 'sat');

/** Остання вибрана точка — з неї карта починає наступного разу (тир зазвичай той самий). */
function lastPoint() {
  try {
    const p = JSON.parse(read(LAST_KEY));
    return Number.isFinite(p?.lat) && Number.isFinite(p?.lon) ? p : null;
  } catch { return null; }
}

/** Карта в елементі; setLayer міняє підкладку ('sat' чи 'osm'). */
function makeMap(L, el, { lat, lon, zoom, layer }) {
  const map = L.map(el, { boxZoom: false }).setView([lat, lon], zoom);
  map.attributionControl.setPrefix(false);
  let base = null;
  let labels = null;
  map.setLayer = (key) => {
    base?.remove();
    labels?.remove();
    labels = null;
    const x = LAYERS[key] ?? LAYERS.sat;
    base = L.tileLayer(x.url, { attribution: x.attribution, maxNativeZoom: x.maxNativeZoom, maxZoom: 20 }).addTo(map);
    if (x.labels) labels = L.tileLayer(x.labels, { maxNativeZoom: x.maxNativeZoom, maxZoom: 20 }).addTo(map);
  };
  map.setLayer(layer);
  return map;
}

/** Маркер-шпилька з перехрестям прицілу. */
function pinIcon(L) {
  return L.divIcon({
    className: 'map-pin',
    html: '<span class="pin-body"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/></svg></span>',
    iconSize: [36, 36],
    // Вістря шпильки (кут, повернутий донизу) — трохи нижче квадрата
    iconAnchor: [18, 43],
  });
}

const smallBtn = (label, onclick, kind = '') => h('button', { type: 'button', class: `btn mini ${kind}`, onclick }, label);

/**
 * Карта на весь екран: торкання ставить точку, шпильку можна перетягнути.
 * start — { lat, lon } або null; onDone({ lat, lon } | null) — після «Готово» (null — точку прибрали).
 * locate() — координати пристрою для «Я тут» або null (причину вже показано).
 */
export async function mapPicker(start, onDone, { title = t('Місце на карті'), tip = t('Торкніться місця, де стріляєте'), locate = null } = {}) {
  let L;
  try { L = await loadLeaflet(); } catch { toast(t('Карта не завантажилась — перевірте інтернет')); return; }
  let pt = start && Number.isFinite(start.lat) && Number.isFinite(start.lon) ? { lat: start.lat, lon: start.lon } : null;
  const el = h('div', { class: 'map-box' });
  let map = null;
  let marker = null;
  const layers = chips([['sat', t('Супутник')], ['osm', t('Схема')]], mapLayer(), (v) => { map?.setLayer(v); write(LAYER_KEY, v); });
  layers.classList.add('segmented', 'map-layers');
  const put = (at) => {
    pt = { lat: at.lat, lon: at.lng ?? at.lon };
    if (marker) { marker.setLatLng([pt.lat, pt.lon]); return; }
    marker = L.marker([pt.lat, pt.lon], { icon: pinIcon(L), draggable: true, keyboard: false })
      .on('dragend', (e) => { const p = e.target.getLatLng(); pt = { lat: p.lat, lon: p.lng }; })
      .addTo(map);
  };
  const clear = smallBtn(t('Прибрати точку'), () => { marker?.remove(); marker = null; pt = null; }, 'quiet');
  const me = locate ? smallBtn([icon('locate'), t('Я тут')], async () => {
    me.disabled = true;
    try {
      const pos = await locate();
      if (pos && map) map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 15));
    } finally { me.disabled = false; }
  }, 'map-btn') : null;
  const close = sheet(title, h('div', { class: 'map-picker' }, h('p', { class: 'muted small map-tip' }, tip), el,
    h('div', { class: 'map-tools' }, layers, h('div', { class: 'btn-row' }, me, clear))), {
    full: true,
    dirty: false,
    onClose: () => map?.remove(),
    actions: [
      h('button', { type: 'button', class: 'btn', onclick: () => close() }, t('Скасувати')),
      h('button', { type: 'button', class: 'btn primary', onclick: () => {
        close();
        if (pt) write(LAST_KEY, JSON.stringify(pt));
        onDone(pt ? { ...pt } : null);
      } }, t('Готово')),
    ],
  });
  // Карта міряє себе при створенні — тож коли шторка вже на екрані
  requestAnimationFrame(() => {
    const last = lastPoint();
    const view = pt ? { ...pt, zoom: 15 } : last ? { ...last, zoom: 13 } : UA;
    map = makeMap(L, el, { ...view, layer: mapLayer() });
    if (pt) put(pt);
    map.on('click', (e) => put(e.latlng));
    setTimeout(() => map.invalidateSize(), 250);
  });
}
