// Детектор пострілів у аудіопотоці (AudioWorklet): працює посемплово, тож час пострілу —
// за годинником звукової карти з точністю до семпла, без затримок головного потоку.
// Постріл — обвідна сигналу перетнула поріг знизу; далі «глухий» час, поки обвідна не впаде
// нижче половини порогу (луна й дзвін ствола не стають другим пострілом).

const HOLDOFF = 0.08; // с: швидше за цей інтервал двох пострілів не буває навіть у дуплеті
const DECAY = 0.01; // с: стала спаду обвідної

class ShotDetector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.threshold = 0.15;
    this.env = 0;
    this.armed = true;
    this.holdUntil = 0;
    this.mutes = [];
    this.peak = 0;
    this.lastLevel = 0;
    this.decay = Math.exp(-1 / (sampleRate * DECAY));
    this.port.onmessage = ({ data }) => {
      if (data.threshold != null) this.threshold = data.threshold;
      // Сигнал таймера чути в мікрофон — на час гудка детектор глухий
      if (data.mute) this.mutes.push(data.mute);
      if (data.reset) {
        this.mutes = [];
        this.holdUntil = 0;
        this.armed = true;
      }
    };
  }

  process(inputs, outputs) {
    const ch = inputs[0]?.[0];
    if (ch) {
      for (let i = 0; i < ch.length; i += 1) {
        const t = currentTime + i / sampleRate;
        const a = Math.abs(ch[i]);
        this.env = Math.max(a, this.env * this.decay);
        if (a > this.peak) this.peak = a;
        if (this.mutes.some(([from, to]) => t >= from && t <= to)) {
          this.armed = false;
          continue;
        }
        if (!this.armed) {
          if (t >= this.holdUntil && this.env < this.threshold / 2) this.armed = true;
          continue;
        }
        if (this.env >= this.threshold) {
          this.port.postMessage({ shot: t, peak: a });
          this.armed = false;
          this.holdUntil = t + HOLDOFF;
        }
      }
      this.mutes = this.mutes.filter(([, to]) => to >= currentTime);
    }
    // Рівень для індикатора чутливості — 20 разів на секунду
    if (currentTime - this.lastLevel >= 0.05) {
      this.port.postMessage({ level: this.peak });
      this.peak = 0;
      this.lastLevel = currentTime;
    }
    outputs[0]?.[0]?.fill(0);
    return true;
  }
}

registerProcessor('shot-detector', ShotDetector);
