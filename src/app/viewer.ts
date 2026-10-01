import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PARTS, PartDef } from '../data/parts';
import { removedAfter } from '../data/teardown';

interface PartNode {
  def: PartDef;
  root: THREE.Group;
  meshes: THREE.Mesh[];
  mats: THREE.MeshStandardMaterial[];
  base: THREE.Vector3;
  box: THREE.Box3; // world bounds at zero explode offset
  explodeDir: THREE.Vector3;
  opacity: number;
  center: THREE.Vector3;
}

const HOME_DIR = new THREE.Vector3(0.62, 0.42, 0.66).normalize();
const HOME_TARGET = new THREE.Vector3(0, 40, 40);
const ENGINE_RADIUS = 560;
function homePose(cam: THREE.PerspectiveCamera, zoom = 1, shift?: THREE.Vector3) {
  const vfov = (cam.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
  const dist = (zoom * ENGINE_RADIUS) / Math.sin(Math.min(vfov, hfov) / 2);
  const target = HOME_TARGET.clone(); if (shift) target.add(shift);
  return { pos: target.clone().add(HOME_DIR.clone().multiplyScalar(dist)), target };
}
const ACCENT = new THREE.Color(0xff4d2e);
const EXPLODE_SCALE = 0.85;

export class Viewer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  nodes = new Map<string, PartNode>();
  engine = new THREE.Group();
  explode = 0;
  step = 0;
  hidden = new Set<string>();
  isolated: string | null = null;
  selected: string | null = null;
  onPick: (id: string | null) => void = () => {};
  private removed = new Set<string>();
  private userMoved = false;
  private camGoal: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private clock = new THREE.Clock();
  private ray = new THREE.Raycaster();
  private needsFrames = 90;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(34, 1, 10, 20000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minDistance = 250;
    this.controls.maxDistance = 9000;
    this.controls.addEventListener('change', () => this.kick());
    this.controls.addEventListener('start', () => { this.camGoal = null; this.userMoved = true; });

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;
    const key = new THREE.DirectionalLight(0xfff4e6, 1.6); key.position.set(600, 1200, 900); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd4ff, 0.8); rim.position.set(-900, 400, -1000); this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x202020, 0.35));
    this.scene.add(this.engine);
    this.addFloor();
    this.bindPicking();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const h = homePose(this.camera); this.camera.position.copy(h.pos); this.controls.target.copy(h.target);
  }

  private addFloor() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.22)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1500), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = -262; m.renderOrder = -1;
    this.scene.add(m);
  }

  async load(baseUrl: string, progress: (f: number) => void) {
    const loader = new GLTFLoader();
    const assets = [...new Set(PARTS.map((p) => p.asset))];
    const cache = new Map<string, THREE.Object3D>();
    let done = 0;
    await Promise.all(assets.map(async (a) => {
      const gltf = await loader.loadAsync(`${baseUrl}parts/${a}.glb`);
      cache.set(a, gltf.scene);
      progress(++done / assets.length);
    }));
    for (const def of PARTS) {
      const src = cache.get(def.asset)!;
      const inst = src.clone(true);
      const root = new THREE.Group(); root.name = def.id;
      if (def.rotation) inst.rotation.set(...def.rotation);
      if (def.position) inst.position.set(...def.position);
      root.add(inst);
      const meshes: THREE.Mesh[] = []; const mats: THREE.MeshStandardMaterial[] = [];
      inst.traverse((o) => {
        const me = o as THREE.Mesh;
        if (!me.isMesh) return;
        const m = (me.material as THREE.MeshStandardMaterial).clone();
        m.side = THREE.DoubleSide;
        tune(m);
        me.material = m; me.userData.partId = def.id;
        meshes.push(me); mats.push(m);
      });
      this.engine.add(root);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      this.nodes.set(def.id, { def, root, meshes, mats, base: new THREE.Vector3(), box, explodeDir: new THREE.Vector3(...def.explode), opacity: 1, center });
    }
    this.kick();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole engine framed on narrow portrait screens
    this.camera.fov = w / h < 0.7 ? 44 : 34;
    // shift the optical centre above the bottom dock so parts aren't hidden behind the UI
    const off = w < 900 ? Math.min(170, h * 0.2) : 0;
    if (off > 0) this.camera.setViewOffset(w, h + off, 0, off, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.kick();
  }

  kick(frames = 90) { this.needsFrames = Math.max(this.needsFrames, frames); }

  setStep(n: number) { this.step = n; this.removed = removedAfter(n); this.kick(160); }
  setExplode(f: number) {
    this.explode = f;
    if (!this.userMoved) this.camGoal = this.explodedHome(f);
    this.kick(120);
  }
  /** Jump all animations to their end state (used for deep links / screenshots). */
  snap() { this.update(10); if (this.camGoal) { this.camera.position.copy(this.camGoal.pos); this.controls.target.copy(this.camGoal.target); this.camGoal = null; } this.kick(); }
  toggleHidden(id: string) { if (this.hidden.has(id)) this.hidden.delete(id); else this.hidden.add(id); this.kick(); }
  isolate(id: string | null) { this.isolated = id; this.kick(); }
  select(id: string | null) {
    this.selected = id;
    for (const n of this.nodes.values()) {
      const on = n.def.id === id;
      for (const m of n.mats) { m.emissive.copy(on ? ACCENT : new THREE.Color(0)); m.emissiveIntensity = on ? 0.45 : 0; }
    }
    this.kick();
  }
  resetView() { this.userMoved = false; this.camGoal = this.explodedHome(this.explode); this.kick(120); }
  /** Home pose for explode fraction f: re-centre on the exploded layout and, if parts that move far
   *  (air cleaner lid up, silencer down) would still leave the frame, back the camera off until they fit.
   *  f = 0 gives the original home pose. */
  private explodedHome(f: number) {
    const pose = homePose(this.camera, 1 + 0.55 * f);
    if (f <= 0 || !this.nodes.size) return pose;
    const b0 = new THREE.Box3(), b1 = new THREE.Box3(), boxes: THREE.Box3[] = [];
    for (const n of this.nodes.values()) {
      const b = n.box.clone().translate(n.explodeDir.clone().multiplyScalar(f * EXPLODE_SCALE));
      b0.union(n.box); b1.union(b); boxes.push(b);
    }
    const shift = b1.getCenter(new THREE.Vector3()).sub(b0.getCenter(new THREE.Vector3()));
    pose.target.add(shift); pose.pos.add(shift);
    const cam = this.camera.clone(), v = new THREE.Vector3();
    for (let i = 0; i < 2; i++) {
      cam.position.copy(pose.pos); cam.lookAt(pose.target); cam.updateMatrixWorld(true);
      let m = 0;
      for (const b of boxes) for (let k = 0; k < 8; k++) {
        v.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).project(cam);
        m = Math.max(m, Math.abs(v.x), Math.abs(v.y));
      }
      if (m <= 0.95) break;
      pose.pos.sub(pose.target).multiplyScalar(m / 0.95).add(pose.target);
    }
    return pose;
  }
  focus(id: string) {
    this.userMoved = true;
    const n = this.nodes.get(id); if (!n) return;
    const box = new THREE.Box3().setFromObject(n.root);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()); const r = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 120);
    const dist = Math.min(Math.max(r / Math.sin((this.camera.fov * Math.PI) / 360) * 1.1, 400), 2600);
    // Keep the current viewing direction unless other parts would block the view of this one
    // (e.g. a lower valve cover on the far bank); then look at it from its own side of the engine.
    let dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (this.occluded(id, c, dir, dist)) {
      const out = c.clone().sub(HOME_TARGET).setY(0);
      if (out.lengthSq() > 1) {
        out.normalize().add(new THREE.Vector3(0, c.y < HOME_TARGET.y ? -0.35 : 0.35, 0)).normalize();
        if (!this.occluded(id, c, out, dist)) dir = out;
      }
    }
    this.camGoal = { pos: c.clone().add(dir.multiplyScalar(dist)), target: c };
    this.kick(120);
  }

  /** True if another visible part sits between a camera at c + dir*dist and the centre c of part `id`. */
  private occluded(id: string, c: THREE.Vector3, dir: THREE.Vector3, dist: number) {
    const targets: THREE.Object3D[] = [];
    for (const n of this.nodes.values()) if (this.visibleFlag(n.def.id)) targets.push(...n.meshes);
    this.ray.set(c.clone().add(dir.clone().multiplyScalar(dist)), dir.clone().negate());
    this.ray.far = dist;
    const hit = this.ray.intersectObjects(targets, false)[0];
    this.ray.far = Infinity;
    return !!hit && hit.object.userData.partId !== id;
  }
  isRemoved(id: string) { return this.removed.has(id); }
  visibleFlag(id: string) {
    if (this.hidden.has(id)) return false;
    if (this.isolated && this.isolated !== id) return false;
    if (this.isolated === id) return true;
    return !this.removed.has(id);
  }

  private bindPicking() {
    let down: { x: number; y: number; t: number } | null = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      down = null;
      if (moved > 7 || !quick) return;
      const r = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(ndc, this.camera);
      const targets: THREE.Object3D[] = [];
      for (const n of this.nodes.values()) if (n.root.visible && n.opacity > 0.5) targets.push(...n.meshes);
      const hit = this.ray.intersectObjects(targets, false)[0];
      this.onPick(hit ? (hit.object.userData.partId as string) : null);
    });
  }

  start() {
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (this.needsFrames <= 0) return;
      this.needsFrames--;
      this.update(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  private update(dt: number) {
    const k = 1 - Math.exp(-dt * 7);
    let moving = false;
    for (const n of this.nodes.values()) {
      const id = n.def.id;
      const vis = this.visibleFlag(id);
      const iso = this.isolated === id;
      const target = n.explodeDir.clone().multiplyScalar(iso ? 0 : this.explode * EXPLODE_SCALE);
      if (this.removed.has(id) && !iso) {
        const d = n.explodeDir.lengthSq() > 0 ? n.explodeDir.clone().normalize() : new THREE.Vector3(0, 1, 0);
        target.add(d.multiplyScalar(700));
      }
      n.root.position.lerp(target, k);
      if (n.root.position.distanceToSquared(target) > 0.5) moving = true;
      const goal = vis ? 1 : 0;
      n.opacity += (goal - n.opacity) * Math.min(1, k * 1.4);
      if (Math.abs(goal - n.opacity) < 0.01) n.opacity = goal; else moving = true;
      n.root.visible = n.opacity > 0.01;
      const transparent = n.opacity < 0.999;
      for (const m of n.mats) {
        if (m.transparent !== transparent) { m.transparent = transparent; m.depthWrite = !transparent; m.needsUpdate = true; }
        m.opacity = n.opacity;
      }
    }
    if (this.camGoal) {
      this.camera.position.lerp(this.camGoal.pos, k);
      this.controls.target.lerp(this.camGoal.target, k);
      if (this.camera.position.distanceTo(this.camGoal.pos) < 1) this.camGoal = null; else moving = true;
    }
    if (moving) this.needsFrames = Math.max(this.needsFrames, 2);
  }
}

/** Per-material tuning after load (GLB carries base PBR values; tweak env response). */
function tune(m: THREE.MeshStandardMaterial) {
  switch (m.name) {
    case 'chrome': m.envMapIntensity = 1.4; break;
    case 'satinBlack': case 'blackPlastic': m.envMapIntensity = 0.6; break;
    case 'castAlu': case 'magnesium': m.envMapIntensity = 0.9; break;
    default: m.envMapIntensity = 1;
  }
}
