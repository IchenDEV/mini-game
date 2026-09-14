import * as THREE from "three";
import { createTheatreCurtain } from "./theatre-curtain.js";
import "./overture.css";

const ease = (n) => { n = THREE.MathUtils.clamp(n, 0, 1); return n * n * (3 - 2 * n); };

/** A rehearsal of the first scene, performed in the same world as play. */
export async function createOverture({ scene, camera, focus, actors, joints, world, obstacles, reducedMotion, onFinish }) {
  const layer = document.createElement("section");
  layer.id = "overture";
  layer.setAttribute("aria-label", "第一幕：门照常开");
  layer.innerHTML = `
    <div class="stage-vignette"></div><canvas class="stage-curtain" aria-hidden="true"></canvas>
    <div class="stage-frame" aria-hidden="true"></div>
    <div class="stage-playbill"><p class="stage-edition">THE FOGHARBOR PLAYHOUSE</p><div class="stage-rule">✦</div>
      <h1>FOGHARBOR</h1><p class="stage-zh-title">雾港修理簿</p><p class="stage-act">ACT I</p><h2>门照常开</h2>
      <button class="stage-enter">请入席<span>BEGIN THE FIRST ACT</span></button>
      <p class="stage-note">一间重新开门的修理铺 · 一个雨后的清晨</p>
    </div>
    <div class="stage-caption" hidden aria-live="polite"><span class="stage-speaker"></span><p></p><button class="stage-next">继续 <span>↵</span></button></div>
    <div class="stage-controls"><button class="stage-sound" aria-pressed="true">声音：开</button><label><input class="stage-motion" type="checkbox">减少动态</label><button class="stage-skip">跳过开幕</button></div>`;
  document.body.append(layer);
  document.body.classList.add("performing-overture");
  const curtain = await createTheatreCurtain(layer.querySelector("canvas"));
  const caption = layer.querySelector(".stage-caption"), next = layer.querySelector(".stage-next");
  const motion = layer.querySelector(".stage-motion");
  motion.checked = reducedMotion;
  const sounds = {
    curtain: new Audio("./theatre/curtain.mp3"), bell: new Audio("./theatre/bell.mp3"),
    knock: new Audio("./theatre/knock.mp3"), tool: new Audio("./theatre/tool.mp3"),
  };
  let soundEnabled = true, active = true, beat = "seated", elapsed = 0, heldTool = false;
  function sound(name, volume = .4) {
    if (!soundEnabled) return;
    const clip = sounds[name]; clip.currentTime = 0; clip.volume = volume;
    void clip.play().catch(() => {});
  }
  const lightLevels = [];
  scene.traverse(o => { if (o.isLight) lightLevels.push([o, o.intensity]); });
  const environment = scene.environmentIntensity;
  const background = scene.background.clone(), fogColor = scene.fog.color.clone();
  const lamp = new THREE.SpotLight(0xffd0a1, 95, 24, .55, .8, 1.3);
  lamp.position.set(-8, 10, 4); lamp.target.position.set(-8.5, .8, -.2);
  scene.add(lamp, lamp.target);
  const props = new THREE.Group(); scene.add(props);
  const wood = new THREE.MeshStandardMaterial({ color: 0x542d1d, roughness: .55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb89955, metalness: .7, roughness: .3 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xc5bda3, roughness: 1 });
  const cube = (parent, mat, size, pos) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat); m.position.set(...pos);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  const chair = new THREE.Group(); chair.position.set(-8.65, 0, -.1); chair.rotation.y = .26; props.add(chair);
  obstacles.push({ minX: -9.06, maxX: -8.24, minZ: -.48, maxZ: .28 });
  cube(chair, wood, [.72, .13, .66], [0, .62, 0]);
  for (const x of [-.28, .28]) for (const z of [-.24, .24]) cube(chair, wood, [.09, .65, .09], [x, .3, z]);
  for (const x of [-.28, -.14, 0, .14, .28]) cube(chair, wood, [.06, .68, .07], [x, 1, -.24]);
  cube(chair, wood, [.72, .13, .13], [0, 1.35, -.24]);
  const cloth = cube(props, linen, [.62, .035, .37], [-5.5, 1.5, -.85]);
  cloth.visible = false;
  const wrench = new THREE.Group(); props.add(wrench);
  cube(wrench, brass, [.07, .38, .05], [0, 0, 0]);
  cube(wrench, brass, [.19, .06, .06], [0, .18, 0]);
  for (const x of [-.065, .065]) cube(wrench, brass, [.055, .13, .06], [x, .245, 0]);
  wrench.position.set(-7.1, 1.5, -.7); wrench.rotation.z = Math.PI / 2;
  const nora = actors.Nora, milo = actors.Milo;
  const kettleHome = world.kettle.position.clone();
  const actorPositions = Object.fromEntries(Object.entries(actors).map(([name, actor]) => [name, { position: actor.position.clone(), rotation: actor.rotation.clone(), visible: actor.visible }]));
  actors.Molly.visible = actors.Beck.visible = false;
  world.setWorkshopFocus(true);
  function enter(name, speaker = "", text = "", button = "继续") {
    beat = name; elapsed = 0; layer.dataset.beat = name;
    caption.hidden = !text && name !== "take";
    caption.classList.toggle("stage-action", name === "take");
    layer.querySelector(".stage-speaker").textContent = speaker;
    caption.querySelector("p").textContent = text;
    next.innerHTML = `${button} <span>↵</span>`;
    next.disabled = true;
    if (text) next.focus({ preventScroll: true });
  }
  function advance() {
    if (next.disabled || !active) return;
    if (beat === "reachLine") enter("absence");
    else if (beat === "take") { heldTool = true; sound("tool", .25); enter("takeMotion"); }
    else if (beat === "miloLine") enter("noraLine", "诺拉", "门没锁。");
    else if (beat === "noraLine") enter("arrival");
    else if (beat === "gift") enter("noraReply", "诺拉", "……我还以为是包炉子的。");
    else if (beat === "noraReply") enter("miloReply", "米洛", "那层旧的才是。");
    else if (beat === "miloReply") enter("fold");
    else if (beat === "ready") enter("handoff");
  }
  next.onclick = advance;
  function keyboard(event) {
    if (event.key === "Enter" && event.target.tagName !== "BUTTON" && !caption.hidden) { event.preventDefault(); advance(); }
  }
  layer.addEventListener("keydown", keyboard);
  layer.querySelector(".stage-enter").onclick = () => {
    layer.querySelector(".stage-playbill").classList.add("departed");
    layer.querySelector(".stage-playbill").inert = true;
    sound("bell", .32); enter("bell");
  };
  layer.querySelector(".stage-sound").onclick = (event) => {
    soundEnabled = !soundEnabled;
    event.currentTarget.textContent = `声音：${soundEnabled ? "开" : "关"}`;
    event.currentTarget.setAttribute("aria-pressed", String(soundEnabled));
    if (!soundEnabled) Object.values(sounds).forEach(s => s.pause());
  };
  layer.querySelector(".stage-skip").onclick = () => finish();
  function finish() {
    if (!active) return;
    active = false;
    lightLevels.forEach(([light, level]) => { light.intensity = level; });
    scene.environmentIntensity = environment; scene.background.copy(background); scene.fog.color.copy(fogColor);
    scene.remove(lamp, lamp.target); lamp.dispose(); curtain.dispose();
    // The chair and folded cloth remain in the playable workshop.
    heldTool = false; props.add(wrench); wrench.position.set(-7.1, 1.5, -.7); wrench.rotation.set(0, 0, Math.PI / 2);
    cloth.visible = true; world.kettle.visible = true; world.kettle.position.copy(kettleHome);
    for (const [name, original] of Object.entries(actorPositions)) {
      actors[name].visible = original.visible;
      for (const joint of Object.values(joints[name])) if (joint) joint.rotation.set(0, 0, 0);
    }
    nora.position.set(-6.3, 0, 1); nora.rotation.y = Math.PI;
    milo.position.set(-4.6, 0, 1); milo.rotation.y = -1;
    Object.values(sounds).forEach(s => { s.pause(); s.removeAttribute("src"); s.load(); });
    document.body.classList.remove("performing-overture"); layer.remove();
    world.setWorkshopFocus(false); onFinish();
  }
  const target = new THREE.Vector3(-7.4, 1.3, -.2), offset = new THREE.Vector3();
  function update(dt, time) {
    if (!active) return;
    elapsed += dt;
    const quiet = motion.checked;
    const release = beat === "handoff" ? ease(elapsed / (quiet ? .5 : 4)) : 0;
    const lit = ["seated", "bell", "opening"].includes(beat) ? .04 : .12;
    lightLevels.forEach(([light, level]) => { light.intensity = level * THREE.MathUtils.lerp(lit, 1, release); });
    scene.environmentIntensity = THREE.MathUtils.lerp(.05, environment, release);
    scene.background.set(0x131519).lerp(background, release); scene.fog.color.set(0x131519).lerp(fogColor, release);
    lamp.intensity = 95 * (1 - release);
    const opening = beat === "seated" || beat === "bell" ? 0 : beat === "opening" ? ease(elapsed / (quiet ? .4 : 5.8)) : 1;
    curtain.update(opening, time); curtain.render();
    layer.style.opacity = String(1 - release);
    let chairFocus = ["seated", "bell", "opening", "chair", "reachLine", "absence"].includes(beat);
    const x = chairFocus ? -7.8 : -6.4;
    if (quiet) target.set(x, 1.2, -.2);
    else target.lerp(new THREE.Vector3(x, 1.2, -.2), 1 - Math.exp(-dt * .65));
    focus.copy(target);
    const height = THREE.MathUtils.lerp(Math.max(8.2, 12 / (innerWidth / innerHeight)), 18, release);
    offset.set(8, 15, 21).normalize().multiplyScalar(49);
    camera.position.copy(focus).add(offset); camera.lookAt(focus);
    camera.left = -height * innerWidth / innerHeight / 2; camera.right = -camera.left;
    camera.top = height / 2; camera.bottom = -height / 2; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    lamp.target.position.set(chairFocus ? -8 : -6.2, .9, 0);
    nora.position.set(-7.1, 0, .4);
    const facingMilo = ["gift", "noraReply", "miloReply", "fold", "ready", "handoff"].includes(beat);
    nora.rotation.y = chairFocus ? -1.7 : facingMilo ? 1.5 : Math.PI;
    joints.Nora.Head.rotation.x = chairFocus ? .03 : .16;
    joints.Nora.RightArm.rotation.x = beat === "reachLine" ? -.8 * ease(elapsed / 1.2) : heldTool ? -.7 : -.08;
    joints.Nora.LeftArm.rotation.x = -.08;
    if (beat === "absence") joints.Nora.RightArm.rotation.x = -.8 * (1 - ease(elapsed / 2.4));
    milo.visible = !["seated", "bell", "opening", "chair", "reachLine", "absence", "take", "takeMotion"].includes(beat);
    const arrived = ["gift", "noraReply", "miloReply", "fold", "ready", "handoff"].includes(beat);
    const walk = arrived ? 1 : ["arrival", "place"].includes(beat) ? (beat === "place" ? 1 : ease(elapsed / 3.5)) : 0;
    milo.position.set(THREE.MathUtils.lerp(-2.5, -5.15, walk), 0, THREE.MathUtils.lerp(2.6, .5, walk));
    milo.rotation.y = -1.65;
    for (const [part, sign] of [["LeftLeg", 1], ["RightLeg", -1]]) joints.Milo[part].rotation.x = beat === "arrival" ? Math.sin(elapsed * 10) * .35 * sign : 0;
    joints.Milo.RightArm.rotation.x = arrived ? -.15 : -.85;
    joints.Milo.LeftArm.rotation.x = arrived ? -.1 : -.85;
    world.kettle.visible = milo.visible;
    if (arrived) world.kettle.position.copy(kettleHome);
    else {
      world.kettle.position.set(milo.position.x - .35, 1.1, milo.position.z - .35);
      if (beat === "place") world.kettle.position.lerp(kettleHome, ease(elapsed / 1.5));
    }
    cloth.visible = arrived;
    if (heldTool) {
      joints.Nora.RightArm.rotation.x = -.7 * ease(beat === "takeMotion" ? elapsed / 1.2 : 1);
      joints.Nora.RightArm.updateWorldMatrix(true, false);
      const hand = new THREE.Vector3(0, -.35, .1).applyMatrix4(joints.Nora.RightArm.matrixWorld);
      const taking = beat === "takeMotion" ? ease(elapsed / 1.2) : 1;
      wrench.position.set(-7.1, 1.5, -.7).lerp(hand, taking);
      wrench.position.y += Math.sin(taking * Math.PI) * .15;
      wrench.rotation.set(.5, nora.rotation.y, .15);
    }
    if (beat === "fold") {
      joints.Nora.LeftArm.rotation.x = -.9 * Math.sin(Math.min(elapsed / 2.5, 1) * Math.PI);
      cloth.scale.x = THREE.MathUtils.lerp(1, .6, ease(elapsed / 2.5));
    }
    if (!caption.hidden) {
      const wasDisabled = next.disabled;
      next.disabled = elapsed < .55;
      if (wasDisabled && !next.disabled) next.focus({ preventScroll: true });
    }
    if (beat === "bell" && elapsed > 2.7) { sound("curtain", .55); enter("opening"); }
    else if (beat === "opening" && elapsed > (quiet ? .5 : 6)) enter("chair");
    else if (beat === "chair" && elapsed > 2.2) enter("reachLine", "诺拉", "师父，小号的——");
    else if (beat === "absence" && elapsed > 2.8) enter("take", "", "", "拿起小号扳手");
    else if (beat === "takeMotion" && elapsed > 1.8) { sound("knock", .4); enter("knock"); }
    else if (beat === "knock" && elapsed > 1.7) enter("miloLine", "门外 · 米洛", "是我。");
    else if (beat === "arrival" && elapsed > 3.7) enter("place");
    else if (beat === "place" && elapsed > 1.7) { sound("tool", .16); enter("gift", "米洛", "莫莉说，布是给你擦手的。"); }
    else if (beat === "fold" && elapsed > 2.8) enter("ready", "诺拉", "我先看看。", "检查茶炉");
    else if (beat === "handoff" && release === 1) finish();
  }
  function resize() { if (active) curtain.resize(innerWidth, innerHeight); }
  resize(); layer.querySelector(".stage-enter").focus();
  return { update, resize, get active() { return active; }, get beat() { return beat; } };
}
