// Builds a course world: environment, track meshes, terrain, water, ground queries.
import * as THREE from 'three';
import { Track } from '../track/Track.js';
import { Ground } from '../track/Ground.js';
import { buildTrackMeshes } from '../track/TrackMesh.js';
import { Terrain } from '../world/Terrain.js';
import { buildEnvironment } from '../world/Environment.js';

export class World {
  constructor(renderer, stageDef, opts = {}) {
    this.def = stageDef;
    this.stage = stageDef;
    this.renderer = renderer;
    this.quality = opts.quality || 'high';
    const scene = new THREE.Scene();
    this.scene = scene;
    this.track = new Track(stageDef.track);
    this.terrain = new Terrain(this.track, stageDef.terrain);
    this.ground = new Ground(this.track, this.terrain, stageDef);
    this.env = buildEnvironment(scene, renderer.renderer, stageDef.env);
    this.updaters = [];

    const terrainMesh = this.terrain.buildMesh(stageDef.terrainMesh || {});
    scene.add(terrainMesh);

    const tm = buildTrackMeshes(this.track, stageDef.trackStyle || {}, this.terrain);
    scene.add(tm.group);
    this.trackMeshes = tm;
    this.updaters.push((dt) => tm.update(dt));
  }

  /** Run the course-specific decoration builder (props, water, vegetation, animated set pieces). */
  async decorate(ctx) {
    if (this.def.build) {
      const res = await this.def.build({ ...ctx, world: this, scene: this.scene, track: this.track, terrain: this.terrain, renderer: this.renderer });
      if (res && res.update) this.updaters.push(res.update);
      this.stageRuntime = res || {};
    }
  }

  update(dt, t, ctx) {
    for (const u of this.updaters) u(dt, t, ctx);
  }
}
