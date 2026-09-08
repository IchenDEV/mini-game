import * as THREE from "three";
import { createCollectible, createRegulator } from "./prop-models.js";
import {
  GEAR_POSITIONS,
  REGULATOR_POSITIONS,
  EXIT_POSITION,
} from "./game-state.js";

// Keep markers on their exact world anchor. Collision avoidance used to teleport them.
export function placeLabels(entries) {
  return entries.map(entry => ({ ...entry }));
}

export function nearbyItem(items, position, previous = null) {
  const eligible = items.filter(item => item.group.visible && item.kind !== "exit");
  const distance = item => Math.hypot(item.x - position.x, item.z - position.z);
  const nearest = eligible.reduce((a, b) => !a || distance(b) < distance(a) ? b : a, null);
  // Hysteresis prevents titles flickering at the boundary between two objects.
  if (previous && eligible.includes(previous) && distance(previous) < 2.65 &&
      (!nearest || distance(nearest) > distance(previous) - 0.4)) return previous;
  return nearest && distance(nearest) < 2.2 ? nearest : null;
}

export function createGameObjects(parent, region, onSelect) {
  const root = new THREE.Group();
  parent.add(root);
  const brass = new THREE.MeshStandardMaterial({
    color: 0xd4a554,
    roughness: 0.32,
    metalness: 0.75,
  });
  const iron = new THREE.MeshStandardMaterial({
    color: 0x294549,
    roughness: 0.42,
    metalness: 0.65,
  });
  const ivory = new THREE.MeshStandardMaterial({
    color: 0xcec1a0,
    roughness: 0.7,
  });
  const overlay = document.querySelector("#world-labels");
  const items = [],
    pickables = [],
    sparks = [];
  let progress = { collected: [], sequence: [], restored: false };
  let nearby = null;
  function mesh(group, geometry, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  }
  function item(kind, id, coords, label) {
    const group = new THREE.Group();
    group.position.set(coords[0], 0, coords[1]);
    root.add(group);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `world-label ${kind}`;
    button.dataset.kind = kind;
    button.dataset.item = String(id);
    button.setAttribute("aria-label", label);
    button.textContent = label;
    overlay.append(button);
    const entry = {
      kind,
      id,
      x: coords[0],
      z: coords[1],
      group,
      button,
      anchor: new THREE.Vector3(
        coords[0],
        kind === "exit" ? 3.1 : 2.05,
        coords[1],
      ),
    };
    button.addEventListener("click", () => onSelect(entry));
    items.push(entry);
    return entry;
  }
  function registerModel(entry, model) {
    entry.group.add(model);
    entry.spinner = model.userData.spinner;
    entry.needle = model.userData.needle;
    entry.lamp = model.userData.lamp;
    // The entire prop is clickable, including its pedestal and outer frame.
    model.traverse(object => {
      if (!object.isMesh) return;
      object.userData.gameItem = entry;
      pickables.push(object);
    });
  }
  GEAR_POSITIONS.forEach((p, id) => {
    const entry = item("gear", id, p, `${region.component} ${id + 1}`);
    registerModel(entry, createCollectible(region, id));
    entry.button.innerHTML = `<span class="target-icon">✦</span><span class="target-name">${region.component} ${id + 1}</span>`;
  });
  REGULATOR_POSITIONS.forEach((p, id) => {
    const entry = item("regulator", id, p, `控制器 ${id + 1}：${region.labels[id]}`);
    registerModel(entry, createRegulator(region, id));
    entry.button.innerHTML = `<span class="target-icon">${id + 1}</span><span class="target-name">${region.labels[id]}</span>`;
  });
  const exit = item("exit", 0, EXIT_POSITION, "航站：完成修复后启航");
  for (const x of [-0.7, 0.7]) {
    mesh(exit.group, new THREE.BoxGeometry(0.19, 2.6, 0.19), iron, x, 1.3);
    mesh(exit.group, new THREE.BoxGeometry(0.35, 0.13, 0.35), brass, x, 2.7);
  }
  const top = mesh(
    exit.group,
    new THREE.BoxGeometry(1.8, 0.2, 0.34),
    brass,
    0,
    2.65,
  );
  top.userData.gameItem = exit;
  pickables.push(top);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x6b807a,
    emissive: 0x173c39,
    emissiveIntensity: 0.8,
  });
  const halo = mesh(
    exit.group,
    new THREE.TorusGeometry(0.5, 0.07, 8, 32),
    beaconMat,
    0,
    1.7,
  );
  exit.lamp = beaconMat;
  exit.spinner = halo;
  mesh(exit.group, new THREE.BoxGeometry(1.7, 0.12, 1.3), ivory, 0, 0.07);
  exit.button.innerHTML = '<span class="target-icon">➶</span><span class="target-name">航站</span>';
  const sparkleGeo = new THREE.BufferGeometry(),
    sparkPositions = new Float32Array(60 * 3);
  sparkleGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(sparkPositions, 3),
  );
  const sparkleMat = new THREE.PointsMaterial({
    color: 0xffd780,
    size: 0.075,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const sparkleMesh = new THREE.Points(sparkleGeo, sparkleMat);
  sparkleMesh.visible = false;
  sparkleMesh.frustumCulled = false;
  root.add(sparkleMesh);
  const screen = new THREE.Vector3();
  return {
    items,
    pickables,
    setProgress(value) {
      progress = value;
      for (const entry of items) {
        if (entry.kind === "gear") {
          entry.group.visible = !value.collected.includes(entry.id);
        } else if (entry.lamp) {
          const active =
            entry.kind === "exit"
              ? value.restored
              : value.sequence.includes(entry.id);
          entry.lamp.color.set(active ? 0x99e6be : 0x6b807a);
          entry.lamp.emissive.set(active ? 0x33bc8e : 0x173c39);
          entry.lamp.emissiveIntensity = active ? 2 : 0.5;
          entry.button.classList.toggle("active", active);
          if (entry.kind === "exit")
            entry.button.innerHTML = active
              ? '<span class="target-icon">➶</span><span class="target-name">启航 →</span>'
              : '<span class="target-icon">➶</span><span class="target-name">航站</span>';
        }
      }
    },
    burst(x, z) {
      sparks.length = 0;
      for (let i = 0; i < 60; i++)
        sparks.push({
          x,
          y: 1.3,
          z,
          vx: (Math.random() - 0.5) * 3,
          vy: 1 + Math.random() * 2,
          vz: (Math.random() - 0.5) * 3,
          life: 0.6 + Math.random() * 0.3,
        });
      sparkleMesh.visible = true;
    },
    update(t, dt, camera, visible = true, position = { x: 100, z: 100 }) {
      nearby = visible ? nearbyItem(items, position, nearby) : null;
      const anchors = [];
      for (const entry of items) {
        if (entry.spinner) {
          if (entry.kind === "gear") {
            entry.spinner.rotation.y = t * 0.9 + entry.id;
            entry.spinner.position.y = 1.35 + Math.sin(t * 2 + entry.id) * 0.1;
          } else entry.spinner.rotation.z = t * 0.3;
        }
        if (entry.needle)
          entry.needle.rotation.z =
            -0.7 +
            (progress.sequence.includes(entry.id)
              ? 1.2
              : Math.sin(t * 1.5 + entry.id) * 0.1);
        screen.copy(entry.anchor).project(camera);
        const show =
          visible &&
          entry.group.visible &&
          (entry.kind !== "exit" || progress.restored) &&
          screen.z > -1 &&
          screen.z < 1 &&
          Math.abs(screen.x) < 0.97 &&
          Math.abs(screen.y) < 0.95;
        entry.button.hidden = !show;
        entry.button.classList.toggle("nearby", entry === nearby);
        if (show)
          anchors.push({
            entry,
            x: ((screen.x + 1) * innerWidth) / 2,
            y: ((1 - screen.y) * innerHeight) / 2,
            width: 24,
            height: 24,
          });
      }
      for (const label of placeLabels(anchors))
        label.entry.button.style.transform = `translate3d(${label.x}px,${label.y}px,0) translate(-50%,-100%)`;
      let alive = false;
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i];
        s.life -= dt;
        if (s.life > 0) {
          alive = true;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.z += s.vz * dt;
          s.vy -= 3 * dt;
          sparkPositions.set([s.x, s.y, s.z], i * 3);
        } else sparkPositions.set([0, -100, 0], i * 3);
      }
      if (sparks.length) sparkleGeo.attributes.position.needsUpdate = true;
      sparkleMesh.visible = alive;
    },
    removeLabels() {
      items.forEach((item) => item.button.remove());
    },
  };
}
