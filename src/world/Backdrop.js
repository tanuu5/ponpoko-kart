// Far-away scenery that ignores regular fog: Mt. Fuji and hazy mountain ridges.
import * as THREE from 'three';
import { makeNoise2D, fbm } from './noise.js';

const vert = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying float vH;
uniform float uHeight;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vH = position.y / uHeight;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const frag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSnow;
uniform vec3 uHaze;
uniform float uHazeAmt;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uSnowLine;
varying vec3 vN;
varying vec3 vW;
varying float vH;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
void main() {
  vec3 n = normalize(vN);
  float ang = atan(vW.z, vW.x);
  float streak = sin(ang * 60.0) * 0.5 + sin(ang * 23.0 + 1.3) * 0.3 + (h21(vec2(floor(ang * 90.0), 1.0)) - 0.5) * 0.4;
  float snow = smoothstep(uSnowLine - 0.04, uSnowLine + 0.02, vH + streak * 0.07 * (1.0 - vH));
  vec3 base = mix(uColor, uSnow, snow);
  float diff = max(dot(n, uSunDir), 0.0);
  // snow catches plenty of sky light even when backlit
  vec3 col = base * (uAmbient * (1.0 + snow * 1.6) + uSunColor * diff);
  // rim light toward the sun (backlit silhouettes glow)
  col += uSunColor * pow(1.0 - max(n.y, 0.0), 3.0) * 0.05;
  col = mix(col, uHaze, uHazeAmt * (1.0 - vH * 0.35));
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createFuji(o = {}) {
  const H = o.height ?? 1100;
  const R = o.radius ?? 3000;
  const pts = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n; // 0 = summit edge, 1 = base
    const r = 0.035 * R + (R - 0.035 * R) * Math.pow(t, 1.9);
    const y = H * (1 - Math.pow(t, 0.85));
    pts.push(new THREE.Vector2(r, y));
  }
  pts.unshift(new THREE.Vector2(0, H * 0.985));
  const geo = new THREE.LatheGeometry(pts, 96);
  // irregular ridges
  const noise = makeNoise2D(77);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + fbm(noise, Math.cos(a) * 3 + y / H * 2, Math.sin(a) * 3, 3) * 0.06 * (1 - y / H);
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uHeight: { value: H },
      uColor: { value: new THREE.Color(o.color ?? 0x4a5670) },
      uSnow: { value: new THREE.Color(o.snowColor ?? 0xf4f2ff) },
      uHaze: { value: new THREE.Color(o.haze ?? 0xc9a8b0) },
      uHazeAmt: { value: o.hazeAmt ?? 0.55 },
      uSunDir: { value: new THREE.Vector3(...(o.sunDir || [0, 1, 0])).normalize() },
      uSunColor: { value: new THREE.Color(o.sunColor ?? 0xffc080) },
      uAmbient: { value: new THREE.Color(o.ambient ?? 0x6a6a88) },
      uSnowLine: { value: o.snowLine ?? 0.7 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fuji';
  mesh.frustumCulled = false;
  return mesh;
}

/** A ring of layered hazy ridges far away (cheap mountain backdrop). */
export function createRidgeRing(o = {}) {
  const group = new THREE.Group();
  const layers = o.layers ?? 3;
  const noise = makeNoise2D(o.seed ?? 5);
  for (let L = 0; L < layers; L++) {
    const R = (o.radius ?? 2600) + L * (o.step ?? 500);
    const seg = 256;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const hNoise = fbm(noise, Math.cos(a) * (2.5 + L), Math.sin(a) * (2.5 + L) + L * 7, 5) * 0.5 + 0.5;
      let h = (o.minH ?? 120) + hNoise * (o.maxH ?? 380) * (1 + L * 0.35);
      if (o.gap) {
        let da = Math.abs(((a - o.gap.angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
        h *= 0.25 + 0.75 * Math.min(1, da / o.gap.width);
      }
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      pos.push(x, -40, z, x, h, z);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const hazeAmt = (o.hazeBase ?? 0.45) + L * (o.hazeStep ?? 0.15);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHaze: { value: new THREE.Color(o.haze ?? 0xb8a4b8) },
        uColor: { value: new THREE.Color(o.color ?? 0x3d4a5e) },
        uHazeAmt: { value: Math.min(0.95, hazeAmt) },
        uTop: { value: new THREE.Color(o.topColor ?? o.haze ?? 0xb8a4b8) },
      },
      vertexShader: /* glsl */ `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: /* glsl */ `uniform vec3 uHaze; uniform vec3 uColor; uniform float uHazeAmt; uniform vec3 uTop; varying float vY;
        void main(){ float t = clamp(vY / 500.0, 0.0, 1.0); vec3 c = mix(uColor, uTop, t * 0.25); c = mix(c, uHaze, uHazeAmt + (1.0 - t) * 0.2); gl_FragColor = vec4(c, 1.0);} `,
      side: THREE.DoubleSide,
      fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = -500 + L;
    group.add(m);
  }
  return group;
}
