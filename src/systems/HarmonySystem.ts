// HarmonySystem: ECS system driving the Giant Steps chord progression
// Manages beat clock, chord changes, and coordinates audio + visuals

import {
  createComponent,
  createSystem,
  Types,
} from '@iwsdk/core';

import { GIANT_STEPS, ChordChange, KEY_COLORS } from '../data/progression.js';
import { AudioEngine } from './AudioEngine.js';

// Components
export const PitchNode = createComponent('PitchNode', {
  pitchClass: { type: Types.Int8, default: 0 },
  isActive: { type: Types.Boolean, default: false },
});

export const Particle = createComponent('Particle', {
  velocity: { type: Types.Vec3, default: [0, 0, 0] },
  life: { type: Types.Float32, default: 1.0 },
  maxLife: { type: Types.Float32, default: 3.0 },
});

export const DomeWireframe = createComponent('DomeWireframe', {});
export const KeyCenterIndicator = createComponent('KeyCenterIndicator', {
  keyCenter: { type: Types.String, default: '' },
});

// System
export class HarmonySystem extends createSystem(
  {
    pitchNodes: { required: [PitchNode] },
    particles: { required: [Particle] },
    dome: { required: [DomeWireframe] },
    keyIndicators: { required: [KeyCenterIndicator] },
  },
  {
    bpm: { type: Types.Float32, default: 160 },
    isPlaying: { type: Types.Boolean, default: false },
  },
) {
  public audioEngine!: AudioEngine;
  private beatClock: number = 0;
  private currentChordIndex: number = -1;
  private currentChord: ChordChange | null = null;
  private totalBeats: number = 48; // full form length
  private intensity: number = 0;
  private phase: 'intro' | 'build' | 'explore' | 'climax' | 'resolve' = 'intro';
  private elapsedTime: number = 0;

  // Exposed for scene builder to set
  public nodeBaseEmissive: Map<number, { r: number; g: number; b: number }> = new Map();

  init() {
    this.audioEngine = new AudioEngine();
  }

  async startPlayback() {
    await this.audioEngine.init();
    this.config.isPlaying.value = true;
    this.beatClock = 0;
    this.currentChordIndex = -1;
    this.elapsedTime = 0;
  }

  update(delta: number, time: number) {
    if (!this.config.isPlaying.value) return;

    this.elapsedTime += delta;
    this.updateNarrativeArc();

    // Advance beat clock
    const beatsPerSecond = this.config.bpm.value / 60;
    this.beatClock += delta * beatsPerSecond;

    // Loop the form
    if (this.beatClock >= this.totalBeats) {
      this.beatClock -= this.totalBeats;
      this.currentChordIndex = -1;
    }

    // Check for chord change
    const newChordIndex = this.findCurrentChord();
    if (newChordIndex !== this.currentChordIndex) {
      this.currentChordIndex = newChordIndex;
      this.currentChord = GIANT_STEPS[newChordIndex];
      this.onChordChange(this.currentChord);
    }

    // Animate pitch nodes
    this.animatePitchNodes(delta, time);

    // Animate dome breathing
    this.animateDome(time);

    // Animate particles
    this.animateParticles(delta);
  }

  private findCurrentChord(): number {
    for (let i = GIANT_STEPS.length - 1; i >= 0; i--) {
      if (this.beatClock >= GIANT_STEPS[i].beat) return i;
    }
    return 0;
  }

  private onChordChange(chord: ChordChange) {
    // Play audio
    this.audioEngine.playChord(chord.tones, chord.keyCenter);

    // Update pitch node active states
    this.queries.pitchNodes.entities.forEach((entity) => {
      const pc = PitchNode.data.pitchClass[entity.index];
      const isActive = chord.tones.includes(pc);
      PitchNode.data.isActive[entity.index] = isActive;

      const obj = entity.object3D;
      if (!obj) return;

      if (isActive) {
        // Scale up active nodes
        const s = 1.3 + this.intensity * 0.4;
        obj.scale.setScalar(s);
        // Brighten emissive
        const mat = (obj as any).material;
        if (mat && mat.emissive) {
          const color = KEY_COLORS[chord.keyCenter];
          mat.emissive.setRGB(color[0] * 2, color[1] * 2, color[2] * 2);
          mat.emissiveIntensity = 2.0 + this.intensity * 3;
        }
      } else {
        obj.scale.setScalar(1.0);
        const mat = (obj as any).material;
        if (mat && mat.emissive) {
          const base = this.nodeBaseEmissive.get(pc);
          if (base) {
            mat.emissive.setRGB(base.r, base.g, base.b);
            mat.emissiveIntensity = 0.5;
          }
        }
      }
    });

    // Update key center indicators
    this.queries.keyIndicators.entities.forEach((entity) => {
      const kc = KeyCenterIndicator.data.keyCenter[entity.index];
      const obj = entity.object3D;
      if (!obj) return;
      const mat = (obj as any).material;
      if (!mat) return;

      if (kc === chord.keyCenter) {
        mat.opacity = 0.3 + this.intensity * 0.2;
        mat.emissiveIntensity = 1.5;
      } else {
        mat.opacity = 0.08;
        mat.emissiveIntensity = 0.3;
      }
    });

    // Spawn particles at active nodes
    this.spawnParticlesForChord(chord);
  }

  private animatePitchNodes(delta: number, time: number) {
    this.queries.pitchNodes.entities.forEach((entity) => {
      const isActive = PitchNode.data.isActive[entity.index];
      const obj = entity.object3D;
      if (!obj) return;

      if (isActive) {
        // Gentle pulse
        const pulse = 1.0 + Math.sin(time * 4) * 0.08;
        const base = 1.3 + this.intensity * 0.4;
        obj.scale.setScalar(base * pulse);
      }
    });
  }

  private animateDome(time: number) {
    this.queries.dome.entities.forEach((entity) => {
      const obj = entity.object3D;
      if (!obj) return;
      // Gentle breathing
      const breathe = 1.0 + Math.sin(time * 0.5) * 0.02 * (1 + this.intensity);
      obj.scale.setScalar(breathe);
    });
  }

  private animateParticles(delta: number) {
    this.queries.particles.entities.forEach((entity) => {
      const life = Particle.data.life[entity.index] - delta;
      Particle.data.life[entity.index] = life;

      const obj = entity.object3D;
      if (!obj) return;

      if (life <= 0) {
        // Remove dead particle
        obj.visible = false;
        entity.destroy();
        return;
      }

      // Move along velocity
      const vel = Particle.data.velocity[entity.index] as unknown as Float32Array;
      obj.position.x += vel[0] * delta;
      obj.position.y += vel[1] * delta;
      obj.position.z += vel[2] * delta;

      // Fade out
      const maxLife = Particle.data.maxLife[entity.index];
      const alpha = life / maxLife;
      obj.scale.setScalar(0.03 * alpha);
      const mat = (obj as any).material;
      if (mat) mat.opacity = alpha * 0.8;
    });
  }

  private spawnParticlesForChord(chord: ChordChange) {
    // Particle spawning is handled by the scene builder since it needs Three.js mesh creation
    // We just emit the event. The index.ts file handles actual spawning.
    if ((globalThis as any).__spawnParticles) {
      (globalThis as any).__spawnParticles(chord);
    }
  }

  private updateNarrativeArc() {
    const t = this.elapsedTime;
    if (t < 8) {
      this.phase = 'intro';
      this.intensity = t / 8 * 0.3;
    } else if (t < 25) {
      this.phase = 'build';
      this.intensity = 0.3 + ((t - 8) / 17) * 0.4;
    } else if (t < 55) {
      this.phase = 'explore';
      this.intensity = 0.7 + Math.sin(t * 0.1) * 0.15;
    } else if (t < 85) {
      this.phase = 'climax';
      this.intensity = 0.85 + Math.sin(t * 0.3) * 0.15;
    } else {
      this.phase = 'resolve';
      this.intensity = Math.max(0.2, 1.0 - (t - 85) / 20);
    }
  }
}
