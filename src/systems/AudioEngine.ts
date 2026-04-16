// Web Audio synthesis engine for Giant Steps
// Spatial voices positioned at pitch-class locations in 3D space

import { pitchFrequency, PITCH_COLORS } from '../data/progression.js';

interface Voice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private voices: Map<number, Voice> = new Map();
  private activeVoices: Set<number> = new Set();
  private bassOsc: OscillatorNode | null = null;
  private bassGain: GainNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;

  // Pitch node positions (set by scene builder)
  public nodePositions: Map<number, { x: number; y: number; z: number }> = new Map();

  async init(): Promise<void> {
    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.4;

    // Simple reverb via delay feedback
    this.reverb = this.ctx.createConvolver();
    try {
      this.reverb.buffer = this.createReverbIR(2.0, 2.5);
      this.reverb.connect(this.masterGain);
    } catch {
      // Fallback: skip reverb
    }

    this.masterGain.connect(this.ctx.destination);

    // Walking bass
    this.bassFilter = this.ctx.createBiquadFilter();
    this.bassFilter.type = 'lowpass';
    this.bassFilter.frequency.value = 400;
    this.bassGain = this.ctx.createGain();
    this.bassGain.gain.value = 0;
    this.bassFilter.connect(this.bassGain);
    this.bassGain.connect(this.masterGain);
  }

  private createReverbIR(duration: number, decay: number): AudioBuffer {
    const length = this.ctx!.sampleRate * duration;
    const buffer = this.ctx!.createBuffer(2, length, this.ctx!.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  playChord(tones: number[], keyCenter: string): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Release old voices
    this.releaseAll(now);

    // Play new voices
    tones.forEach((pc, i) => {
      const freq = pitchFrequency(pc, 4);
      const voice = this.createVoice(pc, freq, now);
      this.voices.set(pc * 100 + i, voice);
      this.activeVoices.add(pc);
    });

    // Walking bass on root
    this.playBass(tones[0], now);
  }

  private createVoice(pitchClass: number, freq: number, time: number): Voice {
    const ctx = this.ctx!;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq * 3;
    filter.Q.value = 2;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 20;

    // Position at pitch node location if available
    const pos = this.nodePositions.get(pitchClass);
    if (pos) {
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.15, time + 0.05);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = freq;

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = freq * 1.002; // slight detune for warmth

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain!);
    if (this.reverb) {
      const send = ctx.createGain();
      send.gain.value = 0.25;
      gain.connect(send);
      send.connect(this.reverb);
    }

    osc1.start(time);
    osc2.start(time);

    // Filter sweep
    filter.frequency.linearRampToValueAtTime(freq * 6, time + 0.3);
    filter.frequency.linearRampToValueAtTime(freq * 2, time + 1.0);

    return { osc1, osc2, gain, filter, panner };
  }

  private releaseAll(time: number): void {
    this.voices.forEach((voice, key) => {
      voice.gain.gain.cancelScheduledValues(time);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, time);
      voice.gain.gain.linearRampToValueAtTime(0, time + 0.3);
      voice.osc1.stop(time + 0.4);
      voice.osc2.stop(time + 0.4);
    });
    this.voices.clear();
    this.activeVoices.clear();
  }

  private playBass(rootPC: number, time: number): void {
    if (!this.ctx || !this.bassFilter || !this.bassGain) return;

    // Stop previous bass
    if (this.bassOsc) {
      try { this.bassOsc.stop(time + 0.05); } catch {}
    }

    const freq = pitchFrequency(rootPC, 2);
    this.bassOsc = this.ctx.createOscillator();
    this.bassOsc.type = 'sawtooth';
    this.bassOsc.frequency.value = freq;
    this.bassOsc.connect(this.bassFilter);

    this.bassGain.gain.cancelScheduledValues(time);
    this.bassGain.gain.setValueAtTime(0, time);
    this.bassGain.gain.linearRampToValueAtTime(0.12, time + 0.02);
    this.bassGain.gain.linearRampToValueAtTime(0.08, time + 0.5);

    this.bassOsc.start(time);
    this.bassOsc.stop(time + 1.8);
  }

  isActive(pitchClass: number): boolean {
    return this.activeVoices.has(pitchClass);
  }

  dispose(): void {
    if (this.ctx) {
      this.releaseAll(this.ctx.currentTime);
      this.ctx.close();
    }
  }
}
