import "./style.css";
import "./game.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { createWorld } from "./world.js";
import { createSurfaces } from "./surfaces.js";
import { createAtmosphere } from "./atmosphere.js";
import { advance, clampDestination, dampAngle } from "./navigation.js";
import { createAirship } from "./airship.js";
import { createConservatory, createTideworks } from "./districts-west.js";
import {
  createFoundry,
  createObservatory,
  createSkyport,
} from "./districts-east.js";
import { createMusic } from "./music.js";
import { createGameObjects } from "./game-objects.js";
import {
  REGIONS,
  SAVE_KEY,
  newJourney,
  restoreJourney,
  collectGear,
  activateRegulator,
  travelTo,
} from "./game-state.js";

const canvas = document.querySelector("#scene");
const errorBox = document.querySelector("#error");
function showError(message) {
  document.querySelector("#loading").classList.add("loaded");
  errorBox.hidden = false;
  errorBox.textContent = message;
}

async function start() {
  let journey;
  try {
    journey = restoreJourney(JSON.parse(localStorage.getItem(SAVE_KEY)));
  } catch {
    journey = newJourney();
  }
  let playing = false,
    busy = false,
    pendingInteraction = null,
    saveAvailable = true;
  const music = createMusic();
  let musicEnabled = true,
    musicVolume = 0.4;
  try {
    const settings = JSON.parse(localStorage.getItem(`${SAVE_KEY}:audio`));
    if (settings) {
      musicEnabled = settings.enabled !== false;
      musicVolume =
        typeof settings.volume === "number"
          ? THREE.MathUtils.clamp(settings.volume, 0, 1)
          : 0.4;
    }
  } catch {}
  music.setEnabled(musicEnabled);
  music.setVolume(musicVolume);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x98c3df);
  scene.fog = new THREE.Fog(0x98c3df, 73, 110);
  const camera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 240);
  const environmentCanvas = document.createElement("canvas");
  environmentCanvas.width = 1024;
  environmentCanvas.height = 512;
  const ctx = environmentCanvas.getContext("2d"),
    gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#97c9ec");
  gradient.addColorStop(0.46, "#dce9ec");
  gradient.addColorStop(0.53, "#d3d2b8");
  gradient.addColorStop(1, "#6a7368");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);
  const sunGlow = ctx.createRadialGradient(280, 145, 4, 280, 145, 110);
  sunGlow.addColorStop(0, "#fffbed");
  sunGlow.addColorStop(0.12, "#fff8e6");
  sunGlow.addColorStop(1, "#fff4db00");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, 1024, 512);
  const skyTex = new THREE.CanvasTexture(environmentCanvas);
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(skyTex).texture;
  scene.environmentIntensity = 0.5;
  skyTex.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xdcefff, 0xb1a07a, 0.58));
  const sun = new THREE.DirectionalLight(0xffdf9f, 7.0);
  sun.position.set(-24, 30, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -28,
    right: 28,
    top: 28,
    bottom: -28,
    near: 0.5,
    far: 95,
  });
  sun.shadow.normalBias = 0.045;
  sun.shadow.bias = -0.00012;
  sun.shadow.radius = 2;
  sun.target.position.set(0, 0, -3);
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xc6e1ff, 0.7);
  fill.position.set(15, 18, 25);
  scene.add(fill);

  const surfaces = createSurfaces(scene, renderer);
  let world,
    atmosphere,
    airship,
    stageRoot,
    gameObjects,
    pointLights = [];
  const stageFactories = [
    createWorld,
    createConservatory,
    createTideworks,
    createFoundry,
    createObservatory,
    createSkyport,
  ];

  const gltf = await new GLTFLoader().loadAsync("./mechanic.glb");
  const player = new THREE.Group();
  player.add(gltf.scene);
  scene.add(player);
  player.position.set(2.8, 0.05, 6);
  player.rotation.y = -0.3;
  gltf.scene.scale.setScalar(2.1);
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
    }
  });
  const joints = {};
  for (const name of [
    "LeftLeg",
    "RightLeg",
    "LeftArm",
    "RightArm",
    "Body",
    "Head",
  ])
    joints[name] = gltf.scene.getObjectByName(name);
  const lanternLight = new THREE.PointLight(0x6de6e6, 1.8, 3, 2);
  lanternLight.position.set(0.6, 1, 0.2);
  player.add(lanternLight);

  const marker = new THREE.Group();
  const markerMat = new THREE.MeshBasicMaterial({
    color: 0xffd98a,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.32, 48),
    markerMat,
  );
  ring.rotation.x = -Math.PI / 2;
  marker.add(ring);
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.015, 0.025),
      markerMat,
    );
    tick.position.set(
      Math.cos((i * Math.PI) / 2) * 0.39,
      0,
      Math.sin((i * Math.PI) / 2) * 0.39,
    );
    tick.rotation.y = (-i * Math.PI) / 2;
    marker.add(tick);
  }
  marker.position.y = 0.06;
  marker.visible = false;
  scene.add(marker);
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 64;
  const sc = shadowCanvas.getContext("2d"),
    sg = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
  sg.addColorStop(0, "#10181999");
  sg.addColorStop(1, "#10181900");
  sc.fillStyle = sg;
  sc.fillRect(0, 0, 64, 64);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.065;
  scene.add(contact);

  const composer = new EffectComposer(renderer);
  // Canvas antialiasing does not apply to the composer's offscreen buffers.
  for (const buffer of [composer.renderTarget1, composer.renderTarget2])
    buffer.samples = Math.min(4, renderer.capabilities.maxSamples);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(
    scene,
    camera,
    innerWidth,
    innerHeight,
    undefined,
    { radius: 0.65, thickness: 1.5, distanceFallOff: 1, scale: 1 },
    { radius: 5, lumaPhi: 8, depthPhi: 1 },
  );
  ao.blendIntensity = 0.8;
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    0.18,
    0.4,
    1.7,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const target = { x: 2.8, z: 6 },
    follow = new THREE.Vector3(0, 6.4, 0),
    lookAt = new THREE.Vector3();
  let yaw = 0.38,
    desiredYaw = 0.38,
    viewHeight = 28,
    desiredHeight = 28,
    elapsed = 0,
    walkPhase = 0,
    markerLife = 0;
  const elevation = THREE.MathUtils.degToRad(25),
    radius = 55;
  const keys = new Set();
  let down = null,
    dragged = false;
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    hit = new THREE.Vector3();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const home = () => {
    desiredYaw = 0.38;
    desiredHeight = homeHeight();
    target.x = 2.8;
    target.z = 6;
    pendingInteraction = null;
  };
  function homeHeight() {
    return Math.min(70, Math.max(28, (30 * innerHeight) / innerWidth));
  }
  function maxHeight() {
    return Math.max(46, homeHeight() + 5);
  }

  let toastTimer;
  function toast(message, warning = false, duration = 3500) {
    const el = document.querySelector("#toast");
    el.textContent = message;
    el.classList.toggle("warning", warning);
    el.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("visible"), duration);
  }
  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(journey));
      saveAvailable = true;
    } catch {
      saveAvailable = false;
    }
  }
  function saveAudio() {
    try {
      localStorage.setItem(
        `${SAVE_KEY}:audio`,
        JSON.stringify({ enabled: musicEnabled, volume: musicVolume }),
      );
    } catch {}
  }
  function renderUI() {
    const region = REGIONS[journey.current],
      progress = journey.districts[journey.current];
    document.title = `${region.name} · 六城之心`;
    document
      .querySelector("#experience")
      .setAttribute("aria-label", `${region.name}可交互三维场景`);
    document.body.style.setProperty("--region-accent", region.color);
    document.querySelector(".title-block h1").innerHTML =
      `${region.english}<span>${region.name}</span>`;
    document.querySelector(".title-block p").textContent = region.subtitle;
    document.querySelector(".eyebrow").innerHTML =
      `<span></span> THE SIX HEARTS · ${String(journey.current + 1).padStart(2, "0")}`;
    document.querySelector("#mission").hidden = !playing;
    document.querySelector("#chapter-number").textContent =
      `CHAPTER ${String(journey.current + 1).padStart(2, "0")} / 06`;
    document.querySelector("#save-status").textContent = saveAvailable
      ? "自动保存"
      : "本次进度暂未保存";
    document.querySelector("#mission-title").textContent = progress.restored
      ? "城市核心已修复"
      : progress.collected.length < 3
        ? `寻找${region.component}`
        : "依次启动控制器";
    document.querySelector("#gear-progress").innerHTML =
      [0, 1, 2]
        .map(
          (i) =>
            `<span class="${progress.collected.includes(i) ? "found" : ""}">⚙</span>`,
        )
        .join("") + `<small>${progress.collected.length} / 3</small>`;
    document
      .querySelector("#gear-progress")
      .setAttribute(
        "aria-label",
        `已收集 ${progress.collected.length} 枚${region.component}，共 3 枚`,
      );
    document.querySelector("#mission-copy").textContent = progress.restored
      ? region.restored
      : progress.collected.length < 3
        ? `点击${region.component}或小标记，走近拾取。找齐三枚，为控制器供能。`
        : "依照下方铭牌，点击编号控制器。走近或悬停可查看名称。顺序不对可以重试。";
    document.querySelector("#clue").hidden =
      progress.collected.length < 3 || progress.restored;
    document.querySelector("#clue-copy").textContent = region.clue;
    document.querySelector("#sequence-progress").hidden =
      progress.collected.length < 3;
    document.querySelector("#sequence-progress").innerHTML = [0, 1, 2]
      .map(
        (i) =>
          `<span class="${progress.sequence[i] !== undefined ? "lit" : ""}">${progress.sequence[i] !== undefined ? region.labels[progress.sequence[i]] : "·"}</span>`,
      )
      .join("<i>→</i>");
    const next = document.querySelector("#next-region");
    next.hidden = !progress.restored;
    next.textContent =
      journey.current === 5
        ? "查看旅程结局 →"
        : `启航 · ${REGIONS[journey.current + 1].name} →`;
    document.querySelector("#journey-count").textContent =
      `${journey.districts.filter((d) => d.restored).length} / 6`;
    document.querySelector("#open-map").disabled = !playing || busy;
    document.querySelector("#route-cards").innerHTML = REGIONS.map(
      (r, i) =>
        `<button class="route-card ${i === journey.current ? "current" : ""}" data-region="${i}" ${i > journey.unlocked ? "disabled" : ""} style="--card-accent:${r.color};--card-tint:${r.color}22" aria-label="${i > journey.unlocked ? "尚未解锁：" : "前往"}${r.name}"><small>${journey.districts[i].restored ? "核心已修复" : i <= journey.unlocked ? "可抵达" : "尚未解锁"}</small><span>${r.symbol}</span><h3>${String(i + 1).padStart(2, "0")} ${r.name}</h3><p>${r.english}</p></button>`,
    ).join("");
    gameObjects?.setProgress(progress);
    world?.setPowered?.(progress.restored);
  }
  function disposeStage(root) {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    root.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const mat of o.material
        ? Array.isArray(o.material)
          ? o.material
          : [o.material]
        : []) {
        materials.add(mat);
        for (const value of Object.values(mat))
          if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  }
  async function loadRegion(index, transition = true) {
    if (
      busy ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > journey.unlocked
    )
      return;
    busy = true;
    pendingInteraction = null;
    keys.clear();
    const curtain = document.querySelector("#stage-transition");
    if (transition) {
      curtain.hidden = false;
      document.querySelector("#destination-name").textContent =
        REGIONS[index].name;
      music.cue("travel");
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    try {
      gameObjects?.removeLabels();
      if (stageRoot) {
        scene.remove(stageRoot);
        disposeStage(stageRoot);
      }
      travelTo(journey, index);
      const region = REGIONS[index];
      stageRoot = new THREE.Group();
      stageRoot.name = region.name;
      scene.add(stageRoot);
      world = stageFactories[index](stageRoot);
      atmosphere = createAtmosphere(
        stageRoot,
        world.steamSources.length ? world.steamSources : [[0, 10, -10]],
      );
      airship = createAirship(stageRoot);
      pointLights = (world.lights || []).slice(0, 5).map((l) => {
        const light = new THREE.PointLight(
          l.color,
          Math.min(l.intensity, 18),
          l.distance || 8,
          2,
        );
        light.userData.baseIntensity = light.intensity;
        light.position.fromArray(l.position);
        stageRoot.add(light);
        return light;
      });
      gameObjects = createGameObjects(stageRoot, region, selectInteraction);
      scene.background.set(region.fog);
      scene.fog.color.set(region.fog);
      surfaces.setTheme(region);
      sun.color.set(region.sun);
      sun.intensity = [7, 5.8, 5.8, 6.5, 5, 5.8][index];
      renderer.toneMappingExposure = index === 4 ? 1.03 : 1.1;
      player.position.set(2.8, 0.055, 6);
      player.rotation.y = -0.3;
      Object.assign(target, { x: 2.8, z: 6 });
      follow.set(0, 6.4, 0);
      yaw = desiredYaw = 0.38;
      viewHeight = desiredHeight = homeHeight();
      marker.visible = false;
      music.setScene(index);
      atmosphere.resize(innerHeight * renderer.getPixelRatio(), viewHeight);
      if (playing) persist();
      renderUI();
      if (transition) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (playing)
          toast(
            journey.districts[index].restored ? region.restored : region.story,
            false,
            6500,
          );
      }
    } catch (error) {
      console.error(error);
      showError("这个区域暂时无法载入，请刷新页面继续旅程。");
    } finally {
      busy = false;
      curtain.hidden = true;
      document.querySelector("#open-map").disabled = !playing;
    }
  }
  function selectInteraction(item) {
    if (!playing || busy || document.querySelector("dialog[open]")) return;
    destination(item.x, item.z);
    pendingInteraction = { kind: item.kind, id: item.id, x: item.x, z: item.z };
  }
  function interact(item) {
    const progress = journey.districts[journey.current];
    if (item.kind === "gear") {
      if (collectGear(journey, item.id)) {
        music.cue("collect");
        gameObjects.burst(item.x, item.z);
        toast(
          progress.collected.length === 3
            ? "动力组件已集齐！按铭牌顺序启动三个控制器。"
            : `找到${REGIONS[journey.current].component} · ${progress.collected.length} / 3`,
        );
      }
    } else if (item.kind === "regulator") {
      const event = activateRegulator(journey, item.id);
      if (event === "needs-gears") {
        toast("还需要找齐三枚动力组件，才能启动控制器。", true);
        return;
      }
      if (event === "already-restored") {
        toast("这里的核心已经恢复运转，可以前往下一站。");
        return;
      }
      music.cue(event);
      if (event === "wrong")
        toast("顺序还不对。看看机械铭牌，再试一次。", true);
      else if (event === "correct") {
        gameObjects.burst(item.x, item.z);
        toast(`控制器已接通 · ${progress.sequence.length} / 3`);
      } else if (event === "restore" || event === "win") {
        gameObjects.burst(item.x, item.z);
        toast(REGIONS[journey.current].restored);
        if (event === "win") setTimeout(showEnding, 1800);
      }
    } else if (item.kind === "exit") {
      if (!progress.restored) {
        toast("先修复这座城的核心，飞艇才能继续启航。", true);
        return;
      }
      if (journey.current === 5) {
        showEnding();
        return;
      }
      loadRegion(journey.current + 1);
      return;
    }
    persist();
    renderUI();
  }
  function showEnding() {
    if (!journey.finished) return;
    document.querySelector("#route-map").close();
    document.querySelector("#ending-mistakes").textContent = journey.mistakes;
    document.querySelector("#ending").showModal();
    keys.clear();
    pendingInteraction = null;
    Object.assign(target, { x: player.position.x, z: player.position.z });
  }
  function audioUI() {
    const button = document.querySelector("#sound");
    button.setAttribute("aria-pressed", String(musicEnabled));
    button.setAttribute(
      "aria-label",
      musicEnabled ? "关闭背景音乐" : "开启背景音乐",
    );
    document.querySelector("#music-volume").value = String(
      Math.round(musicVolume * 100),
    );
  }
  async function begin() {
    playing = true;
    document.body.classList.add("playing");
    document.querySelector("#intro").close();
    try {
      await music.start();
    } catch {
      toast("点击音乐按钮即可开启背景音乐。");
    }
    music.setEnabled(musicEnabled);
    persist();
    renderUI();
    audioUI();
    canvas.focus({ preventScroll: true });
    toast(
      journey.districts[journey.current].restored
        ? REGIONS[journey.current].restored
        : REGIONS[journey.current].story,
      false,
      6500,
    );
  }
  document.querySelector("#begin-game").addEventListener("click", begin);
  document
    .querySelector("#new-game")
    .addEventListener("click", () =>
      document.querySelector("#restart-dialog").showModal(),
    );
  document
    .querySelector("#cancel-restart")
    .addEventListener("click", () =>
      document.querySelector("#restart-dialog").close(),
    );
  document
    .querySelector("#confirm-restart")
    .addEventListener("click", async () => {
      try {
        await music.start();
      } catch {}
      document.querySelector("#restart-dialog").close();
      journey = newJourney();
      await loadRegion(0);
      begin();
    });
  document.querySelector("#open-map").addEventListener("click", () => {
    renderUI();
    document.querySelector("#route-map").showModal();
    keys.clear();
    pendingInteraction = null;
    Object.assign(target, { x: player.position.x, z: player.position.z });
  });
  document
    .querySelector("#close-map")
    .addEventListener("click", () =>
      document.querySelector("#route-map").close(),
    );
  document.querySelector("#route-cards").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-region]");
    if (!button || button.disabled) return;
    document.querySelector("#route-map").close();
    loadRegion(Number(button.dataset.region));
  });
  document.querySelector("#next-region").addEventListener("click", () => {
    if (journey.current === 5) showEnding();
    else selectInteraction(gameObjects.items.find((i) => i.kind === "exit"));
  });
  document.querySelector("#explore-world").addEventListener("click", () => {
    document.querySelector("#ending").close();
    renderUI();
    document.querySelector("#route-map").showModal();
  });
  document
    .querySelector("#intro")
    .addEventListener("cancel", (event) => event.preventDefault());
  function destination(x, z) {
    pendingInteraction = null;
    Object.assign(target, clampDestination(x, z));
    marker.position.set(target.x, 0.07, target.z);
    markerLife = 1;
    marker.visible = true;
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (
      event.button !== 0 ||
      !playing ||
      busy ||
      document.querySelector("dialog[open]")
    )
      return;
    canvas.focus({ preventScroll: true });
    down = { x: event.clientX, y: event.clientY, lastX: event.clientX };
    dragged = false;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!down) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5)
      dragged = true;
    if (dragged) {
      desiredYaw -= (event.clientX - down.lastX) * 0.006;
      canvas.classList.add("dragging");
    }
    down.lastX = event.clientX;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!down) return;
    if (!dragged) {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const objectHit = raycaster
        .intersectObjects(gameObjects.pickables, false)
        .find((h) => h.object.visible && h.object.userData.gameItem?.group.visible);
      if (objectHit) selectInteraction(objectHit.object.userData.gameItem);
      else if (raycaster.ray.intersectPlane(groundPlane, hit))
        destination(hit.x, hit.z);
    }
    down = null;
    canvas.classList.remove("dragging");
  });
  canvas.addEventListener("pointercancel", () => {
    down = null;
    canvas.classList.remove("dragging");
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      desiredHeight = THREE.MathUtils.clamp(
        desiredHeight * Math.exp(event.deltaY * 0.001),
        18,
        maxHeight(),
      );
    },
    { passive: false },
  );
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key.toLowerCase() === "m" && !event.repeat) {
      document.querySelector("#sound").click();
      return;
    }
    if (
      event.key === "Tab" &&
      playing &&
      !document.querySelector("dialog[open]")
    ) {
      event.preventDefault();
      document.querySelector("#open-map").click();
      return;
    }
    if (!playing || busy || document.querySelector("dialog[open]")) return;
    if (event.key.toLowerCase() === "e" && !event.repeat) {
      const nearby = gameObjects.items
        .filter((i) => i.group.visible)
        .map((i) => ({
          item: i,
          d: Math.hypot(i.x - player.position.x, i.z - player.position.z),
        }))
        .sort((a, b) => a.d - b.d)[0];
      if (nearby && nearby.d < 2) interact(nearby.item);
      else toast("走近动力组件或控制器，再按 E 互动。");
      return;
    }
    if (event.target instanceof HTMLButtonElement) return;
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "+",
        "-",
        "=",
        "a",
        "d",
        "A",
        "D",
      ].includes(event.key)
    ) {
      event.preventDefault();
      keys.add(event.key.toLowerCase());
    }
    if (event.key.toLowerCase() === "r") home();
    if (event.key.toLowerCase() === "f") toggleFullscreen();
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => {
    keys.clear();
    down = null;
    canvas.classList.remove("dragging");
  });
  document.querySelector("#reset").addEventListener("click", home);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.querySelector("#experience").requestFullscreen();
    } catch {
      document.querySelector("#fullscreen").title = "当前浏览器不支持全屏";
    }
  }
  document
    .querySelector("#fullscreen")
    .addEventListener("click", toggleFullscreen);
  document.querySelector("#sound").addEventListener("click", async () => {
    musicEnabled = !musicEnabled;
    music.setEnabled(musicEnabled);
    if (musicEnabled && playing) await music.start();
    saveAudio();
    audioUI();
  });
  document.querySelector("#music-volume").addEventListener("input", (event) => {
    musicVolume = Number(event.target.value) / 100;
    music.setVolume(musicVolume);
    saveAudio();
  });
  document.addEventListener("visibilitychange", () => {
    keys.clear();
  });
  function resize(reframe = true) {
    const w = innerWidth,
      h = innerHeight;
    if (reframe && w / h < 1.2)
      desiredHeight = Math.max(desiredHeight, homeHeight());
    renderer.setSize(w, h);
    composer.setSize(w, h);
    surfaces.resize(w, h);
    camera.left = (-viewHeight * w) / h / 2;
    camera.right = -camera.left;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    atmosphere?.resize(h * renderer.getPixelRatio(), viewHeight);
  }
  addEventListener("resize", resize);
  resize();
  await loadRegion(journey.current, false);
  audioUI();
  const hasProgress = journey.districts.some((d) => d.collected.length > 0);
  document.querySelector("#begin-game").innerHTML = hasProgress
    ? `继续旅程 · ${REGIONS[journey.current].name} <span>→</span>`
    : "开始旅程 <span>→</span>";
  document.querySelector("#new-game").hidden = !hasProgress;
  document.querySelector("#intro").showModal();

  const frameTimes = [];
  let last = performance.now(),
    sampleTime = last,
    sampleFrames = 0;
  let currentFPS = 0,
    quality = renderer.getPixelRatio(),
    slowSamples = 0;
  // Read-only diagnostics for reproducible interaction and performance verification.
  window.__brasshaven = {
    state: () => ({
      position: player.position.toArray(),
      target: { ...target },
      camera: camera.position.toArray(),
      yaw,
      desiredYaw,
      viewHeight,
      desiredHeight,
      follow: follow.toArray(),
      fps: currentFPS,
      pixelRatio: renderer.getPixelRatio(),
      antialiasSamples: composer.renderTarget1.samples,
      reflectionSamples: surfaces.reflection.samples,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      frameTimes: frameTimes.slice(),
      ready: true,
      playing,
      busy,
      journey: JSON.parse(JSON.stringify(journey)),
      music: music.getState(),
      gpuGeometries: renderer.info.memory.geometries,
    }),
    project: (x, y, z) => {
      const p = new THREE.Vector3(x, y, z).project(camera);
      return {
        x: ((p.x + 1) * innerWidth) / 2,
        y: ((1 - p.y) * innerHeight) / 2,
      };
    },
  };
  document.querySelector("#loading").classList.add("loaded");
  document.querySelector("#loading").setAttribute("aria-hidden", "true");
  function frame(now) {
    const rawDt = (now - last) / 1000;
    last = now;
    if (document.hidden) {
      requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(rawDt, 0.05);
    const interactive =
      playing && !busy && !document.querySelector("dialog[open]");
    elapsed += dt;
    renderer.info.reset();
    let dx = (keys.has("arrowright") ? 1 : 0) - (keys.has("arrowleft") ? 1 : 0),
      dz = (keys.has("arrowdown") ? 1 : 0) - (keys.has("arrowup") ? 1 : 0);
    if (interactive && (dx || dz)) {
      pendingInteraction = null;
      const inv = 1 / Math.hypot(dx, dz);
      dx *= inv;
      dz *= inv;
      const wx = Math.cos(yaw) * dx + Math.sin(yaw) * dz,
        wz = -Math.sin(yaw) * dx + Math.cos(yaw) * dz;
      Object.assign(
        target,
        clampDestination(
          player.position.x + wx * 2,
          player.position.z + wz * 2,
        ),
      );
      marker.visible = false;
    }
    if (keys.has("a")) desiredYaw += dt;
    if (keys.has("d")) desiredYaw -= dt;
    if (keys.has("+") || keys.has("="))
      desiredHeight = Math.max(18, desiredHeight - dt * 12);
    if (keys.has("-"))
      desiredHeight = Math.min(maxHeight(), desiredHeight + dt * 12);
    const moveX = target.x - player.position.x,
      moveZ = target.z - player.position.z;
    const step = interactive ? advance(player.position, target, 4.2, dt) : 0,
      moving = step > 0.0001;
    if (moving)
      player.rotation.y = dampAngle(
        player.rotation.y,
        Math.atan2(moveX, moveZ),
        10,
        dt,
      );
    walkPhase += step * 5.5;
    const stride = moving
      ? Math.sin(walkPhase) * 0.48
      : Math.sin(elapsed * 1.5) * 0.015;
    if (joints.LeftLeg) joints.LeftLeg.rotation.x = stride;
    if (joints.RightLeg) joints.RightLeg.rotation.x = -stride;
    if (joints.LeftArm) joints.LeftArm.rotation.x = -stride * 0.7;
    if (joints.RightArm) joints.RightArm.rotation.x = stride * 0.4;
    player.position.y =
      0.055 +
      (moving
        ? Math.abs(Math.sin(walkPhase)) * 0.045
        : Math.sin(elapsed * 2) * 0.009);
    contact.position.x = player.position.x;
    contact.position.z = player.position.z;
    if (
      interactive &&
      pendingInteraction &&
      Math.hypot(
        player.position.x - pendingInteraction.x,
        player.position.z - pendingInteraction.z,
      ) < 0.7
    ) {
      const item = pendingInteraction;
      pendingInteraction = null;
      interact(item);
    }
    markerLife = Math.max(0, markerLife - dt * 0.5);
    markerMat.opacity = markerLife * 0.8;
    marker.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.05);
    if (!markerLife) marker.visible = false;
    lookAt.set(
      (player.position.x - 2.8) * 0.55,
      6.4,
      (player.position.z - 6) * 0.35,
    );
    follow.lerp(lookAt, 1 - Math.exp(-1.8 * dt));
    yaw = THREE.MathUtils.damp(yaw, desiredYaw, 8, dt);
    viewHeight = THREE.MathUtils.damp(viewHeight, desiredHeight, 9, dt);
    camera.position.set(
      follow.x + Math.sin(yaw) * Math.cos(elevation) * radius,
      follow.y + Math.sin(elevation) * radius,
      follow.z + Math.cos(yaw) * Math.cos(elevation) * radius,
    );
    camera.lookAt(follow);
    camera.left = (-viewHeight * innerWidth) / innerHeight / 2;
    camera.right = -camera.left;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    world.update(elapsed, dt);
    surfaces.update(elapsed);
    atmosphere.update(elapsed);
    airship.update(elapsed);
    gameObjects.update(elapsed, dt, camera, interactive, player.position);
    for (let i = 0; i < pointLights.length; i++)
      pointLights[i].intensity =
        pointLights[i].userData.baseIntensity *
        (1 + Math.sin(elapsed * 3 + i) * 0.04);
    surfaces.reflect(camera, follow);
    composer.render();
    frameTimes.push(rawDt * 1000);
    if (frameTimes.length > 600) frameTimes.shift();
    sampleFrames++;
    if (now - sampleTime > 1000) {
      currentFPS = (sampleFrames * 1000) / (now - sampleTime);
      document.querySelector("#fps").textContent = Math.round(currentFPS);
      sampleFrames = 0;
      sampleTime = now;
      // Adjust resolution, never scene detail, when the device is persistently GPU-bound.
      if (elapsed > 5 && currentFPS < 53) slowSamples++;
      else slowSamples = 0;
      if (slowSamples >= 3 && quality > 0.8) {
        quality = Math.max(0.8, quality - 0.15);
        renderer.setPixelRatio(quality);
        composer.setPixelRatio(quality);
        resize(false);
        slowSamples = 0;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    showError("图形设备连接中断。请刷新页面，重新进入黄铜港。");
  });
}
start().catch((error) => {
  console.error(error);
  showError("场景暂时无法启动。请使用支持 WebGL 2 的浏览器，并开启硬件加速。");
});
