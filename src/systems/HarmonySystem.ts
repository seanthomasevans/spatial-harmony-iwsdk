// Minimal ECS system: exists solely to provide a frame update callback.
// All state lives in the shared `globals` object set from index.ts.

import { createSystem } from '@iwsdk/core';

export class HarmonySystem extends createSystem({}, {}) {
  init() {
    console.log('[HarmonySystem] registered, update loop active');
  }

  update(delta: number, time: number) {
    const tick = this.globals['tick'] as ((d: number, t: number) => void) | undefined;
    if (tick) tick(delta, time);
  }
}
