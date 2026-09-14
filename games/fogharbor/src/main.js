import { partitionStaticSurfaces } from "./spatial-mesh.js";
import { createSceneLOD, hasGeometryLODs } from "./model-lod.js";
import { createExpansionWorld } from "./expansion-world.js";
import { createTransit, TRANSIT_STOPS, TRANSIT_ROUTES } from "./transit.js";
import { createIndustrialCity } from "./industrial-city.js";
import { createExpansionLife } from "./expansion-life.js";
import { createExpansionEvents } from "./expansion-events.js";
import {
  EXPANSION_SCENES,
  EXPANSION_BUILDINGS,
  EXPANSION_DESTINATIONS,
  buildingPoint,
} from "./expansion-layout.js";
import { ROOM_NOTES, EXPANSION_SPEAKERS } from "./expansion-stories.js";
import "./style.css";
import { addPlayerVisibilityCue } from "./player-visibility.js";
import {
  createWorldLife,
  LIFE_OBSTACLES,
  LIFE_SPOTS,
  lifeScript,
} from "./world-life.js";
import { finishEnvironmentLighting } from "./environment-lighting.js";
import { createOverture } from "./overture.js";
import { loadSculptedWorkshop } from "./sculpted-workshop.js";
import { loadSculptedDistricts } from "./sculpted-districts.js";
import { loadSculptedTransport } from "./sculpted-transport.js";
import * as THREE from "three";
import { followSun } from "./render-stability.js";
import { cityMapMarkup, mapPoint } from "./city-map.js";
import { TERRACE_DESTINATIONS } from "./terrain.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { createDistricts } from "./districts.js";
import { createNeighborhood } from "./neighborhood.js";
import { createGround } from "./ground.js";
import { createAmbience } from "./ambience.js";
import { createSoundscape } from "./soundscape.js";
import {
  route,
  move,
  direction,
  heightAt,
  dampAngle,
  canWalk,
  districtAt,
} from "./movement.js";
import {
  SAVE_KEY,
  freshState,
  readState,
  applyEvent,
  phase,
  objective,
  SCRIPT,
  NAMES,
  validOrders,
  promiseScript,
  CITY_SCRIPT,
  PUMP_EVIDENCE,
} from "./narrative.js";

const $ = (selector) => document.querySelector(selector);
const PORTRAITS = {
  Nora: "./models/nora-portrait.png",
  Milo: "./models/milo-portrait.png",
  Molly: "./models/molly-portrait.png",
  Beck: "./models/beck-portrait.png",
};
const modelPreview = new URL(location.href).searchParams.has("model");
const layoutPreview =
  modelPreview && new URL(location.href).searchParams.has("overview");
const expansionReview =
  modelPreview &&
  EXPANSION_DESTINATIONS[new URL(location.href).searchParams.get("district")];
const overviewHeight = expansionReview ? 96 : 126;
const overturePreview = new URL(location.href).searchParams.has("overture");
const saveKey = modelPreview
  ? `${SAVE_KEY}-model`
  : overturePreview
    ? `${SAVE_KEY}-overture`
    : new URL(location.href).searchParams.get("slot") === "qa"
      ? `${SAVE_KEY}-qa`
      : SAVE_KEY;

async function start() {
  $(".city-map-drawing").innerHTML = cityMapMarkup();
  let state = freshState(),
    saved = true;
  try {
    state = readState(JSON.parse(localStorage.getItem(saveKey)));
  } catch {}
  if (overturePreview || modelPreview) state = freshState();
  let overture = null;
  const canvas = $("#scene"),
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
  let pixelRatio = Math.min(devicePixelRatio, 1.25);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ca9ae);
  scene.fog = new THREE.Fog(
    0x9ca9ae,
    layoutPreview ? 110 : 48,
    layoutPreview ? 230 : 88,
  );
  const sky = document.createElement("canvas");
  sky.width = 512;
  sky.height = 256;
  const skyContext = sky.getContext("2d"),
    gradient = skyContext.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#92baca");
  gradient.addColorStop(0.48, "#dde9e2");
  gradient.addColorStop(0.6, "#d8c8a3");
  gradient.addColorStop(1, "#6d7460");
  skyContext.fillStyle = gradient;
  skyContext.fillRect(0, 0, 512, 256);
  const sunGlow = skyContext.createRadialGradient(125, 72, 0, 125, 72, 34);
  sunGlow.addColorStop(0, "#fffbea");
  sunGlow.addColorStop(0.16, "#fff4ce");
  sunGlow.addColorStop(1, "#fff4ce00");
  skyContext.fillStyle = sunGlow;
  skyContext.fillRect(85, 32, 80, 80);
  // A linear HDR sky gives metal a bright sky band and dark ground to reflect.
  const skyPixels = skyContext.getImageData(0, 0, 512, 256).data,
    hdrPixels = new Float32Array(512 * 256 * 4),
    skyColor = new THREE.Color();
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4;
      skyColor
        .setRGB(
          skyPixels[i] / 255,
          skyPixels[i + 1] / 255,
          skyPixels[i + 2] / 255,
        )
        .convertSRGBToLinear();
      const light = y < 155 ? 2.2 : 0.28;
      const glow = 24 * Math.exp(-((x - 125) ** 2 / 260 + (y - 72) ** 2 / 140));
      hdrPixels[i] = skyColor.r * light + glow;
      hdrPixels[i + 1] = skyColor.g * light + glow * 0.89;
      hdrPixels[i + 2] = skyColor.b * light + glow * 0.67;
      hdrPixels[i + 3] = 1;
    }
  const skyTexture = new THREE.DataTexture(
    hdrPixels,
    512,
    256,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  skyTexture.needsUpdate = true;
  skyTexture.flipY = true;
  skyTexture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(skyTexture).texture;
  scene.environmentIntensity = 0.3;
  pmrem.dispose();
  skyTexture.dispose();
  scene.add(new THREE.HemisphereLight(0xc7d7e0, 0x746f65, 0.34));
  const sun = new THREE.DirectionalLight(0xffdcb0, 3.45);
  sun.position.set(-18, 28, 14);
  sun.target.position.set(0, 0, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(
    layoutPreview ? 4096 : 2048,
    layoutPreview ? 4096 : 2048,
  );
  Object.assign(sun.shadow.camera, {
    left: layoutPreview ? -68 : -25,
    right: layoutPreview ? 68 : 25,
    top: layoutPreview ? 68 : 25,
    bottom: layoutPreview ? -68 : -25,
    near: 0.1,
    far: layoutPreview ? 145 : 85,
  });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0001;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xc5d2dc, 0.24);
  fill.position.set(15, 20, 5);
  scene.add(fill);
  const districts = createDistricts(scene);
  // Model review can inspect a timetable keyframe; normal gameplay keeps the live clock.
  const previewRailTime =
    modelPreview && new URL(location.href).searchParams.has("railAt")
      ? Number(new URL(location.href).searchParams.get("railAt"))
      : NaN;
  const world = createNeighborhood(scene, {
      railPreviewTime: Number.isFinite(previewRailTime)
        ? Math.max(0, Math.min(600, previewRailTime))
        : null,
    }),
    ground = createGround(scene, renderer),
    ambience = createAmbience(scene);
  const obstacles = [
    ...world.obstacles,
    ...districts.obstacles,
    ...LIFE_OBSTACLES,
  ];
  for (const [p, intensity] of [
    [[-55, 3, -8], 20],
    [[-32, 2, -3], 6],
    [[-10.7, 2, 0], 5],
  ]) {
    const l = new THREE.PointLight(0xffbb66, intensity, 6, 2);
    l.position.fromArray(p);
    scene.add(l);
  }
  const [
    actorAsset,
    companionAsset,
    sculptedWorkshop,
    sculptedDistricts,
    sculptedTransport,
    lifeAsset,
  ] = await Promise.all([
    new GLTFLoader().loadAsync("./models/nora-v1.glb"),
    new GLTFLoader().loadAsync("./models/companions-v1.glb"),
    loadSculptedWorkshop(world),
    loadSculptedDistricts(world, districts),
    loadSculptedTransport(world, districts, {
      railPreviewTime: Number.isFinite(previewRailTime)
        ? Math.max(0, Math.min(600, previewRailTime))
        : null,
    }),
    new GLTFLoader().loadAsync("./models/life-props-v1.glb"),
  ]);
  const actors = {};
  for (const [name, position, yaw] of [
    ["Nora", [-6, 0, 3.4], 0.2],
    ["Milo", [-2.8, 0, 2.4], -0.8],
    ["Molly", [5.3, 0, 2.1], 0.1],
    ["Beck", [-49, 0, 0.6], 0.2],
  ]) {
    const source = (
      name === "Nora" ? actorAsset : companionAsset
    ).scene.getObjectByName(name);
    if (!source) throw Error(`Missing actor ${name}`);
    const actor = source.clone(true);
    actor.position.fromArray(position);
    actor.rotation.y = yaw;
    actor.scale.setScalar(1.18);
    actor.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    actors[name] = actor;
    scene.add(actor);
  }
  const playerCues = addPlayerVisibilityCue(actors.Nora);
  const industrialCity = createIndustrialCity(scene, sculptedTransport);
  obstacles.push(...industrialCity.obstacles);
  const life = createWorldLife(
    scene,
    lifeAsset.scene,
    companionAsset.scene,
    obstacles,
  );
  const [expansion, expansionLife] = await Promise.all([
    createExpansionWorld(scene, ground),
    createExpansionLife(
      scene,
      companionAsset.scene,
      obstacles,
      null,
      lifeAsset.scene,
    ),
  ]);
  const spatialChunks = partitionStaticSurfaces(scene, {
    exclude: mesh => hasGeometryLODs(mesh.geometry),
    // Reflection receivers must still be hidden while their own map is rendered.
    onChunk: mesh => { if (mesh.material === ground.floorMaterial) ground.registerFloor(mesh); },
  });
  const sceneLOD = createSceneLOD(scene, {
    enabled: new URL(location.href).searchParams.get("lod") !== "0",
  });
  const expansionEvents = createExpansionEvents(expansion.buildings);
  expansionEvents.bindWorkers(expansionLife.people);
  ambience.setWorkshopVents([
    ...sculptedWorkshop.vents,
    ...sculptedDistricts.vents,
    ...sculptedTransport.vents,
    ...expansion.vents,
    ...industrialCity.vents,
  ]);
  finishEnvironmentLighting(scene);
  const player = actors.Nora,
    actorJoints = {};
  for (const name of Object.keys(actors))
    actorJoints[name] = Object.fromEntries(
      ["Head", "LeftArm", "RightArm", "LeftLeg", "RightLeg"].map((part) => [
        part,
        actors[name].getObjectByName(`${name}_${part}`),
      ]),
    );
  if (canWalk(...state.position, obstacles))
    player.position.set(
      state.position[0],
      heightAt(...state.position),
      state.position[1],
    );
  const transit = createTransit(sculptedTransport, player);
  if (state.chapterComplete) {
    const start = { x: player.position.x + 1.2, z: player.position.z };
    if (canWalk(start.x, start.z, obstacles))
      actors.Milo.position.set(start.x, heightAt(start.x, start.z), start.z);
  }
  const camera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 320),
    elevation = Math.atan(1 / Math.sqrt(2)),
    radius = layoutPreview ? 112 : 49,
    homeYaw = Math.PI / 4;
  camera.layers.enable(1);
  const homeHeight = () =>
    Math.min(32, Math.max(24.5, (32.66 * innerHeight) / innerWidth));
  let yaw = homeYaw,
    desiredYaw = homeYaw,
    viewHeight = homeHeight(),
    desiredHeight = viewHeight,
    previousHomeHeight = viewHeight,
    reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("#reduced-motion").checked = reducedMotion;
  const focus = new THREE.Vector3(
      player.position.x + 6,
      2.3,
      player.position.z - 6.2,
    ),
    focusTarget = focus.clone();
  const composer = new EffectComposer(renderer);
  for (const buffer of [composer.renderTarget1, composer.renderTarget2]) {
    buffer.samples = Math.min(4, renderer.capabilities.maxSamples);
    buffer.depthTexture = new THREE.DepthTexture(buffer.width, buffer.height);
  }
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(
    scene,
    camera,
    innerWidth,
    innerHeight,
    undefined,
    { radius: 0.65, thickness: 1.3, distanceFallOff: 1, scale: 1 },
    { radius: 5, lumaPhi: 8, depthPhi: 1 },
  );
  ao.blendIntensity = 0.65;
  composer.addPass(ao);
  composer.addPass(
    new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      0.12,
      0.3,
      1.5,
    ),
  );
  composer.addPass(new OutputPass());
  const audio = createSoundscape();
  canvas.addEventListener(
    "pointerdown",
    () => {
      void audio.start();
    },
    { once: true },
  );
  let running = false,
    talking = false,
    speakerName = "Nora",
    time = 0,
    walkPhase = 0,
    path = [],
    pending = null,
    movementDistance = 0;
  const keys = new Set();
  const spots = [
    {
      id: "bench",
      name: "工作台",
      x: -6.3,
      z: 1,
      anchor: new THREE.Vector3(-5.3, 1.2, 0.3),
    },
    {
      id: "orders",
      name: "订单板",
      x: -10.2,
      z: 2.2,
      anchor: new THREE.Vector3(-10.2, 2.6, 1.1),
    },
    {
      id: "molly",
      name: "莫莉",
      x: 5.3,
      z: 3.5,
      anchor: new THREE.Vector3(5.3, 2.8, 2.1),
    },
    {
      id: "milo",
      name: "米洛",
      x: -2.8,
      z: 3.3,
      anchor: new THREE.Vector3(-2.8, 2.8, 2.4),
    },
    {
      id: "pump",
      name: "水闸传动",
      x: 10.2,
      z: 0.2,
      anchor: new THREE.Vector3(10.2, 2.8, -2.3),
    },
    {
      id: "laundry",
      name: "洗衣院",
      ...world.spots.laundry,
      anchor: new THREE.Vector3(-0.3, 2.4, -3),
    },
  ];
  spots.push(
    {
      id: "wharf",
      name: "第七码头",
      x: -30,
      z: 2,
      anchor: new THREE.Vector3(-30, 2.3, 1),
    },
    {
      id: "doorstep",
      name: "住户门前",
      x: -37,
      z: 1,
      anchor: new THREE.Vector3(-37, 2.1, -0.6),
    },
    {
      id: "beck",
      name: "贝克",
      x: -49,
      z: 1.5,
      anchor: new THREE.Vector3(-49, 2.8, 0.6),
    },
    {
      id: "engine",
      name: "泵站检查廊",
      x: -57,
      z: -8,
      anchor: new THREE.Vector3(-57, 2.8, -8),
    },
    {
      id: "outfall",
      name: "码头排水口",
      x: -59,
      z: 4,
      anchor: new THREE.Vector3(-59, 1.3, 5.3),
    },
  );
  spots.push(
    ...LIFE_SPOTS.map((spot) => ({
      ...spot,
      anchor: new THREE.Vector3(...spot.anchor),
    })),
  );
  for (const b of EXPANSION_BUILDINGS) {
    const point = buildingPoint(b, 0, 0);
    spots.push({
      id: `room_${b.id}`,
      name: b.primary ? EXPANSION_SPEAKERS[`Local_${b.sceneId}`].name : b.name,
      ...point,
      anchor: new THREE.Vector3(point.x, b.height + 1.5, point.z),
      building: b,
    });
  }
  spots.push(...TRANSIT_STOPS.map(s => ({ ...s, transitStop: true,
    anchor: new THREE.Vector3(s.x, s.height + 3, s.z),
  })));
  const guideGeometry = new THREE.RingGeometry(0.2, 0.26, 32),
    guideMaterial = new THREE.MeshBasicMaterial({
      color: 0xf1cb79,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
  const marker = new THREE.Mesh(guideGeometry, guideMaterial);
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);
  const trail = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.045, 6, 4),
    guideMaterial,
    80,
  );
  trail.count = 0;
  trail.frustumCulled = false;
  scene.add(trail);
  const trailPose = new THREE.Object3D();
  for (const spot of spots) {
    const b = document.createElement("button");
    b.className = "world-label";
    b.setAttribute("aria-label", `走近${spot.name}`);
    b.innerHTML = `${["molly", "milo", "beck"].includes(spot.id) ? "⋯" : "✧"}<small>${spot.name}</small>`;
    b.onclick = () => go(spot, spot);
    $("#world-labels").append(b);
    spot.button = b;
  }
  function activeModal() {
    return document.querySelector("dialog[open]");
  }
  function stop() {
    path = [];
    pending = null;
    keys.clear();
    marker.visible = false;
    trail.count = 0;
  }
  let noticeTimer;
  function notify(text) {
    $("#notice").textContent = text;
    $("#notice").hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => ($("#notice").hidden = true), 4200);
  }
  function updateUI() {
    const [title, copy, target, progress] = objective(state);
    $("#quest-title").textContent = title;
    $("#quest-copy").textContent = copy;
    $("#quest-track").style.setProperty(
      "--progress",
      `${(progress / 16) * 100}%`,
    );
    $("#guide-target").disabled = !target;
    world.setState(state);
    districts.setState(state);
    requestAnimationFrame(measureHUD);
    $("#save-status").textContent = saved
      ? "进度保存在当前浏览器"
      : "当前浏览器无法保存进度，请保持页面打开";
    spots.forEach((s) => s.button.classList.toggle("target", s.id === target));
  }
  function commit(event, payload) {
    if (!transit.locked) state.position = [player.position.x, player.position.z];
    state = applyEvent(state, event, payload);
    try {
      localStorage.setItem(saveKey, JSON.stringify(state));
      saved = true;
    } catch {
      saved = false;
    }
    updateUI();
  }
  function showTrail(points) {
    const samples = points.filter((_, i) => i % 3 === 0).slice(0, 80);
    trail.count = samples.length;
    samples.forEach((p, i) => {
      trailPose.position.set(p.x, heightAt(p.x, p.z) + 0.055, p.z);
      trailPose.updateMatrix();
      trail.setMatrixAt(i, trailPose.matrix);
    });
    trail.instanceMatrix.needsUpdate = true;
  }
  function go(point, spot = null) {
    if (!running || activeModal()) return;
    if (transit.locked) { notify("到站后从升降台下到街面，再继续步行。"); return; }
    transit.cancelWaiting();
    const result = route(player.position, point, obstacles);
    if (!result.length) {
      notify("沿石路与石桥走。目标附近的入口会留出通道。");
      return;
    }
    path = result;
    pending = spot;
    marker.position.set(point.x, heightAt(point.x, point.z) + 0.035, point.z);
    marker.visible = true;
    showTrail(result);
  }
  $("#guide-target").onclick = () => {
    const target = spots.find((s) => s.id === objective(state)[2]);
    if (target) go(target, target);
  };
  let labelExclusions = [];
  function measureHUD() {
    labelExclusions = ["#quest", ".chapter-hud", ".utilities"].map((selector) =>
      $(selector).getBoundingClientRect(),
    );
  }
  let lines = [],
    lineIndex = 0,
    finishDialogue = null,
    choices = [],
    currentScript = null,
    currentGesture = "",
    talkPartner = null;
  function converse(script, done = null, options = []) {
    stop();
    world.setWorkshopFocus(false);
    talking = true;
    const partnerKey = script.find((line) => line[0] !== "Nora")?.[0];
    const localSpeaker = EXPANSION_SPEAKERS[partnerKey];
    talkPartner =
      actors[partnerKey] ||
      (localSpeaker
        ? expansionLife.people.find(
            (person) => person.home.id === localSpeaker.sceneId && person.work,
          )?.model
        : null);
    currentScript = script;
    lines = script;
    lineIndex = 0;
    finishDialogue = done;
    choices = options;
    document.body.classList.add("talking");
    if (!$("#dialogue").open) $("#dialogue").showModal();
    renderLine();
  }
  function renderLine() {
    const [name, text] = lines[lineIndex];
    speakerName = name;
    const localSpeaker = EXPANSION_SPEAKERS[name];
    $("#speaker").textContent = localSpeaker
      ? `${localSpeaker.label} · ${localSpeaker.name}`
      : `${name.toUpperCase()} · ${NAMES[name]}`;
    $(".portrait-frame").hidden = !!localSpeaker;
    if (!localSpeaker) {
      $("#portrait").src = PORTRAITS[name];
      $("#portrait").alt = NAMES[name];
    }
    $("#line").textContent = text;
    $("#stage-direction").textContent = lines[lineIndex][2] || "";
    $("#stage-direction").hidden = !lines[lineIndex][2];
    currentGesture = lines[lineIndex][3] || "";
    if (currentScript === SCRIPT.delivery && lineIndex >= 9)
      world.setState({ ...state, delivered: true });
    $("#line-counter").textContent = `${lineIndex + 1} / ${lines.length}`;
    $("#dialogue-choices").replaceChildren();
    const last = lineIndex === lines.length - 1;
    $("#next-line").hidden = last && choices.length > 0;
    $("#skip-dialogue").hidden = choices.length > 0;
    if (last)
      for (const choice of choices) {
        const b = document.createElement("button");
        b.className = "choice-button";
        b.textContent = choice.label;
        b.onclick = () => {
          audio.cue("page");
          choice.action();
        };
        $("#dialogue-choices").append(b);
      }
    (last && choices.length
      ? $("#dialogue-choices button")
      : $("#next-line")
    ).focus({ preventScroll: true });
    audio.cue("page");
  }
  function endDialogue(apply = true) {
    const done = finishDialogue;
    finishDialogue = null;
    talking = false;
    talkPartner = null;
    currentGesture = "";
    document.body.classList.remove("talking");
    $("#dialogue").close();
    canvas.focus({ preventScroll: true });
    if (apply && done) done();
  }
  $("#next-line").onclick = () => {
    if (lineIndex < lines.length - 1) {
      lineIndex++;
      renderLine();
    } else endDialogue();
  };
  $("#skip-dialogue").onclick = () => endDialogue();
  $("#dialogue").addEventListener("cancel", (e) => e.preventDefault());
  function openModal(id) {
    stop();
    $("#notice").hidden = true;
    $("#" + id).showModal();
  }
  document
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => $("#" + b.dataset.close).close()));
  for (const id of [
    "inspection",
    "orders",
    "journal",
    "settings",
    "restart",
    "city-map",
    "pump-inspection",
  ])
    $("#" + id).addEventListener("close", () => {
      if (id === "inspection") {
        world.setWorkshopFocus(false);
        clearHighlight();
      }
      canvas.focus({ preventScroll: true });
    });
  const originalMaterials = new Map();
  function clearHighlight() {
    for (const [mesh, material] of originalMaterials) {
      mesh.material.dispose();
      mesh.material = material;
    }
    originalMaterials.clear();
  }
  function highlightPart(id) {
    clearHighlight();
    const part = world.kettleParts[id === "note" ? "body" : id];
    if (!part) return;
    part.traverse((o) => {
      if (!o.isMesh) return;
      originalMaterials.set(o, o.material);
      o.material = o.material.clone();
      o.material.emissive.set(0xb58c36);
      o.material.emissiveIntensity = 0.22;
    });
  }
  const evidence = {
    lid: "盖口干燥，没有水痕。这里不是漏水的地方。",
    spout: "壶嘴转动时，接缝处渗出水滴。密封圈的边缘已经磨薄。",
    note: "莫莉的留言：“烧水没事。一倒就滴，麻烦你看看。”",
  };
  function renderInspection() {
    const repairing = state.diagnosed;
    $("#inspect-title").textContent = repairing
      ? "更换密封圈"
      : "茶炉为什么漏水？";
    $("#inspect-description").textContent = repairing
      ? "停用、替换，然后试水。"
      : "委托单说：倒水的时候才会漏。";
    $(".evidence-buttons").hidden = repairing;
    $("#evidence-readout").hidden = repairing;
    $("#diagnosis").hidden = repairing || state.inspected.length < 3;
    $("#repair-controls").hidden = !repairing;
    document
      .querySelectorAll("[data-observe]")
      .forEach((b) =>
        b.classList.toggle("seen", state.inspected.includes(b.dataset.observe)),
      );
    const steps = ["停用茶炉", "替换密封圈", "试倒热水"];
    $("#repair-action").textContent = steps[state.repairStep] || "已完成";
    $("#repair-explanation").textContent =
      [
        "等炉体冷却，再拆开接缝。",
        "拆下旧圈，装入同型号的新圈。",
        "慢慢倾倒，确认接缝处保持干燥。",
      ][state.repairStep] || "";
    $(".repair-steps")
      .querySelectorAll("li")
      .forEach((li, i) => {
        li.classList.toggle("done", i < state.repairStep);
        li.classList.toggle("active", i === state.repairStep);
      });
  }
  document.querySelectorAll("[data-observe]").forEach(
    (b) =>
      (b.onclick = () => {
        commit("inspect", b.dataset.observe);
        highlightPart(b.dataset.observe);
        $("#evidence-readout").textContent = evidence[b.dataset.observe];
        document
          .querySelectorAll("[data-observe]")
          .forEach((x) => x.classList.toggle("selected", x === b));
        renderInspection();
        audio.cue("page");
      }),
  );
  document.querySelectorAll("[data-diagnosis]").forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.diagnosis !== "seal") {
          $("#diagnosis-feedback").textContent =
            "炉子仍能加热，平放也不漏。整台换新解释不了“倒水时才漏”，再看一下壶嘴接缝。";
          audio.cue("page");
          return;
        }
        commit("diagnose");
        clearHighlight();
        renderInspection();
        audio.cue("success");
      }),
  );
  let repairing = false;
  $("#repair-action").onclick = async () => {
    if (repairing) return;
    repairing = true;
    $("#repair-action").disabled = true;
    const step = state.repairStep;
    commit("repair", step);
    audio.cue("page");
    renderInspection();
    await new Promise((r) => setTimeout(r, step === 2 ? 1600 : 700));
    repairing = false;
    $("#repair-action").disabled = false;
    if (state.repairStep === 3) {
      $("#inspection").close();
      audio.cue("success");
      converse(SCRIPT.repaired);
    }
  };
  $("#confirm-orders").onclick = () => {
    const plan = {
      winch: $("#order-winch").value,
      clock: $("#order-clock").value,
    };
    if (!plan.winch || !plan.clock) {
      $("#orders-feedback").textContent = "两张旧单都需要一个明确答复。";
      return;
    }
    if (!validOrders(plan)) {
      $("#orders-feedback").textContent =
        "两张单都需要铜套，而架上只有一份。至少联系一家改期，或说明需要等材料。";
      return;
    }
    commit("orders", plan);
    $("#orders").close();
    converse(promiseScript(state.orders));
  };
  $("#file-letter").onclick = () => {
    commit("letter");
    $("#letter").close();
    converse(SCRIPT.closing, () => {
      commit("complete");
      audio.cue("success");
      notify("米洛收起邮袋。沿运河往西走，就是第七码头。");
    });
  };
  $("#replay-opening").onclick = () => {
    $("#settings").close();
    converse(SCRIPT.opening);
  };
  function journal() {
    const entries = [
      ["今天的委托", "莫莉的茶炉：烧水正常，倒水时沿壶嘴接缝渗漏。"],
    ];
    if (state.inspected.length)
      entries.push([
        "观察记录",
        state.inspected.map((x) => evidence[x]).join(" "),
      ]);
    if (state.repairStep === 3)
      entries.push(["维修结果", "已更换壶嘴密封圈，试水没有渗漏。"]);
    if (state.orders)
      entries.push([
        "交付承诺",
        `绞盘：${{ today: "今天开工", contact: "联系改期", materials: "说明缺料，等待补货" }[state.orders.winch]}；报时钟：${{ today: "今天开工", contact: "联系改期", materials: "说明缺料，等待补货" }[state.orders.clock]}。`,
      ]);
    if (state.delivered)
      entries.push([
        "送回汤铺",
        "莫莉用修好的茶炉接着忙碌，也给诺拉留了一碗汤。",
      ]);
    if (state.signals.length)
      entries.push([
        "共同异响",
        state.inferred
          ? "洗衣院与水闸在同一拍停顿，线索指向共享供给。"
          : "已检查：" +
            state.signals
              .map((x) => (x === "pump" ? "水闸传动" : "洗衣院"))
              .join("、") +
            "。",
      ]);
    if (state.letterRead)
      entries.push([
        "地图之外",
        "贝克寄来第七码头的维修单。米洛认识沿河的路，愿意带我去。",
      ]);
    if (state.wharfMet)
      entries.push([
        "第七码头",
        "地图没有画进来的一截河岸，住户仍在这里生活。",
      ]);
    if (state.doorstepSeen)
      entries.push([
        "住户门前",
        "水印到了第二级台阶。艾达垫起裁布台，借了邻居的地方做活。",
      ]);
    if (state.pumpEvidence.length)
      entries.push([
        "旧泵站",
        state.pumpEvidence.map((id) => PUMP_EVIDENCE[id]).join(" "),
      ]);
    if (state.pumpRestored)
      entries.push([
        "阀盖维修",
        "只隔离外侧支路，换下破损垫片，缓慢复汽。排水恢复，但旧管线仍需后续处理。",
      ]);
    if (state.homecoming)
      entries.push(["回到汤铺", "莫莉确认设备不再停顿。我把留着的碗洗了。"]);
    $("#journal-entries").replaceChildren(
      ...entries.map(([heading, text]) => {
        const s = document.createElement("section");
        s.className = "journal-entry";
        const h = document.createElement("h3"),
          p = document.createElement("p");
        h.textContent = heading;
        p.textContent = text;
        s.append(h, p);
        return s;
      }),
    );
    openModal("journal");
  }
  function interact(spot) {
    if (spot.transitStop) {
      stop();
      if (transit.request(spot.id)) notify("已经招呼过值班员。车辆靠稳后，升降台会带你上去。");
      return;
    }
    if (spot.building) {
      const b = spot.building;
      converse(
        b.primary ? expansionEvents.script(b.sceneId) : ROOM_NOTES[b.id],
      );
      return;
    }
    if (spot.id.startsWith("life_")) {
      converse(lifeScript(spot.id));
      return;
    }
    const p = phase(state);
    if (["wharf", "doorstep", "beck", "engine", "outfall"].includes(spot.id)) {
      interactCity(spot);
      return;
    }
    if (spot.id === "bench") {
      if (!state.started) {
        converse(SCRIPT.opening, () => commit("start"));
        return;
      }
      if (!state.walked) commit("walk");
      if (state.repairStep === 3) {
        converse(SCRIPT.noraIdle);
        return;
      }
      renderInspection();
      world.setWorkshopFocus(true);
      openModal("inspection");
    } else if (spot.id === "orders") {
      if (state.repairStep < 3) {
        converse([["Milo", "这两家也在等。我把单子留这儿，等你腾出手。"]]);
        return;
      }
      if (state.orders) {
        journal();
        return;
      }
      openModal("orders");
    } else if (spot.id === "molly") {
      if (p === "homecoming") {
        converse(CITY_SCRIPT.homecoming, () => commit("homecoming"));
        return;
      }
      if (p === "delivery") {
        converse(SCRIPT.delivery, () => {
          commit("deliver");
          audio.cue("success");
        });
      } else if (p === "infer") {
        converse(
          [
            ["Molly", "看出什么来了？"],
            ["Nora", "两边停得一样。我刚才等了好几回。"],
          ],
          null,
          [
            {
              label: "它们共用的供给支路",
              action: () => converse(SCRIPT.inferred, () => commit("infer")),
            },
            {
              label: "两台机器都要拆掉重修",
              action: () =>
                converse(
                  [
                    [
                      "Nora",
                      "不，洗衣院换过带子，还是一样……",
                      "她重新对着两处指针的记录看了一遍。",
                    ],
                  ],
                  null,
                  [{ label: "重新对照观察结果", action: () => interact(spot) }],
                ),
            },
          ],
        );
      } else
        converse(
          state.chapterComplete
            ? SCRIPT.mollyAfter
            : state.delivered
              ? SCRIPT.mollyIdle
              : [["Molly", "茶炉还放得下吗？我那边找了块新布，包在最外面了。"]],
        );
    } else if (spot.id === "milo") {
      if (p === "opening") converse(SCRIPT.opening, () => commit("start"));
      else if (p === "letter")
        converse(SCRIPT.letter, () => openModal("letter"));
      else if (p === "closing")
        converse(SCRIPT.closing, () => {
          commit("complete");
          notify("米洛收起邮袋。沿运河往西走，就是第七码头。");
        });
      else converse(state.chapterComplete ? SCRIPT.miloAfter : SCRIPT.miloIdle);
    } else if (spot.id === "pump" || spot.id === "laundry") {
      if (!state.delivered) {
        converse([
          ["Nora", "洗衣院今天开得早。", "绞盘转动着，晾衣绳上的布慢慢展开。"],
        ]);
        return;
      }
      const id = spot.id;
      converse(
        id === "pump"
          ? [
              [
                "Nora",
                "……不是卡住了。",
                "指针往回一跳。轮缘上那道白色记号，又停在了同一个位置。",
              ],
              [
                "Nora",
                "等一下。",
                "短促的撞击声从管道里传来，比轮子的停顿更早。",
              ],
            ]
          : [
              [
                "Nora",
                "带子没松。",
                "正要拧干的布缓缓垂了下来。供给指针也往下一沉。",
              ],
              ["Nora", "这里也有。", "诺拉抬起头，望向隔街的水闸。"],
            ],
        () => commit("signal", id),
      );
    }
  }
  function inspectPump() {
    const repaired = state.pumpDiagnosed;
    $("#pump-readout").hidden = repaired;
    $("#pump-evidence").hidden = repaired;
    $("#pump-diagnosis").hidden = repaired || state.pumpEvidence.length < 3;
    $("#pump-repair").hidden = !repaired;
    $("#pump-step").textContent =
      ["关闭外侧小阀", "更换阀盖垫片", "缓慢复汽"][state.pumpStep] ||
      "排水已恢复";
    $("#pump-step-copy").textContent =
      [
        "贝克守着内支路。只关外侧小阀，等表针回到零位。",
        "拆下旧垫片，清理阀盖接面，装上同型号的新片。",
        "一点点复汽，听轮轴转过两圈，确认接缝不再漏汽。",
      ][state.pumpStep] || "";
    document
      .querySelectorAll("[data-pump-observe]")
      .forEach((b) =>
        b.classList.toggle(
          "seen",
          state.pumpEvidence.includes(b.dataset.pumpObserve),
        ),
      );
    openModal("pump-inspection");
  }
  function interactCity(spot) {
    const p = phase(state);
    if (spot.id === "wharf") {
      if (p === "wharf") converse(CITY_SCRIPT.wharf, () => commit("wharf"));
      else
        converse([
          [
            "Nora",
            state.wharfMet
              ? "弯栏杆还在。顺着这里就能找到那几户人家。"
              : "第七码头。这里还有人住。",
          ],
        ]);
    } else if (spot.id === "doorstep") {
      if (p === "doorstep")
        converse(CITY_SCRIPT.doorstep, () => commit("doorstep"));
      else
        converse([
          [
            "Nora",
            state.pumpRestored
              ? "水印露出来了。台阶上还留着一层泥。"
              : "第二级台阶也是湿的。桌腿下面垫了砖。",
          ],
        ]);
    } else if (spot.id === "beck") {
      if (p === "beck") converse(CITY_SCRIPT.beck, () => commit("beck"));
      else if (p === "debrief")
        converse(CITY_SCRIPT.restored, () => commit("debrief"));
      else if (state.beckMet) converse(CITY_SCRIPT.beckIdle);
      else if (state.wharfMet)
        converse([
          [
            "Beck",
            "先看看门前的水位。那些住户每天踩着它进出，比表上的数记得清楚。",
          ],
        ]);
      else converse(CITY_SCRIPT.early);
    } else if (spot.id === "engine") {
      if (state.pumpRestored)
        converse([["Nora", "两圈都没停。新垫片边上也是干的。"]]);
      else if (state.beckMet) inspectPump();
      else converse([["Nora", "机器还在带负荷。先找看管的人问清楚。"]]);
    } else
      converse([
        [
          "Nora",
          state.pumpRestored
            ? "水流接上了。积在住户门前的水，会从这里排出去。"
            : "水流一阵一阵的，和那边的停顿一样。",
        ],
      ]);
  }
  document.querySelectorAll("[data-pump-observe]").forEach(
    (b) =>
      (b.onclick = () => {
        commit("pumpObserve", b.dataset.pumpObserve);
        $("#pump-readout").textContent = PUMP_EVIDENCE[b.dataset.pumpObserve];
        inspectPump();
        audio.cue("page");
      }),
  );
  $("#pump-correct").onclick = () => {
    commit("pumpDiagnose");
    inspectPump();
  };
  $("#pump-wrong").onclick = () => {
    $("#pump-readout").textContent =
      "贝克从门边提醒：“总阀还带着住户。看那道接缝，先把漏的地方找准。”";
  };
  let pumpBusy = false;
  $("#pump-step").onclick = async () => {
    if (pumpBusy) return;
    pumpBusy = true;
    const step = state.pumpStep;
    commit("pumpRepair", step);
    audio.cue("repair");
    $("#pump-step").disabled = true;
    await new Promise((resolve) =>
      setTimeout(resolve, step === 2 ? 1500 : 800),
    );
    pumpBusy = false;
    $("#pump-step").disabled = false;
    if (state.pumpRestored) {
      $("#pump-inspection").close();
      notify("排水声连了起来。到门口和贝克一起听一会儿。");
    } else if ($("#pump-inspection").open) inspectPump();
  };
  $("#map-button").onclick = () => openModal("city-map");
  $("#transport-map-button").onclick = () => openModal("city-map");
  for (const station of TRANSIT_STOPS) {
    const button = document.createElement("button");
    button.className = "choice-button transit-destination";
    button.dataset.walkTo = station.id;
    button.textContent = `${station.mode === "train" ? "铁路" : "飞艇"} · ${station.name}`;
    $(".transit-destinations").append(button);
  }
  $("#transit-action").onclick = () => {
    if (!running || activeModal()) return;
    const service = transit.state();
    if (service.passenger) transit.toggleExit();
    else if (service.waiting) transit.cancelWaiting();
    else {
      const nearest = TRANSIT_STOPS.find(s => Math.hypot(player.position.x-s.x, player.position.z-s.z)<1.8);
      if (nearest) interact(spots.find(s => s.id === nearest.id));
    }
    canvas.focus({ preventScroll: true });
  };
  let transitCopy = "", previousTransitStage = "";
  function updateTransitHUD(interactive) {
    const current = transit.state(), rider = current.passenger;
    const stage = rider?.stage ?? "walking";
    if (interactive && stage !== previousTransitStage) {
      if (stage === "boarding" || stage === "exiting") audio.cue("transit-bell");
      if (stage === "riding") audio.cue(rider.mode === "train" ? "steam-whistle" : "airship-horn");
      previousTransitStage = stage;
    }
    const station = TRANSIT_STOPS.find(s => s.id === current.waiting) ??
      TRANSIT_STOPS.find(s => Math.hypot(player.position.x-s.x,player.position.z-s.z)<2.3 && Math.abs(player.position.y-s.height)<0.4);
    const panel = $("#transit-panel");
    panel.hidden = !interactive || (!rider && !station);
    if (panel.hidden) return;
    const mode = rider?.mode ?? station.mode, service = current.services[mode];
    let title, copy, action, disabled = false;
    if (rider) {
      title = rider.stage === "boarding" ? "升降台正在上行" : rider.stage === "exiting" ? "到站 · 回到街面" : `驶向${service.to.name}`;
      copy = rider.stage === "boarding" ? "铜铃响了两声。扶索绷紧，踏板缓缓离开石路。"
        : rider.stage === "exiting" ? "等踏板与石路齐平，再松开扶手。"
        : mode === "train" ? service.progress < 0.5
          ? "车身轻轻一晃。下面有人把饭盒举过头顶，朝末节车厢挥手。"
          : "这段高架原本只运煤。工人们在末节焊上踏板，后来才有了客车。"
        : service.progress < 0.5
          ? "河上的绳索松开了。烟囱慢慢降到脚下，工坊的声音却还追得上来。"
          : "船壳上每一块不同颜色的补丁，都出自山上那间学徒工坊。";
      action = rider.exitAtNext ? "到站自动下车 · 点击留乘" : "继续留乘 · 点击预约下车";
      disabled = rider.stage !== "riding";
    } else {
      const here = service.docked && service.from.id === station.id;
      title = station.name;
      const seconds = here ? service.remaining : service.from.id === station.id
        ? service.remaining + TRANSIT_ROUTES[mode].duration + TRANSIT_ROUTES[mode].dwell
        : service.docked ? service.remaining + TRANSIT_ROUTES[mode].duration : service.remaining;
      copy = here ? `车辆已靠稳 · ${Math.ceil(seconds)} 秒后发车。` : `下一班约 ${Math.ceil(seconds)} 秒后抵达。可在此候车，也可继续步行。`;
      action = current.waiting ? "取消候车" : here ? "搭乘" : "在此候车";
      disabled = Math.hypot(player.position.x-station.x,player.position.z-station.z)>1.8;
    }
    const next = [mode,title,copy,action,disabled].join("|");
    if (next === transitCopy) return;
    transitCopy = next;
    $("#transit-line").textContent = TRANSIT_ROUTES[mode].english;
    $("#transit-title").textContent = title;
    $("#transit-copy").textContent = copy;
    $("#transit-action").textContent = action;
    $("#transit-action").disabled = disabled;
  }
  for (const area of EXPANSION_SCENES) {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.dataset.walkTo = area.id;
    button.textContent = area.name;
    $(".map-destinations").append(button);
  }
  document.querySelectorAll("[data-walk-to]").forEach(
    (b) =>
      (b.onclick = () => {
        const spot = spots.find((s) => s.id === b.dataset.walkTo);
        $("#city-map").close();
        if (spot) go(spot, spot.transitStop ? null : spot);
        else
          go(
            EXPANSION_DESTINATIONS[b.dataset.walkTo] ??
              TERRACE_DESTINATIONS[b.dataset.walkTo] ?? { x: -34, z: 19 },
          );
      }),
  );
  let companionPath = [],
    companionPlanAt = 0,
    lastPositionSave = 0,
    lastDistrict = "",
    captionTimer;
  const districtVisits = new Set();
  function updateCity(t, dt, interactive) {
    const area = districtAt(player.position.x, player.position.z);
    if (lastDistrict !== area.id) {
      lastDistrict = area.id;
      $("#district-title").textContent = area.english;
      if (running && state.chapterComplete && !districtVisits.has(area.id)) {
        const copy = {
          wharf: "米洛：沿着管子走。前面那排晒衣服的房子，就是旧码头。",
          pumpworks: "米洛：就是这儿。贝克总怕听不见泵的动静，门从来不关严。",
          riverside: "米洛：从这边回去也行。莫莉一抬头就能看见我们。",
          saltlane: state.pumpRestored
            ? "隔着运河，盐锈巷的绞盘一直没有停。"
            : "工坊的暖灯还亮着。",
        }[area.id];
        $("#travel-caption").textContent = copy;
        $("#travel-caption").hidden = false;
        clearTimeout(captionTimer);
        captionTimer = setTimeout(
          () => ($("#travel-caption").hidden = true),
          7000,
        );
        districtVisits.add(area.id);
      }
    }
    $("#map-player").setAttribute(
      "cx",
      String(mapPoint(player.position.x, player.position.z)[0]),
    );
    $("#map-player").setAttribute(
      "cy",
      String(mapPoint(player.position.x, player.position.z)[1]),
    );
    const milo = actors.Milo;
    let companionWalking = false;
    if (state.chapterComplete && interactive && !transit.locked) {
      const distance = milo.position.distanceTo(player.position);
      if (t > companionPlanAt) {
        companionPlanAt = t + 1.1;
        companionPath =
          distance > 2.5
            ? route(
                milo.position,
                { x: player.position.x, z: player.position.z },
                obstacles,
              )
            : [];
      }
      if (distance > 1.8 && companionPath.length) {
        const goal = companionPath[0],
          dx = goal.x - milo.position.x,
          dz = goal.z - milo.position.z,
          l = Math.hypot(dx, dz);
        if (l < 0.14) companionPath.shift();
        else {
          move(
            milo.position,
            { x: dx / l, z: dz / l },
            Math.min(l, 3.7 * dt),
            obstacles,
          );
          companionWalking = true;
          milo.rotation.y = dampAngle(
            milo.rotation.y,
            Math.atan2(dx, dz),
            8,
            dt,
          );
          for (const [part, sign] of [
            ["LeftLeg", 1],
            ["RightLeg", -1],
            ["LeftArm", -0.6],
            ["RightArm", 0.6],
          ])
            if (actorJoints.Milo[part])
              actorJoints.Milo[part].rotation.x = Math.sin(t * 9) * 0.36 * sign;
        }
      }
      milo.position.y = heightAt(milo.position.x, milo.position.z);
    }
    if (!companionWalking)
      for (const part of ["LeftLeg", "RightLeg", "LeftArm"]) {
        const joint = actorJoints.Milo[part];
        if (joint)
          joint.rotation.x = THREE.MathUtils.damp(joint.rotation.x, 0, 8, dt);
      }
    const miloSpot = spots.find((s) => s.id === "milo");
    miloSpot.x = milo.position.x;
    miloSpot.z = milo.position.z;
    miloSpot.anchor.set(
      milo.position.x,
      milo.position.y + 2.8,
      milo.position.z,
    );
    if (running && !transit.locked && t - lastPositionSave > 3) {
      lastPositionSave = t;
      state.position = [player.position.x, player.position.z];
      try {
        localStorage.setItem(saveKey, JSON.stringify(state));
      } catch {
        saved = false;
      }
    }
  }
  $("#journal-button").onclick = journal;
  $("#settings-button").onclick = () => openModal("settings");
  $("#sound-enabled").onchange = (e) => {
    audio.setEnabled(e.target.checked);
    if (e.target.checked) void audio.start();
  };
  $("#volume").oninput = (e) => audio.setVolume(Number(e.target.value) / 100);
  $("#lod-enabled").checked = sceneLOD.state().enabled;
  $("#lod-enabled").onchange = (e) => sceneLOD.setEnabled(e.target.checked);
  $("#reduced-motion").onchange = (e) => (reducedMotion = e.target.checked);
  function resetCamera() {
    desiredYaw = homeYaw;
    desiredHeight = homeHeight();
  }
  $("#reset-camera").onclick = resetCamera;
  $("#restart-button").onclick = () => {
    $("#settings").close();
    openModal("restart");
  };
  $("#confirm-restart").onclick = () => {
    transit.reset();
    state = freshState();
    try {
      localStorage.setItem(saveKey, JSON.stringify(state));
    } catch {}
    $("#restart").close();
    player.position.set(-6, 0, 3.4);
    actors.Milo.position.set(-2.8, 0, 2.4);
    companionPath = [];
    resetCamera();
    updateUI();
    converse(SCRIPT.opening, () => commit("start"));
  };
  $("#begin").textContent = state.started ? "继续沿河的路 →" : "开始营业 →";
  if (state.started)
    $("#title-screen .opening-copy").textContent =
      `你停在${districtAt(player.position.x, player.position.z).name}。${objective(state)[1]}`;
  $("#begin").onclick = () => {
    running = true;
    $("#title-screen").close();
    void audio.start();
    if (!state.started) converse(SCRIPT.opening, () => commit("start"));
    else {
      canvas.focus({ preventScroll: true });
      notify("接着上次的记录继续。当前目标就在左上角。");
    }
  };
  $("#title-screen").addEventListener("cancel", (e) => {
    if (!running) e.preventDefault();
  });
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    hit = new THREE.Vector3(),
    groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let down = null,
    dragged = false;
  canvas.addEventListener("pointerdown", (e) => {
    if (!running || activeModal()) return;
    canvas.focus({ preventScroll: true });
    down = { x: e.clientX, y: e.clientY, last: e.clientX };
    dragged = false;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!down) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) dragged = true;
    if (dragged) {
      desiredYaw -= (e.clientX - down.last) * 0.005;
      canvas.classList.add("dragging");
    }
    down.last = e.clientX;
  });
  function release() {
    down = null;
    canvas.classList.remove("dragging");
  }
  canvas.addEventListener("pointerup", (e) => {
    if (!down) return;
    if (!dragged && !transit.locked) {
      const r = canvas.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const actorHit = raycaster.intersectObjects(
        [actors.Milo, actors.Molly, actors.Beck],
        true,
      )[0];
      if (actorHit) {
        let o = actorHit.object;
        while (
          o.parent &&
          o !== actors.Milo &&
          o !== actors.Molly &&
          o !== actors.Beck
        )
          o = o.parent;
        const spot = spots.find(
          (s) =>
            s.id ===
            (o === actors.Milo ? "milo" : o === actors.Beck ? "beck" : "molly"),
        );
        go(spot, spot);
      } else {
        const terrainHit = raycaster.intersectObjects(
          [sculptedDistricts.terrain, expansion.floorRoot],
          true,
        )[0];
        if (terrainHit) {
          if (
            terrainHit.object.userData.walkSurface &&
            terrainHit.face.normal.y > 0.5
          )
            go({ x: terrainHit.point.x, z: terrainHit.point.z });
        } else if (raycaster.ray.intersectPlane(groundPlane, hit)) {
          go({ x: hit.x, z: hit.z });
        }
      }
    }
    release();
  });
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", release);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (!running || activeModal()) return;
      desiredHeight = THREE.MathUtils.clamp(
        desiredHeight * Math.exp(e.deltaY * 0.001),
        10,
        42,
      );
    },
    { passive: false },
  );
  addEventListener("keydown", (e) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    )
      return;
    const key = e.key.toLowerCase();
    if (!running || activeModal()) return;
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(key)
    ) {
      e.preventDefault();
      if (transit.locked) return;
      keys.add(key);
      path = [];
      pending = null;
      trail.count = 0;
    }
    if (e.repeat) return;
    if (key === "j") journal();
    if (key === "m") openModal("city-map");
    if (key === "t") openModal("city-map");
    if (key === "r") resetCamera();
    if (key === "e") {
      if (transit.locked) { transit.toggleExit(); return; }
      const nearest = spots
        .map((s) => ({
          spot: s,
          d: Math.hypot(player.position.x - s.x, player.position.z - s.z),
        }))
        .sort((a, b) => a.d - b.d)[0];
      if (nearest.d < 1.8) interact(nearest.spot);
      else $("#guide-target").click();
    }
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => {
    keys.clear();
    release();
  });
  document.addEventListener("visibilitychange", () => {
    keys.clear();
    if (document.hidden) audio.suspend();
    else audio.resume();
  });
  function resize() {
    measureHUD();
    const nextHomeHeight = homeHeight();
    desiredHeight = THREE.MathUtils.clamp(
      (desiredHeight * nextHomeHeight) / previousHomeHeight,
      10,
      42,
    );
    previousHomeHeight = nextHomeHeight;
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    ground.resize(innerWidth, innerHeight);
    overture?.resize();
  }
  addEventListener("resize", resize);
  resize();
  updateUI();
  $("#loading").classList.add("loaded");
  $("#loading").setAttribute("aria-hidden", "true");
  if (modelPreview) {
    running = true;
    player.position.set(-6.3, 0, 1.6);
    const reviewDistrict =
      EXPANSION_DESTINATIONS[
        new URL(location.href).searchParams.get("district")
      ];
    if (reviewDistrict)
      player.position.set(
        reviewDistrict.x,
        heightAt(reviewDistrict.x, reviewDistrict.z),
        reviewDistrict.z,
      );
    state = applyEvent(applyEvent(state, "start"), "walk");
    desiredHeight = viewHeight = layoutPreview ? overviewHeight : 20;
    if (layoutPreview) focus.set(-18, 2, expansionReview ? 92 : 42);
    else if (expansionReview)
      focus.set(
        player.position.x + 2.8,
        player.position.y + 2.3,
        player.position.z - 3.8,
      );
    else focus.set(-4.2, 2.1, -1.1);
    updateUI();
  } else if (overturePreview) {
    overture = await createOverture({
      scene,
      camera,
      focus,
      actors,
      joints: actorJoints,
      world,
      obstacles,
      reducedMotion,
      onFinish() {
        running = true;
        commit("start");
        commit("walk");
        void audio.start();
        canvas.focus({ preventScroll: true });
        notify("茶炉就在面前。按 E 或点击工作台，看看哪里出了问题。");
      },
    });
  } else $("#title-screen").showModal();
  let last = performance.now(),
    sampleTime = last,
    frames = 0,
    fps = 0,
    slow = 0;
  const frameTimes = [];
  function frame(now) {
    const raw = (now - last) / 1000;
    last = now;
    if (document.hidden) {
      requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(raw, 0.05);
    time += dt;
    renderer.info.reset();
    const interactive = running && !activeModal(),
      oldX = player.position.x,
      oldZ = player.position.z;
    for (const cue of playerCues) cue.visible = interactive;
    const wasRiding = transit.locked;
    transit.update(dt, interactive);
    if (wasRiding && !transit.locked) {
      stop();
      lastPositionSave = -Infinity;
    }
    const airborne = transit.state().passenger?.mode === "airship";
    if (!layoutPreview) {
      const altitude = airborne ? THREE.MathUtils.clamp((player.position.y - 8) / 18, 0, 1) : 0;
      scene.fog.near = THREE.MathUtils.damp(scene.fog.near, 48 + altitude * 35, 2, dt);
      scene.fog.far = THREE.MathUtils.damp(scene.fog.far, 88 + altitude * 72, 2, dt);
    }
    if (interactive && !transit.locked && !wasRiding) {
      const d = direction(keys, yaw);
      if (d.x || d.z) move(player.position, d, 3.2 * dt, obstacles);
      else if (path.length) {
        let budget = 3.2 * dt;
        while (path.length && budget > 0) {
          const goal = path[0],
            dx = goal.x - player.position.x,
            dz = goal.z - player.position.z,
            length = Math.hypot(dx, dz);
          if (length < 0.001) {
            path.shift();
            continue;
          }
          const distance = Math.min(length, budget);
          move(
            player.position,
            { x: dx / length, z: dz / length },
            distance,
            obstacles,
          );
          budget -= distance;
          if (distance === length) path.shift();
          else break;
        }
      }
      if (pending && !path.length) {
        const spot = pending;
        pending = null;
        if (
          Math.hypot(player.position.x - spot.x, player.position.z - spot.z) <
          0.7
        )
          interact(spot);
      }
    }
    const step = transit.locked || wasRiding ? 0 : Math.hypot(player.position.x - oldX, player.position.z - oldZ);
    movementDistance += step;
    walkPhase += step * 6;
    const walking = step > 0.00001;
    if (talking && talkPartner) {
      const angle = Math.atan2(
        talkPartner.position.x - player.position.x,
        talkPartner.position.z - player.position.z,
      );
      player.rotation.y = dampAngle(player.rotation.y, angle, 5, dt);
      talkPartner.rotation.y = dampAngle(
        talkPartner.rotation.y,
        angle + Math.PI,
        5,
        dt,
      );
    }
    if (walking)
      player.rotation.y = dampAngle(
        player.rotation.y,
        Math.atan2(player.position.x - oldX, player.position.z - oldZ),
        11,
        dt,
      );
    if (
      phase(state) === "walk" &&
      movementDistance > 0.5 &&
      Math.hypot(player.position.x + 6.3, player.position.z - 1) < 1.3
    ) {
      commit("walk");
      if (!pending) notify("到工作台了。按 E 或点击标记，开始观察茶炉。");
    }
    const gait = walking
      ? Math.sin(walkPhase) * 0.26
      : Math.sin(time * 1.5) * 0.01;
    for (const [part, sign] of [
      ["LeftLeg", 1],
      ["RightLeg", -1],
      ["LeftArm", -0.6],
      ["RightArm", 0.6],
    ])
      if (actorJoints.Nora[part])
        actorJoints.Nora[part].rotation.x = gait * sign;
    if (!transit.locked && !wasRiding) player.position.y =
      heightAt(player.position.x, player.position.z) +
      (walking ? Math.abs(Math.sin(walkPhase)) * 0.025 : 0);
    for (const name of Object.keys(actors)) {
      const joints = actorJoints[name];
      if (joints.Head)
        joints.Head.rotation.x = THREE.MathUtils.damp(
          joints.Head.rotation.x,
          currentGesture === "nora_down" && name === "Nora" ? 0.13 : 0,
          5,
          dt,
        );
      if (joints.Head)
        joints.Head.rotation.z =
          talking && speakerName === name
            ? Math.sin(time * 2) * 0.025
            : Math.sin(time * 0.5) * 0.012;
      if (name !== "Nora" && joints.RightArm)
        joints.RightArm.rotation.x =
          talking && speakerName === name
            ? -0.25 + Math.sin(time * 2) * 0.08
            : state.delivered && name === "Molly"
              ? -0.65 + Math.sin(time * 1.6) * 0.12
              : 0.03 * Math.sin(time);
    }
    const inspectionOpen = $("#inspection").open;
    if (layoutPreview) {
      focusTarget.set(-18, 2, expansionReview ? 92 : 42);
    } else if ($("#pump-inspection").open) {
      focusTarget.set(-55, 2.3, -6);
    } else if (inspectionOpen) {
      focusTarget.set(-6.25, 1.5, -1.25);
    } else
      focusTarget.set(
        player.position.x + (talking ? 1.6 : 2.8),
        player.position.y + (airborne ? -1.5 : 2.3),
        player.position.z - (talking ? 2.6 : 3.8),
      );
    focus.lerp(focusTarget, 1 - Math.exp(-(reducedMotion ? 8 : 1.7) * dt));
    yaw = dampAngle(yaw, desiredYaw, 8, dt);
    const zoom = layoutPreview
      ? overviewHeight
      : $("#pump-inspection").open
        ? 18
        : inspectionOpen
          ? 10
          : talking
            ? Math.max(23, desiredHeight * 0.94)
            : desiredHeight + (airborne ? 7 : 0);
    viewHeight = THREE.MathUtils.damp(
      viewHeight,
      zoom,
      reducedMotion ? 12 : 4,
      dt,
    );
    camera.position.set(
      focus.x + Math.sin(yaw) * Math.cos(elevation) * radius,
      focus.y + Math.sin(elevation) * radius,
      focus.z + Math.cos(yaw) * Math.cos(elevation) * radius,
    );
    camera.lookAt(focus);
    camera.left = (-viewHeight * innerWidth) / innerHeight / 2;
    camera.right = -camera.left;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    marker.visible = path.length > 0;
    markerMaterialPulse();
    world.update(time, dt, state);
    if (Number.isFinite(previewRailTime)) sculptedTransport.train.update(previewRailTime);
    industrialCity.update(time, dt, transit, player.position);
    sculptedDistricts.update(time);
    life.update(time, dt, player.position, interactive);
    expansion.update(dt, player.position, camera);
    expansionLife.update(time, dt, player.position, interactive);
    expansionEvents.update(
      running ? dt : 0,
      player.position,
      expansion.state().interior,
    );
    sculptedWorkshop.update(time, dt, state);
    districts.update(time, dt, {
      ...state,
      playerX: player.position.x,
      playerZ: player.position.z,
    });
    updateCity(time, dt, interactive);
    ground.update(time);
    ambience.update(time, innerHeight * pixelRatio, viewHeight);
    if (!overture?.active)
      audio.update(time, state, {
        scene: districtAt(player.position.x, player.position.z).id,
        interior: expansion.state().interior,
        traffic: expansionLife.vehicles.some(
          (v) =>
            v.speed > 0.1 && v.group.position.distanceTo(player.position) < 12,
        ),
      });
    // Distant overview shadows update at half rate; the playable camera stays full rate.
    if (layoutPreview) {
      sun.shadow.autoUpdate = false;
      sun.shadow.needsUpdate = frames % 2 === 0;
    }
    sun.intensity = 3.45 + Math.sin(time * 0.045) * 0.08;
    followSun(sun, focus);
    overture?.update(dt, time);
    let nearest = null,
      distance = Infinity;
    for (const spot of spots) {
      const p = spot.anchor.clone().project(camera),
        d = Math.hypot(player.position.x - spot.x, player.position.z - spot.z);
      const target = spot.id === objective(state)[2];
      const screenX = ((p.x + 1) * innerWidth) / 2,
        screenY = ((1 - p.y) * innerHeight) / 2;
      const covered = labelExclusions.some(
        (r) =>
          screenX > r.left - 18 &&
          screenX < r.right + 18 &&
          screenY > r.top - 18 &&
          screenY < r.bottom + 18,
      );
      spot.button.hidden =
        covered ||
        !running ||
        !!activeModal() ||
        Math.abs(p.x) > 0.97 ||
        Math.abs(p.y) > 0.94 ||
        transit.locked || (!target && d > (spot.transitStop ? 13 : 4));
      spot.button.style.left = `${((p.x + 1) * innerWidth) / 2}px`;
      spot.button.style.top = `${((1 - p.y) * innerHeight) / 2}px`;
      spot.button.classList.toggle("near", d < 1.8);
      if (d < distance) {
        distance = d;
        nearest = spot;
      }
    }
    $("#arrival-hint").hidden = !interactive || transit.locked || distance >= 1.8;
    if (interactive && distance < 1.8)
      $("#arrival-hint span").textContent =
        `${nearest.name} · ${nearest.transitStop ? "候车 / 搭乘" : ["milo", "molly", "beck"].includes(nearest.id) || nearest.building?.primary ? "交谈" : "查看"}`;
    updateTransitHUD(interactive);
    // Select once using the main camera; reflection passes reuse the same levels.
    sceneLOD.update(camera, player.position);
    ground.reflect(camera, focus);
    // Reconstruct AO normals from the main pass depth instead of drawing
    // the entire town a second time just to produce its geometry buffer.
    ao.setGBuffer(composer.readBuffer.depthTexture);
    composer.render();
    if (running) {
      frameTimes.push(raw * 1000);
      if (frameTimes.length > 12000) frameTimes.shift();
    }
    frames++;
    if (now - sampleTime > 1000) {
      fps = (frames * 1000) / (now - sampleTime);
      $("#fps").textContent = Math.round(fps);
      canvas.dataset.fps = fps.toFixed(1);
      canvas.dataset.phase = phase(state);
      canvas.dataset.position = `${player.position.x.toFixed(2)},${player.position.z.toFixed(2)}`;
      frames = 0;
      sampleTime = now;
      if (time > 8 && fps < 57) slow++;
      else slow = 0;
      if (slow >= 3 && pixelRatio > 0.75) {
        pixelRatio = Math.max(0.75, pixelRatio - 0.125);
        renderer.setPixelRatio(pixelRatio);
        composer.setPixelRatio(pixelRatio);
        resize();
        slow = 0;
      }
    }
    requestAnimationFrame(frame);
  }
  function markerMaterialPulse() {
    guideMaterial.opacity = 0.6 + Math.sin(time * 3) * 0.18;
  }
  window.__fogharbor = {
    state: () => ({
      story: structuredClone(state),
      phase: phase(state),
      position: player.position.toArray(),
      yaw,
      desiredYaw,
      viewHeight,
      desiredHeight,
      focus: focus.toArray(),
      focusTarget: focusTarget.toArray(),
      fps,
      pixelRatio,
      frameTimes: [...frameTimes],
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      lod: { ...sceneLOD.state(), spatialChunks },
      pathLength: path.length,
      running,
      overture: overture?.beat ?? null,
      talking,
      transit: transit.state(),
      railway: sculptedTransport.train.state(),
      life: life.state(),
      expansion: {
        ...expansion.state(),
        ...expansionLife.state(),
        events: expansionEvents.state(),
      },
      airship: {
        position: sculptedTransport.airship.root.position.toArray(),
        propellers: sculptedTransport.airship.propellers.map(
          (p) => p.rotation.x,
        ),
      },
    }),
    project: (x, y, z) => {
      const p = new THREE.Vector3(x, y, z).project(camera);
      return {
        x: ((p.x + 1) * innerWidth) / 2,
        y: ((1 - p.y) * innerHeight) / 2,
      };
    },
  };
  requestAnimationFrame(frame);
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    $("#error").hidden = false;
    $("#error").textContent =
      "图形设备连接中断。请刷新页面，已完成的步骤会保留。";
  });
}
start().catch((error) => {
  console.error(error);
  $("#loading").classList.add("loaded");
  $("#loading").setAttribute("aria-hidden", "true");
  $("#error").hidden = false;
  $("#error").textContent =
    "工坊暂时未能打开。请确认浏览器已开启硬件加速，然后刷新重试。";
});
