// Spatial Harmony: Giant Steps -- IWSDK Edition
// Immersive visualization of Coltrane's harmonic cosmos

import {
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  SphereGeometry,
  IcosahedronGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SessionMode,
  World,
  Color,
  LineSegments,
  WireframeGeometry,
  LineBasicMaterial,
  DoubleSide,
} from '@iwsdk/core';

import { IBLGradient, DomeGradient } from '@iwsdk/core';

import { HarmonySystem } from './systems/HarmonySystem.js';

import {
  GIANT_STEPS,
  CIRCLE_OF_FIFTHS_PC,
  PITCH_COLORS,
  KEY_COLORS,
  pitchFrequency,
  ChordChange,
} from './data/progression.js';

// ========================================================================
// Audio Engine
// ========================================================================

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private voices: { osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode }[] = [];
  private bassOsc: OscillatorNode | null = null;
  private bassGain: GainNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;
  public nodePositions = new Map<number, { x: number; y: number; z: number }>();

  async init() {
    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    try {
      this.reverb = this.ctx.createConvolver();
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
      this.reverb.buffer = buf;
      this.reverb.connect(this.master);
    } catch { /* skip reverb */ }
    this.master.connect(this.ctx.destination);
    this.bassFilter = this.ctx.createBiquadFilter();
    this.bassFilter.type = 'lowpass';
    this.bassFilter.frequency.value = 400;
    this.bassGain = this.ctx.createGain();
    this.bassGain.gain.value = 0;
    this.bassFilter.connect(this.bassGain);
    this.bassGain.connect(this.master);
    console.log('[Audio] Web Audio initialized');
  }

  playChord(tones: number[]) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + 0.2);
      try { v.osc1.stop(now + 0.3); } catch {}
      try { v.osc2.stop(now + 0.3); } catch {}
    }
    this.voices = [];
    for (const pc of tones) {
      const freq = pitchFrequency(pc, 4);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq * 3;
      filter.Q.value = 1.5;
      const panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 20;
      const pos = this.nodePositions.get(pc);
      if (pos) { panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z; }
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
      const osc1 = this.ctx.createOscillator(); osc1.type = 'sine'; osc1.frequency.value = freq;
      const osc2 = this.ctx.createOscillator(); osc2.type = 'triangle'; osc2.frequency.value = freq * 1.003;
      osc1.connect(filter); osc2.connect(filter);
      filter.connect(gain); gain.connect(panner); panner.connect(this.master);
      if (this.reverb) { const send = this.ctx.createGain(); send.gain.value = 0.2; gain.connect(send); send.connect(this.reverb); }
      filter.frequency.linearRampToValueAtTime(freq * 6, now + 0.2);
      filter.frequency.linearRampToValueAtTime(freq * 2, now + 0.8);
      osc1.start(now); osc2.start(now);
      this.voices.push({ osc1, osc2, gain });
    }
    // Walking bass
    if (this.bassFilter && this.bassGain && this.ctx) {
      if (this.bassOsc) { try { this.bassOsc.stop(now + 0.02); } catch {} }
      const bFreq = pitchFrequency(tones[0], 2);
      this.bassOsc = this.ctx.createOscillator();
      this.bassOsc.type = 'sawtooth';
      this.bassOsc.frequency.value = bFreq;
      this.bassOsc.connect(this.bassFilter);
      this.bassGain.gain.cancelScheduledValues(now);
      this.bassGain.gain.setValueAtTime(0, now);
      this.bassGain.gain.linearRampToValueAtTime(0.1, now + 0.02);
      this.bassGain.gain.linearRampToValueAtTime(0.06, now + 0.5);
      this.bassOsc.start(now);
      this.bassOsc.stop(now + 1.5);
    }
  }
}

// ========================================================================
// Types
// ========================================================================

interface NodeInfo {
  pc: number;
  mesh: Mesh;
  mat: MeshStandardMaterial;
  haloMat: MeshBasicMaterial;
  x: number; y: number; z: number;
  baseColor: [number, number, number];
}

interface Part {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
}

// ========================================================================
// Boot
// ========================================================================

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets: {},
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
    features: { handTracking: true, layers: true },
  },
  features: {
    locomotion: false,
    grabbing: false,
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
  },
}).then((world) => {

  // -- Camera --
  world.camera.position.set(0, 1.6, 0);

  // -- Environment --
  const lvl = world.activeLevel.value;
  lvl.addComponent(IBLGradient, {
    sky: [0.02, 0.01, 0.08, 1.0],
    equator: [0.01, 0.02, 0.06, 1.0],
    ground: [0.005, 0.005, 0.02, 1.0],
    intensity: 0.4,
  });
  lvl.addComponent(DomeGradient, {
    sky: [0.01, 0.005, 0.04, 1.0],
    equator: [0.005, 0.01, 0.03, 1.0],
    ground: [0.002, 0.002, 0.01, 1.0],
    intensity: 1.0,
  });

  // -- Geodesic Dome --
  const domeGeo = new IcosahedronGeometry(6.5, 2);
  const domeMat = new LineBasicMaterial({ color: new Color(0.15, 0.2, 0.5), transparent: true, opacity: 0.3 });
  const dome = new LineSegments(new WireframeGeometry(domeGeo), domeMat);
  dome.position.set(0, 1.6, 0);
  world.createTransformEntity(dome);

  // -- Stars --
  for (let i = 0; i < 100; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const r = 11 + Math.random() * 5;
    const s = new Mesh(
      new SphereGeometry(0.015 + Math.random() * 0.02, 4, 4),
      new MeshBasicMaterial({ color: new Color(0.7 + Math.random() * 0.3, 0.8 + Math.random() * 0.2, 1.0), transparent: true, opacity: 0.3 + Math.random() * 0.5 }),
    );
    s.position.set(r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th) + 1.6, r * Math.cos(ph));
    world.createTransformEntity(s);
  }

  // -- Circle of Fifths nodes --
  const audio = new AudioEngine();
  const nodes: NodeInfo[] = [];
  const R = 3.8, Y = 1.6;

  for (let i = 0; i < 12; i++) {
    const pc = CIRCLE_OF_FIFTHS_PC[i];
    const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(ang) * R, z = Math.sin(ang) * R;
    const c = PITCH_COLORS[pc];

    const mat = new MeshStandardMaterial({
      color: new Color(c[0], c[1], c[2]),
      emissive: new Color(c[0] * 0.5, c[1] * 0.5, c[2] * 0.5),
      emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.6,
    });
    const mesh = new Mesh(new SphereGeometry(0.15, 16, 16), mat);
    mesh.position.set(x, Y, z);
    world.createTransformEntity(mesh);

    const haloMat = new MeshBasicMaterial({ color: new Color(c[0], c[1], c[2]), transparent: true, opacity: 0.15, side: DoubleSide });
    const halo = new Mesh(new CylinderGeometry(0.3, 0.3, 0.01, 32, 1, true), haloMat);
    halo.position.set(x, Y, z);
    halo.rotation.x = Math.PI / 2;
    world.createTransformEntity(halo);

    nodes.push({ pc, mesh, mat, haloMat, x, y: Y, z, baseColor: c });
    audio.nodePositions.set(pc, { x, y: Y, z });
  }

  // -- Key center indicators --
  const kiMats: { kc: string; mat: MeshStandardMaterial }[] = [];
  for (const { name, angle, color } of [
    { name: 'B', angle: 0, color: KEY_COLORS['B'] },
    { name: 'G', angle: 120, color: KEY_COLORS['G'] },
    { name: 'Eb', angle: 240, color: KEY_COLORS['Eb'] },
  ]) {
    const th = (angle * Math.PI) / 180;
    const x = Math.cos(th) * 4.5, z = Math.sin(th) * 4.5;
    const mat = new MeshStandardMaterial({
      color: new Color(color[0], color[1], color[2]),
      emissive: new Color(color[0], color[1], color[2]),
      emissiveIntensity: 0.4, transparent: true, opacity: 0.08, side: DoubleSide,
    });
    const m = new Mesh(new PlaneGeometry(2, 2), mat);
    m.position.set(x, Y, z);
    m.lookAt(0, Y, 0);
    world.createTransformEntity(m);
    kiMats.push({ kc: name, mat });
  }

  // -- HUD --
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:50;font-family:system-ui,sans-serif;text-align:center;color:#c8d0e8;pointer-events:none;';
  hud.innerHTML = '<div id="chord-name" style="font-size:28px;font-weight:300;letter-spacing:0.15em;"></div><div id="key-center" style="font-size:13px;color:#667;margin-top:4px;letter-spacing:0.2em;"></div>';
  document.body.appendChild(hud);

  // -- Playback state --
  let playing = false;
  let beatClock = 0;
  let chordIdx = -1;
  let elapsed = 0;
  const BPM = 160;
  const TOTAL = 48;
  const parts: Part[] = [];

  function onChord(chord: ChordChange) {
    audio.playChord(chord.tones);
    const cEl = document.getElementById('chord-name');
    const kEl = document.getElementById('key-center');
    if (cEl) cEl.textContent = chord.name;
    if (kEl) {
      const kc = KEY_COLORS[chord.keyCenter];
      kEl.textContent = chord.keyCenter + ' MAJOR';
      kEl.style.color = `rgb(${kc[0]*255|0},${kc[1]*255|0},${kc[2]*255|0})`;
    }
    const active = new Set(chord.tones);
    const kc = KEY_COLORS[chord.keyCenter];
    for (const n of nodes) {
      if (active.has(n.pc)) {
        n.mat.emissive.setRGB(kc[0] * 2, kc[1] * 2, kc[2] * 2);
        n.mat.emissiveIntensity = 3.0;
        n.mesh.scale.setScalar(1.8);
        n.haloMat.opacity = 0.5;
      } else {
        n.mat.emissive.setRGB(n.baseColor[0] * 0.3, n.baseColor[1] * 0.3, n.baseColor[2] * 0.3);
        n.mat.emissiveIntensity = 0.5;
        n.mesh.scale.setScalar(1.0);
        n.haloMat.opacity = 0.1;
      }
    }
    for (const ki of kiMats) {
      if (ki.kc === chord.keyCenter) { ki.mat.opacity = 0.25; ki.mat.emissiveIntensity = 1.5; }
      else { ki.mat.opacity = 0.05; ki.mat.emissiveIntensity = 0.2; }
    }
    // Particles
    for (const pc of chord.tones) {
      const n = nodes.find(nd => nd.pc === pc);
      if (!n) continue;
      const col = PITCH_COLORS[pc];
      for (let p = 0; p < 4; p++) {
        const pMat = new MeshBasicMaterial({ color: new Color(col[0], col[1], col[2]), transparent: true, opacity: 0.7 });
        const pMesh = new Mesh(new SphereGeometry(0.04, 4, 4), pMat);
        pMesh.position.set(n.x + (Math.random() - 0.5) * 0.15, n.y + (Math.random() - 0.5) * 0.15, n.z + (Math.random() - 0.5) * 0.15);
        world.createTransformEntity(pMesh);
        parts.push({ mesh: pMesh, mat: pMat, vx: (Math.random() - 0.5) * 0.6, vy: Math.random() * 0.4 + 0.15, vz: (Math.random() - 0.5) * 0.6, life: 2.5 + Math.random() * 1.5, maxLife: 4 });
      }
    }
  }

  // -- Register the system and wire the tick --
  world.registerSystem(HarmonySystem, {
    globals: {
      tick: (delta: number, time: number) => {
        if (!playing) return;
        elapsed += delta;

        // Beat clock
        beatClock += delta * (BPM / 60);
        if (beatClock >= TOTAL) { beatClock -= TOTAL; chordIdx = -1; }

        // Chord change
        let newIdx = 0;
        for (let i = GIANT_STEPS.length - 1; i >= 0; i--) {
          if (beatClock >= GIANT_STEPS[i].beat) { newIdx = i; break; }
        }
        if (newIdx !== chordIdx) { chordIdx = newIdx; onChord(GIANT_STEPS[chordIdx]); }

        // Pulse active nodes
        for (const n of nodes) {
          if (n.mesh.scale.x > 1.2) {
            n.mesh.scale.setScalar(1.6 * (1.0 + Math.sin(time * 4) * 0.1));
          }
        }

        // Dome breathing
        dome.scale.setScalar(1.0 + Math.sin(time * 0.5) * 0.015);

        // Particles
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.life -= delta;
          if (p.life <= 0) { p.mesh.visible = false; parts.splice(i, 1); continue; }
          p.mesh.position.x += p.vx * delta;
          p.mesh.position.y += p.vy * delta;
          p.mesh.position.z += p.vz * delta;
          const a = p.life / p.maxLife;
          p.mesh.scale.setScalar(0.04 * a);
          p.mat.opacity = a * 0.7;
        }
      },
    },
  });

  // -- Start overlay --
  const overlay = document.createElement('div');
  overlay.innerHTML = `
    <div style="position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,10,0.92);font-family:system-ui,sans-serif;color:#e8eaf0;cursor:pointer;">
      <h1 style="font-size:32px;font-weight:300;letter-spacing:0.12em;margin-bottom:8px;">SPATIAL HARMONY</h1>
      <p style="font-size:14px;color:#8892a8;margin-bottom:32px;letter-spacing:0.2em;">GIANT STEPS &bull; JOHN COLTRANE</p>
      <button id="start-btn" style="padding:16px 48px;border-radius:999px;border:2px solid rgba(82,109,255,0.4);background:rgba(82,109,255,0.85);color:white;font-size:18px;font-weight:600;cursor:pointer;letter-spacing:0.05em;">Enter Experience</button>
      <p style="font-size:11px;color:#445;margin-top:24px;">Audio required &bull; VR headset recommended</p>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('start-btn')!.addEventListener('click', async () => {
    overlay.style.display = 'none';
    await audio.init();
    playing = true;
    beatClock = 0;
    chordIdx = -1;
    elapsed = 0;
    console.log('[Spatial Harmony] Playing Giant Steps at 160 BPM');
  });

  console.log('[Spatial Harmony] Ready. 12 nodes, dome, stars, 3 key indicators.');
});
