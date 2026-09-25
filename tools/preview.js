// Model preview harness.
// URL params:
//   mod=/src/props/rural.js   module to import
//   fn=createThatchedHouse    export to call (or all=1 for every export starting with "create", or list=a,b,c)
//   args=[...]                JSON args for fn
//   yaw=35 pitch=18 dist=1    camera orbit (degrees) and distance multiplier
//   night=1                   night lighting (emissives glow)
//   anim=2                    if the result has update(dt,t), advance it this many seconds
//   ground=0                  hide ground plane
// Exposes window.__stats and window.__ready.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const q = new URLSearchParams(location.search);
const night = q.get('night') === '1';
const yaw = THREE.MathUtils.degToRad(parseFloat(q.get('yaw') ?? '35'));
const pitch = THREE.MathUtils.degToRad(parseFloat(q.get('pitch') ?? '18'));
const distMul = parseFloat(q.get('dist') ?? '1');
const animSec = parseFloat(q.get('anim') ?? '0');
const showGround = q.get('ground') !== '0';

const errEl = document.getElementById('err');
function showErr(e) {
  console.error(e);
  errEl.textContent += String(e && e.stack ? e.stack : e) + '\n';
}
window.addEventListener('error', (e) => showErr(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showErr(e.reason));

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = night ? 1.0 : 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 2000);

// --- sky gradient background + environment ---
function gradientScene(top, mid, bottom) {
  const s = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0),0.6)) : mix(mid, bottom, clamp(-h*3.0,0.0,1.0)); gl_FragColor = vec4(c,1.0);} ',
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), m));
  return s;
}
const skyCols = night ? [0x050a1a, 0x1a2440, 0x0a0a0a] : [0x5d93d8, 0xdfe9f0, 0x5a5448];
const envScene = gradientScene(...skyCols);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(envScene, 0.02).texture;
scene.environmentIntensity = night ? 0.5 : 1.0;
scene.background = new THREE.Color(night ? 0x0b1226 : 0xb9d3ea);

const hemi = new THREE.HemisphereLight(night ? 0x4a5a90 : 0xcfe3ff, night ? 0x1a140e : 0x6a5a45, night ? 0.8 : 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(night ? 0x9fb2e8 : 0xfff1dc, night ? 0.9 : 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

if (showGround) {
  const g = new THREE.Mesh(
    new THREE.CircleGeometry(400, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: night ? 0x3a3c42 : 0x8d9a78, roughness: 1 }),
  );
  g.receiveShadow = true;
  scene.add(g);
}

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), night ? 1.1 : 0.35, 0.55, night ? 0.85 : 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function normalize(res) {
  if (!res) return null;
  if (res.isObject3D) return { obj: res, update: res.userData && res.userData.update };
  const obj = res.group || res.root || res.object || res.mesh;
  const update = typeof res.update === 'function' ? res.update.bind(res) : null;
  return obj ? { obj, update } : null;
}

async function main() {
  const modPath = q.get('mod');
  if (!modPath) throw new Error('missing ?mod=');
  const mod = await import(/* @vite-ignore */ modPath);
  let names = [];
  if (q.get('fn')) names = [q.get('fn')];
  else if (q.get('list')) names = q.get('list').split(',');
  else names = Object.keys(mod).filter((k) => k.startsWith('create') && typeof mod[k] === 'function');
  const args = q.get('args') ? JSON.parse(q.get('args')) : [];

  const items = [];
  for (const n of names) {
    try {
      const res = await mod[n](...(names.length === 1 ? args : []));
      const it = normalize(res);
      if (!it) { showErr(`${n}: returned nothing usable`); continue; }
      it.name = n;
      items.push(it);
    } catch (e) {
      showErr(`${n}: ${e.stack || e}`);
    }
  }

  // layout in rows
  const root = new THREE.Group();
  scene.add(root);
  const gap = 1.0;
  let x = 0;
  let rowZ = 0;
  let rowDepth = 0;
  const maxRowW = names.length > 1 ? 60 : Infinity;
  const labels = [];
  for (const it of items) {
    it.obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(it.obj);
    const size = bb.getSize(new THREE.Vector3());
    if (x > 0 && x + size.x > maxRowW) {
      x = 0;
      rowZ += rowDepth + gap * 3;
      rowDepth = 0;
    }
    const holder = new THREE.Group();
    holder.add(it.obj);
    holder.position.set(x - bb.min.x, 0, rowZ - bb.min.z);
    root.add(holder);
    labels.push({ name: it.name, holder, height: bb.max.y });
    x += size.x + gap;
    rowDepth = Math.max(rowDepth, size.z);
  }

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 0.5);
  const d = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5))) * 0.95 * distMul;
  camera.position.set(
    center.x + Math.sin(yaw) * Math.cos(pitch) * d,
    center.y + Math.sin(pitch) * d,
    center.z + Math.cos(yaw) * Math.cos(pitch) * d,
  );
  camera.lookAt(center);
  camera.near = Math.max(0.02, d / 500);
  camera.far = d * 20 + 500;
  camera.updateProjectionMatrix();

  sun.position.set(center.x + radius * 1.5, center.y + radius * 3, center.z + radius * 2);
  sun.target.position.copy(center);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -radius * 1.3;
  sc.right = sc.top = radius * 1.3;
  sc.near = 0.1;
  sc.far = radius * 10;
  sc.updateProjectionMatrix();

  // animation stepping
  const updaters = items.filter((i) => i.update);
  if (animSec > 0 && updaters.length) {
    const dt = 1 / 60;
    for (let t = 0; t < animSec; t += dt) for (const u of updaters) u.update(dt, t);
  }

  // labels
  const lab = document.getElementById('labels');
  function drawLabels() {
    lab.innerHTML = '';
    if (labels.length < 2) return;
    for (const l of labels) {
      const p = new THREE.Vector3(0, l.height + 0.3, 0);
      l.holder.localToWorld(p);
      p.project(camera);
      const div = document.createElement('div');
      div.textContent = l.name;
      div.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
      div.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight - 16}px`;
      lab.appendChild(div);
    }
  }

  let meshes = 0;
  const mats = new Set();
  root.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    }
  });
  let t = animSec;
  let frames = 0;
  function frame() {
    const dt = 1 / 60;
    t += dt;
    if (q.get('live') === '1') for (const u of updaters) u.update(dt, t);
    composer.render();
    if (frames === 2) {
      renderer.info.autoReset = true;
      renderer.render(scene, camera); // plain render for stats
      const stats = {
        objects: items.length,
        meshes,
        materials: mats.size,
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        size: { x: +size.x.toFixed(2), y: +size.y.toFixed(2), z: +size.z.toFixed(2) },
      };
      window.__stats = stats;
      console.log('[preview stats]', JSON.stringify(stats));
      drawLabels();
      window.__ready = true;
    }
    frames++;
    requestAnimationFrame(frame);
  }
  frame();
}

main().catch(showErr);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
