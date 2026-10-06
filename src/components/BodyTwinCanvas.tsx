import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useVisibilityPause } from '../hooks/useVisibilityPause';
import { useDiagnostics } from '../providers/DiagnosticsProvider';
import type { OrganKey, MarkerStatus } from '../utils/reportParser';

/** Hard particle budget — the whole twin never exceeds this. */
const MAX_PARTICLES = 1200;
const PIXEL_RATIO_CAP = 1.5;
/** How long to wait before re-checking whether the tab became visible again. */
const WAKE_POLL_MS = 500;

/** Where the camera should orbit to when an organ is flagged. */
const ORGAN_VIEW: Record<OrganKey, { yaw: number; tilt: number }> = {
  heart: { yaw: 0, tilt: 0.04 },
  lungs: { yaw: -0.35, tilt: 0.04 },
  brain: { yaw: 0.55, tilt: 0.22 },
  pancreas: { yaw: 0.18, tilt: -0.12 },
  kidneys: { yaw: Math.PI * 0.45, tilt: -0.08 },
  legs: { yaw: 0.1, tilt: -0.35 },
};

const COLOURS = {
  body: new THREE.Color('#06b6d4'),
  bodyDim: new THREE.Color('#0891b2'),
  brain: new THREE.Color('#22d3ee'),
  heart: new THREE.Color('#ef4444'),
  heartCritical: new THREE.Color('#ff2f2f'),
  arteries: new THREE.Color('#dc2626'),
  pancreas: new THREE.Color('#f59e0b'),
  kidney: new THREE.Color('#10b981'),
};

interface Region {
  positions: Float32Array;
  color: THREE.Color;
}

/**
 * three.js types a renderable `.material` as `Material | Material[]`; both
 * shapes expose `dispose()`, so normalise here instead of casting per call site.
 */
function disposeMaterial(material: unknown): void {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const entry of material) {
      if (entry && typeof (entry as THREE.Material).dispose === 'function') {
        (entry as THREE.Material).dispose();
      }
    }
    return;
  }
  if (typeof (material as THREE.Material).dispose === 'function') {
    (material as THREE.Material).dispose();
  }
}

/** Merge region buffers into a single additive-blended Points cloud. */
function buildPoints(buffers: Region[], size: number, cap?: number) {
  let total = 0;
  for (const buffer of buffers) total += buffer.positions.length / 3;
  total = cap !== undefined ? Math.min(total, cap) : total;

  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  let written = 0;

  for (const buffer of buffers) {
    const remaining = total - written;
    if (remaining <= 0) break;
    const available = buffer.positions.length / 3;
    const take = Math.min(available, remaining);
    positions.set(buffer.positions.subarray(0, take * 3), written * 3);
    const { r, g, b } = buffer.color;
    for (let i = 0; i < take; i += 1) {
      const base = (written + i) * 3;
      colors[base] = r;
      colors[base + 1] = g;
      colors[base + 2] = b;
    }
    written += take;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return { geometry, material, points: new THREE.Points(geometry, material) };
}

/**
 * Whole twin is generated in-memory from arithmetic — no .glb/.gltf download,
 * so first paint costs zero network bytes and a handful of KB of VRAM.
 */
export function buildSkeleton() {
  const group = new THREE.Group();
  const body: Region[] = [];
  const heartRegion: Region[] = [];

  const add = (
    bucket: Region[],
    positions: Float32Array,
    usedLength: number,
    color: THREE.Color,
  ) => {
    const slice = new Float32Array(positions.subarray(0, usedLength));
    bucket.push({ positions: slice, color });
  };

  // ---- Head ----------------------------------------------------------------
  const head = new Float32Array(180 * 3);
  let h = 0;
  for (let i = 0; i < 180; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 0.22 + Math.random() * 0.12;
    head[h++] = Math.sin(phi) * Math.cos(theta) * r;
    head[h++] = Math.sin(phi) * Math.sin(theta) * r * 1.05 + 1.65;
    head[h++] = Math.cos(phi) * r;
  }
  add(body, head, h, COLOURS.body);

  // ---- Brain node ----------------------------------------------------------
  const brain = new Float32Array(60 * 3);
  let b = 0;
  for (let i = 0; i < 60; i++) {
    const r = 0.14 + Math.random() * 0.08;
    brain[b++] = (Math.random() - 0.5) * r * 1.4;
    brain[b++] = 1.95 + (Math.random() - 0.5) * r * 0.9;
    brain[b++] = (Math.random() - 0.5) * r * 1.1;
  }
  add(body, brain, b, COLOURS.brain);

  // ---- Torso ---------------------------------------------------------------
  const torso = new Float32Array(260 * 3);
  let t = 0;
  for (let i = 0; i < 260; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const rx = 0.3 + Math.random() * 0.25;
    const ry = 0.15 + Math.random() * 0.15;
    const rz = 0.2 + Math.random() * 0.2;
    torso[t++] = Math.sin(phi) * Math.cos(theta) * rx;
    torso[t++] = Math.sin(phi) * Math.sin(theta) * ry + 1.2;
    torso[t++] = Math.cos(phi) * rz;
  }
  add(body, torso, t, COLOURS.body);

  // ---- Arms, hands, legs, feet --------------------------------------------
  const armsSpec: { sign: -1 | 1 }[] = [{ sign: -1 }, { sign: 1 }];
  for (const { sign } of armsSpec) {
    const arm = new Float32Array(85 * 3);
    let a = 0;
    for (let i = 0; i < 85; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 0.08 + Math.random() * 0.09;
      arm[a++] = sign * (0.42 + Math.cos(theta) * r);
      arm[a++] = 0.9 + Math.sin(phi) * r * 0.7;
      arm[a++] = (Math.random() - 0.5) * r * 1.2;
    }
    add(body, arm, a, COLOURS.body);

    const hand = new Float32Array(26 * 3);
    let hd = 0;
    for (let i = 0; i < 26; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 0.04 + Math.random() * 0.05;
      hand[hd++] = sign * (0.62 + Math.cos(theta) * r);
      hand[hd++] = 0.45 + Math.sin(theta) * r * 0.6;
      hand[hd++] = (Math.random() - 0.5) * r * 1.4;
    }
    add(body, hand, hd, COLOURS.bodyDim);

    const leg = new Float32Array(85 * 3);
    let lg = 0;
    for (let i = 0; i < 85; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 0.09 + Math.random() * 0.1;
      leg[lg++] = sign * 0.16 + Math.cos(theta) * r * 0.6;
      leg[lg++] = -0.1 - Math.abs(Math.sin(phi) * r) * 0.9;
      leg[lg++] = (Math.random() - 0.5) * r * 1.3;
    }
    add(body, leg, lg, COLOURS.body);

    const foot = new Float32Array(24 * 3);
    let ft = 0;
    for (let i = 0; i < 24; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 0.05 + Math.random() * 0.05;
      foot[ft++] = sign * 0.18 + Math.cos(theta) * r;
      foot[ft++] = -0.85 + Math.sin(theta) * r * 0.5;
      foot[ft++] = (Math.random() - 0.5) * r * 1.6;
    }
    add(body, foot, ft, COLOURS.bodyDim);

    // ---- Lungs (cyan) ----------------------------------------------------
    const lung = new Float32Array(60 * 3);
    let lu = 0;
    for (let i = 0; i < 60; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const rx = 0.13 + Math.random() * 0.09;
      const ry = 0.16 + Math.random() * 0.1;
      const rz = 0.08 + Math.random() * 0.06;
      lung[lu++] = sign * 0.14 + Math.sin(phi) * Math.cos(theta) * rx;
      lung[lu++] = Math.sin(phi) * Math.sin(theta) * ry + 1.15;
      lung[lu++] = Math.cos(phi) * rz;
    }
    add(body, lung, lu, COLOURS.body);
  }

  // ---- Heart node (its own cloud so it can beat independently) -------------
  const heart = new Float32Array(45 * 3);
  let hr = 0;
  for (let i = 0; i < 45; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 0.1 + Math.random() * 0.08;
    heart[hr++] = Math.sin(phi) * Math.cos(theta) * r - 0.08;
    heart[hr++] = Math.sin(phi) * Math.sin(theta) * r + 1.25;
    heart[hr++] = Math.cos(phi) * r - 0.18;
  }
  add(heartRegion, heart, hr, COLOURS.heart);

  const arteries = new Float32Array(40 * 3);
  let ar = 0;
  for (let i = 0; i < 40; i++) {
    const t = Math.random();
    const r = 0.03 + Math.random() * 0.03;
    arteries[ar++] = -0.05 + (Math.random() - 0.5) * 0.06;
    arteries[ar++] = 1.1 + t * 0.35;
    arteries[ar++] = -0.15 + (Math.random() - 0.5) * r * 4;
  }
  add(heartRegion, arteries, ar, COLOURS.arteries);

  // ---- Pancreas (amber) ----------------------------------------------------
  const pancreas = new Float32Array(50 * 3);
  let pc = 0;
  for (let i = 0; i < 50; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 0.09 + Math.random() * 0.06;
    pancreas[pc++] = Math.sin(phi) * Math.cos(theta) * r;
    pancreas[pc++] = Math.sin(phi) * Math.sin(theta) * r + 0.55;
    pancreas[pc++] = Math.cos(phi) * r - 0.05;
  }
  add(body, pancreas, pc, COLOURS.pancreas);

  // ---- Kidneys (emerald, bilateral flanks) ---------------------------------
  for (const sign of [-1, 1] as const) {
    const kidney = new Float32Array(40 * 3);
    let kd = 0;
    for (let i = 0; i < 40; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 0.07 + Math.random() * 0.06;
      kidney[kd++] = sign * 0.32 + Math.sin(phi) * Math.cos(theta) * r;
      kidney[kd++] = Math.sin(phi) * Math.sin(theta) * r + 0.05;
      kidney[kd++] = Math.cos(phi) * r - 0.05;
    }
    add(body, kidney, kd, COLOURS.kidney);
  }

  // The heart cloud is built first and always kept whole; the body cloud then
  // takes whatever is left of the global budget, so the twin's TOTAL particle
  // count can never exceed MAX_PARTICLES.
  const heartCloud = buildPoints(heartRegion, 0.16);
  const heartPoints = (heartCloud.geometry.attributes.position as THREE.BufferAttribute).count;
  const bodyCloud = buildPoints(body, 0.18, Math.max(MAX_PARTICLES - heartPoints, 0));
  group.add(bodyCloud.points);
  group.add(heartCloud.points);

  // Low-poly wireframe silhouette keeps the human shape readable at 1,200 pts.
  const silhouetteGeo = new THREE.CylinderGeometry(0.32, 0.28, 1.6, 10, 1, true);
  silhouetteGeo.translate(0, 1.0, 0);
  const silhouette = new THREE.Mesh(
    silhouetteGeo,
    new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    }),
  );
  group.add(silhouette);

  return {
    group,
    bodyMaterial: bodyCloud.material,
    heartMaterial: heartCloud.material,
    particleCount:
      (bodyCloud.geometry.attributes.position as THREE.BufferAttribute).count + heartPoints,
  };
}
// ---------------------------------------------------------------------------
// Pure-HTML5 2D holographic twin.
//
// This path cannot fail: no GPU, no shaders, no context negotiation. It draws a
// complete neon-cyan anatomical silhouette (head, neck, chest, ribcage, arms,
// abdomen, hips, legs and feet) with pulsating organ nodes, and it supports the
// same mouse/touch 360° orbit as the WebGL twin. It is what guarantees the user
// never sees a black box or an error card.
// ---------------------------------------------------------------------------

type BodyPart = 'head' | 'neck' | 'chest' | 'rib' | 'arm' | 'abdomen' | 'hips' | 'leg' | 'foot';

interface BodyNode {
  x: number;
  y: number;
  z: number;
  part: BodyPart;
}

/**
 * Probe WebGL on a throwaway offscreen canvas.
 *
 * Doing the probe here — instead of on the rendered <canvas> — is what stops the
 * real element from ever holding a context of the wrong type. Reusing one DOM
 * node first for WebGL and then for `getContext('2d')` throws
 * "Canvas has an existing context of a different type", which silently blanked
 * the twin. That was the root cause of the previous black box.
 */
function canUseWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    const gl = (probe.getContext('webgl') ||
      probe.getContext('webgl2') ||
      probe.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Elliptical ring of surface points — the building block of the body volume. */
function ring(y: number, rx: number, rz: number, count: number, part: BodyPart): BodyNode[] {
  const nodes: BodyNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2;
    nodes.push({ x: Math.cos(t) * rx, y, z: Math.sin(t) * rz, part });
  }
  return nodes;
}

/** Evenly distributed sphere-surface points (head and shoulder joints). */
function sphere(
  cx: number,
  cy: number,
  cz: number,
  r: number,
  count: number,
  part: BodyPart,
): BodyNode[] {
  const nodes: BodyNode[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    nodes.push({
      x: cx + Math.cos(theta) * radius * r,
      y: cy + y * r,
      z: cz + Math.sin(theta) * radius * r,
      part,
    });
  }
  return nodes;
}

/** Tapered limb between two joints (arms, legs, feet). */
function limb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  radius: number,
  steps: number,
  ringCount: number,
  part: BodyPart,
): BodyNode[] {
  const nodes: BodyNode[] = [];
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    const r = radius * (0.74 + 0.26 * Math.sin(Math.PI * t));
    for (const node of ring(y, r, r, ringCount, part)) {
      nodes.push({ x: node.x + x, y, z: node.z + z, part });
    }
  }
  return nodes;
}

/** The full humanoid point model — generated once, reused every frame. */
const BODY_MODEL: BodyNode[] = (() => {
  const nodes: BodyNode[] = [];

  // Head + neck (44 + 24)
  nodes.push(...sphere(0, 1.62, 0, 0.115, 44, 'head'));
  nodes.push(...ring(1.5, 0.055, 0.055, 12, 'neck'));
  nodes.push(...ring(1.45, 0.062, 0.062, 12, 'neck'));

  // Chest + ribcage (the rib rings are emphasised when drawn)
  const chestLevels = [1.43, 1.37, 1.31, 1.25, 1.19, 1.13, 1.07];
  chestLevels.forEach((y, index) => {
    const swell = Math.sin((index / (chestLevels.length - 1)) * Math.PI) * 0.028;
    nodes.push(...ring(y, 0.196 + swell, 0.126, 26, index % 2 === 0 ? 'rib' : 'chest'));
  });

  // Shoulders
  nodes.push(...sphere(-0.212, 1.42, 0, 0.058, 16, 'chest'));
  nodes.push(...sphere(0.212, 1.42, 0, 0.058, 16, 'chest'));

  // Arms + hands (4 × 9 rings × 10 = 360)
  nodes.push(...limb([-0.212, 1.41, 0], [-0.298, 1.05, 0.015], 0.052, 8, 10, 'arm'));
  nodes.push(...limb([-0.298, 1.05, 0.015], [-0.334, 0.72, 0.03], 0.042, 8, 10, 'arm'));
  nodes.push(...limb([0.212, 1.41, 0], [0.298, 1.05, 0.015], 0.052, 8, 10, 'arm'));
  nodes.push(...limb([0.298, 1.05, 0.015], [0.334, 0.72, 0.03], 0.042, 8, 10, 'arm'));

  // Abdomen
  for (const y of [1.01, 0.95, 0.89, 0.83]) {
    nodes.push(...ring(y, 0.166, 0.106, 20, 'abdomen'));
  }

  // Hips / pelvis
  for (const y of [0.78, 0.725]) {
    nodes.push(...ring(y, 0.186, 0.122, 22, 'hips'));
  }

  // Legs (thigh then calf) — 4 × 8 rings × 11 = 352
  nodes.push(...limb([-0.09, 0.74, 0], [-0.101, 0.4, 0], 0.076, 7, 11, 'leg'));
  nodes.push(...limb([-0.101, 0.4, 0], [-0.096, 0.08, 0], 0.056, 7, 11, 'leg'));
  nodes.push(...limb([0.09, 0.74, 0], [0.101, 0.4, 0], 0.076, 7, 11, 'leg'));
  nodes.push(...limb([0.101, 0.4, 0], [0.096, 0.08, 0], 0.056, 7, 11, 'leg'));

  // Feet
  nodes.push(...limb([-0.096, 0.055, 0], [-0.096, 0.028, 0.135], 0.046, 3, 9, 'foot'));
  nodes.push(...limb([0.096, 0.055, 0], [0.096, 0.028, 0.135], 0.046, 3, 9, 'foot'));

  return nodes;
})();

interface OrganNode {
  key: 'heart' | 'lungs' | 'pancreas' | 'kidneys';
  x: number;
  y: number;
  z: number;
  colour: string;
  glow: string;
  radius: number;
}

const ORGAN_NODES: OrganNode[] = [
  { key: 'heart', x: -0.052, y: 1.245, z: 0.062, colour: '#ef4444', glow: '239, 68, 68', radius: 6 },
  { key: 'lungs', x: -0.118, y: 1.3, z: 0, colour: '#06b6d4', glow: '6, 182, 212', radius: 7 },
  { key: 'lungs', x: 0.118, y: 1.3, z: 0, colour: '#06b6d4', glow: '6, 182, 212', radius: 7 },
  { key: 'pancreas', x: 0, y: 1.0, z: -0.03, colour: '#f59e0b', glow: '245, 158, 11', radius: 5.5 },
  { key: 'kidneys', x: -0.138, y: 0.9, z: -0.058, colour: '#10b981', glow: '16, 185, 129', radius: 4.8 },
  { key: 'kidneys', x: 0.138, y: 0.9, z: -0.058, colour: '#10b981', glow: '16, 185, 129', radius: 4.8 },
];

/** Orthographic projection of a 3D point after a yaw/pitch orbit. */
function projectOrbit(
  x: number,
  y: number,
  z: number,
  yaw: number,
  tilt: number,
  scale: number,
  cx: number,
  cy: number,
): { sx: number; sy: number; depth: number } {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const rx = x * cosYaw + z * sinYaw;
  const rz = -x * sinYaw + z * cosYaw;
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const ry = y * cosTilt - rz * sinTilt;
  const depth = y * sinTilt + rz * cosTilt;
  // The model is centred on y = 0.9 so the whole body sits in the panel.
  return { sx: cx + rx * scale, sy: cy - (ry - 0.9) * scale, depth };
}

/** Draw one frame of the 2D hologram. Dependency-free and allocation-light. */
function drawHologram(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  yaw: number,
  tilt: number,
) {
  const scale = Math.min(width / 1.08, height / 1.95);
  const cx = width * 0.5;
  const cy = height * 0.5;

  ctx.clearRect(0, 0, width, height);

  // Deep-space halo so the neon cyan reads clearly over the dark panel.
  const halo = ctx.createRadialGradient(cx, cy, 12, cx, cy, Math.max(width, height) * 0.62);
  halo.addColorStop(0, 'rgba(6, 182, 212, 0.18)');
  halo.addColorStop(0.5, 'rgba(6, 182, 212, 0.05)');
  halo.addColorStop(1, 'rgba(6, 182, 212, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);

  const breath = 0.5 + 0.5 * Math.sin(time * 0.0016);

  // Silhouette points, painter-sorted back-to-front for a true 3D read.
  const points = BODY_MODEL.map((node) => ({
    ...projectOrbit(node.x, node.y, node.z, yaw, tilt, scale, cx, cy),
    part: node.part,
  }));
  points.sort((a, b) => a.depth - b.depth);

  ctx.globalCompositeOperation = 'lighter';
  for (const point of points) {
    const emphasized = point.part === 'rib' || point.part === 'head';
    const depthFactor = clamp((point.depth + 0.35) / 0.7, 0, 1);
    const alpha = 0.26 + 0.4 * depthFactor + (emphasized ? 0.14 : 0);
    const radius = (emphasized ? 1.5 : 1.15) + 0.35 * breath;
    ctx.fillStyle = `rgba(6, 182, 212, ${Math.min(0.88, alpha)})`;
    ctx.beginPath();
    ctx.arc(point.sx, point.sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Pulsating organ nodes drawn on top of the body volume.
  const beat = 0.5 + 0.5 * Math.abs(Math.sin(time * 0.0032));
  const organs = ORGAN_NODES.map((organ) => ({
    ...projectOrbit(organ.x, organ.y, organ.z, yaw, tilt, scale, cx, cy),
    organ,
  }));
  organs.sort((a, b) => a.depth - b.depth);

  for (const { sx, sy, organ } of organs) {
    const grow = organ.key === 'heart' ? 1 + 0.4 * beat : 1 + 0.1 * Math.sin(time * 0.002);
    const base = Math.max(3, organ.radius * Math.max(0.75, scale / 200));
    const r = base * grow;

    const organHalo = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.4);
    organHalo.addColorStop(0, `rgba(${organ.glow}, 0.8)`);
    organHalo.addColorStop(0.4, `rgba(${organ.glow}, 0.28)`);
    organHalo.addColorStop(1, `rgba(${organ.glow}, 0)`);
    ctx.fillStyle = organHalo;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 3.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = organ.colour;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, r + 1.6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function BodyTwinCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  /**
   * Which twin is live: `'gl'` is the three.js WebGL twin, `'2d'` is the
   * fail-proof HTML5 hologram. Probed once, offscreen, before either mounts.
   */
  const [mode, setMode] = useState<'gl' | '2d'>(() => (canUseWebGL() ? 'gl' : '2d'));
  const bodyMaterialRef = useRef<THREE.PointsMaterial | null>(null);
  const heartMaterialRef = useRef<THREE.PointsMaterial | null>(null);
  const particleCountRef = useRef(MAX_PARTICLES);
  const isAnimatingRef = useRef(true);
  const rotationRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  const { alerts, focusOrgan, setFocusOrgan } = useDiagnostics();

  // Latest diagnostics state, read inside the RAF loop without re-creating it.
  const heartSeverityRef = useRef<MarkerStatus | null>(null);
  const focusOrganRef = useRef<OrganKey | null>(null);
  const setFocusOrganRef = useRef(setFocusOrgan);

  setFocusOrganRef.current = setFocusOrgan;

  useEffect(() => {
    const heartAlert = alerts.find((alert) => alert.organ === 'heart');
    heartSeverityRef.current = heartAlert?.severity ?? null;
  }, [alerts]);

  useEffect(() => {
    focusOrganRef.current = focusOrgan;
  }, [focusOrgan]);

  useVisibilityPause(isAnimatingRef);

  // ---- WebGL twin: only ever mounted when the offscreen probe succeeded -----
  useEffect(() => {
    if (mode !== 'gl') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
    } catch {
      // No GPU, or the context was refused. Hand the twin to the 2D hologram
      // instead of surfacing an error — the user never sees a black box.
      setMode('2d');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.setClearColor(0x050811, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      Math.max(canvas.clientWidth, 1) / Math.max(canvas.clientHeight, 1),
      0.1,
      100,
    );
    camera.position.set(0, 1.1, 2.6);
    camera.lookAt(0, 1.0, 0);

    const { group, bodyMaterial, heartMaterial, particleCount } = buildSkeleton();
    bodyMaterialRef.current = bodyMaterial;
    heartMaterialRef.current = heartMaterial;
    particleCountRef.current = particleCount;
    scene.add(group);

    scene.add(new THREE.AmbientLight(0x404060, 0.5));
    const dirLight = new THREE.DirectionalLight(0x06b6d4, 0.8);
    dirLight.position.set(2, 3, 4);
    scene.add(dirLight);

    let rafId: number | null = null;
    let wakeTimer: number | null = null;
    let alive = true;

    const scheduleWake = () => {
      if (wakeTimer !== null) return;
      wakeTimer = window.setTimeout(() => {
        wakeTimer = null;
        if (!alive) return;
        if (isAnimatingRef.current) startLoop();
      }, WAKE_POLL_MS);
    };

    const startLoop = () => {
      if (rafId === null) rafId = requestAnimationFrame(step);
    };

    const step = (time: number) => {
      // Truly halt (no further frames scheduled) while the tab/canvas is hidden.
      if (!alive || !isAnimatingRef.current) {
        rafId = null;
        scheduleWake();
        return;
      }
      rafId = requestAnimationFrame(step);

      // ---- Alert-driven orbit toward the flagged organ ---------------------
      const focus = focusOrganRef.current;
      if (focus && !isDraggingRef.current) {
        const view = ORGAN_VIEW[focus];
        rotationRef.current.y = lerpAngle(rotationRef.current.y, view.yaw, 0.06);
        rotationRef.current.x = lerp(rotationRef.current.x, view.tilt, 0.06);
      }

      group.rotation.y = rotationRef.current.y;
      group.rotation.x = rotationRef.current.x;

      // ---- Heart beat -------------------------------------------------------
      const severity = heartSeverityRef.current;
      if (heartMaterialRef.current) {
        const material = heartMaterialRef.current;
        if (severity === 'critical') {
          // Double-thump beat, bright red.
          const beat = Math.abs(Math.sin(time * 0.005));
          const thump = Math.abs(Math.sin(time * 0.005) * Math.sin(time * 0.0055));
          material.size = 0.16 + 0.16 * beat + 0.06 * thump;
          material.opacity = 0.75 + 0.25 * beat;
          material.color.lerp(COLOURS.heartCritical, 0.12);
        } else if (severity === 'borderline') {
          const beat = Math.abs(Math.sin(time * 0.0035));
          material.size = 0.16 + 0.07 * beat;
          material.opacity = 0.85 + 0.12 * beat;
          material.color.lerp(COLOURS.heart, 0.12);
        } else {
          material.size = 0.16 + 0.02 * Math.sin(time * 0.002);
          material.opacity = 0.95;
          material.color.lerp(COLOURS.heart, 0.05);
        }
      }

      if (bodyMaterialRef.current) {
        // Slow breathing shimmer keeps the hologram alive at negligible cost.
        bodyMaterialRef.current.size = 0.18 + 0.012 * Math.sin(time * 0.0015);
      }

      renderer.render(scene, camera);
    };

    const onPointerDown = (event: PointerEvent) => {
      isDraggingRef.current = true;
      // The user takes manual control: stop auto-orbiting.
      if (focusOrganRef.current) setFocusOrganRef.current(null);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      rotationRef.current.y += dx * 0.01;
      rotationRef.current.x = clamp(rotationRef.current.x + dy * 0.005, -1.2, 1.2);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = () => {
      isDraggingRef.current = false;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);

    // Low-end drivers drop the context under memory pressure. Swap to the 2D
    // hologram rather than showing an error state.
    const onContextLost = (event: Event) => {
      event.preventDefault();
      isAnimatingRef.current = false;
      setMode('2d');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    const handleResize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', handleResize);

    startLoop();

    return () => {
      alive = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      if (wakeTimer !== null) window.clearTimeout(wakeTimer);
      wakeTimer = null;

      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();

      // Strict teardown: walk the graph and release every GPU-owned resource.
      group.traverse((object) => {
        const renderable = object as THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        if (renderable.geometry && typeof renderable.geometry.dispose === 'function') {
          renderable.geometry.dispose();
        }
        disposeMaterial(renderable.material);
      });
      scene.clear();
      renderer.dispose();
      bodyMaterialRef.current = null;
      heartMaterialRef.current = null;
    };
  }, [mode]);

  // ---- 2D hologram: sizing first so the first frame is already crisp -------
  useEffect(() => {
    if (mode !== '2d') return;
    const fbCanvas = fallbackCanvasRef.current;
    if (!fbCanvas) return;

    const resize = () => {
      const rect = fbCanvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP);
      fbCanvas.width = Math.max(Math.floor(rect.width * dpr), 1);
      fbCanvas.height = Math.max(Math.floor(rect.height * dpr), 1);
    };
    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(fbCanvas);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [mode]);

  // ---- 2D hologram animation + 360° orbit interaction ----------------------
  useEffect(() => {
    if (mode !== '2d') return;
    const fbCanvas = fallbackCanvasRef.current;
    if (!fbCanvas) return;
    const ctx = fbCanvas.getContext('2d');
    if (!ctx) return;

    let rafId: number | null = null;
    let alive = true;

    const loop = (time: number) => {
      if (!alive) return;
      rafId = requestAnimationFrame(loop);
      if (!isAnimatingRef.current) return;
      if (!isDraggingRef.current) {
        // Gentle idle turntable so the twin still reads as three-dimensional.
        rotationRef.current.y += 0.0035;
      }
      drawHologram(
        ctx,
        fbCanvas.width,
        fbCanvas.height,
        time,
        rotationRef.current.y,
        rotationRef.current.x,
      );
    };
    rafId = requestAnimationFrame(loop);

    const onPointerDown = (event: PointerEvent) => {
      isDraggingRef.current = true;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      fbCanvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      rotationRef.current.y += dx * 0.01;
      rotationRef.current.x = clamp(rotationRef.current.x + dy * 0.005, -1.2, 1.2);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = () => {
      isDraggingRef.current = false;
    };

    fbCanvas.addEventListener('pointerdown', onPointerDown);
    fbCanvas.addEventListener('pointermove', onPointerMove);
    fbCanvas.addEventListener('pointerup', onPointerUp);
    fbCanvas.addEventListener('pointercancel', onPointerUp);
    fbCanvas.addEventListener('pointerleave', onPointerUp);

    return () => {
      alive = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      fbCanvas.removeEventListener('pointerdown', onPointerDown);
      fbCanvas.removeEventListener('pointermove', onPointerMove);
      fbCanvas.removeEventListener('pointerup', onPointerUp);
      fbCanvas.removeEventListener('pointercancel', onPointerUp);
      fbCanvas.removeEventListener('pointerleave', onPointerUp);
    };
  }, [mode]);

  if (mode === '2d') {
    // Pure HTML5 hologram — always renders, never an error card. The distinct
    // `key` forces React to build a brand-new <canvas>, so this element never
    // inherits a WebGL context from the twin above.
    return (
      <div className="relative w-full h-[400px] rounded-2xl overflow-hidden bg-[#050811] border border-slate-800/60">
        <canvas
          key="twin-2d"
          ref={fallbackCanvasRef}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          style={{ display: 'block', touchAction: 'none' }}
          aria-label="Holographic anatomical twin"
        />
        <div className="absolute bottom-3 left-3 right-3 flex justify-between pointer-events-none text-[11px] text-slate-500 font-mono">
          <span>
            {`${focusOrgan ? `focus: ${focusOrgan}` : 'idle'} · ≤${MAX_PARTICLES.toLocaleString(
              'en-IN',
            )} pts · 2D hologram`}
          </span>
          <span>drag to rotate</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[400px] rounded-2xl overflow-hidden bg-[#050811] border border-slate-800/60">
      <canvas
        key="twin-gl"
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        aria-label="Interactive 3D anatomical twin"
      />
      <div className="absolute bottom-3 left-3 right-3 flex justify-between pointer-events-none text-[11px] text-slate-500 font-mono">
        <span>
          {`${focusOrgan ? `focus: ${focusOrgan}` : 'idle'} · ≤${particleCountRef.current.toLocaleString(
            'en-IN',
          )} pts · pixcap ${PIXEL_RATIO_CAP}`}
        </span>
        <span>drag to rotate</span>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/** Interpolate along the shortest arc so a spun model does not unwind. */
function lerpAngle(from: number, to: number, amount: number): number {
  const TAU = Math.PI * 2;
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return from + delta * amount;
}
