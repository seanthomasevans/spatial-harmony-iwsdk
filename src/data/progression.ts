// Giant Steps chord progression -- 16-bar AABA form
// Three key centers: B major, G major, Eb major (symmetric major third cycle)

export interface ChordChange {
  beat: number;
  name: string;
  root: number;       // pitch class 0-11 (C=0)
  quality: 'maj7' | 'dom7' | 'min7';
  keyCenter: 'B' | 'G' | 'Eb';
  tones: number[];    // pitch classes in chord
}

// Pitch class mapping: C=0, Db=1, D=2, Eb=3, E=4, F=5, Gb=6, G=7, Ab=8, A=9, Bb=10, B=11
export const GIANT_STEPS: ChordChange[] = [
  { beat: 0,  name: 'Bmaj7',  root: 11, quality: 'maj7', keyCenter: 'B',  tones: [11, 3, 6, 10] },
  { beat: 2,  name: 'D7',     root: 2,  quality: 'dom7', keyCenter: 'G',  tones: [2, 6, 9, 0] },
  { beat: 4,  name: 'Gmaj7',  root: 7,  quality: 'maj7', keyCenter: 'G',  tones: [7, 11, 2, 6] },
  { beat: 6,  name: 'Bb7',    root: 10, quality: 'dom7', keyCenter: 'Eb', tones: [10, 2, 5, 8] },
  { beat: 8,  name: 'Ebmaj7', root: 3,  quality: 'maj7', keyCenter: 'Eb', tones: [3, 7, 10, 2] },
  { beat: 10, name: 'Am7',    root: 9,  quality: 'min7', keyCenter: 'G',  tones: [9, 0, 4, 7] },
  { beat: 12, name: 'D7',     root: 2,  quality: 'dom7', keyCenter: 'G',  tones: [2, 6, 9, 0] },
  { beat: 14, name: 'Gmaj7',  root: 7,  quality: 'maj7', keyCenter: 'G',  tones: [7, 11, 2, 6] },
  { beat: 16, name: 'Bb7',    root: 10, quality: 'dom7', keyCenter: 'Eb', tones: [10, 2, 5, 8] },
  { beat: 18, name: 'Ebmaj7', root: 3,  quality: 'maj7', keyCenter: 'Eb', tones: [3, 7, 10, 2] },
  { beat: 20, name: 'F#7',    root: 6,  quality: 'dom7', keyCenter: 'B',  tones: [6, 10, 1, 4] },
  { beat: 22, name: 'Bmaj7',  root: 11, quality: 'maj7', keyCenter: 'B',  tones: [11, 3, 6, 10] },
  { beat: 24, name: 'Fm7',    root: 5,  quality: 'min7', keyCenter: 'Eb', tones: [5, 8, 0, 3] },
  { beat: 26, name: 'Bb7',    root: 10, quality: 'dom7', keyCenter: 'Eb', tones: [10, 2, 5, 8] },
  { beat: 28, name: 'Ebmaj7', root: 3,  quality: 'maj7', keyCenter: 'Eb', tones: [3, 7, 10, 2] },
  { beat: 30, name: 'Am7',    root: 9,  quality: 'min7', keyCenter: 'G',  tones: [9, 0, 4, 7] },
  { beat: 32, name: 'D7',     root: 2,  quality: 'dom7', keyCenter: 'G',  tones: [2, 6, 9, 0] },
  { beat: 34, name: 'Gmaj7',  root: 7,  quality: 'maj7', keyCenter: 'G',  tones: [7, 11, 2, 6] },
  { beat: 36, name: 'C#7',    root: 1,  quality: 'dom7', keyCenter: 'B',  tones: [1, 5, 8, 11] },
  { beat: 38, name: 'F#7',    root: 6,  quality: 'dom7', keyCenter: 'B',  tones: [6, 10, 1, 4] },
  { beat: 40, name: 'Bmaj7',  root: 11, quality: 'maj7', keyCenter: 'B',  tones: [11, 3, 6, 10] },
  { beat: 42, name: 'Fm7',    root: 5,  quality: 'min7', keyCenter: 'Eb', tones: [5, 8, 0, 3] },
  { beat: 44, name: 'Bb7',    root: 10, quality: 'dom7', keyCenter: 'Eb', tones: [10, 2, 5, 8] },
  { beat: 46, name: 'Ebmaj7', root: 3,  quality: 'maj7', keyCenter: 'Eb', tones: [3, 7, 10, 2] },
];

// Circle of fifths order for spatial layout
// Using consistent naming that maps to pitch class indices
export const CIRCLE_OF_FIFTHS_PC = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // C G D A E B F# Db Ab Eb Bb F
export const CIRCLE_OF_FIFTHS_LABELS = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];

// Colors per pitch class (hue-mapped around the circle, indexed 0-11)
export const PITCH_COLORS: [number, number, number][] = [
  [1.0, 0.2, 0.2],   // 0  C  - red
  [1.0, 0.4, 0.1],   // 1  Db - orange-red
  [1.0, 0.7, 0.0],   // 2  D  - gold
  [0.8, 1.0, 0.0],   // 3  Eb - yellow-green
  [0.2, 1.0, 0.2],   // 4  E  - green
  [0.0, 1.0, 0.6],   // 5  F  - cyan-green
  [0.0, 0.7, 1.0],   // 6  F# - cyan
  [0.2, 0.4, 1.0],   // 7  G  - blue
  [0.5, 0.2, 1.0],   // 8  Ab - indigo
  [0.8, 0.2, 1.0],   // 9  A  - violet
  [1.0, 0.2, 0.8],   // 10 Bb - magenta
  [1.0, 0.2, 0.5],   // 11 B  - rose
];

// Key center colors
export const KEY_COLORS: Record<string, [number, number, number]> = {
  B:  [0.23, 0.51, 0.96],  // blue
  G:  [0.06, 0.73, 0.45],  // green
  Eb: [0.96, 0.62, 0.17],  // orange
};

// Note frequency from pitch class + octave
export function pitchFrequency(pitchClass: number, octave: number = 4): number {
  const midi = 12 * (octave + 1) + pitchClass;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
