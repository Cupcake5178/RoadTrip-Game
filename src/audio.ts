import type { Settings, Weather } from './state';
import type { Surface } from './collision';

export type Sound =
  | 'click'
  | 'pick'
  | 'success'
  | 'bad'
  | 'shutter'
  | 'door'
  | 'step'
  | 'jump'
  | 'land'
  | 'bump'
  | 'cloth'
  | 'throw'
  | 'drop'
  | 'horn'
  | 'brake'
  | 'startup'
  | 'repair'
  | 'drink'
  | 'vending';
export class AudioSystem {
  ctx?: AudioContext;
  master?: GainNode;
  analyser?: AnalyserNode;
  engine?: OscillatorNode;
  engineGain?: GainNode;
  rainGain?: GainNode;
  effects?: GainNode;
  musicBus?: GainNode;
  ambience?: GainNode;
  tireGain?: GainNode;
  windGain?: GainNode;
  insectGain?: GainNode;
  noiseBuffer?: AudioBuffer;
  lastNote = 0;
  note = 0;
  active = false;
  nextBird = 0;
  lastDriving = false;
  previousSpeed = 0;
  brakeAt = 0;
  bumpAt = 0;
  crackleAt = 0;
  events: Partial<Record<Sound, number>> = {};
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.master.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.effects = this.ctx.createGain();
      this.effects.gain.value = 0.68;
      this.effects.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.48;
      this.musicBus.connect(this.master);
      this.ambience = this.ctx.createGain();
      this.ambience.gain.value = 0.55;
      this.ambience.connect(this.master);
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.04 * white) / 1.04;
        data[i] = white * 0.6 + last * 3;
      }
      this.noiseBuffer = buffer;
      this.engine = this.ctx.createOscillator();
      this.engine.type = 'triangle';
      this.engine.frequency.value = 40;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 360;
      this.engine.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.effects);
      this.engine.start();
      const harmonic = this.ctx.createOscillator();
      harmonic.type = 'sawtooth';
      harmonic.frequency.value = 20;
      const harmonicGain = this.ctx.createGain();
      harmonicGain.gain.value = 0.2;
      harmonic.connect(harmonicGain);
      harmonicGain.connect(this.engineGain);
      harmonic.start();
      this.rainGain = this.loopNoise(1200, 'lowpass');
      this.tireGain = this.loopNoise(500, 'bandpass');
      this.windGain = this.loopNoise(220, 'lowpass');
      const insect = this.ctx.createOscillator();
      insect.type = 'sine';
      insect.frequency.value = 3100;
      this.insectGain = this.ctx.createGain();
      this.insectGain.gain.value = 0;
      insect.connect(this.insectGain);
      this.insectGain.connect(this.ambience);
      insect.start();
      this.active = true;
    } catch {
      /* Browsers can deny audio; gameplay remains available. */
    }
  }
  private loopNoise(frequency: number, type: BiquadFilterType) {
    const ctx = this.ctx!,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = this.noiseBuffer!;
    source.loop = true;
    filter.type = type;
    filter.frequency.value = frequency;
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambience!);
    source.start();
    return gain;
  }
  tone(
    freq: number,
    length = 0.15,
    volume = 0.12,
    type: OscillatorType = 'sine',
    bus?: GainNode,
    endFrequency?: number,
  ) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx,
      osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      t = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFrequency)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), t + length);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain);
    gain.connect(bus ?? this.effects!);
    osc.start();
    osc.stop(t + length + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  noise(duration: number, volume: number, frequency: number, type: BiquadFilterType = 'lowpass') {
    if (!this.ctx || !this.noiseBuffer || !this.effects) return;
    const ctx = this.ctx,
      t = ctx.currentTime,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = type;
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effects);
    source.start(t, Math.random());
    source.stop(t + duration + 0.01);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  step(surface: Surface, running = false) {
    this.events.step = (this.events.step ?? 0) + 1;
    const frequency = { grass: 650, road: 230, gravel: 1700, wood: 460, metal: 1100 }[surface];
    this.noise(
      running ? 0.12 : 0.09,
      running ? 0.16 : 0.11,
      frequency,
      surface === 'gravel' ? 'highpass' : 'lowpass',
    );
    if (surface === 'wood' || surface === 'road')
      this.tone(surface === 'wood' ? 130 : 80, 0.1, 0.085, 'triangle');
  }
  feedback(kind: Sound) {
    this.events[kind] = (this.events[kind] ?? 0) + 1;
    switch (kind) {
      case 'success':
        [440, 554, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.26, 0.12), i * 80));
        break;
      case 'pick':
        this.noise(0.12, 0.08, 1500);
        this.tone(510, 0.11, 0.12, 'sine', undefined, 760);
        break;
      case 'bad':
        this.tone(155, 0.25, 0.13, 'triangle', undefined, 110);
        break;
      case 'shutter':
        this.noise(0.055, 0.2, 2400, 'highpass');
        setTimeout(() => this.noise(0.04, 0.13, 1800), 65);
        break;
      case 'door':
        this.noise(0.12, 0.18, 500);
        this.tone(76, 0.16, 0.18, 'triangle', undefined, 45);
        break;
      case 'step':
        this.step('grass');
        break;
      case 'jump':
        this.noise(0.14, 0.07, 1200);
        this.tone(140, 0.16, 0.08, 'sine', undefined, 240);
        break;
      case 'land':
        this.noise(0.18, 0.18, 350);
        this.tone(95, 0.15, 0.12, 'triangle', undefined, 55);
        break;
      case 'bump':
        this.noise(0.12, 0.12, 400);
        this.tone(115, 0.16, 0.08, 'sine', undefined, 85);
        break;
      case 'cloth':
        this.noise(0.18, 0.07, 950);
        break;
      case 'throw':
        this.noise(0.24, 0.17, 1800, 'bandpass');
        this.tone(300, 0.18, 0.035, 'sine', undefined, 180);
        break;
      case 'drop':
        this.noise(0.12, 0.14, 680);
        this.tone(105, 0.12, 0.09, 'triangle');
        break;
      case 'horn':
        this.tone(349, 0.45, 0.14, 'triangle');
        this.tone(440, 0.44, 0.1, 'triangle');
        break;
      case 'brake':
        this.noise(0.16, 0.1, 1800, 'bandpass');
        break;
      case 'startup':
        this.noise(0.4, 0.11, 350);
        this.tone(37, 0.6, 0.14, 'sawtooth', undefined, 85);
        break;
      case 'repair':
        this.noise(0.07, 0.14, 2200, 'bandpass');
        this.tone(720, 0.06, 0.08, 'triangle');
        break;
      case 'drink':
        this.noise(0.23, 0.08, 900);
        this.tone(320, 0.12, 0.05, 'sine', undefined, 200);
        break;
      case 'vending':
        this.tone(860, 0.07, 0.08);
        setTimeout(() => this.noise(0.2, 0.16, 700), 160);
        break;
      default:
        this.tone(510, 0.065, 0.075, 'sine', undefined, 620);
    }
  }
  meter() {
    if (!this.analyser) return 0;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    return Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
  }
  update(
    speed: number,
    driving: boolean,
    weather: Weather,
    settings: Settings,
    paused: boolean,
    context?: { surface: Surface; forest: boolean; night: boolean; camp: boolean; gas: boolean },
    delta = 1 / 60,
  ) {
    if (!this.ctx || !this.master || !this.engine || !this.engineGain || !this.rainGain) return;
    const t = this.ctx.currentTime,
      velocity = Math.abs(speed);
    this.master.gain.setTargetAtTime(settings.volume * (paused ? 0.12 : 1), t, 0.12);
    this.engine.frequency.setTargetAtTime(38 + velocity * 5.3, t, 0.09);
    this.engineGain.gain.setTargetAtTime(driving && !paused ? 0.13 + velocity * 0.003 : 0, t, 0.14);
    this.rainGain.gain.setTargetAtTime(weather === 'rain' && !paused ? 0.16 : 0, t, 0.6);
    this.windGain?.gain.setTargetAtTime(
      paused
        ? 0
        : 0.018 + (driving ? velocity * 0.001 : 0.008) + (weather === 'cloudy' ? 0.012 : 0),
      t,
      0.5,
    );
    this.tireGain?.gain.setTargetAtTime(
      driving && !paused
        ? velocity * (context?.surface === 'road' ? 0.0012 : 0.003)
        : context?.gas && !paused
          ? 0.008
          : 0,
      t,
      0.1,
    );
    this.insectGain?.gain.setTargetAtTime(
      context?.night && !paused ? 0.006 * (0.5 + 0.5 * Math.sin(t * 8) ** 2) : 0,
      t,
      0.2,
    );
    if (driving && !this.lastDriving && !paused) this.feedback('startup');
    if (
      driving &&
      !paused &&
      velocity > 1 &&
      (this.previousSpeed - velocity) / Math.max(delta, 0.001) > 8 &&
      t > this.brakeAt
    ) {
      this.feedback('brake');
      this.brakeAt = t + 0.35;
    }
    if (driving && context?.surface !== 'road' && velocity > 9 && t > this.bumpAt) {
      this.bumpAt = t + 1.8;
      this.tone(65, 0.11, 0.035, 'triangle');
    }
    this.lastDriving = driving;
    this.previousSpeed = velocity;
    if (context?.camp && !paused && t > this.crackleAt) {
      this.crackleAt = t + 0.3 + Math.random() * 0.6;
      this.noise(0.04, 0.045, 2000, 'highpass');
    }
    if (!paused && !context?.night && weather !== 'rain' && t > this.nextBird) {
      this.nextBird = t + 6 + Math.random() * 9;
      this.tone(1900, 0.14, context?.forest ? 0.045 : 0.025, 'sine', this.ambience, 2900);
      setTimeout(() => this.tone(2400, 0.1, 0.025, 'sine', this.ambience, 2000), 180);
    }
    if (settings.music && !paused && t > this.lastNote + 0.68) {
      this.lastNote = t;
      const melody = [0, 7, 12, 4, 7, 14, 12, 7, 0, 9, 12, 4, 7, 4, 2, -3];
      const f = 164.81 * 2 ** (melody[this.note++ % melody.length] / 12);
      this.tone(f, 1.1, 0.045, 'sine', this.musicBus);
      if (this.note % 4 === 0) this.tone(f / 2, 1.6, 0.04, 'triangle', this.musicBus);
    }
  }
}
