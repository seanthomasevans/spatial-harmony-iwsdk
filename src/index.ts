// Spatial Harmony: Giant Steps — IWSDK Edition
// Immersive visualization of Coltrane's harmonic cosmos

import {
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  SphereGeometry,
  IcosahedronGeometry,
  CylinderGeometry,
  PlaneGeometry,
  BoxGeometry,
  SessionMode,
  World,
  Color,
  Vector3,
  LineSegments,
  WireframeGeometry,
  LineBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  AdditiveBlending,
  DoubleSide,
} from '@iwsdk/core';

import { IBLGradient, DomeGradient } from '@iwsdk/core';

import {
  HarmonySystem,
  PitchNode,
  Particle,
  DomeWireframe,
  KeyCenterIndicator,
} from './systems/HarmonySystem.js';

import {
  CIRCLE_OF_FIFTHS,
  PITCH_CLASS_NAMES,
  PITCH_COLORS,
  KEY_COLORS,
  GIANT_STEPS,
  ChordChange,
} from './data/progression.js';

// No external assets needed, everything is procedural
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
  // Register components
  world
    .registerComponent(PitchNode)
    .registerComponent(Particle)
    .registerComponent(DomeWireframe)
    .registerComponent(KeyCenterIndicator);

  // Register system
  const harmonySystem = world.registerSystem(HarmonySystem, {
    configData: { bpm: 160, isPlaying: false },
  });

  // Camera position: inside the dome, at standing height
  const { camera } = world;
  camera.position.set(0, 1.6, 0);

  // ========================================================================
  // Environment: dark cosmic void
  // ========================================================================
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

  // ========================================================================
  // Geodesic Dome (wireframe icosahedron)
  // ========================================================================
  const domeRadius = 6.5;
  const domeGeo = new IcosahedronGeometry(domeRadius, 2);
  const domeWireGeo = new WireframeGeometry(domeGeo);
  const domeMat = new LineBasicMaterial({
    color: new Color(0.15, 0.2, 0.5),
    transparent: true,
    opacity: 0.3,
  });
  const domeMesh = new LineSegments(domeWireGeo, domeMat);
  domeMesh.position.set(0, 1.6, 0);
  const domeEntity = world.createTransformEntity(domeMesh);
  domeEntity.addComponent(DomeWireframe);

  // ========================================================================
  // Star Field
  // ========================================================================
  const starCount = 150;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 12 + Math.random() * 5;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) + 1.6;
    starPositions[i * 3 + 2] = r * Math.cos(phi);
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new Float32BufferAttribute(starPositions, 3));
  const starMat = new MeshBasicMaterial({
    color: new Color(0.8, 0.85, 1.0),
    transparent: true,
    opacity: 0.6,
  });
  // Use small spheres for stars (points aren't well supported in all WebXR)
  for (let i = 0; i < starCount; i++) {
    const starMesh = new Mesh(
      new SphereGeometry(0.02 + Math.random() * 0.02, 4, 4),
      new MeshBasicMaterial({
        color: new Color(0.7 + Math.random() * 0.3, 0.75 + Math.random() * 0.25, 1.0),
        transparent: true,
        opacity: 0.4 + Math.random() * 0.5,
      }),
    );
    starMesh.position.set(
      starPositions[i * 3],
      starPositions[i * 3 + 1],
      starPositions[i * 3 + 2],
    );
    world.createTransformEntity(starMesh);
  }

  // ========================================================================
  // Circle of Fifths: 12 pitch-class nodes
  // ========================================================================
  const pitchNodeRadius = 3.8;
  const pitchNodeY = 1.6;
  const pitchNodeEntities: any[] = [];

  for (let i = 0; i < 12; i++) {
    const noteName = CIRCLE_OF_FIFTHS[i];
    const pitchClass = PITCH_CLASS_NAMES.indexOf(noteName);
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2; // start from top

    const x = Math.cos(angle) * pitchNodeRadius;
    const z = Math.sin(angle) * pitchNodeRadius;

    const color = PITCH_COLORS[pitchClass];

    // Main node sphere
    const nodeMat = new MeshStandardMaterial({
      color: new Color(color[0], color[1], color[2]),
      emissive: new Color(color[0] * 0.5, color[1] * 0.5, color[2] * 0.5),
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.6,
    });
    const nodeMesh = new Mesh(new SphereGeometry(0.15, 16, 16), nodeMat);
    nodeMesh.position.set(x, pitchNodeY, z);

    const entity = world.createTransformEntity(nodeMesh);
    entity.addComponent(PitchNode, { pitchClass, isActive: false });
    pitchNodeEntities.push({ entity, pitchClass, x, y: pitchNodeY, z });

    // Store base emissive for reset
    (harmonySystem as any).nodeBaseEmissive.set(pitchClass, {
      r: color[0] * 0.5,
      g: color[1] * 0.5,
      b: color[2] * 0.5,
    });

    // Halo ring around each node
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
    haloMesh.position.set(x, pitchNodeY, z);
    haloMesh.rotation.x = Math.PI / 2;
    world.createTransformEntity(haloMesh);

    // Store position for spatial audio
    (harmonySystem as any).audioEngine.nodePositions.set(pitchClass, { x, y: pitchNodeY, z });
  }

  // ========================================================================
  // Three Key Center Indicators (B, G, Eb triangles)
  // ========================================================================
  const keyCenters: { name: string; angle: number; color: [number, number, number] }[] = [
    { name: 'B', angle: 0, color: KEY_COLORS.B },
    { name: 'G', angle: 120, color: KEY_COLORS.G },
    { name: 'Eb', angle: 240, color: KEY_COLORS.Eb },
  ];

  keyCenters.forEach(({ name, angle, color }) => {
    const theta = (angle * Math.PI) / 180;
    const radius = 4.5;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;

    const mat = new MeshStandardMaterial({
      color: new Color(color[0], color[1], color[2]),
      emissive: new Color(color[0], color[1], color[2]),
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.1,
      side: DoubleSide,
    });

    const mesh = new Mesh(new PlaneGeometry(2, 2), mat);
    mesh.position.set(x, pitchNodeY, z);
    mesh.lookAt(0, pitchNodeY, 0);

    const entity = world.createTransformEntity(mesh);
    entity.addComponent(KeyCenterIndicator, { keyCenter: name });
  });

  // ========================================================================
  // Particle Spawner (called from HarmonySystem on chord changes)
  // ========================================================================
  (globalThis as any).__spawnParticles = (chord: ChordChange) => {
    chord.tones.forEach((pc) => {
      const nodeInfo = pitchNodeEntities.find((n: any) => n.pitchClass === pc);
      if (!nodeInfo) return;

      const color = PITCH_COLORS[pc];
      for (let p = 0; p < 5; p++) {
        const pMat = new MeshBasicMaterial({
          color: new Color(color[0], color[1], color[2]),
          transparent: true,
          opacity: 0.7,
        });
        const pMesh = new Mesh(new SphereGeometry(0.03, 4, 4), pMat);
        pMesh.position.set(
          nodeInfo.x + (Math.random() - 0.5) * 0.2,
          nodeInfo.y + (Math.random() - 0.5) * 0.2,
          nodeInfo.z + (Math.random() - 0.5) * 0.2,
        );

        const pEntity = world.createTransformEntity(pMesh);
        pEntity.addComponent(Particle, {
          velocity: [
            (Math.random() - 0.5) * 0.8,
            Math.random() * 0.5 + 0.2,
            (Math.random() - 0.5) * 0.8,
          ],
          life: 2 + Math.random() * 2,
          maxLife: 4,
        });
      }
    });
  };

  // ========================================================================
  // Voice-leading lines between consecutive chord tones
  // ========================================================================
  // These get created dynamically on chord changes. For now the particle
  // system provides the visual motion.

  // ========================================================================
  // UI: Start/Stop controls via screen-space panel
  // ========================================================================
  // Simple approach: use a click handler on the whole scene to start
  let started = false;

  const startOverlay = document.createElement('div');
  startOverlay.id = 'start-overlay';
  startOverlay.innerHTML = `
    <div style="
      position: fixed; inset: 0; z-index: 100;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: rgba(0,0,10,0.9);
      font-family: system-ui, sans-serif; color: #e8eaf0;
      cursor: pointer;
    ">
      <h1 style="font-size: 32px; font-weight: 300; letter-spacing: 0.1em; margin-bottom: 8px;">
        SPATIAL HARMONY
      </h1>
      <p style="font-size: 14px; color: #8892a8; margin-bottom: 32px; letter-spacing: 0.2em;">
        GIANT STEPS \u2022 JOHN COLTRANE
      </p>
      <button id="start-btn" style="
        padding: 16px 48px; border-radius: 999px; border: none;
        background: rgba(82, 109, 255, 0.85); color: white;
        font-size: 18px; font-weight: 600; cursor: pointer;
        letter-spacing: 0.05em;
        transition: transform 0.2s, background 0.2s;
      ">
        Enter Experience
      </button>
      <p style="font-size: 12px; color: #556; margin-top: 24px;">
        Audio required \u2022 VR headset recommended
      </p>
    </div>
  `;
  document.body.appendChild(startOverlay);

  document.getElementById('start-btn')!.addEventListener('click', async () => {
    if (started) return;
    started = true;
    startOverlay.style.display = 'none';
    await (harmonySystem as any).startPlayback();
  });

  console.log('[Spatial Harmony] IWSDK scene initialized');
  console.log('[Spatial Harmony] 12 pitch nodes, geodesic dome, star field, particle system');
  console.log('[Spatial Harmony] Giant Steps: 24-chord progression, 3 key centers');
});
