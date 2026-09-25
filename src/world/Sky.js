// Stylized anime-like sky: gradient, sun disk & glow, procedural cloud layer, stars & moon,
// plus big billboard cumulus clouds near the horizon. Also generates the PMREM environment.
import * as THREE from 'three';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 0.0)).xyz;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const skyFrag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uSunGlow;
uniform float uSunDisk;
uniform float uTime;
uniform float uCloudCover;
uniform float uCloudSoft;
uniform float uCloudOpacity;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uStars;
uniform vec3 uMoonDir;
uniform float uMoon;
uniform float uGradExp;
varying vec3 vDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = m * p; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir + vec3(0.0, 1e-5, 0.0));
  float y = d.y;
  float h = max(y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, uGradExp));
  // warm haze band hugging the horizon, stronger toward the sun
  float cosA = dot(d, uSunDir);
  float sunSide = pow(max(cosA * 0.5 + 0.5, 0.0), 3.0);
  col = mix(col, uHaze, exp(-h * 9.0) * (0.35 + 0.65 * sunSide));
  if (y < 0.0) col = mix(mix(uHorizon, uHaze, 0.5), uGround, 1.0 - exp(y * 10.0));

  // sun glow
  float g1 = pow(max(cosA, 0.0), 6.0);
  float g2 = pow(max(cosA, 0.0), 60.0);
  float g3 = pow(max(cosA, 0.0), 800.0);
  col += uSunColor * (g1 * 0.25 + g2 * 0.6 + g3 * 1.5) * uSunGlow;

  // cloud layer (projected plane)
  float cloud = 0.0;
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.08) * 0.9 + uTime * vec2(0.006, 0.0025);
    float n = fbm(uv * 1.3);
    float n2 = fbm(uv * 1.3 + uSunDir.xz * 0.12);
    cloud = smoothstep(uCloudCover, uCloudCover + uCloudSoft, n) * smoothstep(0.0, 0.18, y) * uCloudOpacity;
    float lit = clamp(0.55 + (n - n2) * 5.0, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    cc += uSunColor * (g1 * 0.9 + g2 * 1.6) * 0.8; // silver lining toward the sun
    col = mix(col, cc, cloud);
  }

  // sun disk (hidden by clouds)
  float disk = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.5, cosA);
  col += uSunColor * disk * uSunDisk * (1.0 - cloud * 0.85);

  // stars
  if (uStars > 0.0 && y > 0.0) {
    vec3 sd = d * 300.0;
    vec2 cell = floor(sd.xz / (sd.y * 0.02 + 1.0) * 0.6 + sd.y * 0.7);
    vec2 p2 = floor(d.xz * 420.0 / (y + 0.35));
    float st = hash21(p2);
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + st * 60.0);
    float star = step(0.9965, st) * tw * smoothstep(0.02, 0.3, y);
    col += vec3(0.9, 0.95, 1.0) * star * uStars * 3.0 * (1.0 - cloud);
    // milky haze band
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.2, 1.0))) * 3.0, 2.0));
    col += vec3(0.25, 0.3, 0.5) * band * fbm(d.xz * 6.0) * 0.15 * uStars * (1.0 - cloud);
  }
  // moon
  if (uMoon > 0.0) {
    float cm = dot(d, uMoonDir);
    float md = smoothstep(0.99955, 0.99975, cm);
    float crater = fbm(d.xy * 400.0) * 0.25;
    col += vec3(1.0, 0.97, 0.88) * md * (2.2 - crater) * uMoon;
    col += vec3(0.5, 0.6, 0.9) * pow(max(cm, 0.0), 300.0) * 0.5 * uMoon;
    col += vec3(0.3, 0.4, 0.7) * pow(max(cm, 0.0), 20.0) * 0.08 * uMoon;
  }
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

// Soft painterly cumulus billboard texture (grayscale lit top / shaded bottom in RG channels)
function cloudTexture(seed) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.clearRect(0, 0, 512, 256);
  const blobs = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = 70 + t * 372 + (r() - 0.5) * 30;
    const hump = Math.sin(t * Math.PI);
    const y = 200 - hump * (70 + r() * 70) - r() * 20;
    const rad = 30 + hump * 45 + r() * 25;
    blobs.push([x, y, rad]);
  }
  for (let i = 0; i < 10; i++) blobs.push([60 + r() * 392, 190 + r() * 20, 30 + r() * 25]);
  // RGB = lighting (0 shaded .. 1 lit), A = coverage. Layer dark cores, then lit caps (upper-left).
  for (const [x, y, rad] of blobs) {
    const grd = g.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    grd.addColorStop(0, 'rgba(90,90,90,1)');
    grd.addColorStop(0.7, 'rgba(110,110,110,0.9)');
    grd.addColorStop(1, 'rgba(120,120,120,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, y, rad] of blobs) {
    const cx = x - rad * 0.25, cy = y - rad * 0.35;
    const grd = g.createRadialGradient(cx, cy, rad * 0.05, cx, cy, rad * 0.85);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.5, 'rgba(225,225,225,0.55)');
    grd.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, rad * 0.85, 0, Math.PI * 2);
    g.fill();
  }
  // flatten the bottom
  const fade = g.createLinearGradient(0, 180, 0, 236);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = fade;
  g.fillRect(0, 180, 512, 76);
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const cloudVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const cloudFrag = /* glsl */ `
uniform sampler2D map;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uRim;
uniform float uRimAmt;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * uOpacity;
  if (a < 0.01) discard;
  float lit = clamp((t.r - 0.35) * 1.6 + (vUv.y - 0.5) * 0.5, 0.0, 1.0);
  vec3 col = mix(uShade, uLit, lit);
  // rim light at the thin edges
  col += uRim * uRimAmt * (1.0 - smoothstep(0.0, 0.6, t.a));
  gl_FragColor = vec4(col, a);
}
`;

export class Sky {
  /**
   * p: { zenith, horizon, haze, ground, sunDir [x,y,z], sunColor, sunSize, sunGlow, sunDisk,
   *      cloudCover, cloudSoft, cloudOpacity, cloudLit, cloudShade, stars, moonDir, moon, gradExp,
   *      billboards: { count, lit, shade, rim, rimAmt, opacity, minH, maxH, dist } }
   */
  constructor(p) {
    this.p = p;
    const col = (c) => new THREE.Color(c);
    this.uniforms = {
      uZenith: { value: col(p.zenith) },
      uHorizon: { value: col(p.horizon) },
      uHaze: { value: col(p.haze ?? p.horizon) },
      uGround: { value: col(p.ground ?? 0x404040) },
      uSunDir: { value: new THREE.Vector3(...(p.sunDir || [0.3, 0.3, -1])).normalize() },
      uSunColor: { value: col(p.sunColor ?? 0xffe0b0) },
      uSunSize: { value: p.sunSize ?? 0.0006 },
      uSunGlow: { value: p.sunGlow ?? 1.0 },
      uSunDisk: { value: p.sunDisk ?? 30 },
      uTime: { value: 0 },
      uCloudCover: { value: p.cloudCover ?? 0.55 },
      uCloudSoft: { value: p.cloudSoft ?? 0.25 },
      uCloudOpacity: { value: p.cloudOpacity ?? 0.9 },
      uCloudLit: { value: col(p.cloudLit ?? 0xffffff) },
      uCloudShade: { value: col(p.cloudShade ?? 0x9aa6b8) },
      uStars: { value: p.stars ?? 0 },
      uMoonDir: { value: new THREE.Vector3(...(p.moonDir || [0.3, 0.5, -1])).normalize() },
      uMoon: { value: p.moon ?? 0 },
      uGradExp: { value: p.gradExp ?? 0.55 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), mat);
    this.dome.name = 'skydome';
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;

    this.group = new THREE.Group();
    this.group.name = 'sky';
    this.group.add(this.dome);

    // billboard cumulus clouds
    this.clouds = [];
    const bb = p.billboards;
    if (bb && bb.count > 0) {
      const texes = [cloudTexture(11), cloudTexture(29), cloudTexture(53), cloudTexture(97)];
      const sunDir = this.uniforms.uSunDir.value;
      for (let i = 0; i < bb.count; i++) {
        const tex = texes[i % texes.length];
        const cm = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: tex },
            uLit: { value: col(bb.lit ?? 0xffffff) },
            uShade: { value: col(bb.shade ?? 0x8f9bb0) },
            uRim: { value: col(p.sunColor ?? 0xffe0b0) },
            uRimAmt: { value: 0 },
            uOpacity: { value: bb.opacity ?? 0.95 },
          },
          vertexShader: cloudVert,
          fragmentShader: cloudFrag,
          transparent: true,
          depthWrite: false,
          fog: false,
        });
        const ang = (i / bb.count) * Math.PI * 2 + (Math.sin(i * 12.9898) * 0.5);
        const dist = (bb.dist ?? 2200) * (0.85 + ((i * 37) % 10) / 30);
        const w = (bb.minW ?? 500) + (((i * 53) % 10) / 10) * ((bb.maxW ?? 1100) - (bb.minW ?? 500));
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.5), cm);
        const hgt = (bb.minH ?? 60) + (((i * 71) % 10) / 10) * ((bb.maxH ?? 260) - (bb.minH ?? 60));
        m.position.set(Math.sin(ang) * dist, hgt + w * 0.2, Math.cos(ang) * dist);
        m.lookAt(0, m.position.y, 0);
        m.renderOrder = -900;
        m.frustumCulled = false;
        // rim amount: clouds toward the sun get a bright rim
        const dirToCloud = new THREE.Vector3(m.position.x, 0, m.position.z).normalize();
        const sunH = new THREE.Vector3(sunDir.x, 0, sunDir.z).normalize();
        cm.uniforms.uRimAmt.value = Math.max(0, dirToCloud.dot(sunH)) * (bb.rimAmt ?? 1.2);
        this.group.add(m);
        this.clouds.push(m);
      }
    }
  }

  get sunDir() {
    return this.uniforms.uSunDir.value;
  }

  /** Keep the sky centered on the camera. */
  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    this.group.position.copy(camera.position);
    this.group.position.y = camera.position.y * 0.3; // clouds sink slightly as the camera rises
  }

  /** Build a PMREM environment texture from the sky (call once per course). */
  buildEnvironment(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const dome = this.dome.clone();
    dome.material = this.dome.material.clone();
    dome.material.uniforms = THREE.UniformsUtils.clone(this.uniforms);
    dome.material.uniforms.uSunDisk.value = Math.min(this.uniforms.uSunDisk.value, 4); // avoid a hot spot in the IBL
    envScene.add(dome);
    for (const c of this.clouds) envScene.add(c.clone());
    const rt = pmrem.fromScene(envScene, 0.0, 0.1, 5000);
    pmrem.dispose();
    dome.material.dispose();
    return rt.texture;
  }
}
