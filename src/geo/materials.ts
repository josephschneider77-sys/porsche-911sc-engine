import * as THREE from 'three';

/** PBR material library. Material `name` survives GLB export and is used by the app to re-tune. */
export type MatKey =
  | 'castAlu' | 'machinedAlu' | 'magnesium' | 'nikasil' | 'forgedSteel' | 'steel' | 'darkSteel'
  | 'chrome' | 'blackPlastic' | 'satinBlack' | 'rubber' | 'gasket' | 'ceramic' | 'brass'
  | 'heatSteel' | 'zincPlate' | 'friction' | 'redPaint' | 'bore' | 'filterPaper' | 'bronze';

const DEF: Record<MatKey, { color: number; metalness: number; roughness: number }> = {
  castAlu: { color: 0x9a9c9b, metalness: 0.65, roughness: 0.62 },
  machinedAlu: { color: 0xc4c7ca, metalness: 0.9, roughness: 0.3 },
  magnesium: { color: 0x7e7f77, metalness: 0.5, roughness: 0.66 },
  nikasil: { color: 0x6f7275, metalness: 0.7, roughness: 0.5 },
  forgedSteel: { color: 0x6b6d70, metalness: 0.9, roughness: 0.42 },
  steel: { color: 0x9da1a6, metalness: 1.0, roughness: 0.32 },
  darkSteel: { color: 0x3c3e41, metalness: 0.85, roughness: 0.45 },
  chrome: { color: 0xf2f4f6, metalness: 1.0, roughness: 0.07 },
  blackPlastic: { color: 0x151515, metalness: 0.0, roughness: 0.55 },
  satinBlack: { color: 0x1b1c1e, metalness: 0.35, roughness: 0.48 },
  rubber: { color: 0x0e0e0e, metalness: 0.0, roughness: 0.85 },
  gasket: { color: 0x5a4a3a, metalness: 0.0, roughness: 0.9 },
  ceramic: { color: 0xeeeae0, metalness: 0.0, roughness: 0.3 },
  brass: { color: 0xc9a54a, metalness: 1.0, roughness: 0.35 },
  heatSteel: { color: 0x5b5752, metalness: 0.75, roughness: 0.58 },
  zincPlate: { color: 0xb4b6ae, metalness: 0.9, roughness: 0.38 },
  friction: { color: 0x4a3b30, metalness: 0.1, roughness: 0.95 },
  redPaint: { color: 0xa3261e, metalness: 0.2, roughness: 0.45 },
  bore: { color: 0x2a2b2d, metalness: 0.6, roughness: 0.6 },
  filterPaper: { color: 0xd9c89a, metalness: 0.0, roughness: 0.95 },
  bronze: { color: 0xb07a45, metalness: 1.0, roughness: 0.35 },
};

const cache = new Map<MatKey, THREE.MeshStandardMaterial>();
export function mat(key: MatKey): THREE.MeshStandardMaterial {
  let m = cache.get(key);
  if (!m) {
    const d = DEF[key];
    m = new THREE.MeshStandardMaterial({ color: d.color, metalness: d.metalness, roughness: d.roughness, side: THREE.DoubleSide });
    m.name = key;
    cache.set(key, m);
  }
  return m;
}
export const MAT_KEYS = Object.keys(DEF) as MatKey[];
