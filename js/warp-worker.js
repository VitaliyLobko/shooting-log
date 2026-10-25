// Випрямлення фото мішені у фоновому потоці: попіксельний перерахунок займає секунди на телефоні,
// а в головному потоці сторінка весь цей час не відповідала б.
// Модуль: той самий код головний потік бере напряму, якщо фоновий потік не запустився.

/**
 * sd — пікселі робочої копії sw × sh, m — перетворення квадрат → чотирикутник, frame — частина квадрата в кадрі,
 * W × H — розмір результату, bg — колір поза обрієм. Повертає пікселі результату.
 */
export function warpPixels({ sd, sw, sh, m, frame, W, H, bg }) {
  const od = new Uint8ClampedArray(W * H * 4);
  const du = (frame.x1 - frame.x0) / W;
  const dv = (frame.y1 - frame.y0) / H;
  let o = 0;
  for (let y = 0; y < H; y += 1) {
    const v = frame.y0 + (y + 0.5) * dv;
    for (let x = 0; x < W; x += 1, o += 4) {
      const u = frame.x0 + (x + 0.5) * du;
      const w = m.g * u + m.h * v + 1;
      const sx = (m.a * u + m.b * v + m.c) / w - 0.5;
      const sy = (m.d * u + m.e * v + m.f) / w - 0.5;
      od[o + 3] = 255;
      if (!(w > 0) || sx < -0.5 || sy < -0.5 || sx > sw - 0.5 || sy > sh - 0.5) {
        od[o] = bg; od[o + 1] = bg; od[o + 2] = bg;
        continue;
      }
      const ix = Math.min(sw - 2, Math.max(0, Math.floor(sx)));
      const iy = Math.min(sh - 2, Math.max(0, Math.floor(sy)));
      const fx = Math.min(1, Math.max(0, sx - ix));
      const fy = Math.min(1, Math.max(0, sy - iy));
      const i00 = (iy * sw + ix) * 4;
      const i01 = i00 + sw * 4;
      for (let c = 0; c < 3; c += 1) {
        const top = sd[i00 + c] + (sd[i00 + 4 + c] - sd[i00 + c]) * fx;
        const bot = sd[i01 + c] + (sd[i01 + 4 + c] - sd[i01 + c]) * fx;
        od[o + c] = top + (bot - top) * fy;
      }
    }
  }
  return od;
}

// у фоновому потоці (не в головному, де модуль просто імпортують)
if (typeof window === 'undefined') {
  self.onmessage = (e) => {
    const od = warpPixels({ ...e.data, sd: new Uint8ClampedArray(e.data.sd) });
    self.postMessage({ od: od.buffer }, [od.buffer]);
  };
}
