// Sample prop module to verify the preview harness.
import * as THREE from 'three';
import { getMat } from '../src/props/materials.js';
import { mesh, place } from '../src/props/util.js';

export function createSampleTorii() {
  const g = new THREE.Group();
  const red = getMat('vermilion');
  const black = getMat('blackLacquer');
  for (const x of [-1.6, 1.6]) {
    place(g, mesh(new THREE.CylinderGeometry(0.18, 0.2, 4, 16), red), [x, 2, 0]);
    place(g, mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.4, 16), black), [x, 0.2, 0]);
  }
  place(g, mesh(new THREE.BoxGeometry(4.6, 0.28, 0.4), black), [0, 4.1, 0]);
  place(g, mesh(new THREE.BoxGeometry(3.8, 0.22, 0.3), red), [0, 3.4, 0]);
  return g;
}

export function createSampleLantern() {
  const g = new THREE.Group();
  place(g, mesh(new THREE.SphereGeometry(0.3, 24, 16).scale(1, 1.3, 1), getMat('lanternGlowRed')), [0, 1.2, 0]);
  return g;
}
