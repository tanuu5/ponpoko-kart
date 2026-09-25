// Lights, sky, fog and image-based lighting for a course.
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { Sky } from './Sky.js';
import { FogState } from '../core/fog.js';

/**
 * env: {
 *   sky: {...Sky params},
 *   sun: { color, intensity, shadowFar },
 *   hemi: { sky, ground, intensity },
 *   fog: { color, density, sunColor },
 *   envIntensity, look: {...Renderer.setLook params}
 * }
 */
export function buildEnvironment(scene, renderer, env) {
  const sky = new Sky(env.sky);
  scene.add(sky.group);

  const sunDir = sky.sunDir.clone();
  const sun = new SunLight(new THREE.Color(env.sun.color), env.sun.intensity);
  sun.position.copy(sunDir); // SunLight shines from its position toward the origin
  sun.castShadow = env.sun.shadows !== false;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.far = env.sun.shadowFar ?? 220;
  sun.shadow.camera.near = 0.5;
  sun.shadow.bias = env.sun.bias ?? -0.00025;
  sun.shadow.normalBias = env.sun.normalBias ?? 0.035;
  sun.shadow.radius = 2;
  sun.shadow.intensity = env.sun.shadowIntensity ?? 1.0;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(new THREE.Color(env.hemi.sky), new THREE.Color(env.hemi.ground), env.hemi.intensity);
  scene.add(hemi);

  scene.fog = new THREE.FogExp2(new THREE.Color(env.fog.color), env.fog.density);
  FogState.sunDirWorld.copy(sunDir);
  FogState.setSunColor(new THREE.Color(env.fog.sunColor ?? env.fog.color));

  const envTex = sky.buildEnvironment(renderer);
  scene.environment = envTex;
  scene.environmentIntensity = env.envIntensity ?? 1.0;
  scene.background = null;

  return {
    sky,
    sun,
    hemi,
    envTex,
    update(dt, camera) {
      sky.update(dt, camera);
    },
    dispose() {
      envTex.dispose();
    },
  };
}
