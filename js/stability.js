// Гіроскопічна стабільність кулі (ФГС, Sg) за формулою Міллера: чи вистачає кроку нарізів, щоб куля летіла носом уперед.
// Рахуємо за стандартної атмосфери (+15 °C, 760 мм рт. ст.), як у таблицях Berger і Litz: цифра не скаче від погоди.
import { sameCaliber, bulletMm } from './model.js';

const GRAIN_G = 0.06479891;
const MM_IN = 25.4;
const MS_FPS = 3.28084;

// Діаметр кулі за калібром, мм: номінал «5.56» чи «7.62» — це поля нарізів, куля товща (по дну нарізів)
const BULLET_MM = [
  ['5.56x45', 5.69], ['.308', 7.82], ['7.62x39', 7.92], ['7.62x54R', 7.92], ['5.45x39', 5.62],
];
const BY_NAME = [[/6[.,]5\s*(mm|мм|creed|cm|grendel|prc|x)|\.264|260/i, 6.71], [/\b6\s*(mm|мм)|243|6\s*arc/i, 6.17],
  [/\.338|8[.,]6\s*[x×х*]/i, 8.59], [/\.?300\b|30-06|\.30\b/i, 7.82]];

/** Діаметр кулі калібру, мм; null — калібр не нарізний або незрозумілий. */
export function bulletDiameter(caliber) {
  if (!caliber) return null;
  const known = BULLET_MM.find(([c]) => sameCaliber(c, caliber));
  if (known) return known[1];
  const named = BY_NAME.find(([re]) => re.test(caliber));
  return named ? named[1] : bulletMm(caliber);
}

/** «1:8», «1/7», «8», «1:200 мм» → дюймів на оберт; числа понад 30 вважаємо міліметрами. null — не розібрати. */
export function parseTwist(text) {
  const m = String(text ?? '').replace(',', '.').match(/(?:1\s*[:/]\s*)?(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = Number(m[1]);
  const inches = v > 30 || /мм|mm/i.test(text) ? v / MM_IN : v;
  return inches >= 5 && inches <= 20 ? Math.round(inches * 100) / 100 : null;
}

/** 8 → «1:8″». */
export const twistText = (inches) => `1:${String(Math.round(inches * 10) / 10).replace('.', ',')}″`;

/**
 * ФГС за Міллером: grains — вага кулі, gr; lengthMm і diameterMm — довжина й діаметр кулі; twistIn — дюймів на оберт;
 * mv — м/с (поправка на швидкість від 2800 fps). null — даних не вистачає.
 */
export function millerSg({ grains, lengthMm, diameterMm, twistIn, mv }) {
  if (!(grains > 0 && lengthMm > 0 && diameterMm > 0 && twistIn > 0)) return null;
  const d = diameterMm / MM_IN;
  const l = lengthMm / diameterMm;
  const tw = twistIn / d;
  const sg = (30 * grains) / (tw ** 2 * d ** 3 * l * (1 + l ** 2));
  return mv > 0 ? sg * Math.cbrt((mv * MS_FPS) / 2800) : sg;
}

/** Вага кулі набою в гранах; null — не вказано. */
export const bulletGrains = (c) => (c?.bulletWeight > 0 ? (c.weightUnit === 'г' ? c.bulletWeight / GRAIN_G : c.bulletWeight) : null);

/** ФГС набою c у стволі w (крок нарізів — w.size.twist); mv — швидкість, якщо не з картки набою. */
export const sgOf = (c, w, mv = c?.mv) => millerSg({
  grains: bulletGrains(c), lengthMm: c?.bulletLength, diameterMm: bulletDiameter(c?.caliber || w?.caliber), twistIn: w?.size?.twist, mv,
});

/** Що означає ФГС: { level: 'ok' | 'edge' | 'bad', text }. */
export function sgVerdict(sg) {
  if (sg >= 1.5) return { level: 'ok', text: 'стабільна' };
  if (sg >= 1) return { level: 'edge', text: 'на межі: летить, але BC нижчий, у мороз може не вистачити' };
  return { level: 'bad', text: 'нестабільна: куля перекидатиметься' };
}
