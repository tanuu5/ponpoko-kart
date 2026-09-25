// Visual representation of a kart: model animation, glider, particles, invincibility aura.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

function placeholderModel(color) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 1.9), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
  m.position.y = 0.45;
  m.castShadow = true;
  body.add(m);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshStandardMaterial({ color: 0x8a6a4a }));
  head.position.set(0, 1.15, -0.2);
  head.castShadow = true;
  body.add(head);
  const gm = new THREE.Object3D();
  gm.position.set(0, 1.4, -0.4);
  body.add(gm);
  return {
    root, body, gliderMount: gm,
    exhaustPoints: [new THREE.Vector3(-0.3, 0.45, -1.0), new THREE.Vector3(0.3, 0.45, -1.0)],
    rearWheelContacts: [new THREE.Vector3(0.7, 0, -0.65), new THREE.Vector3(-0.7, 0, -0.65)],
    radius: 1,
    animate() {},
    dispose() {},
  };
}

function auraMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.8, 0.25) } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0); f = pow(f, 2.0);
        float pulse = 0.75 + 0.25 * sin(uTime * 12.0);
        vec3 c = mix(uColor, vec3(1.0, 0.4, 0.8), 0.5 + 0.5 * sin(uTime * 3.0));
        gl_FragColor = vec4(c * 2.5 * pulse, f * 0.9); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export class KartView {
  /**
   * @param {import('./Kart.js').Kart} kart
   * @param {{createKartModel?:Function, createGlider?:Function}|null} api
   */
  constructor(kart, api, scene, fx) {
    this.kart = kart;
    this.fx = fx;
    this.scene = scene;
    let model = null;
    try {
      if (api && api.createKartModel) model = api.createKartModel(kart.character);
    } catch (e) {
      console.warn('kart model failed', e);
    }
    if (!model) model = placeholderModel(new THREE.Color(kart.color));
    this.model = model;
    scene.add(model.root);
    this.glider = null;
    try {
      if (api && api.createGlider) {
        this.glider = api.createGlider(kart.character);
        model.gliderMount.add(this.glider.group);
        this.glider.setOpen(0);
        this.glider.group.visible = false;
      }
    } catch (e) {
      console.warn('glider failed', e);
      this.glider = null;
    }
    this.gliderOpen = 0;
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 16), auraMaterial());
    this.aura.scale.set(1.0, 0.85, 1.25);
    this.aura.position.y = 0.7;
    this.aura.visible = false;
    model.root.add(this.aura);
    this.state = {
      speed: 0, steer: 0, driftDir: 0, driftLevel: 0, boosting: false, airborne: false, gliding: false,
      trickT: -1, trickType: 'flip', squash: 0, spinOut: false, time: 0,
    };
    this._fxAcc = 0;
    this.visible = true;
  }

  update(dt, time) {
    const k = this.kart;
    const m = this.model;
    // hide while being respawned
    const hidden = k.respawnT >= 0 && k.respawnT < 0.9;
    if (hidden !== !this.visible) {
      this.visible = !hidden;
      m.root.visible = this.visible;
      if (hidden) this.fx.dust(k.pos, [0.9, 0.9, 0.95], 10);
    }
    m.root.position.copy(k.pos);
    k.renderQuaternion(m.root.quaternion);

    const s = this.state;
    s.speed = k.speed;
    s.steer = k.steerSmooth;
    s.driftDir = k.drift.active ? k.drift.dir : 0;
    s.driftLevel = k.drift.level;
    s.boosting = k.boostT > 0;
    s.airborne = !k.grounded;
    s.gliding = k.glide.active;
    s.trickT = k.trick.t;
    s.trickType = k.trick.type;
    s.squash = k.squash;
    s.spinOut = k.spin.t >= 0;
    s.time = time;
    try {
      m.animate(dt, s);
    } catch (e) {
      if (!this._warned) { console.warn(e); this._warned = true; }
    }

    // glider
    if (this.glider) {
      const want = k.glide.active ? 1 : 0;
      this.gliderOpen += (want - this.gliderOpen) * Math.min(1, dt * (want ? 5 : 7));
      if (this.gliderOpen < 0.01 && !want) this.gliderOpen = 0;
      this.glider.group.visible = this.gliderOpen > 0.01;
      this.glider.setOpen(this.gliderOpen);
    }

    // invincibility aura
    this.aura.visible = k.invincibleT > 0;
    if (this.aura.visible) {
      this.aura.material.uniforms.uTime.value = time;
      if (Math.random() < dt * 30) {
        _v.set((Math.random() - 0.5) * 2, Math.random() * 1.6, (Math.random() - 0.5) * 2.4).applyQuaternion(m.root.quaternion).add(k.pos);
        this.fx.sparks.spawn({ x: _v.x, y: _v.y, z: _v.z, vy: 1.5, life: 0.5, size: 0.12, size1: 0.02, r: 1, g: 0.85, b: 0.3, a: 1, a1: 0 });
      }
    }

    if (!this.visible) return;
    const fwdX = Math.sin(k.heading), fwdZ = Math.cos(k.heading);
    // drift sparks
    if (k.drift.active && k.grounded) {
      const lvl = k.drift.level;
      for (const c of m.rearWheelContacts) {
        _v.copy(c).applyQuaternion(m.root.quaternion).add(k.pos);
        if (Math.random() < (lvl > 0 ? 1 : 0.5)) this.fx.driftSparks(_v, fwdX, fwdZ, lvl, -k.drift.dir * -fwdZ, -k.drift.dir * fwdX);
      }
      if (Math.random() < dt * 20) this.fx.dust(_v, [0.6, 0.58, 0.55], 1);
    }
    // boost flames
    if (k.boostT > 0) {
      const col = k.boostKind === 'turbo3' ? [1.0, 0.4, 1.0] : k.boostKind === 'turbo1' ? [0.4, 0.7, 1.0] : [1.0, 0.55, 0.15];
      for (const e of m.exhaustPoints) {
        _v.copy(e).applyQuaternion(m.root.quaternion).add(k.pos);
        this.fx.boostFlame(_v, fwdX, fwdZ, 1.0 + Math.min(1, k.boostPower / 10), col);
        this.fx.boostFlame(_v, fwdX, fwdZ, 0.6, [1, 0.9, 0.6]);
      }
    }
    // offroad dust / splash
    const spd = Math.abs(k.speed);
    if (k.grounded && spd > 5) {
      this._fxAcc += dt;
      if (k.surface === 'grass' || k.surface === 'dirt' || k.surface === 'sand') {
        if (this._fxAcc > (k.surface === 'dirt' ? 0.05 : 0.08)) {
          this._fxAcc = 0;
          for (const c of m.rearWheelContacts) {
            _v.copy(c).applyQuaternion(m.root.quaternion).add(k.pos);
            this.fx.dust(_v, k.surface === 'grass' ? [0.42, 0.45, 0.3] : [0.6, 0.5, 0.38], 1, k.vel);
          }
        }
      } else if (k.surface === 'paddy' || k.surface === 'water') {
        if (this._fxAcc > 0.03) {
          this._fxAcc = 0;
          for (const c of m.rearWheelContacts) {
            _v.copy(c).applyQuaternion(m.root.quaternion).add(k.pos);
            _v.y = Math.max(_v.y, this.kart.world.stage.waterLevelAt ? this.kart.world.stage.waterLevelAt(_v.x, _v.z) : _v.y);
            this.fx.splash(_v, 3, 0.7 + spd / 40);
          }
        }
      }
    }
  }

  dispose() {
    this.scene.remove(this.model.root);
    if (this.model.dispose) this.model.dispose();
  }
}
