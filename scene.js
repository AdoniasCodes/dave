// A quiet field of dots that rolls like terrain. The pointer sends a ripple through it,
// scrolling moves you across it. It sits behind the page and follows the light/dark theme.
import * as THREE from 'three';

const canvas = document.getElementById('stage');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const html = document.documentElement;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (e) { canvas.remove(); throw e; } // no WebGL: the page reads fine without it
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);

// grid of points
const COLS = 170, ROWS = 90, STEP = 0.5;
const pos = new Float32Array(COLS * ROWS * 3);
for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
  const k = (j * COLS + i) * 3;
  pos[k] = (i - COLS / 2) * STEP; pos[k + 1] = 0; pos[k + 2] = -j * STEP + 8;
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

const uniforms = {
  uTime: { value: 0 }, uScroll: { value: 0 }, uMouse: { value: new THREE.Vector3(999, 0, 999) },
  uSize: { value: 2.2 }, uDpr: { value: 1 },
  uDot: { value: new THREE.Color() }, uAccent: { value: new THREE.Color() }, uAlpha: { value: 0.5 },
};
const mat = new THREE.ShaderMaterial({
  uniforms, transparent: true, depthWrite: false,
  vertexShader: /* glsl */`
    uniform float uTime, uScroll, uSize, uDpr; uniform vec3 uMouse;
    varying float vH, vM, vFade;
    float terrain(vec2 p){
      return sin(p.x*.30 + uTime*.22)*.55
           + sin(p.y*.42 + uScroll*7.0 + uTime*.18)*.50
           + sin((p.x+p.y)*.19 - uTime*.14)*.75;
    }
    void main(){
      vec3 p = position;
      float y = terrain(p.xz);
      float d = distance(p.xz, uMouse.xz);
      float m = exp(-d*d*.045);
      y += m * (1.1 + sin(d*2.4 - uTime*3.2) * .5);
      p.y = y;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vH = y; vM = m;
      vFade = smoothstep(70.0, 18.0, -mv.z);
      gl_PointSize = uSize * uDpr * (1.0 + m*1.6) * (24.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uDot, uAccent; uniform float uAlpha;
    varying float vH, vM, vFade;
    void main(){
      vec2 c = gl_PointCoord - .5;
      float r = length(c);
      if (r > .5) discard;
      float a = uAlpha * (.35 + .65 * smoothstep(-1.6, 1.6, vH)) * vFade;
      vec3 col = mix(uDot, uAccent, clamp(vM*1.4, 0., 1.));
      gl_FragColor = vec4(col, clamp(a + vM*.5, 0., 1.) * smoothstep(.5, .35, r));
    }`,
});
scene.add(new THREE.Points(geo, mat));

function theme() {
  const dark = html.dataset.theme !== 'light';
  uniforms.uDot.value.set(dark ? 0xE8EAF0 : 0x15171F);
  uniforms.uAccent.value.set(dark ? 0xFF7A3D : 0xC93508);
  uniforms.uAlpha.value = (dark ? 0.5 : 0.42) * (innerWidth < 700 ? 0.55 : 1);
  draw();
}
new MutationObserver(theme).observe(html, { attributes: true, attributeFilter: ['data-theme'] });

// pointer to a spot on the ground
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2(0, 0), hit = new THREE.Vector3(), mouse = new THREE.Vector3(999, 0, 999);
let ex = 0, ey = 0, scrollRatio = 0, inView = true;
addEventListener('pointermove', (e) => ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), { passive: true });
addEventListener('scroll', () => {
  scrollRatio = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
}, { passive: true });

function resize() {
  const dpr = Math.min(devicePixelRatio, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  uniforms.uDpr.value = dpr;
  theme();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  draw();
}
addEventListener('resize', resize);

const clock = new THREE.Clock();
function draw() {
  camera.position.set(ex * 2.2, 7.5 + ey * 1.2, 18);
  camera.lookAt(0, 0, -9);
  renderer.render(scene, camera);
}
function frame() {
  requestAnimationFrame(frame);
  if (!inView) return;
  uniforms.uTime.value = clock.getElapsedTime();
  uniforms.uScroll.value += (scrollRatio - uniforms.uScroll.value) * 0.06;
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(plane, hit)) mouse.lerp(hit, 0.12);
  uniforms.uMouse.value.copy(mouse);
  ex += (ndc.x - ex) * 0.04; ey += (ndc.y - ey) * 0.04;
  draw();
}
document.addEventListener('visibilitychange', () => { inView = !document.hidden; });

resize();
theme();
if (!reduce) frame();
