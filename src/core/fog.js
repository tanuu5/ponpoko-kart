// Global fog override: distance fog whose color is tinted toward the sun color
// when looking toward the sun (cheap "aerial perspective" / sun scattering).
// Installed once at startup, before any material compiles.
import * as THREE from 'three';

// Plain objects (not Vector3) so UniformsUtils.clone() shares them by reference
// across every material: updating them once per frame updates all materials.
const sunDirView = { x: 0, y: 1, z: 0 };
const sunColor = { x: 1, y: 0.85, z: 0.6 };
const sunDirWorld = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

export const FogState = {
  sunDirWorld,
  setSunColor(color) {
    sunColor.x = color.r;
    sunColor.y = color.g;
    sunColor.z = color.b;
  },
  /** Call every frame (and before rendering any auxiliary camera). */
  updateCamera(camera) {
    _v.copy(sunDirWorld).transformDirection(camera.matrixWorldInverse);
    sunDirView.x = _v.x;
    sunDirView.y = _v.y;
    sunDirView.z = _v.z;
  },
  uniforms() {
    return { fogSunDir: { value: sunDirView }, fogSunColor: { value: sunColor } };
  },
};

let installed = false;
export function installFog() {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogViewPos;
#endif
`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogViewPos = mvPosition.xyz;
#endif
`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec3 fogSunDir;
  uniform vec3 fogSunColor;
  varying float vFogDepth;
  varying vec3 vFogViewPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 fogDirV = normalize( vFogViewPos + vec3( 0.0, 0.0, -1e-4 ) );
  float fogSunAmt = pow( max( dot( fogDirV, fogSunDir ), 0.0 ), 5.0 );
  vec3 fogCol = mix( fogColor, fogSunColor, fogSunAmt );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, clamp( fogFactor, 0.0, 1.0 ) );
#endif
`;
  const extra = FogState.uniforms();
  for (const key of Object.keys(THREE.ShaderLib)) {
    const u = THREE.ShaderLib[key].uniforms;
    if (u && u.fogColor) Object.assign(u, extra);
  }
  Object.assign(THREE.UniformsLib.fog, extra);
}
