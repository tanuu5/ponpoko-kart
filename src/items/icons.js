// ぽんぽこカート — offscreen icon / portrait renderer.
//
// renderItemIcons(size = 160) → Promise<{ dango3, dango2, dango1, daruma, shuriken, makibishi,
//                                          manekineko, kanedarai, koban }>   (PNG data URLs, transparent)
// renderPortraits(size = 256)  → Promise<{ tanuki, kitsune, neko, shiba, usagi, kappa, tengu, oni }>
//
// Uses its own small WebGLRenderer (alpha, ACES, PMREM room environment) and disposes it afterwards.
// Shared model geometry/materials are NOT disposed (the game keeps using them).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createItemModel } from './itemModels.js';
import { createDriverModel } from '../kart/KartModel.js';
import { CHARACTERS } from '../kart/characters.js';

function makeStudio(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.75;

  const key = new THREE.DirectionalLight(0xfff1de, 2.4);
  key.position.set(-2.5, 4, 5);
  const fill = new THREE.DirectionalLight(0xd8e6ff, 0.8);
  fill.position.set(4, 1.5, 2);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(1.5, 3, -5);
  const hemi = new THREE.HemisphereLight(0xeef4ff, 0x6a5a4a, 0.55);
  scene.add(key, fill, rim, hemi);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  return {
    canvas, renderer, scene, camera,
    dispose() {
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

const _v = new THREE.Vector3();
/**
 * Orthographic fit: camera looks at the object from direction `dir` (unit, from target toward camera).
 * Frames every vertex of every visible mesh under `obj` (optionally only meshes accepted by `filter`),
 * with `margin` (fraction of the frame) around it.
 */
function frameOrtho(camera, obj, dir, { margin = 0.06, filter = null, clipBottom = null } = {}) {
  obj.updateMatrixWorld(true);
  const target = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
  camera.position.copy(target).addScaledVector(dir, 20);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const inv = camera.matrixWorldInverse;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry || !isVisible(o)) return;
    if (filter && !filter(o)) return;
    const p = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(p.count / 4000));
    for (let i = 0; i < p.count; i += step) {
      _v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (clipBottom !== null && _v.y < clipBottom) continue;
      _v.applyMatrix4(inv);
      minX = Math.min(minX, _v.x);
      maxX = Math.max(maxX, _v.x);
      minY = Math.min(minY, _v.y);
      maxY = Math.max(maxY, _v.y);
    }
  });
  const w = maxX - minX;
  const h = maxY - minY;
  const half = (Math.max(w, h) / 2) * (1 + margin * 2);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  camera.left = cx - half;
  camera.right = cx + half;
  camera.top = cy + half;
  camera.bottom = cy - half;
  camera.near = 0.01;
  camera.far = 60;
  camera.updateProjectionMatrix();
}
function isVisible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** Draw the rendered image with a soft white outline + drop shadow for readability. */
function decorate(srcCanvas, size, { outline = 3, shadow = true } = {}) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  // silhouette
  const sil = document.createElement('canvas');
  sil.width = size;
  sil.height = size;
  const sg = sil.getContext('2d');
  sg.drawImage(srcCanvas, 0, 0, size, size);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = '#fffaf2';
  sg.fillRect(0, 0, size, size);
  if (shadow) {
    g.save();
    g.shadowColor = 'rgba(20,12,8,0.45)';
    g.shadowBlur = size * 0.035;
    g.shadowOffsetY = size * 0.018;
    g.drawImage(sil, 0, 0);
    g.restore();
  }
  if (outline > 0) {
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      g.drawImage(sil, Math.cos(a) * outline, Math.sin(a) * outline);
    }
  }
  g.drawImage(srcCanvas, 0, 0, size, size);
  return c.toDataURL('image/png');
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Item icons. dango3/2/1 = skewer with 3/2/1 balls. */
export async function renderItemIcons(size = 160) {
  const pad = Math.round(size * 0.05);
  const inner = size - pad * 2;
  const st = makeStudio(inner);
  const out = {};
  const jobs = [
    ['dango3', 'dango', { count: 3 }, [0.55, 0.12, 1], -0.5],
    ['dango2', 'dango', { count: 2 }, [0.55, 0.12, 1], -0.5],
    ['dango1', 'dango', { count: 1 }, [0.55, 0.12, 1], -0.5],
    ['daruma', 'daruma', {}, [0.35, 0.18, 1], 0],
    ['shuriken', 'shuriken', {}, [0.0, 1.0, 0.75], 0],
    ['makibishi', 'makibishi', { icon: true }, [0.3, 0.75, 1], 0],
    ['manekineko', 'manekineko', {}, [0.42, 0.14, 1], 0],
    ['kanedarai', 'kanedarai', {}, [0.25, -0.35, 1], 0],
    ['koban', 'koban', {}, [0.3, 0.1, 1], 0],
  ];
  try {
    for (const [name, id, opts, dir, roll] of jobs) {
      const model = createItemModel(id, opts);
      const holder = new THREE.Group();
      holder.add(model);
      if (roll) holder.rotation.z = roll;
      st.scene.add(holder);
      frameOrtho(st.camera, holder, new THREE.Vector3(...dir).normalize(), { margin: 0.02 });
      st.renderer.render(st.scene, st.camera);
      out[name] = await pad2(st.canvas, size, pad);
      st.scene.remove(holder);
      await nextFrame();
    }
  } finally {
    st.dispose();
  }
  return out;
}

async function pad2(src, size, pad) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  c.getContext('2d').drawImage(src, pad, pad);
  return decorate(c, size, { outline: Math.max(2, Math.round(size / 55)) });
}

/** Head + shoulders portraits (3/4 view) of every character. */
export async function renderPortraits(size = 256) {
  const st = makeStudio(size);
  const out = {};
  try {
    for (const ch of CHARACTERS) {
      const drv = createDriverModel(ch.id);
      const holder = new THREE.Group();
      holder.add(drv.group);
      // cheerful pose: waving paw, slight head tilt
      for (let i = 0; i < 40; i++) drv.pose(1 / 30, { time: 0.3, portrait: true });
      drv.head.rotation.z += 0.08;
      drv.head.rotation.y += 0.12;
      st.scene.add(holder);
      holder.updateMatrixWorld(true);
      const hc = drv.headCenter.clone();
      frameOrtho(st.camera, holder, new THREE.Vector3(0.55, 0.12, 1).normalize(), { margin: 0.04, clipBottom: hc.y - 0.5 });
      st.renderer.render(st.scene, st.camera);
      out[ch.id] = decorate(st.canvas, size, { outline: Math.max(2, Math.round(size / 64)) });
      st.scene.remove(holder);
      await nextFrame();
    }
  } finally {
    st.dispose();
  }
  return out;
}
