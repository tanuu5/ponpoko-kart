// WebGL renderer + HDR post-processing chain:
//   MSAA scene pass (half-float, linear HDR) -> Unreal bloom -> OutputPass (ACES + sRGB)
//   -> FinalFX pass (boost radial blur, speed lines, chromatic aberration, grading, vignette, grain)
// Also handles adaptive resolution to hold ~60 fps.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { installFog, FogState } from './fog.js';

class MSAAScenePass extends Pass {
  constructor(samples = 4) {
    super();
    this.scene = null;
    this.camera = null;
    this.needsSwap = false;
    this.clear = true;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.copyMat = new THREE.ShaderMaterial(CopyShader);
    this.copyMat.depthTest = false;
    this.copyMat.depthWrite = false;
    this.fsQuad = new FullScreenQuad(this.copyMat);
    this.beforeRender = null; // hook(renderer) e.g. planar reflections
  }
  setSize(w, h) {
    this.target.setSize(w, h);
  }
  render(renderer, writeBuffer, readBuffer) {
    if (!this.scene || !this.camera) return;
    if (this.beforeRender) this.beforeRender(renderer);
    FogState.updateCamera(this.camera);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.copyMat.uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.fsQuad.render(renderer);
  }
  dispose() {
    this.target.dispose();
    this.copyMat.dispose();
    this.fsQuad.dispose();
  }
}

const FinalFXShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uBoost: { value: 0 },
    uSpeedLines: { value: 0 },
    uCA: { value: 0.0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.02 },
    uSaturation: { value: 1.08 },
    uContrast: { value: 1.04 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uLift: { value: new THREE.Color(0, 0, 0) },
    uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVis: { value: 0 },
    uFlareColor: { value: new THREE.Color(1.0, 0.8, 0.55) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime, uBoost, uSpeedLines, uCA, uFlash, uVignette, uGrain, uSaturation, uContrast;
    uniform vec3 uFlashColor, uTint, uLift;
    uniform vec2 uSunPos;
    uniform float uSunVis;
    uniform vec3 uFlareColor;
    varying vec2 vUv;
    vec3 lensFlare(vec2 uv, float aspect) {
      vec3 acc = vec3(0.0);
      vec2 sp = uSunPos;
      vec2 axis = vec2(0.5) - sp;
      // ghosts along the line through the screen centre
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float t = 0.35 + fi * 0.42;
        float r = 0.02 + 0.035 * mod(fi * 1.7, 3.0);
        vec2 c = sp + axis * t * 2.0;
        vec2 d = (uv - c) * vec2(aspect, 1.0);
        float g = smoothstep(r, r * 0.55, length(d));
        vec3 tint = mix(uFlareColor, vec3(0.55, 0.8, 1.0), fract(fi * 0.37));
        acc += tint * g * (0.05 + 0.03 * fi);
      }
      // ring halo around the centre-mirror point
      vec2 hc = sp + axis * 2.0;
      float hr = length((uv - hc) * vec2(aspect, 1.0));
      acc += uFlareColor * smoothstep(0.03, 0.0, abs(hr - 0.22)) * 0.04;
      // soft glare near the sun itself
      float sr = length((uv - sp) * vec2(aspect, 1.0));
      acc += uFlareColor * (0.12 / (1.0 + sr * sr * 60.0));
      return acc;
    }
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec2 c = vUv - 0.5;
      float aspect = uRes.x / max(uRes.y, 1.0);
      float r = length(c * vec2(aspect, 1.0));
      vec3 col;
      float blur = uBoost * 0.045 * smoothstep(0.12, 0.7, r);
      if (blur > 0.0004) {
        col = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float t = float(i) / 7.0;
          col += texture2D(tDiffuse, 0.5 + c * (1.0 - blur * t)).rgb;
        }
        col *= 0.125;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      float ca = uCA * r * r;
      if (ca > 0.00005) {
        col.r = texture2D(tDiffuse, vUv + c * ca).r * 0.7 + col.r * 0.3;
        col.b = texture2D(tDiffuse, vUv - c * ca).b * 0.7 + col.b * 0.3;
      }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      col = max(col, 0.0) * uTint + uLift;
      if (uSpeedLines > 0.001) {
        float ang = atan(c.y, c.x * aspect);
        float seg = floor(ang * 38.0);
        float n = hash12(vec2(seg, floor(uTime * 18.0)));
        float w = fract(ang * 38.0);
        float line = step(0.86, n) * smoothstep(0.0, 0.3, w) * smoothstep(1.0, 0.7, w);
        line *= smoothstep(0.32, 0.85, r);
        col = mix(col, vec3(1.0), line * uSpeedLines * 0.55);
      }
      if (uSunVis > 0.01) col += lensFlare(vUv, aspect) * uSunVis;
      col *= 1.0 - uVignette * smoothstep(0.38, 1.0, r);
      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
      col += (hash12(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export class Renderer {
  constructor(container) {
    installFog();
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 1);
    container.appendChild(renderer.domElement);
    renderer.domElement.id = 'game-canvas';
    this.renderer = renderer;

    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = Math.min(this.maxPixelRatio, 1.5);
    this.minPixelRatio = 0.7;
    this.adaptive = true;

    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
    this.scenePass = new MSAAScenePass(4);
    this.composer.addPass(this.scenePass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.55, 0.95);
    this.composer.addPass(this.bloom);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
    this.fxPass = new ShaderPass(FinalFXShader);
    this.composer.addPass(this.fxPass);
    this.fx = this.fxPass.uniforms;

    this._frameTimes = [];
    this._lastAdjust = 0;
    this._time = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get domElement() {
    return this.renderer.domElement;
  }

  setScene(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.scenePass.scene = scene;
    this.scenePass.camera = camera;
    this.resize();
  }

  /** Per-course look settings. */
  setLook({ exposure = 1.0, bloomStrength = 0.45, bloomRadius = 0.55, bloomThreshold = 0.95, saturation = 1.08, contrast = 1.04, tint = [1, 1, 1], lift = [0, 0, 0], vignette = 0.35, grain = 0.02 } = {}) {
    this.renderer.toneMappingExposure = exposure;
    this.bloom.strength = bloomStrength;
    this.bloom.radius = bloomRadius;
    this.bloom.threshold = bloomThreshold;
    this.fx.uSaturation.value = saturation;
    this.fx.uContrast.value = contrast;
    this.fx.uTint.value.setRGB(tint[0], tint[1], tint[2]);
    this.fx.uLift.value.setRGB(lift[0], lift[1], lift[2]);
    this.fx.uVignette.value = vignette;
    this.fx.uGrain.value = grain;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.fx.uRes.value.set(w * this.pixelRatio, h * this.pixelRatio);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  _adapt(dt, now) {
    if (!this.adaptive) return;
    this._frameTimes.push(dt);
    if (this._frameTimes.length > 90) this._frameTimes.shift();
    if (now - this._lastAdjust < 2.5 || this._frameTimes.length < 60) return;
    const sorted = [...this._frameTimes].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length * 0.5)];
    let next = this.pixelRatio;
    if (med > 1 / 50) next = Math.max(this.minPixelRatio, this.pixelRatio - 0.15);
    else if (med < 1 / 70 && this.pixelRatio < this.maxPixelRatio) next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1);
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next;
      this._lastAdjust = now;
      this._frameTimes.length = 0;
      this.resize();
    }
  }

  render(dt) {
    this._time += dt;
    this.fx.uTime.value = this._time;
    this.composer.render(dt);
    this._adapt(dt, this._time);
  }
}
