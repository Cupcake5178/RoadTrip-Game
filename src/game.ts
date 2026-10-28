import * as T from 'three';
import { AudioSystem } from './audio';
import { createCharacter, animateCharacter, EXPEDITION_CAST, CHARACTER_BODY } from './character';
import { FollowCamera } from './follow-camera';
import { Input } from './input';
import { box, sphere } from './models';
import { Physics } from './physics';
import {
  biome,
  clamp,
  nextStop,
  roadHeading,
  roadPoint,
  roadX,
  seeded,
  STOPS,
  terrainHeight,
  type StopId,
} from './route';
import {
  cargoCapacity,
  cargoUsed,
  discover,
  eventKind,
  feed,
  finishTrip,
  freshSave,
  ITEMS,
  loadSave,
  packItem,
  refuel,
  spend,
  STORAGE_KEY,
  storeSave,
  type ItemId,
  type Save,
  type Weather,
} from './state';
import { UI, type Panel } from './ui';
import { Vehicle } from './vehicle';
import { World, type Target } from './world';

type HoldAction = { target: string; elapsed: number; duration: number; complete: () => void };
export class Game {
  save = loadSave() ?? freshSave();
  ui = new UI();
  audio = new AudioSystem();
  input: Input;
  renderer: T.WebGLRenderer;
  camera = new T.PerspectiveCamera(76, innerWidth / innerHeight, 0.075, 1000);
  world = new World();
  physics = new Physics();
  vehicle: Vehicle;
  position = new T.Vector3();
  yaw = 0;
  pitch = -0.12;
  jumpY = 0;
  jumpVelocity = 0;
  walkTime = 0;
  footstep = 0;
  holding: ItemId | null = null;
  holdingProp: string | null = null;
  avatar = createCharacter(this.save.trip.seed, 0);
  followCamera = new FollowCamera();
  thirdPerson = this.save.settings.thirdPerson ?? true;
  velocity = new T.Vector3();
  grounded = true;
  actionMotion = 0;
  landingMotion = 0;
  stumbleMotion = 0;
  movingSpeed = 0;
  turnMotion = 0;
  climbMotion = 0;
  seated: { position: T.Vector3; yaw: number } | null = null;
  transition = 0;
  entryStart = new T.Vector3();
  exitTransition = 0;
  roofMugAttached = true;
  hands = new T.Group();
  highlighted: T.Object3D | null = null;
  photoMode = false;
  chase = false;
  target: Target | null = null;
  targetText = '';
  targetHint = '';
  hold: HoldAction | null = null;
  panelHistory: Panel[] = [];
  autosave = 0;
  uiTime = 0;
  dialogueAt = 22;
  random = seeded(this.save.trip.seed);
  totalTime = 0;
  lastTime = 0;
  ready = false;
  storageWarningShown = false;
  constructor() {
    const canvas = document.getElementById('world') as HTMLCanvasElement;
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.16;
    this.input = new Input(canvas);
    this.vehicle = new Vehicle(this.world, this.save);
    this.vehicle.onImpact = (force) => {
      this.audio.feedback('bad');
      if (force > 8) {
        this.ui.dialogue('June', 'The bumper was already a little wobbly. Probably.');
        this.save.trip.moments.push({
          text: 'Gave the bumper a small new personality.',
          at: this.save.trip.elapsed,
        });
      }
    };
    this.physics.onImpact = (id, strength) =>
      this.audio.noise(0.09, Math.min(0.12, strength * 0.015), id.startsWith('prop:') ? 1200 : 500);
    this.ui.onAction = (action, value) => this.action(action, value);
    window.addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    });
    window.addEventListener('beforeunload', () => {
      if (this.ready && this.ui.panel !== 'home') this.persist();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.ready && !this.ui.panel) {
        this.show('pause');
        this.persist();
      }
    });
    canvas.addEventListener('click', () => {
      if (this.photoMode && !this.ui.panel) this.takePhoto();
    });
    this.world.scene.add(this.camera);
    this.world.scene.add(this.avatar);
    for (const side of [-1, 1]) {
      const hand = sphere(
        this.hands,
        0.12,
        [side * 0.32, -0.53, -0.78],
        EXPEDITION_CAST[0].head,
        2,
      );
      hand.scale.z = 1.35;
      const sleeve = box(
        this.hands,
        [0.15, 0.16, 0.45],
        [side * 0.33, -0.63, -0.5],
        EXPEDITION_CAST[0].shirt,
        0.07,
      );
      sleeve.rotation.x = -0.2;
    }
    this.camera.add(this.hands);
    this.hands.visible = false;
    for (const item of this.world.itemObjects.values())
      item.traverse((obj) => {
        if (obj instanceof T.Mesh && obj.material instanceof T.MeshStandardMaterial)
          obj.material = obj.material.clone();
      });
    this.resetPosition();
    this.applySettings();
  }
  async init() {
    await this.world.prepareAssets();
    await this.physics.init(this.world);
    this.resetItems();
    this.ready = true;
    this.ui.loaded();
    this.ui.show('home', this.save);
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
      // A development-only travel harness. Gameplay tests still use real keyboard interactions,
      // real resources, rendering, UI actions and save code; only long drives are shortened.
      Object.assign(window, {
        __roadtrip: {
          snapshot: () =>
            JSON.parse(
              JSON.stringify({
                save: this.save,
                holding: this.holding,
                target: this.target?.id,
                text: this.targetText,
                mode: this.save.mode,
                panel: this.ui.panel,
                speed: this.vehicle.speed,
                position: this.position,
                fps: 1 / Math.max(0.001, this.lastDelta),
                carBodyAttached: this.vehicle.model.body.parent === this.vehicle.model.root,
                carBodyWorld: this.vehicle.model.body.getWorldPosition(new T.Vector3()),
                handMeshes: this.hands.children.length,
                drawCalls: this.renderer.info.render.calls,
                triangles: this.renderer.info.render.triangles,
                thirdPerson: this.thirdPerson,
                grounded: this.grounded,
                avatar: this.avatar.userData.appearance,
                party: this.vehicle.model.passengers.map((p) => p.userData.appearance),
                companionHeads: this.vehicle.model.passengers.map((p) =>
                  p.userData.rig.head.getWorldPosition(new T.Vector3()),
                ),
                avatarYaw: this.avatar.rotation.y,
                avatarVisible: this.avatar.visible,
                avatarPose: {
                  lean: this.avatar.userData.rig.torso.rotation.x,
                  arms: this.avatar.userData.rig.arms.map((a: T.Object3D) => a.rotation.x),
                  legs: this.avatar.userData.rig.legs.map((a: T.Object3D) => a.rotation.x),
                },
                camera: this.camera.position,
                cameraObstructed: this.followCamera.obstruction,
                cameraClearance: this.world.collision.sweep(
                  this.position.clone().add(new T.Vector3(0, 1.5, 0)),
                  this.camera.position,
                  0.22,
                ),
                colliders: this.world.collision.obstacles.length,
                holdingProp: this.holdingProp,
                audio: this.audio.ctx?.state,
                audioEvents: this.audio.events,
                audioLevel: this.audio.meter(),
                bodies: this.physics.bodies.size,
                seated: !!this.seated,
              }),
            ),
          warp: (x: number, z: number, drive = false) => {
            this.save.mode = drive ? 'driving' : 'walking';
            this.vehicle.speed = 0;
            if (drive) {
              this.save.vehicle.x = x;
              this.save.vehicle.z = z;
              this.save.vehicle.yaw = roadHeading(-z);
              this.vehicle.sync(this.save);
            } else {
              this.position.set(x, this.world.walkingHeight(x, z) + 0.14, z);
              this.jumpY = this.jumpVelocity = 0;
              this.velocity.set(0, 0, 0);
              this.transition = this.exitTransition = 0;
              this.followCamera.reset();
            }
          },
          aim: (x: number, y: number, z: number) => {
            const d = new T.Vector3(x, y, z).sub(
              this.save.mode === 'walking'
                ? this.position.clone().add(new T.Vector3(0, 1.5, 0))
                : this.camera.position,
            );
            this.yaw = Math.atan2(-d.x, -d.z);
            this.pitch = Math.asin(clamp(d.y / d.length(), -1, 1));
          },
          target: (id: string) => {
            const target = this.allTargets().find((t) => t.id === id);
            if (!target) return null;
            return { x: target.position.x, y: target.position.y, z: target.position.z };
          },
          advance: (seconds: number) => {
            this.save.trip.elapsed += seconds;
          },
          panel: (panel: Panel) => this.show(panel),
          messages: () => {
            this.ui.dialogue(
              'June',
              'A map, a snack, a very long sentence about the lovely scenery ahead.',
            );
            this.ui.toast('A little discovery. A lot of possibilities.');
            this.save.trip.problem = 'cargo';
          },
          obstacles: () =>
            this.world.collision.obstacles.map((o) => ({
              id: o.id,
              center: o.center,
              half: o.half,
              kind: o.kind,
            })),
        },
      });
    }
  }
  resetPosition() {
    const p = this.save.player;
    this.position.set(p.x, this.world.walkingHeight(p.x, p.z) + 0.14, p.z);
    this.yaw = p.yaw;
    this.pitch = -0.1;
    this.velocity.set(0, 0, 0);
    this.followCamera.reset();
    this.avatar.position.copy(this.position);
  }
  resetItems() {
    this.transition = this.exitTransition = 0;
    this.physics.reset();
    let i = 0;
    for (const [id, obj] of this.world.itemObjects) {
      obj.removeFromParent();
      this.world.scene.add(obj);
      obj.rotation.set(0, 0, 0);
      obj.scale.setScalar(1);
      obj.visible = !this.save.trip.packed.includes(id) && !this.save.trip.departed;
      if (obj.visible) {
        const x = 16 + (i % 4) * 1.6,
          z = 3 + Math.floor(i / 4) * 2.3;
        obj.position.set(x, this.world.walkingHeight(x, z) + 0.12, z);
        this.physics.drop(id, obj, obj.position.clone());
      }
      i++;
    }
    this.holding = null;
    this.holdingProp = null;
    this.seated = null;
    for (const [id, obj] of this.world.life.props) {
      obj.removeFromParent();
      this.world.scene.add(obj);
      obj.scale.setScalar(1);
      obj.visible = true;
      this.physics.drop(id, obj, obj.userData.home.clone().add(new T.Vector3(0, 0.1, 0)));
      if (id === 'prop:roof-mug') {
        this.physics.remove(id);
        this.vehicle.model.root.add(obj);
        obj.position.set(0.62, 2.56, 1.1);
        this.roofMugAttached = true;
      }
    }
  }
  applySettings() {
    this.camera.fov = this.save.settings.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      this.save.settings.quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5),
    );
    this.renderer.shadowMap.enabled = this.save.settings.quality === 'high';
    this.world.sun.castShadow = this.save.settings.quality === 'high';
    this.thirdPerson = this.save.settings.thirdPerson ?? true;
  }
  show(panel: Panel, remember = true) {
    this.hold = null;
    if (panel) {
      this.photoMode = false;
      this.input.unlock();
      this.input.clear();
      if (remember && panel !== this.ui.panel) this.panelHistory.push(this.ui.panel);
    }
    if (!panel || panel === 'home') this.panelHistory = [];
    this.ui.show(panel, this.save);
  }
  resume() {
    this.show(null);
    this.input.lock();
    this.audio.start();
  }
  newTrip() {
    this.save = freshSave(this.save.settings, this.save);
    if (this.save.completed > 0) this.save.trip.seed |= 1;
    this.random = seeded(this.save.trip.seed);
    this.avatar.removeFromParent();
    this.avatar = createCharacter(this.save.trip.seed, 0);
    this.world.scene.add(this.avatar);
    this.vehicle.paint(this.save.vehicle.paint);
    this.vehicle.sync(this.save);
    this.vehicle.doorOpen = false;
    this.vehicle.hoodOpen = false;
    this.vehicle.trunkOpen = true;
    this.resetPosition();
    this.resetItems();
    this.jumpY = this.jumpVelocity = 0;
    this.chase = this.photoMode = false;
    this.dialogueAt = 22;
    this.autosave = 0;
    this.applySettings();
    this.persist();
    this.show('intro');
    this.audio.start();
  }
  persist() {
    this.save.player = { x: this.position.x, z: this.position.z, yaw: this.yaw };
    const ok = storeSave(this.save);
    this.ui.saveWarning = !ok;
    if (!ok && !this.storageWarningShown) {
      this.ui.toast('Browser storage is full or unavailable. Your trip is in memory only.', 'bad');
      this.storageWarningShown = true;
    }
  }
  action(action: string, value?: string) {
    this.audio.start();
    this.audio.feedback('click');
    const [kind, id] = action.split(':');
    switch (kind) {
      case 'new':
        if (loadSave() && !this.save.trip.completed) this.show('new');
        else this.newTrip();
        break;
      case 'confirmnew':
      case 'replay':
        this.newTrip();
        break;
      case 'continue':
        this.resetPosition();
        this.show(this.save.trip.completed ? 'journal' : null);
        this.input.lock();
        this.audio.start();
        break;
      case 'resume':
        this.resume();
        break;
      case 'close': {
        const back = this.panelHistory.pop() ?? null;
        this.show(back, false);
        if (!back) this.input.lock();
        break;
      }
      case 'home':
        this.persist();
        this.show('home');
        break;
      case 'pause':
      case 'settings':
      case 'help':
      case 'packing':
      case 'map':
      case 'journal':
      case 'upgrades':
      case 'reset':
        this.show(kind as Panel);
        break;
      case 'confirmreset': {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* Memory-only play is supported. */
        }
        this.save = freshSave();
        this.vehicle.paint(this.save.vehicle.paint);
        this.vehicle.sync(this.save);
        this.resetPosition();
        this.resetItems();
        this.applySettings();
        this.show('home');
        this.ui.toast('A clean page. A new road.');
        break;
      }
      case 'setting': {
        if (id === 'quality') this.save.settings.quality = value === 'low' ? 'low' : 'high';
        if (id === 'volume') this.save.settings.volume = clamp(Number(value), 0, 1);
        if (id === 'sensitivity') this.save.settings.sensitivity = clamp(Number(value), 0.3, 2);
        if (id === 'fov') this.save.settings.fov = clamp(Number(value), 60, 95);
        if (id === 'music') this.save.settings.music = value === 'true';
        if (id === 'thirdPerson') {
          this.save.settings.thirdPerson = value === 'true';
          this.followCamera.reset();
        }
        this.applySettings();
        this.persist();
        const output = this.ui.overlay
          .querySelector(`[data-setting="${id}"]`)
          ?.parentElement?.querySelector('output');
        if (output)
          output.textContent =
            id === 'volume'
              ? `${Math.round(this.save.settings.volume * 100)}%`
              : id === 'fov'
                ? `${this.save.settings.fov}°`
                : this.save.settings.sensitivity.toFixed(1);
        break;
      }
      case 'fullscreen':
        if (!document.fullscreenElement)
          void document.documentElement
            .requestFullscreen()
            .catch(() => this.ui.toast('Fullscreen isn’t available in this browser.'));
        else void document.exitFullscreen();
        break;
      case 'buy': {
        const item = ITEMS[id as ItemId];
        if (
          !item ||
          this.save.trip.packed.includes(id as ItemId) ||
          cargoUsed(this.save) + item.slots > cargoCapacity(this.save)
        )
          return;
        if (!spend(this.save, item.price)) {
          this.ui.toast('That’s a little outside the snack budget.', 'bad');
          return;
        }
        packItem(this.save, id as ItemId);
        this.vehicle.updateCargo(this.save);
        this.ui.toast(`${item.name} delivered to your wagon.`);
        this.audio.feedback('success');
        this.persist();
        this.show('store');
        break;
      }
      case 'buysnack':
        if (spend(this.save, 5)) {
          this.save.trip.snacks += 3;
          this.ui.toast('Three snacks. A world of possibilities.');
          this.persist();
          this.show('store');
        }
        break;
      case 'buywater':
        if (spend(this.save, 4)) {
          this.save.trip.water += 3;
          this.ui.toast('Fresh water topped up.');
          this.persist();
          this.show('store');
        }
        break;
      case 'repairshop':
        if (spend(this.save, 22)) {
          this.save.vehicle.condition = 100;
          if (this.save.trip.problem) this.fixProblem();
          this.ui.toast('The wagon got a little spa day.');
          this.persist();
          this.show('store');
        }
        break;
      case 'feed':
        if (feed(this.save)) {
          this.ui.dialogue('Milo', 'These taste better when somebody else packed them.');
          this.audio.feedback('success');
          this.persist();
          this.show(this.ui.panel);
        } else this.ui.toast('No snacks left. The next store has your back.');
        break;
      case 'unpack':
        this.unpack(id as ItemId);
        break;
      case 'usefuel': {
        const index = this.save.trip.packed.indexOf('fuel');
        if (index >= 0 && this.save.vehicle.fuel < 95) {
          this.save.trip.packed.splice(index, 1);
          this.save.vehicle.fuel = Math.min(100, this.save.vehicle.fuel + 28);
          this.ui.toast('A little peace of mind. +28% fuel.');
          this.persist();
          this.show(this.ui.panel);
        } else this.ui.toast('The tank has plenty for now.');
        break;
      }
      case 'route': {
        if (id !== 'highway' && id !== 'shortcut') break;
        this.save.trip.route = id;
        discover(this.save, 'fork');
        this.save.passengers[id === 'highway' ? 0 : 1].mood = 100;
        this.save.trip.moments.push({
          text:
            id === 'highway'
              ? 'Took the highway. June called it a “boldly sensible choice”.'
              : 'Took Pinecone Trail. Milo’s sense of direction finally had its moment.',
          at: this.save.trip.elapsed,
        });
        this.resume();
        this.ui.dialogue(
          id === 'highway' ? 'June' : 'Milo',
          id === 'highway'
            ? 'A smooth road is its own adventure. I put that on a mug.'
            : 'If it has pinecones on it, it’s technically a road.',
        );
        this.persist();
        break;
      }
      case 'campaction':
        this.campAction();
        break;
      case 'recover':
        this.assistance();
        break;
      case 'upgrade': {
        const price = { rack: 90, tires: 120, tune: 150 }[id];
        if (!price || this.save.upgrades.includes(id) || this.save.career < price) return;
        this.save.career -= price;
        this.save.upgrades.push(id);
        this.audio.feedback('success');
        this.persist();
        this.show('upgrades');
        break;
      }
      case 'paint':
        if (/^#[a-f0-9]{6}$/.test(id)) {
          this.save.vehicle.paint = id;
          this.vehicle.paint(id);
          this.persist();
          this.show('upgrades');
        }
        break;
    }
  }
  unpack(id: ItemId) {
    if (
      this.save.mode === 'driving' ||
      this.position.distanceTo(this.vehicle.model.root.position) > 7 ||
      this.holding
    ) {
      this.ui.toast('Unpack beside your parked wagon with your hands free.');
      return;
    }
    const index = this.save.trip.packed.indexOf(id);
    if (index < 0) return;
    this.save.trip.packed.splice(index, 1);
    const obj = this.world.itemObjects.get(id)!;
    const pos = this.vehicle.local(1.8, 0.8, 2.1);
    this.physics.drop(id, obj, pos);
    this.vehicle.updateCargo(this.save);
    this.persist();
    this.show('packing');
  }
  assistance() {
    const cost = Math.min(this.save.money, 8);
    spend(this.save, cost);
    this.vehicle.recover(this.save);
    if (this.save.trip.problem) this.fixProblem();
    this.save.vehicle.fuel = Math.max(28, this.save.vehicle.fuel);
    this.save.vehicle.condition = Math.max(65, this.save.vehicle.condition);
    this.save.mode = 'walking';
    this.position.copy(this.vehicle.local(-2.2, 0, -0.2));
    this.position.y = terrainHeight(this.position.x, this.position.z);
    this.save.trip.moments.push({
      text: 'A friendly ranger set the weekend back on course.',
      at: this.save.trip.elapsed,
    });
    this.resume();
    this.ui.toast(
      `A friendly ranger got you rolling. ${cost ? '$' + cost.toFixed(0) : 'This one’s on the house'}.`,
    );
    this.persist();
  }
  campAction() {
    const trip = this.save.trip;
    if (trip.campStage === 0) {
      if (!trip.packed.includes('tent') && !spend(this.save, 12)) {
        this.ui.toast('The ranger lends you a tent. Just bring it back folded.');
      }
      trip.campStage = 1;
      discover(this.save, 'camp');
      this.ui.toast('Home is where you unfold it.');
    } else if (trip.campStage === 1) {
      trip.campStage = 2;
      this.ui.toast('A cozy little fire, safely in its stone ring.');
    } else if (trip.campStage === 2) {
      if (trip.snacks > 0) trip.snacks--;
      else spend(this.save, Math.min(5, this.save.money));
      trip.campStage = 3;
      this.save.passengers.forEach((p) => {
        p.hunger = 0;
        p.mood = 100;
      });
      this.ui.toast('Supper tastes better with a view.');
    } else {
      trip.campStage = 4;
      this.save.passengers.forEach((p) => {
        p.energy = 100;
        p.hunger = 15;
        p.mood = 100;
      });
      const baseHour = this.save.trip.seed % 2 ? 15 : 10;
      const currentHour = (trip.elapsed / 65 + baseHour) % 24;
      trip.elapsed += ((7 - currentHour + 24) % 24 || 24) * 65;
      trip.weather = 'sunny';
      trip.weatherAt = trip.elapsed + 180;
      trip.moments.push({ text: 'Slept under the pines. Dreamed of pancakes.', at: trip.elapsed });
      this.dialogueAt = trip.elapsed + 35;
      this.resume();
      this.audio.feedback('success');
      this.ui.dialogue('June', 'I slept like a log. A log with a very organized itinerary.');
      this.persist();
      return;
    }
    this.audio.feedback('success');
    this.persist();
    this.resume();
  }
  pickup(id: ItemId) {
    if (this.holding || this.holdingProp) {
      this.ui.toast('Two hands. One thing at a time. Q puts it down.');
      return;
    }
    const obj = this.world.itemObjects.get(id)!;
    this.physics.remove(id);
    this.holding = id;
    obj.removeFromParent();
    this.camera.add(obj);
    obj.position.set(0.42, -0.58, -0.92);
    obj.rotation.set(0.1, -0.3, 0.1);
    obj.scale.setScalar(0.8);
    obj.visible = true;
    this.actionMotion = 1;
    this.updateCarryPose();
    this.audio.feedback('pick');
    this.ui.toast(`${ITEMS[id].name} · ${ITEMS[id].hint}`);
  }
  drop(throwing = false) {
    if (this.holdingProp) {
      const id = this.holdingProp,
        obj = this.world.physicsObjects.get(id)!;
      const direction = new T.Vector3(-Math.sin(this.yaw), 0.18, -Math.cos(this.yaw));
      const pos = this.position
        .clone()
        .add(new T.Vector3(0, 1.1, 0))
        .addScaledVector(direction, 0.9);
      obj.removeFromParent();
      this.world.scene.add(obj);
      obj.scale.setScalar(1);
      this.physics.drop(
        id,
        obj,
        this.safeRelease(pos),
        direction.multiplyScalar(throwing ? 8.5 : 1.3),
      );
      this.holdingProp = null;
      this.audio.feedback(throwing ? 'throw' : 'drop');
      this.actionMotion = 1;
      return;
    }
    if (!this.holding) return;
    const id = this.holding,
      obj = this.world.itemObjects.get(id)!;
    const pos = this.position
      .clone()
      .add(new T.Vector3(-Math.sin(this.yaw) * 0.9, 1.1, -Math.cos(this.yaw) * 0.9));
    obj.removeFromParent();
    this.world.scene.add(obj);
    obj.scale.setScalar(1);
    const direction = new T.Vector3(-Math.sin(this.yaw), 0.15, -Math.cos(this.yaw)).multiplyScalar(
      throwing ? 8.5 : 1.3,
    );
    this.physics.drop(id, obj, this.safeRelease(pos), direction);
    this.actionMotion = 1;
    this.holding = null;
    this.audio.feedback(throwing ? 'throw' : 'drop');
  }
  spillCargo() {
    const bag = this.save.trip.packed.includes('bag');
    const id = bag ? 'bag' : 'prop:roof-mug';
    if (!bag && !this.roofMugAttached) return;
    if (bag) this.save.trip.packed.splice(this.save.trip.packed.indexOf('bag'), 1);
    else this.roofMugAttached = false;
    const object = this.world.physicsObjects.get(id)!;
    object.removeFromParent();
    this.world.scene.add(object);
    object.scale.setScalar(1);
    object.visible = true;
    this.physics.drop(
      id,
      object,
      this.vehicle.local(1.2, 2.8, 0.9),
      new T.Vector3(
        2 - Math.sin(this.save.vehicle.yaw) * this.vehicle.speed * 0.7,
        1,
        -Math.cos(this.save.vehicle.yaw) * this.vehicle.speed * 0.7,
      ),
    );
    this.save.trip.moments.push({
      text: bag
        ? 'The weekend bag briefly tried travelling independently.'
        : 'The roof mug requested a scenic stop. With a little bouncing.',
      at: this.save.trip.elapsed,
    });
    this.ui.dialogue(
      'Nia',
      bag ? 'The socks are taking the scenic route!' : 'Your travel mug is living up to its name.',
    );
    this.audio.feedback('drop');
  }
  safeRelease(desired: T.Vector3) {
    const origin = this.position.clone().add(new T.Vector3(0, 1.1, 0));
    return origin.lerp(desired, this.world.collision.sweep(origin, desired, 0.35));
  }
  startHold(duration: number, complete: () => void) {
    this.audio.feedback('repair');
    this.actionMotion = 1;
    if (this.target) this.hold = { target: this.target.id, elapsed: 0, duration, complete };
  }
  fixProblem() {
    if (!this.save.trip.problem) return;
    const label =
      this.save.trip.problem === 'flat'
        ? 'Changed a tire beside the road. Teamwork, mostly.'
        : this.save.trip.problem === 'heat'
          ? 'Cooled down the engine. And the conversation.'
          : 'Secured the dancing roof cargo. Nothing lost but a little dignity.';
    this.save.trip.moments.push({ text: label, at: this.save.trip.elapsed });
    this.save.trip.repairs++;
    this.save.trip.problem = null;
    this.save.trip.repairStep = 0;
    this.save.vehicle.condition = Math.min(100, this.save.vehicle.condition + 15);
    this.vehicle.hoodOpen = false;
    this.save.trip.roofSecured = true;
    this.audio.feedback('success');
    this.ui.toast('Good as almost-new. Back to the good part.');
    this.persist();
  }
  interact() {
    if (!this.target) return;
    const id = this.target.id;
    this.actionMotion = 1;
    if (id.startsWith('junk:')) {
      if (this.holding || this.holdingProp) {
        this.ui.toast('One treasure at a time. Q puts it down. G gives it a little flight.');
        return;
      }
      const prop = id.slice(5),
        object = this.world.physicsObjects.get(prop)!;
      this.physics.remove(prop);
      this.holdingProp = prop;
      if (prop === 'prop:roof-mug') this.roofMugAttached = false;
      this.updateCarryPose();
      this.audio.feedback('pick');
      return;
    }
    if (id.startsWith('npc:')) {
      const line = this.world.life.talk(id.slice(4));
      this.ui.dialogue(line.name, line.text);
      this.save.passengers.forEach((p) => (p.mood = Math.min(100, p.mood + 3)));
      this.audio.feedback('cloth');
      return;
    }
    if (id.startsWith('seat:')) {
      const seat = this.world.life.seats.get(id.slice(5))!;
      this.seated = seat;
      this.velocity.set(0, 0, 0);
      this.position.copy(seat.position);
      this.save.passengers.forEach((p) => (p.energy = Math.min(100, p.energy + 8)));
      this.audio.feedback('cloth');
      this.ui.toast('A good view. A moment to do absolutely nothing. E to stand.');
      return;
    }
    if (id.startsWith('vending:')) {
      if (!spend(this.save, 3)) {
        this.ui.toast('The machine accepts coins, not optimistic speeches.');
        this.audio.feedback('bad');
        return;
      }
      this.save.trip.snacks += 2;
      this.audio.feedback('vending');
      this.ui.toast('Two trail treats. One very dramatic clunk.');
      this.persist();
      return;
    }
    if (id.startsWith('item:')) {
      this.pickup(this.target.data as ItemId);
      return;
    }
    if (id === 'door') {
      if (this.holding || this.holdingProp) {
        this.ui.toast('Pack that in the trunk, or press Q to put it down.');
        return;
      }
      if (!this.vehicle.doorOpen) {
        this.vehicle.doorOpen = true;
        this.audio.feedback('door');
        return;
      }
      this.entryStart.copy(this.position);
      this.transition = 0.65;
      this.save.mode = 'driving';
      this.vehicle.doorOpen = this.vehicle.trunkOpen = this.vehicle.hoodOpen = false;
      this.yaw = 0;
      this.pitch = -0.015;
      this.followCamera.reset();
      this.actionMotion = 1;
      this.audio.feedback('door');
      this.persist();
      if (!this.save.trip.departed)
        this.ui.dialogue(
          'Milo',
          'I packed my sense of adventure. It doesn’t take up a cargo slot.',
        );
      return;
    }
    if (id === 'trunk') {
      if (!this.vehicle.trunkOpen) {
        this.vehicle.trunkOpen = true;
        this.audio.feedback('door');
        return;
      }
      if (this.holding) {
        if (!packItem(this.save, this.holding)) {
          this.ui.toast('The wagon is full. Tab opens your cargo manifest.', 'bad');
          return;
        }
        const obj = this.world.itemObjects.get(this.holding)!;
        obj.removeFromParent();
        this.world.scene.add(obj);
        obj.visible = false;
        obj.scale.setScalar(1);
        this.holding = null;
        this.save.trip.roofSecured = false;
        this.audio.feedback('success');
        this.ui.toast(
          `${cargoUsed(this.save)} / ${cargoCapacity(this.save)} cargo slots. A little more prepared.`,
        );
        this.persist();
      } else this.show('packing');
      return;
    }
    if (id === 'roof') {
      this.startHold(1.5, () => {
        this.save.trip.roofSecured = true;
        if (this.save.trip.problem === 'cargo') this.fixProblem();
        else {
          this.ui.toast('Roof straps snug. Snacks safe.');
          this.audio.feedback('success');
          this.persist();
        }
      });
      return;
    }
    if (id === 'tire' && this.save.trip.problem === 'flat') {
      const supplies =
        this.save.trip.packed.includes('spare') && this.save.trip.packed.includes('tools');
      if (!supplies) {
        this.startHold(3.5, () => {
          spend(this.save, Math.min(this.save.money, 14));
          this.fixProblem();
          this.ui.dialogue('Milo', 'Roadside service. The ultimate spare tire.');
        });
        return;
      }
      if (this.save.trip.repairStep === 0) {
        this.save.trip.repairStep = 1;
        this.ui.toast('Spare and tool kit retrieved. Hold E to jack up the wagon.');
        this.audio.feedback('pick');
      } else if (this.save.trip.repairStep === 1)
        this.startHold(1.8, () => {
          this.save.trip.repairStep = 2;
          this.ui.toast('Nicely lifted. Hold E to fit the spare.');
          this.audio.feedback('door');
        });
      else
        this.startHold(2.6, () => {
          this.save.trip.packed.splice(this.save.trip.packed.indexOf('spare'), 1);
          this.fixProblem();
        });
      return;
    }
    if (id === 'hood') {
      if (!this.vehicle.hoodOpen) {
        this.vehicle.hoodOpen = true;
        this.audio.feedback('door');
        return;
      }
      if (this.save.trip.problem === 'heat') {
        const hasWater = this.save.trip.water > 0;
        this.startHold(hasWater ? 2.3 : 5, () => {
          if (hasWater) this.save.trip.water--;
          this.fixProblem();
        });
      } else if (this.save.vehicle.condition < 98 && this.save.trip.packed.includes('tools'))
        this.startHold(2, () => {
          this.save.vehicle.condition = Math.min(100, this.save.vehicle.condition + 20);
          this.ui.toast('A little tightening. A lot less rattling.');
          this.persist();
        });
      else {
        this.vehicle.hoodOpen = false;
        this.ui.toast('The engine looks reassuringly engine-shaped.');
      }
      return;
    }
    if (id === 'pump') {
      if (this.vehicle.model.root.position.distanceTo(this.target.position) > 14) {
        this.ui.toast('Park your wagon closer to this pump.');
        return;
      }
      if (this.save.vehicle.fuel > 98) {
        this.ui.toast('Full tank. Full of possibility.');
        return;
      }
      if (this.save.money < 1) {
        this.ui.toast('Short on change? R calls a friendly ranger.');
        return;
      }
      this.startHold(2.5, () => {
        const amount = refuel(this.save);
        this.ui.toast(`Topped up ${Math.round(amount)}% fuel. Good roads ahead.`);
        this.audio.feedback('success');
        this.persist();
      });
      return;
    }
    if (id === 'store' || id === 'diner') {
      this.show('store');
      return;
    }
    if (id === 'route') {
      this.show('route');
      return;
    }
    if (id === 'camp' || id === 'fire') {
      this.show('camp');
      return;
    }
    if (id === 'view:lake') {
      discover(this.save, 'lake');
      this.ui.dialogue(
        'Milo',
        'The lake is doing that thing where it looks better than the postcard.',
      );
      this.ui.toast('A good place for a photograph. Press C.');
      return;
    }
    if (id === 'teapot') {
      this.save.passengers.forEach((p) => (p.mood = 100));
      this.ui.dialogue('June', 'The sign says it serves four hundred. Very impractical to wash.');
      this.save.trip.moments.push({
        text: 'Found the Big Little Teapot. Nobody brought a big enough biscuit.',
        at: this.save.trip.elapsed,
      });
      return;
    }
    if (id === 'raccoon') {
      this.ui.dialogue('Milo', 'He says the picnic table is reserved. For him. All of it.');
      if (!this.save.trip.moments.some((m) => m.text.startsWith('Met the tiny')))
        this.save.trip.moments.push({
          text: 'Met the tiny campsite supervisor. He took his job very seriously.',
          at: this.save.trip.elapsed,
        });
      this.save.passengers.forEach((p) => (p.mood = Math.min(100, p.mood + 8)));
      this.audio.feedback('pick');
      return;
    }
    if (id === 'bathroom') {
      this.save.passengers.forEach((p) => {
        p.mood = Math.min(100, p.mood + 12);
        p.energy = Math.min(100, p.energy + 10);
      });
      this.ui.toast('A quick comfort break. Everybody feels a little more human.');
      return;
    }
    if (id === 'motel') {
      if (spend(this.save, 18)) {
        this.save.passengers.forEach((p) => {
          p.energy = 100;
          p.mood = 100;
        });
        this.save.trip.elapsed += 180;
        this.ui.toast('Well rested. The wallpaper was surprisingly loud.');
        this.persist();
      } else this.ui.toast('A tent is the more budget-friendly option.');
      return;
    }
    if (id === 'finish') {
      if (this.save.trip.route === 'undecided') {
        this.ui.toast('One last decision for the journal. Which road did you take?');
        this.show('route');
        return;
      }
      discover(this.save, 'summit');
      finishTrip(this.save);
      this.persist();
      this.audio.feedback('success');
      this.show('journal');
      return;
    }
  }
  allTargets() {
    const targets = this.world.targets.filter((t) => {
      if (t.id.startsWith('junk:')) {
        const prop = t.data!,
          obj = this.world.physicsObjects.get(prop)!;
        if (this.holdingProp === prop || !obj.visible) return false;
        t.position.copy(obj.getWorldPosition(new T.Vector3())).add(new T.Vector3(0, 0.2, 0));
        return true;
      }
      if (!t.id.startsWith('item:')) return true;
      const id = t.data as ItemId,
        obj = this.world.itemObjects.get(id)!;
      if (id === this.holding || !obj.visible || this.save.trip.packed.includes(id)) return false;
      t.position.copy(obj.position).add(new T.Vector3(0, 0.35, 0));
      return true;
    });
    const v = this.vehicle;
    targets.push({
      id: 'door',
      position: v.local(-1.4, 1.6, -0.1),
      radius: 2.9,
      title: v.doorOpen ? 'Hop in the wagon' : 'Open the driver’s door',
    });
    targets.push({
      id: 'trunk',
      position: v.local(0, 1.3, 2.65),
      radius: 3.1,
      title: !v.trunkOpen
        ? 'Open the trunk'
        : this.holding
          ? `Pack ${ITEMS[this.holding].name.toLowerCase()}`
          : 'Check the cargo',
    });
    if (!this.save.trip.roofSecured || this.save.trip.problem === 'cargo')
      targets.push({
        id: 'roof',
        position: v.local(0, 2.85, 0.45),
        radius: 3.9,
        title: 'Secure the roof straps',
        hint: 'Hold E · keep the good stuff on board',
      });
    targets.push({
      id: 'hood',
      position: v.local(0, 1.6, -2.35),
      radius: 3,
      title:
        this.save.trip.problem === 'heat'
          ? !v.hoodOpen
            ? 'Open the hood'
            : this.save.trip.water > 0
              ? 'Cool the engine'
              : 'Let the engine cool down'
          : v.hoodOpen
            ? 'Inspect the engine'
            : 'Open the hood',
      hint:
        v.hoodOpen && this.save.trip.problem === 'heat'
          ? 'Hold E · a little patience goes a long way'
          : '',
    });
    if (this.save.trip.problem === 'flat') {
      const supplies =
        this.save.trip.packed.includes('spare') && this.save.trip.packed.includes('tools');
      targets.push({
        id: 'tire',
        position: v.local(-1.3, 0.65, -1.43),
        radius: 3,
        title: supplies
          ? ['Retrieve spare & tool kit', 'Jack up the wagon', 'Fit the spare tire'][
              this.save.trip.repairStep
            ]
          : 'Call tire service · up to $14',
        hint:
          supplies && this.save.trip.repairStep === 0
            ? 'E · packed supplies make this easy'
            : 'Hold E · a little roadside teamwork',
      });
    }
    return targets;
  }
  chooseTarget() {
    const origin = this.position.clone().add(new T.Vector3(0, 1.5, 0));
    const direction = new T.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    let score = -Infinity;
    this.target = null;
    for (const target of this.allTargets()) {
      const delta = target.position.clone().sub(origin),
        distance = delta.length();
      if (distance > target.radius || distance < 0.05) continue;
      const dot = delta.normalize().dot(direction);
      if (dot < (distance < 1.1 ? 0.25 : 0.78)) continue;
      const carTarget = ['door', 'trunk', 'roof', 'hood', 'tire'].includes(target.id);
      const fraction = this.world.collision.sweep(
        origin,
        target.position,
        0.015,
        carTarget ? 'vehicle' : target.id.startsWith('npc:') ? target.id : undefined,
      );
      if (fraction < 0.85 && fraction * distance < distance - 0.45) continue;
      const value = dot - distance * 0.045 + (target.id === 'trunk' && this.holding ? 0.05 : 0);
      if (value > score) {
        score = value;
        this.target = target;
      }
    }
    this.targetText = this.target?.title || '';
    this.targetHint = this.target?.hint || '';
    if (this.seated) {
      this.targetText = 'Stand up & stretch';
      this.targetHint = 'E · the road will still be there';
    }
    if (this.target?.id.startsWith('item:')) {
      const item = ITEMS[this.target.data as ItemId];
      this.targetText = `Pick up ${item.name.toLowerCase()}`;
      this.targetHint = `${item.slots} cargo slot${item.slots > 1 ? 's' : ''} · ${item.hint}`;
    }
    const highlight = this.target?.object ?? null;
    if (this.highlighted !== highlight) {
      this.highlighted?.traverse((o) => {
        if (o instanceof T.Mesh && o.material instanceof T.MeshStandardMaterial) {
          o.material.emissive.set('#000000');
        }
      });
      // Batched buildings keep their solid colors; physical supplies receive a warm highlight.
      if (this.target?.id.startsWith('item:'))
        highlight?.traverse((o) => {
          if (o instanceof T.Mesh && o.material instanceof T.MeshStandardMaterial) {
            o.material.emissive.set('#51452a');
            o.material.emissiveIntensity = 0.28;
          }
        });
      this.highlighted = highlight;
    }
  }
  takePhoto() {
    this.followCamera.reset();
    if (this.save.trip.photos.length >= 8) {
      this.ui.toast('Eight moments in this little album. Leave a few for next time.');
      this.photoMode = false;
      return;
    }
    this.renderer.render(this.world.scene, this.camera);
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 250;
    canvas.getContext('2d')!.drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height);
    const near = STOPS.find((s) => this.position.distanceTo(roadPoint(s.s, s.side * 25)) < 110);
    const name = near?.name ?? biome(-this.save.vehicle.z);
    this.save.trip.photos.push({
      image: canvas.toDataURL('image/jpeg', 0.65),
      label: name,
      time: this.save.trip.elapsed,
    });
    if (
      near &&
      this.save.trip.packed.includes('camera') &&
      !this.save.trip.scenicPhotos.includes(near.id)
    ) {
      this.save.trip.scenicPhotos.push(near.id);
      this.ui.toast(`${name}, remembered. +$20 scenic bonus at journey’s end.`);
    } else this.ui.toast('A little moment, kept in your journal.');
    this.audio.feedback('shutter');
    this.ui.flash();
    this.photoMode = false;
    this.persist();
  }
  updateTrip(dt: number) {
    const trip = this.save.trip,
      s = -this.save.vehicle.z;
    trip.elapsed += dt;
    if (!trip.departed && s > 40) {
      trip.departed = true;
      this.ui.toast('The Mountain Weekend · Your story starts here.');
      this.vehicle.trunkOpen = false;
      this.persist();
    }
    for (const p of this.save.passengers) {
      p.hunger = clamp(p.hunger + dt * 0.045, 0, 100);
      p.energy = clamp(p.energy - dt * 0.031, 0, 100);
      if (p.hunger > 72 || p.energy < 25) p.mood = clamp(p.mood - dt * 0.018, 15, 100);
    }
    if (this.save.mode === 'walking')
      for (const stop of STOPS) {
        if (stop.id === 'fork' || stop.id === 'summit') continue;
        if (
          this.position.distanceTo(roadPoint(stop.s, stop.side * 25)) < 55 &&
          discover(this.save, stop.id)
        ) {
          this.ui.toast(`A little discovery · ${stop.name}`);
          this.audio.feedback('success');
          this.persist();
        }
      }
    if (s > 3070 && trip.route === 'undecided') {
      this.vehicle.speed = 0;
      this.show('route');
    }
    if (trip.departed && s > trip.eventAt && !trip.problem && trip.eventIndex < 4) {
      const kind =
        trip.eventIndex === 0 && !trip.roofSecured && trip.packed.length
          ? 'cargo'
          : eventKind(this.save);
      trip.problem = kind;
      trip.repairStep = 0;
      if (kind === 'cargo') {
        trip.roofSecured = false;
        this.spillCargo();
      }
      trip.eventIndex++;
      trip.eventAt = s + 1400 + this.random() * 500;
      this.audio.feedback('bad');
      this.ui.dialogue(
        kind === 'heat' ? 'June' : 'Milo',
        kind === 'flat'
          ? 'The front tire’s doing a pancake impression. A very determined pancake.'
          : kind === 'heat'
            ? 'The engine light is on. I’m choosing to see this as a request for a scenic break.'
            : 'Is the roof luggage supposed to wave at people?',
      );
      this.persist();
    }
    if (trip.elapsed > trip.weatherAt) {
      const weather: Weather[] = ['sunny', 'cloudy', 'rain', 'fog'];
      trip.weather =
        weather[(weather.indexOf(trip.weather) + 1 + Math.floor(this.random() * 2)) % 4];
      trip.weatherAt = trip.elapsed + 130 + this.random() * 100;
      if (trip.weather === 'rain') {
        trip.moments.push({
          text: 'A passing shower made the pines smell like a whole new place.',
          at: trip.elapsed,
        });
        this.ui.dialogue('June', 'A little rain. A very good excuse for hot chocolate.');
      }
    }
    if (trip.elapsed > this.dialogueAt) {
      this.dialogueAt = trip.elapsed + 38 + this.random() * 22;
      const hungry = this.save.passengers.find((p) => p.hunger > 65),
        tired = this.save.passengers.find((p) => p.energy < 30);
      const lines = [
        ['Milo', 'I saw a cloud shaped like our car. It looked better packed.'],
        ['June', 'According to the map, we are exactly somewhere.'],
        ['Milo', 'If we stop for a snack, that counts as sightseeing.'],
        ['June', 'We have time. I put “being spontaneous” in the schedule.'],
        ['Milo', 'The mountains are really showing off today.'],
        ['June', 'I may have packed three maps. In case the first two disagree.'],
      ];
      const [name, text] = hungry
        ? [
            hungry.name,
            'Any snacks left? My stomach is trying to join the conversation. Tab opens the supplies.',
          ]
        : tired
          ? [tired.name, 'A campsite sounds pretty wonderful about now.']
          : lines[Math.floor(this.random() * lines.length)];
      this.ui.dialogue(name, text);
    }
    if (
      this.save.vehicle.fuel < 15 &&
      this.save.mode === 'driving' &&
      Math.floor(trip.elapsed) % 35 === 0 &&
      this.autosave > 1
    )
      this.ui.toast('Fuel getting low. A pump, a fuel can, or R for a ranger.');
  }
  walk(dt: number) {
    const input = this.input;
    const axis = new T.Vector3(
      Number(input.down('KeyD', 'ArrowRight')) - Number(input.down('KeyA', 'ArrowLeft')),
      0,
      Number(input.down('KeyS', 'ArrowDown')) - Number(input.down('KeyW', 'ArrowUp')),
    );
    if (this.exitTransition > 0) axis.set(0, 0, 0);
    const running = input.down('ShiftLeft', 'ShiftRight') && !this.holding && !this.holdingProp;
    if (this.seated && (axis.lengthSq() || input.hit('Space'))) this.standUp();
    if (this.seated) {
      this.physics.player.setEnabled(false);
      this.position.copy(this.seated.position);
      this.avatar.rotation.y = this.seated.yaw;
      this.movingSpeed = 0;
    } else {
      const desired = axis.lengthSq()
        ? axis
            .normalize()
            .applyAxisAngle(new T.Vector3(0, 1, 0), this.yaw)
            .multiplyScalar(running ? 6.3 : 3.6)
        : axis;
      this.velocity.x = T.MathUtils.damp(this.velocity.x, desired.x, 12, dt);
      this.velocity.z = T.MathUtils.damp(this.velocity.z, desired.z, 12, dt);
      if (this.grounded && this.jumpVelocity < 0) this.jumpVelocity = -0.8;
      if (input.hit('Space') && this.grounded) {
        this.jumpVelocity = 5.2;
        this.grounded = false;
        this.audio.feedback('jump');
      }
      this.jumpVelocity = Math.max(-18, this.jumpVelocity - dt * 15);
      const before = this.position.clone();
      const result = this.physics.movePlayer(
        this.position,
        new T.Vector3(this.velocity.x * dt, this.jumpVelocity * dt, this.velocity.z * dt),
      );
      this.position.copy(result.position);
      if (result.grounded && result.position.y - before.y > 0.07) {
        this.climbMotion = 0.4;
        this.audio.feedback('cloth');
      }
      const landed = !this.grounded && result.grounded;
      this.grounded = result.grounded;
      if (landed) {
        this.landingMotion = Math.min(1, Math.abs(this.jumpVelocity) / 7);
        this.audio.feedback('land');
        this.jumpVelocity = -0.8;
      }
      this.movingSpeed =
        Math.hypot(this.position.x - before.x, this.position.z - before.z) / Math.max(dt, 0.001);
      if (result.collisions > 0 && running && this.movingSpeed < 1 && this.stumbleMotion <= 0) {
        this.stumbleMotion = 1;
        this.audio.feedback('bump');
      }
      if (
        this.position.y < terrainHeight(this.position.x, this.position.z) - 3 ||
        Math.abs(this.position.x) > 470 ||
        this.position.z < -7475 ||
        this.position.z > 275
      ) {
        this.position.copy(before);
        this.position.y = Math.max(before.y, this.world.walkingHeight(before.x, before.z) + 0.2);
        this.jumpVelocity = 0;
      }
      this.walkTime += dt * (running ? 11 : 7);
      this.footstep += this.movingSpeed * dt;
      if (this.footstep > (running ? 1.9 : 1.6) && this.grounded) {
        this.footstep = 0;
        this.audio.step(
          this.world.surfaceAt(this.position.x, this.position.z, this.position.y),
          running,
        );
      }
      if (this.movingSpeed > 0.15) {
        const direction = Math.atan2(-(this.position.x - before.x), -(this.position.z - before.z));
        const turn =
          T.MathUtils.euclideanModulo(direction - this.avatar.rotation.y + Math.PI, Math.PI * 2) -
          Math.PI;
        this.turnMotion = clamp(turn, -1, 1);
        this.avatar.rotation.y += turn * (1 - Math.exp(-dt * 13));
      }
    }
    this.avatar.position.copy(this.position);
    this.avatar.visible = this.thirdPerson && !this.photoMode;
    if (this.exitTransition > 0) {
      const t = 1 - this.exitTransition / 0.5;
      this.avatar.position.lerpVectors(this.entryStart, this.position, t * t * (3 - 2 * t));
      this.exitTransition = Math.max(0, this.exitTransition - dt);
    }
    animateCharacter(this.avatar, this.totalTime, dt, {
      speed: this.movingSpeed,
      running,
      grounded: this.grounded,
      vertical: this.jumpVelocity,
      carrying: !!this.holding || !!this.holdingProp,
      seated: !!this.seated,
      action: this.actionMotion,
      landing: this.landingMotion,
      stumble: this.stumbleMotion,
      climbing: this.climbMotion > 0,
      turn: this.turnMotion,
    });
    this.climbMotion = Math.max(0, this.climbMotion - dt);
    this.turnMotion *= Math.exp(-dt * 6);
    this.actionMotion = Math.max(0, this.actionMotion - dt * 2);
    this.landingMotion = Math.max(0, this.landingMotion - dt * 4);
    this.stumbleMotion = Math.max(0, this.stumbleMotion - dt * 0.8);
    this.jumpY = Math.max(
      0,
      this.position.y - this.world.walkingHeight(this.position.x, this.position.z),
    );
    const head = this.position.clone().add(new T.Vector3(0, 1.5, 0));
    if (this.thirdPerson && !this.photoMode)
      this.followCamera.update(
        this.camera,
        head,
        this.yaw,
        Math.max(-0.65, Math.min(0.8, this.pitch)),
        dt,
        this.world.collision,
        (x, z) => this.world.walkingHeight(x, z),
      );
    else {
      this.camera.position.copy(head);
      this.camera.quaternion.setFromEuler(
        new T.Euler(
          this.pitch,
          this.yaw,
          Math.sin(this.stumbleMotion * 12) * this.stumbleMotion * 0.035,
          'YXZ',
        ),
      );
    }
    const rig = this.avatar.userData.rig;
    if (rig) {
      const distance = this.camera.position.distanceTo(head);
      rig.head.scale.setScalar(distance > 1 ? 1 : 0.001);
      rig.backpack.scale.setScalar(distance > 0.7 ? 1 : 0.001);
    }
    this.updateCarryPose();
  }
  standUp() {
    if (!this.seated) return;
    this.position
      .copy(this.seated.position)
      .add(new T.Vector3(Math.sin(this.seated.yaw) * 1.3, 0, Math.cos(this.seated.yaw) * 1.3));
    this.position.y = this.world.walkingHeight(this.position.x, this.position.z) + 0.18;
    this.seated = null;
    this.followCamera.reset();
    this.audio.feedback('cloth');
  }
  updateCarryPose() {
    const obj = this.holding
      ? this.world.itemObjects.get(this.holding)
      : this.holdingProp
        ? this.world.physicsObjects.get(this.holdingProp)
        : null;
    if (!obj) return;
    const parent = this.thirdPerson ? this.avatar : this.camera;
    if (obj.parent !== parent) {
      obj.removeFromParent();
      parent.add(obj);
    }
    obj.position.set(
      this.thirdPerson ? 0 : 0.42,
      this.thirdPerson ? 0.76 : -0.55,
      this.thirdPerson ? -0.62 : -0.9,
    );
    obj.rotation.set(0.1, this.thirdPerson ? 0 : -0.3, 0.06);
    obj.scale.setScalar(0.75);
    obj.updateWorldMatrix(true, false);
    const desired = obj.getWorldPosition(new T.Vector3());
    const safe = this.safeRelease(desired);
    obj.position.copy(parent.worldToLocal(safe));
  }
  updateCompanions(dt: number) {
    const out = this.save.mode === 'walking';
    for (const [id, p] of this.world.life.people) {
      this.physics.syncNPC(id, p.root.position, p.root.visible);
      if (p.root.visible)
        this.world.collision.dynamic.set(`npc:${id}`, {
          id: `npc:${id}`,
          center: p.root.position.clone().add(new T.Vector3(0, 0.88, 0)),
          half: new T.Vector3(CHARACTER_BODY.radius, 0.88, CHARACTER_BODY.radius),
          rotation: new T.Quaternion(),
          kind: 'cylinder',
          surface: 'grass',
        });
      else this.world.collision.dynamic.delete(`npc:${id}`);
    }
    this.physics.syncNPC('deer', this.world.life.deer.position, this.world.life.deer.visible);

    this.vehicle.model.passengers.forEach((person, i) => {
      const seat = new T.Vector3(i === 1 ? -0.5 : 0.5, 0.83, i === 0 ? 0 : 1.1);
      const outside = new T.Vector3(i === 1 ? -3.1 : 3.1, 0, i === 1 ? 3.8 : (i - 1) * 1.9);
      if (out) {
        const world = this.vehicle.local(outside.x, 0, outside.z);
        outside.y = this.world.walkingHeight(world.x, world.z) - this.vehicle.model.root.position.y;
      }
      const goal = out ? outside : seat;
      const speed = person.position.distanceTo(goal) * 3;
      person.position.lerp(goal, 1 - Math.exp(-dt * 3));
      person.rotation.y = T.MathUtils.damp(
        person.rotation.y,
        out ? Math.sin(this.totalTime * 0.3 + i) * 0.35 : 0,
        3,
        dt,
      );
      person.scale.setScalar(out ? 1 : 0.78);
      animateCharacter(person, this.totalTime + i, dt, {
        speed: out ? speed : 0,
        seated: !out,
        grounded: true,
      });
      const position = person.getWorldPosition(new T.Vector3());
      this.physics.syncNPC(`companion:${i}`, position, out && speed < 0.35);
      // Camera collision follows the large heads throughout the exit animation.
      if (out)
        this.world.collision.dynamic.set(`companion:${i}`, {
          id: `companion:${i}`,
          center: position.clone().add(new T.Vector3(0, 0.88, 0)),
          half: new T.Vector3(CHARACTER_BODY.radius, 0.88, CHARACTER_BODY.radius),
          rotation: new T.Quaternion(),
          kind: 'cylinder',
          surface: 'grass',
        });
      else this.world.collision.dynamic.delete(`companion:${i}`);
    });
  }
  driveCamera(dt: number) {
    const v = this.vehicle;
    this.avatar.visible = false;
    this.physics.player.setEnabled(false);
    if (this.transition > 0) {
      this.transition = Math.max(0, this.transition - dt);
      const t = 1 - this.transition / 0.65;
      this.avatar.visible = true;
      this.avatar.position.lerpVectors(
        this.entryStart,
        v.local(-0.5, 0.86, 0),
        t * t * (3 - 2 * t),
      );
      this.avatar.rotation.y = this.save.vehicle.yaw;
      animateCharacter(this.avatar, this.totalTime, dt, { seated: t > 0.4, action: 1 - t });
      this.followCamera.update(
        this.camera,
        v.local(-0.5, 1.3, 0),
        this.save.vehicle.yaw + 0.7,
        -0.1,
        dt,
        this.world.collision,
        (x, z) => this.world.walkingHeight(x, z),
        4.2,
        'vehicle',
      );
      if (!this.chase && t > 0.6) {
        this.camera.position.lerp(v.local(-0.5, 1.86, 0.14), (t - 0.6) / 0.4);
        this.camera.quaternion.slerp(
          new T.Quaternion().setFromEuler(new T.Euler(this.pitch, this.save.vehicle.yaw, 0, 'YXZ')),
          (t - 0.6) / 0.4,
        );
      }
      this.position.copy(v.model.root.position);
      return;
    }
    if (this.chase) {
      this.followCamera.update(
        this.camera,
        v.local(0, 1.5, 0),
        this.save.vehicle.yaw + this.yaw,
        -0.22,
        dt,
        this.world.collision,
        (x, z) => this.world.walkingHeight(x, z),
        this.followCamera.distance + 3.5,
        'vehicle',
      );
    } else {
      this.camera.position.copy(
        v.local(
          -0.5,
          1.86 + Math.sin(this.save.trip.elapsed * 12) * Math.abs(v.speed) * 0.0003,
          0.14,
        ),
      );
      this.yaw = clamp(this.yaw, -1.4, 1.4); // While seated yaw is relative to the wagon.
      this.camera.quaternion.setFromEuler(
        new T.Euler(
          this.pitch + v.model.root.rotation.x,
          this.save.vehicle.yaw + this.yaw,
          v.bodyRoll * 0.45,
          'YXZ',
        ),
      );
    }
    this.position.copy(v.model.root.position);
  }
  handleKeys() {
    const i = this.input;
    if (i.hit('Escape') || i.hit('KeyP')) {
      if (this.photoMode) this.photoMode = false;
      else if (this.ui.panel && this.ui.panel !== 'home' && this.ui.panel !== 'intro')
        this.action('close');
      else if (!this.ui.panel) {
        this.persist();
        this.show('pause');
      }
      return;
    }
    if (this.ui.panel) return;
    if (i.hit('KeyH')) this.audio.feedback('horn');
    if (i.hit('KeyV') && this.save.mode === 'walking') {
      this.thirdPerson = !this.thirdPerson;
      this.save.settings.thirdPerson = this.thirdPerson;
      this.followCamera.reset();
      this.updateCarryPose();
      this.persist();
    }
    if (i.hit('KeyM')) {
      this.show('map');
      return;
    }
    if (i.hit('Tab')) {
      this.show('packing');
      return;
    }
    if (i.hit('KeyR')) {
      this.assistance();
      return;
    }
    if (i.hit('KeyC')) {
      if (this.photoMode) this.takePhoto();
      else {
        this.photoMode = true;
        this.ui.toast('Frame a little memory. Press C again to keep it.');
      }
    }
    if (i.hit('KeyF')) {
      this.vehicle.headlights = !this.vehicle.headlights;
      this.ui.toast(`Headlights ${this.vehicle.headlights ? 'on' : 'off'}.`);
    }
    if (this.save.mode === 'driving') {
      if (i.hit('KeyV')) {
        this.chase = !this.chase;
        this.yaw = 0;
        this.followCamera.reset();
      }
      if (i.hit('KeyE')) {
        if (Math.abs(this.vehicle.speed) > 1.2)
          this.ui.toast('A little slower before you hop out.');
        else {
          const exit = [
            [-2, -0.15],
            [2, -0.15],
            [-1.8, 3.1],
            [1.8, 3.1],
          ]
            .map(([x, z]) => {
              const point = this.vehicle.local(x, 0, z);
              point.y = this.world.walkingHeight(point.x, point.z) + 0.06;
              return point;
            })
            .find((point) => this.physics.canStandAt(point));
          if (!exit) {
            this.ui.toast('A tight squeeze. Move the wagon a little before getting out.');
            return;
          }
          this.vehicle.speed = 0;
          this.entryStart.copy(this.vehicle.local(-0.5, 0.86, 0));
          this.exitTransition = 0.5;
          this.save.mode = 'walking';
          this.vehicle.doorOpen = true;
          this.position.copy(exit);
          this.yaw = this.save.vehicle.yaw;
          this.pitch = -0.1;
          this.followCamera.reset();
          this.actionMotion = 1;
          this.audio.feedback('door');
          this.persist();
        }
      }
    } else {
      if (i.hit('KeyG')) this.drop(true);
      if (i.hit('KeyQ')) this.drop();
      if (i.hit('KeyE') && !this.photoMode) {
        if (this.seated) this.standUp();
        else this.interact();
      }
    }
  }
  lastDelta = 0.016;
  frame = (now: number) => {
    this.lastDelta = (now - this.lastTime) / 1000;
    const dt = Math.min(this.lastDelta, 0.08);
    this.lastTime = now;
    this.totalTime += dt;
    this.handleKeys();
    const paused = !!this.ui.panel;
    if (!paused) {
      this.followCamera.distance = clamp(
        this.followCamera.distance + this.input.wheel * 0.3,
        2.2,
        6.5,
      );
      this.yaw -= this.input.mouseX * 0.002 * this.save.settings.sensitivity;
      this.pitch = clamp(
        this.pitch - this.input.mouseY * 0.002 * this.save.settings.sensitivity,
        -1.35,
        1.25,
      );
      this.vehicle.update(
        dt,
        this.save,
        this.input,
        this.save.mode === 'driving' && this.transition <= 0,
      );
      if (
        !this.save.trip.roofSecured &&
        this.vehicle.speed > 9 &&
        Math.abs(this.vehicle.steer) > 0.6 &&
        this.roofMugAttached
      )
        this.spillCargo();
      this.physics.syncVehicle(this.vehicle.model.root);
      this.physics.syncTent(this.world.campTent, this.save.trip.campStage >= 1);
      if (this.save.trip.campStage >= 1)
        this.world.collision.dynamic.set('camp-tent', {
          id: 'camp-tent',
          center: this.world.campTent.position.clone().add(new T.Vector3(0, 1, 0)),
          half: new T.Vector3(1.7, 1, 2),
          rotation: new T.Quaternion(),
          kind: 'box',
          surface: 'wood',
        });
      else this.world.collision.dynamic.delete('camp-tent');
      this.world.collision.dynamic.set('vehicle', {
        id: 'vehicle',
        center: this.vehicle.local(0, 1.15, 0),
        half: new T.Vector3(1.16, 0.76, 2.4),
        rotation: this.vehicle.model.root.quaternion.clone(),
        kind: 'box',
        surface: 'metal',
      });
      this.updateCompanions(dt);
      if (this.save.mode === 'walking') this.walk(dt);
      else this.driveCamera(dt);
      this.hands.visible =
        (!!this.holding || !!this.holdingProp) && this.save.mode === 'walking' && !this.thirdPerson;
      this.physics.update(dt, this.world.physicsObjects);
      for (const id of this.save.trip.packed)
        if (this.physics.bodies.has(id)) this.physics.remove(id);
      if (this.save.mode === 'walking') this.chooseTarget();
      else {
        this.target = null;
        this.targetText = '';
      }
      if (this.hold) {
        if (!this.input.down('KeyE') || this.target?.id !== this.hold.target) this.hold = null;
        else {
          this.hold.elapsed += dt;
          if (this.hold.elapsed >= this.hold.duration) {
            const complete = this.hold.complete;
            this.hold = null;
            complete();
          }
        }
      }
      if (!this.save.trip.completed) this.updateTrip(dt);
      this.autosave += dt;
      if (this.autosave > 12) {
        this.autosave = 0;
        this.persist();
      }
    } else if (this.ui.panel === 'home') {
      // A live diorama, framed like the first page of a travel journal.
      const car = this.vehicle.model.root.position;
      this.camera.position
        .copy(car)
        .add(new T.Vector3(8.6 + Math.sin(this.totalTime * 0.05) * 0.5, 4.3, 9.5));
      this.camera.lookAt(car.clone().add(new T.Vector3(-4.8, 1.2, -3.6)));
    }
    this.world.update(paused ? 0.012 : dt, this.camera.position, this.save);
    this.audio.update(
      this.vehicle.speed,
      this.save.mode === 'driving',
      this.save.trip.weather,
      this.save.settings,
      paused,
      {
        surface: this.world.surfaceAt(this.position.x, this.position.z),
        forest: -this.position.z > 650 && -this.position.z < 5000,
        night:
          (this.save.trip.elapsed / 65 + (this.save.trip.seed % 2 ? 15 : 10)) % 24 > 19 ||
          (this.save.trip.elapsed / 65 + (this.save.trip.seed % 2 ? 15 : 10)) % 24 < 6,
        camp: Math.abs(this.position.z + 4300) < 80 && this.save.trip.campStage >= 2,
        gas: Math.abs(this.position.z + 1100) < 65,
      },
      dt,
    );
    this.uiTime += dt;
    if (this.uiTime > 0.09) {
      this.uiTime = 0;
      this.ui.update(
        this.save,
        this.vehicle.speed,
        this.save.mode === 'driving',
        this.holding,
        this.targetText,
        this.targetHint,
        this.hold ? this.hold.elapsed / this.hold.duration : 0,
        this.vehicle.headlights,
        this.photoMode,
        this.holdingProp,
      );
    }
    this.renderer.render(this.world.scene, this.camera);
    this.input.end();
    requestAnimationFrame(this.frame);
  };
}
