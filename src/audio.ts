import type { Settings, Weather } from './state';

export class AudioSystem {
  ctx?: AudioContext;
  master?: GainNode;
  engine?: OscillatorNode;
  engineGain?: GainNode;
  rainGain?: GainNode;
  lastNote = 0;
  note = 0;
  active = false;
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
      this.engine = this.ctx.createOscillator();
      this.engine.type = 'triangle';
      this.engine.frequency.value = 45;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 350;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engine.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engine.start();
      const data = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const a = data.getChannelData(0);
      for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = data;
      noise.loop = true;
      const rf = this.ctx.createBiquadFilter();
      rf.type = 'lowpass';
      rf.frequency.value = 900;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;
      noise.connect(rf);
      rf.connect(this.rainGain);
      this.rainGain.connect(this.master);
      noise.start();
      this.active = true;
    } catch {
      /* Audio is optional; the game remains fully playable. */
    }
  }
  tone(freq: number, length = 0.15, volume = 0.12, type: OscillatorType = 'sine') {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator(),
      gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + length);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + length + 0.02);
  }
  feedback(kind: 'click' | 'pick' | 'success' | 'bad' | 'shutter' | 'door' | 'step') {
    if (kind === 'success') {
      [440, 554, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.28, 0.12), i * 90));
    } else if (kind === 'pick') this.tone(610, 0.14);
    else if (kind === 'bad') this.tone(155, 0.25, 0.15, 'triangle');
    else if (kind === 'shutter') {
      this.tone(1500, 0.035, 0.14, 'square');
      setTimeout(() => this.tone(800, 0.04, 0.08), 60);
    } else if (kind === 'door') this.tone(82, 0.12, 0.15, 'triangle');
    else if (kind === 'step') this.tone(65 + Math.random() * 30, 0.07, 0.08, 'triangle');
    else this.tone(510, 0.07, 0.07);
  }
  update(speed: number, driving: boolean, weather: Weather, settings: Settings, paused: boolean) {
    if (!this.ctx || !this.master || !this.engine || !this.engineGain || !this.rainGain) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.volume * (paused ? 0.3 : 1), t, 0.1);
    this.engine.frequency.setTargetAtTime(37 + Math.abs(speed) * 5.8, t, 0.1);
    this.engineGain.gain.setTargetAtTime(
      driving && !paused ? 0.11 + Math.abs(speed) * 0.004 : 0,
      t,
      0.15,
    );
    this.rainGain.gain.setTargetAtTime(weather === 'rain' && !paused ? 0.12 : 0.008, t, 0.5);
    if (settings.music && !paused && t > this.lastNote + 0.6) {
      this.lastNote = t;
      const melody = [0, 7, 12, 4, 7, 14, 12, 7, 0, 9, 12, 4, 7, 4, 2, -3];
      const f = 164.81 * 2 ** (melody[this.note++ % melody.length] / 12);
      this.tone(f, 1.1, 0.026);
      if (this.note % 4 === 0) this.tone(f / 2, 1.6, 0.035, 'triangle');
    }
  }
}
