import * as T from 'three';
import { AudioSystem } from './audio';
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
  camera = new T.PerspectiveCamera(76, innerWidth / innerHeight, 0.075, 1700);
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
    for (const side of [-1, 1]) {
      const hand = sphere(this.hands, 0.095, [side * 0.32, -0.53, -0.78], '#dcad87', 1);
      hand.scale.z = 1.35;
      const sleeve = box(
        this.hands,
        [0.15, 0.16, 0.45],
        [side * 0.33, -0.63, -0.5],
        '#7e9d89',
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
              this.position.set(x, terrainHeight(x, z), z);
              this.jumpY = this.jumpVelocity = 0;
            }
          },
          aim: (x: number, y: number, z: number) => {
            const d = new T.Vector3(x, y, z).sub(this.camera.position);
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
        },
      });
    }
  }
  resetPosition() {
    const p = this.save.player;
    this.position.set(p.x, terrainHeight(p.x, p.z), p.z);
    this.yaw = p.yaw;
    this.pitch = -0.1;
  }
  resetItems() {
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
        obj.position.set(x, terrainHeight(x, z), z);
      }
      i++;
    }
    this.holding = null;
  }
  applySettings() {
    this.camera.fov = this.save.settings.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      this.save.settings.quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5),
    );
    this.renderer.shadowMap.enabled = this.save.settings.quality === 'high';
    this.world.sun.castShadow = this.save.settings.quality === 'high';
  }
  show(panel: Panel, remember = true) {
    this.hold = null;
    if (panel) {
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
    if (this.holding) {
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
    this.audio.feedback('pick');
    this.ui.toast(`${ITEMS[id].name} · ${ITEMS[id].hint}`);
  }
  drop() {
    if (!this.holding) return;
    const id = this.holding,
      obj = this.world.itemObjects.get(id)!;
    const pos = this.camera.localToWorld(new T.Vector3(0, -0.4, -1.2));
    obj.removeFromParent();
    this.world.scene.add(obj);
    obj.scale.setScalar(1);
    const direction = this.camera.getWorldDirection(new T.Vector3()).multiplyScalar(1.7);
    this.physics.drop(id, obj, pos, direction);
    this.holding = null;
    this.audio.feedback('door');
  }
  startHold(duration: number, complete: () => void) {
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
    if (id.startsWith('item:')) {
      this.pickup(this.target.data as ItemId);
      return;
    }
    if (id === 'door') {
      if (this.holding) {
        this.ui.toast('Pack that in the trunk, or press Q to put it down.');
        return;
      }
      if (!this.vehicle.doorOpen) {
        this.vehicle.doorOpen = true;
        this.audio.feedback('door');
        return;
      }
      this.save.mode = 'driving';
      this.vehicle.doorOpen = this.vehicle.trunkOpen = this.vehicle.hoodOpen = false;
      this.yaw = 0;
      this.pitch = -0.015;
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
    const direction = this.camera.getWorldDirection(new T.Vector3());
    let score = -Infinity;
    this.target = null;
    for (const target of this.allTargets()) {
      const delta = target.position.clone().sub(this.camera.position),
        distance = delta.length();
      if (distance > target.radius || distance < 0.05) continue;
      const dot = delta.normalize().dot(direction);
      if (dot < (distance < 1.1 ? 0.25 : 0.78)) continue;
      const value = dot - distance * 0.045 + (target.id === 'trunk' && this.holding ? 0.05 : 0);
      if (value > score) {
        score = value;
        this.target = target;
      }
    }
    this.targetText = this.target?.title || '';
    this.targetHint = this.target?.hint || '';
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
      if (kind === 'cargo') trip.roofSecured = false;
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
    const move = new T.Vector3(
      Number(this.input.down('KeyD', 'ArrowRight')) - Number(this.input.down('KeyA', 'ArrowLeft')),
      0,
      Number(this.input.down('KeyS', 'ArrowDown')) - Number(this.input.down('KeyW', 'ArrowUp')),
    );
    const moving = move.lengthSq() > 0;
    if (moving) {
      const speed = this.input.down('ShiftLeft', 'ShiftRight') ? 6.5 : 3.8;
      move
        .normalize()
        .applyAxisAngle(new T.Vector3(0, 1, 0), this.yaw)
        .multiplyScalar(speed * dt);
      let { x, z } = this.world.collide(this.position.x + move.x, this.position.z + move.z, 0.32);
      // The wagon is solid even while walking around its open doors.
      const local = this.vehicle.model.root.worldToLocal(
        new T.Vector3(x, this.vehicle.model.root.position.y, z),
      );
      if (Math.abs(local.x) < 1.36 && Math.abs(local.z) < 2.65) {
        if (1.36 - Math.abs(local.x) < 2.65 - Math.abs(local.z))
          local.x = Math.sign(local.x || 1) * 1.36;
        else local.z = Math.sign(local.z || 1) * 2.65;
        const p = this.vehicle.model.root.localToWorld(local);
        x = p.x;
        z = p.z;
      }
      this.position.x = clamp(x, roadX(-z) - 210, roadX(-z) + 210);
      this.position.z = clamp(z, -7370, 110);
      this.walkTime += dt * (speed > 4 ? 11 : 7);
      this.footstep += dt;
      if (this.footstep > (speed > 4 ? 0.3 : 0.46) && this.jumpY === 0) {
        this.footstep = 0;
        this.audio.feedback('step');
      }
    }
    if (this.input.hit('Space') && this.jumpY === 0) this.jumpVelocity = 4.6;
    this.jumpVelocity -= dt * 13;
    this.jumpY = Math.max(0, this.jumpY + this.jumpVelocity * dt);
    if (this.jumpY === 0) this.jumpVelocity = 0;
    this.position.y = this.world.walkingHeight(this.position.x, this.position.z);
    const bob = moving && !this.photoMode ? Math.sin(this.walkTime) * 0.025 : 0;
    this.camera.position.copy(this.position).add(new T.Vector3(0, 1.7 + this.jumpY + bob, 0));
    this.camera.quaternion.setFromEuler(new T.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }
  driveCamera(dt: number) {
    const v = this.vehicle;
    if (this.chase) {
      const desired = v.local(0, 5, 9);
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
      this.camera.lookAt(v.local(0, 1.5, -6));
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
      }
      if (i.hit('KeyE')) {
        if (Math.abs(this.vehicle.speed) > 1.2)
          this.ui.toast('A little slower before you hop out.');
        else {
          this.vehicle.speed = 0;
          this.save.mode = 'walking';
          this.vehicle.doorOpen = true;
          this.position.copy(this.vehicle.local(-2, 0, -0.15));
          this.position.y = terrainHeight(this.position.x, this.position.z);
          this.yaw = this.save.vehicle.yaw;
          this.pitch = -0.1;
          this.audio.feedback('door');
          this.persist();
        }
      }
    } else {
      if (i.hit('KeyQ')) this.drop();
      if (i.hit('KeyE') && !this.photoMode) this.interact();
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
      this.yaw -= this.input.mouseX * 0.002 * this.save.settings.sensitivity;
      this.pitch = clamp(
        this.pitch - this.input.mouseY * 0.002 * this.save.settings.sensitivity,
        -1.35,
        1.25,
      );
      this.vehicle.update(dt, this.save, this.input, this.save.mode === 'driving');
      if (this.save.mode === 'walking') this.walk(dt);
      else this.driveCamera(dt);
      this.hands.visible = !!this.holding && this.save.mode === 'walking';
      this.physics.update(dt, this.world.itemObjects);
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
      );
    }
    this.renderer.render(this.world.scene, this.camera);
    this.input.end();
    requestAnimationFrame(this.frame);
  };
}
