// Spatial Harmony: Giant Steps -- IWSDK Edition
// Immersive visualization of Coltrane's harmonic cosmos
// Direct-drive architecture: no ECS for the core loop, just Three.js + Web Audio

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
  Object3D,
} from '@iwsdk/core';

import { IBLGradient, DomeGradient } from '@iwsdk/core';

import {
  GIANT_STEPS,
  CIRCLE_OF_FIFTHS_PC,
  CIRCLE_OF_FIFTHS_LABELS,
  PITCH_COLORS,
  KEY_COLORS,
  pitchFrequency,
  ChordChange,
} from './data/progression.js';

// ========================================================================
// Audio Engine (inline, no separate file indirection)
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

    // Reverb IR
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

    // Bass chain
    this.bassFilter = this.ctx.createBiquadFilter();
    this.bassFilter.type = 'lowpass';
    this.bassFilter.frequency.value = 400;
    this.bassGain = this.ctx.createGain();
    this.bassGain.gain.value = 0;
    this.bassFilter.connect(this.bassGain);
    this.bassGain.connect(this.master);

    console.log('[Audio] Initialized');
  }

  playChord(tones: number[], _keyCenter: string) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;

    // Release old
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + 0.2);
      try { v.osc1.stop(now + 0.3); } catch {}
      try { v.osc2.stop(now + 0.3); } catch {}
    }
    this.voices = [];

    // New voices
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
      if (pos) {
        panner.positionX.value = pos.x;
        panner.positionY.value = pos.y;
        panner.positionZ.value = pos.z;
      }

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.04);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = freq;

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = freq * 1.003;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(this.master);

      if (this.reverb) {
        const send = this.ctx.createGain();
        send.gain.value = 0.2;
        gain.connect(send);
        send.connect(this.reverb);
      }

      filter.frequency.linearRampToValueAtTime(freq * 6, now + 0.2);
      filter.frequency.linearRampToValueAtTime(freq * 2, now + 0.8);

      osc1.start(now);
      osc2.start(now);

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
// Scene state
// ========================================================================

interface PitchNodeInfo {
  pitchClass: number;
  mesh: Mesh;
  mat: MeshStandardMaterial;
  haloMat: MeshBasicMaterial;
  x: number;
  y: number;
  z: number;
  baseColor: [number, number, number];
}

interface ParticleInfo {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

interface KeyIndicatorInfo {
  keyCenter: string;
  mat: MeshStandardMaterial;
}

const audio = new AudioEngine();
const pitchNodes: PitchNodeInfo[] = [];
const particles: ParticleInfo[] = [];
const keyIndicators: KeyIndicatorInfo[] = [];
let domeMesh: LineSegments | null = null;

let isPlaying = false;
let beatClock = 0;
let currentChordIndex = -1;
let elapsedTime = 0;
const BPM = 160;
const TOTAL_BEATS = 48;

// ========================================================================
// World setup
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
  const { camera } = world;
  camera.position.set(0, 1.6, 0);

  // ======================================================================
  // Environment
  // ======================================================================
  const levelRoot = world.activeLevel.value;

  levelRoot.addComponent(IBLGradient, {
    sky: [0.02, 0.01, 0.08, 1.0],
    equator: [0.01, 0.02, 0.06, 1.0],
    ground: [0.005, 0.005, 0.02, 1.0],
    intensity: 0.4,
  });

  levelRoot.addComponent(DomeGradient, {
    sky: [0.01, 0.005, 0.04, 1.0],
    equator: [0.005, 0.01, 0.03, 1.0],
    ground: [0.002, 0.002, 0.01, 1.0],
    intensity: 1.0,
  });

  // ======================================================================
  // Geodesic Dome
  // ======================================================================
  const domeGeo = new IcosahedronGeometry(6.5, 2);
  const domeWireGeo = new WireframeGeometry(domeGeo);
  const domeMat = new LineBasicMaterial({
    color: new Color(0.15, 0.2, 0.5),
    transparent: true,
    opacity: 0.3,
  });
  domeMesh = new LineSegments(domeWireGeo, domeMat);
  domeMesh.position.set(0, 1.6, 0);
  world.createTransformEntity(domeMesh);

  // ======================================================================
  // Star Field (small spheres)
  // ======================================================================
  for (let i = 0; i < 120; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 11 + Math.random() * 5;
    const sMesh = new Mesh(
      new SphereGeometry(0.015 + Math.random() * 0.02, 4, 4),
      new MeshBasicMaterial({
        color: new Color(0.7 + Math.random() * 0.3, 0.75 + Math.random() * 0.25, 1.0),
        transparent: true,
        opacity: 0.3 + Math.random() * 0.5,
      }),
    );
    sMesh.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta) + 1.6,
      r * Math.cos(phi),
    );
    world.createTransformEntity(sMesh);
  }

  // ======================================================================
  // Circle of Fifths: 12 pitch-class nodes
  // ======================================================================
  const nodeRadius = 3.8;
  const nodeY = 1.6;

  for (let i = 0; i < 12; i++) {
    const pc = CIRCLE_OF_FIFTHS_PC[i];
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * nodeRadius;
    const z = Math.sin(angle) * nodeRadius;
    const color = PITCH_COLORS[pc];

    const nodeMat = new MeshStandardMaterial({
      color: new Color(color[0], color[1], color[2]),
      emissive: new Color(color[0] * 0.5, color[1] * 0.5, color[2] * 0.5),
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.6,
    });
    const nodeMesh = new Mesh(new SphereGeometry(0.15, 16, 16), nodeMat);
    nodeMesh.position.set(x, nodeY, z);
    world.createTransformEntity(nodeMesh);

    // Halo
    const haloMat = new MeshBasicMaterial({
      color: new Color(color[0], color[1], color[2]),
      transparent: true,
      opacity: 0.15,
      side: DoubleSide,
    });
    const haloMesh = new Mesh(
      new CylinderGeometry(0.3, 0.3, 0.01, 32, 1, true),
      haloMat,
    );
    haloMesh.position.set(x, nodeY, z);
    haloMesh.rotation.x = Math.PI / 2;
    world.createTransformEntity(haloMesh);

    pitchNodes.push({ pitchClass: pc, mesh: nodeMesh, mat: nodeMat, haloMat, x, y: nodeY, z, baseColor: color });

    // Register position for spatial audio
    audio.nodePositions.set(pc, { x, y: nodeY, z });
  }

  // ======================================================================
  // Key Center Indicators
  // ======================================================================
  const centers = [
    { name: 'B', angle: 0, color: KEY_COLORS['B'] },
    { name: 'G', angle: 120, color: KEY_COLORS['G'] },
    { name: 'Eb', angle: 240, color: KEY_COLORS['Eb'] },
  ];

  for (const { name, angle, color } of centers) {
    const theta = (angle * Math.PI) / 180;
    const r = 4.5;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;

    const mat = new MeshStandardMaterial({
      color: new Color(color[0], color[1], color[2]),
      emissive: new Color(color[0], color[1], color[2]),
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.08,
      side: DoubleSide,
    });
    const mesh = new Mesh(new PlaneGeometry(2, 2), mat);
    mesh.position.set(x, nodeY, z);
    mesh.lookAt(0, nodeY, 0);
    world.createTransformEntity(mesh);
    keyIndicators.push({ keyCenter: name, mat });
  }

  // ======================================================================
  // Chord name HUD (floating text won't work without font, use console)
  // ======================================================================
  const hudEl = document.createElement('div');
  hudEl.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    z-index: 50; font-family: system-ui, sans-serif; text-align: center;
    color: #c8d0e8; pointer-events: none;
  `;
  hudEl.innerHTML = `
    <div id="chord-name" style="font-size: 28px; font-weight: 300; letter-spacing: 0.15em;"></div>
    <div id="key-center" style="font-size: 13px; color: #667; margin-top: 4px; letter-spacing: 0.2em;"></div>
  `;
  document.body.appendChild(hudEl);

  // ======================================================================
  // Update loop
  // ======================================================================
  function onChordChange(chord: ChordChange) {
    audio.playChord(chord.tones, chord.keyCenter);

    // Update HUD
    const chordEl = document.getElementById('chord-name');
    const keyEl = document.getElementById('key-center');
    if (chordEl) chordEl.textContent = chord.name;
    if (keyEl) {
      const kcColor = KEY_COLORS[chord.keyCenter];
      keyEl.textContent = `${chord.keyCenter} MAJOR`;
      keyEl.style.color = `rgb(${Math.round(kcColor[0]*255)},${Math.round(kcColor[1]*255)},${Math.round(kcColor[2]*255)})`;
    }

    // Light up active nodes, dim inactive
    const activeTones = new Set(chord.tones);
    const kcColor = KEY_COLORS[chord.keyCenter];

    for (const node of pitchNodes) {
      if (activeTones.has(node.pitchClass)) {
        node.mat.emissive.setRGB(kcColor[0] * 2, kcColor[1] * 2, kcColor[2] * 2);
        node.mat.emissiveIntensity = 3.0;
        node.mesh.scale.setScalar(1.8);
        node.haloMat.opacity = 0.5;
      } else {
        node.mat.emissive.setRGB(node.baseColor[0] * 0.3, node.baseColor[1] * 0.3, node.baseColor[2] * 0.3);
        node.mat.emissiveIntensity = 0.5;
        node.mesh.scale.setScalar(1.0);
        node.haloMat.opacity = 0.1;
      }
    }

    // Key center indicators
    for (const ki of keyIndicators) {
      if (ki.keyCenter === chord.keyCenter) {
        ki.mat.opacity = 0.25;
        ki.mat.emissiveIntensity = 1.5;
      } else {
        ki.mat.opacity = 0.05;
        ki.mat.emissiveIntensity = 0.2;
      }
    }

    // Spawn particles at active nodes
    for (const pc of chord.tones) {
      const node = pitchNodes.find(n => n.pitchClass === pc);
      if (!node) continue;
      const color = PITCH_COLORS[pc];
      for (let p = 0; p < 4; p++) {
        const pMat = new MeshBasicMaterial({
          color: new Color(color[0], color[1], color[2]),
          transparent: true,
          opacity: 0.7,
        });
        const pMesh = new Mesh(new SphereGeometry(0.04, 4, 4), pMat);
        pMesh.position.set(
          node.x + (Math.random() - 0.5) * 0.15,
          node.y + (Math.random() - 0.5) * 0.15,
          node.z + (Math.random() - 0.5) * 0.15,
        );
        world.createTransformEntity(pMesh);
        particles.push({
          mesh: pMesh,
          mat: pMat,
          vx: (Math.random() - 0.5) * 0.6,
          vy: Math.random() * 0.4 + 0.15,
          vz: (Math.random() - 0.5) * 0.6,
          life: 2.5 + Math.random() * 1.5,
          maxLife: 4,
        });
      }
    }
  }

  function findCurrentChord(): number {
    for (let i = GIANT_STEPS.length - 1; i >= 0; i--) {
      if (beatClock >= GIANT_STEPS[i].beat) return i;
    }
    return 0;
  }

  // Main update
  world.onUpdate((delta: number, time: number) => {
    if (!isPlaying) return;

    elapsedTime += delta;

    // Narrative intensity
    let intensity = 0;
    if (elapsedTime < 8) intensity = (elapsedTime / 8) * 0.3;
    else if (elapsedTime < 25) intensity = 0.3 + ((elapsedTime - 8) / 17) * 0.4;
    else if (elapsedTime < 55) intensity = 0.7 + Math.sin(elapsedTime * 0.1) * 0.15;
    else if (elapsedTime < 85) intensity = 0.85 + Math.sin(elapsedTime * 0.3) * 0.15;
    else intensity = Math.max(0.2, 1.0 - (elapsedTime - 85) / 20);

    // Beat clock
    beatClock += delta * (BPM / 60);
    if (beatClock >= TOTAL_BEATS) {
      beatClock -= TOTAL_BEATS;
      currentChordIndex = -1;
    }

    // Chord change detection
    const newIdx = findCurrentChord();
    if (newIdx !== currentChordIndex) {
      currentChordIndex = newIdx;
      onChordChange(GIANT_STEPS[newIdx]);
    }

    // Animate active pitch nodes (pulse)
    for (const node of pitchNodes) {
      if (node.mesh.scale.x > 1.2) {
        const pulse = 1.0 + Math.sin(time * 4) * 0.1;
        node.mesh.scale.setScalar(1.6 * pulse);
      }
    }

    // Dome breathing
    if (domeMesh) {
      const breathe = 1.0 + Math.sin(time * 0.5) * 0.015 * (1 + intensity);
      domeMesh.scale.setScalar(breathe);
    }

    // Animate + cull particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        p.mesh.visible = false;
        particles.splice(i, 1);
        continue;
      }
      p.mesh.position.x += p.vx * delta;
      p.mesh.position.y += p.vy * delta;
      p.mesh.position.z += p.vz * delta;
      const alpha = p.life / p.maxLife;
      p.mesh.scale.setScalar(0.04 * alpha);
      p.mat.opacity = alpha * 0.7;
    }
  });

  // ======================================================================
  // Start overlay
  // ======================================================================
  const overlay = document.createElement('div');
  overlay.innerHTML = `
    <div style="
      position: fixed; inset: 0; z-index: 100;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: rgba(0,0,10,0.92);
      font-family: system-ui, sans-serif; color: #e8eaf0;
      cursor: pointer;
    ">
      <h1 style="font-size: 32px; font-weight: 300; letter-spacing: 0.12em; margin-bottom: 8px;">
        SPATIAL HARMONY
      </h1>
      <p style="font-size: 14px; color: #8892a8; margin-bottom: 32px; letter-spacing: 0.2em;">
        GIANT STEPS &bull; JOHN COLTRANE
      </p>
      <button id="start-btn" style="
        padding: 16px 48px; border-radius: 999px; border: 2px solid rgba(82,109,255,0.4);
        background: rgba(82, 109, 255, 0.85); color: white;
        font-size: 18px; font-weight: 600; cursor: pointer;
        letter-spacing: 0.05em;
      ">
        Enter Experience
      </button>
      <p style="font-size: 11px; color: #445; margin-top: 24px;">
        Audio required &bull; VR headset recommended
      </p>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('start-btn')!.addEventListener('click', async () => {
    overlay.style.display = 'none';
    await audio.init();
    isPlaying = true;
    beatClock = 0;
    currentChordIndex = -1;
    elapsedTime = 0;
    console.log('[Spatial Harmony] Playback started: 160 BPM, Giant Steps');
  });

  console.log('[Spatial Harmony] Scene ready: 12 nodes, dome, 120 stars, 3 key indicators');
  console.log('[Spatial Harmony] Click "Enter Experience" to begin');
});
