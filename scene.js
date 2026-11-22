// Cartons that stack, line up and react to the pointer. One WebGL scene behind the page.
import * as THREE from 'three';

const canvas = document.getElementById('stage');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = 240;
const COLORS = [0xF4D31B, 0xF4D31B, 0xF4D31B, 0x15171F, 0xD9DCE1, 0xD9DCE1];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (e) { canvas.remove(); throw e; } // no WebGL: the page still reads fine without the scene

renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
const world = new THREE.Group();
scene.add(world);

scene.add(new THREE.HemisphereLight(0xffffff, 0xc9ccd4, 1.35));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(6, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.16 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
world.add(floor);

const geo = new THREE.BoxGeometry(1, 1, 1);
geo.translate(0, 0.5, 0);
const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), N);
mesh.castShadow = true;
mesh.receiveShadow = true;
const c = new THREE.Color();
for (let i = 0; i < N; i++) mesh.setColorAt(i, c.setHex(COLORS[(i * 7 + (i >> 2)) % COLORS.length]));
world.add(mesh);

// ---- formations: each returns N targets {x,y,z,sx,sy,sz,ry} ----
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

function grid() {
  const out = [];
  for (let j = 0; j < 15; j++) for (let i = 0; i < 16; i++) {
    const h = 0.45 + 1.1 * Math.abs(Math.sin(i * 0.62) * Math.cos(j * 0.5)) + hash(i * 31 + j) * 0.35;
    out.push({ x: (i - 7.5) * 1.05, y: 0, z: (j - 7) * 1.05, sx: 0.82, sy: h, sz: 0.82, ry: 0 });
  }
  return out;
}
function pallet() {
  const out = [];
  for (let r = 0; r < 6; r++) for (let q = 0; q < 10; q++) for (let k = 0; k < 4; k++) {
    const s = hash(q * 13 + r * 7);
    out.push({ x: (q - 4.5) * 1.75, y: k * 0.56, z: (r - 2.5) * 1.75, sx: 1.3, sy: 0.5, sz: 1.3, ry: (s - 0.5) * 0.12 });
  }
  return out;
}
function route() {
  const out = [];
  for (let lane = 0; lane < 2; lane++) for (let i = 0; i < N / 2; i++) {
    const t = i / (N / 2 - 1);
    const px = -8 + t * 16, pz = 3 * Math.sin(t * 6.2);
    const a = Math.atan2((3 * 6.2 / 16) * Math.cos(t * 6.2), 1); // path tangent
    const off = (lane ? 0.55 : -0.55);
    out.push({ x: px - Math.sin(a) * off, y: 0, z: pz + Math.cos(a) * off, sx: 0.7, sy: 0.3 + t * 2.3, sz: 0.7, ry: -a });
  }
  return out;
}
const FORMS = { grid: grid(), pallet: pallet(), route: route() };

// ---- state ----
const cur = new Float32Array(N * 7);
let target = FORMS.grid;
const set = (f) => { target = FORMS[f] || target; if (reduce) snap(); needs = true; };
function snap() { target.forEach((t, i) => cur.set([t.x, t.y, t.z, t.sx, t.sy, t.sz, t.ry], i * 7)); }
let needs = true;
snap();

const dummy = new THREE.Object3D();
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2(0, 0), hit = new THREE.Vector3(), ptr = new THREE.Vector3(99, 0, 99);
let sx = 0, sy = 0, scrollY = 0;

addEventListener('pointermove', (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
}, { passive: true });

for (const el of document.querySelectorAll('[data-form]')) {
  new IntersectionObserver(([en]) => { if (en.isIntersecting) set(el.dataset.form); },
    { rootMargin: '-45% 0px -45% 0px' }).observe(el);
}

function resize() {
  const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const wide = w >= 900;
  camera.userData.dist = wide ? 43 : 58;
  // slide the scene to the right on wide screens, down on phones, so text stays readable
  camera.setViewOffset(w, h, wide ? -w * 0.19 : 0, wide ? -h * 0.04 : -h * 0.3, w, h);
  camera.updateProjectionMatrix();
  needs = true;
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const t = clock.getElapsedTime();
  const k = reduce ? 1 : 0.07;

  // pointer on the floor
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(plane, hit)) world.worldToLocal(hit);
  ptr.lerp(hit, reduce ? 0 : 0.18);

  // scroll turns the whole set a little
  const sp = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
  world.rotation.y += ((reduce ? 0 : sp * 0.6) - world.rotation.y) * 0.05;

  // camera follows the pointer a bit
  sx += ((reduce ? 0 : ndc.x) - sx) * 0.05; sy += ((reduce ? 0 : ndc.y) - sy) * 0.05;
  const d = camera.userData.dist;
  camera.position.set(d * 0.62 + sx * 3, d * 0.62 + sy * 2, d * 0.62);
  camera.lookAt(0, 0.4, 0);

  for (let i = 0; i < N; i++) {
    const g = target[i], o = i * 7;
    cur[o] += (g.x - cur[o]) * k; cur[o + 1] += (g.y - cur[o + 1]) * k; cur[o + 2] += (g.z - cur[o + 2]) * k;
    cur[o + 3] += (g.sx - cur[o + 3]) * k; cur[o + 4] += (g.sy - cur[o + 4]) * k; cur[o + 5] += (g.sz - cur[o + 5]) * k;
    cur[o + 6] += (g.ry - cur[o + 6]) * k;
    const dx = cur[o] - ptr.x, dz = cur[o + 2] - ptr.z;
    const f = Math.max(0, 1 - Math.hypot(dx, dz) / 3.4), lift = f * f;
    const bob = reduce ? 0 : Math.sin(t * 0.9 + cur[o] * 0.45 + cur[o + 2] * 0.35) * 0.05;
    dummy.position.set(cur[o], cur[o + 1] + lift * 1.3 + bob, cur[o + 2]);
    dummy.rotation.set(0, cur[o + 6] + lift * 0.6, 0);
    dummy.scale.set(cur[o + 3], cur[o + 4] * (1 + lift * 0.5), cur[o + 5]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}
addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });
frame();
