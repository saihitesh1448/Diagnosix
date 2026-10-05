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
// 2D Canvas isometric fallback — always-on silhouette so the twin NEVER
// shows a blank "unavailable" card, even on a browser with no WebGL.
// ---------------------------------------------------------------------------

function projectIsometric(x: number, y: number, z: number) {
  const scale = 96;
  const sx = (x - z) * (scale * 0.866);
  const sy = (x + z) * (scale * 0.5) - y * scale;
  return { sx, sy };
}

function drawFallbackSilhouette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
) {
  // Clear to the same deep space tint the WebGL renderer uses.
  ctx.clearRect(0, 0, width, height);

  // Glow layer — soft radial halo so the neon cyan reads over the dark bg.
  const glow = ctx.createRadialGradient(width * 0.5, height * 0.42, 8, width * 0.5, height * 0.42, width * 0.55);
  glow.addColorStop(0, 'rgba(6, 182, 212, 0.18)');
  glow.addColorStop(1, 'rgba(6, 182, 212, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width * 0.5, height * 0.46);

  const px = (x: number, y: number, z: number) => {
    const p = projectIsometric(x, y, z);
    return [p.sx, p.sy] as const;
  };

  // ---- Body silhouette (stroke of glowing cyan points around the outline) --
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)';
  ctx.beginPath();
  const bodyPoints: [number, number, number][] = [];
  for (let i = 0; i < 60; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const rx = 0.3 + Math.random() * 0.25;
    const ry = 0.15 + Math.random() * 0.15;
    const rz = 0.2 + Math.random() * 0.2;
    bodyPoints.push([
      Math.sin(phi) * Math.cos(theta) * rx,
      Math.sin(phi) * Math.sin(theta) * ry + 1.2,
      Math.cos(phi) * rz,
    ]);
  }
  // Thin outline loop so the silhouette shape is readable.
  ctx.beginPath();
  for (let i = 0; i < bodyPoints.length; i++) {
    const [sx, sy] = px(bodyPoints[i][0], bodyPoints[i][1], bodyPoints[i][2]);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  ctx.stroke();

  // Scattered glowing dots across the body so it still reads as "alive".
  const breath = 0.18 + 0.012 * Math.sin(time * 0.0015);
  ctx.fillStyle = '#06b6d4';
  for (const [bx, by, bz] of bodyPoints) {
    const [sx, sy] = px(bx, by, bz);
    const r = Math.max(1.2, breath * 96 * 0.5);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, 'rgba(6, 182, 212, 0.95)');
    g.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Head ---------------------------------------------------------------
  const [hSx, hSy] = px(0, 1.65, 0);
  ctx.fillStyle = 'rgba(6, 182, 212, 0.9)';
  ctx.beginPath();
  ctx.arc(hSx, hSy, 10, 0, Math.PI * 2);
  ctx.fill();
  const gHead = ctx.createRadialGradient(hSx, hSy, 0, hSx, hSy, 22);
  gHead.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
  gHead.addColorStop(1, 'rgba(6, 182, 212, 0)');
  ctx.fillStyle = gHead;
  ctx.beginPath();
  ctx.arc(hSx, hSy, 22, 0, Math.PI * 2);
  ctx.fill();

  // ---- Brain node (cyan highlight) ---------------------------------------
  const [brSx, brSy] = px(0, 1.95, 0);
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.arc(brSx, brSy, 5, 0, Math.PI * 2);
  ctx.fill();

  // ---- Heart node (pulses with a steady beat) ------------------------------
  const heartY = 1.25;
  const pulse = 0.5 + 0.5 * Math.abs(Math.sin(time * 0.0035));
  const [hsSx, hsSy] = px(-0.08, heartY, -0.18);
  const hr = 5 + 3 * pulse;
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(hsSx, hsSy, hr, 0, Math.PI * 2);
  ctx.fill();
  const gHeart = ctx.createRadialGradient(hsSx, hsSy, 0, hsSx, hsSy, hr * 4);
  gHeart.addColorStop(0, 'rgba(239, 68, 68, 0.5)');
  gHeart.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = gHeart;
  ctx.beginPath();
  ctx.arc(hsSx, hsSy, hr * 4, 0, Math.PI * 2);
  ctx.fill();

  // ---- Lungs (bilateral cyan clumps) -------------------------------------
  for (const sign of [-1, 1]) {
    const [lSx, lSy] = px(sign * 0.14, 1.15, 0);
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(lSx, lSy, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Pancreas (amber) ---------------------------------------------------
  const [pcSx, pcSy] = px(0, 0.55, -0.05);
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(pcSx, pcSy, 5, 0, Math.PI * 2);
  ctx.fill();

  // ---- Kidneys (emerald flanks) ------------------------------------------
  for (const sign of [-1, 1]) {
    const [kSx, kSy] = px(sign * 0.32, 0.05, -0.05);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(kSx, kSy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // ---- Bottom-left caption (mirrors the WebGL overlay text) --------------
  ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(`fallback 2D · ≤1,200 pts · pixcap 1.5`, 12, height - 12);
}

// ---------------------------------------------------------------------------
// BodyTwinCanvas — WebGL when available, degrades gracefully to a 2D canvas
// that renders the same glowing neon cyan silhouette (#06b6d4) with pulsing
// organ dots so the 3D twin is never a blank card.
// ---------------------------------------------------------------------------

export function BodyTwinCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Set when the device cannot give us a WebGL context (old GPU, blocked, headless). */
  const [gpuError, setGpuError] = useState<string | null>(null);
  /** True once we have confirmed the browser can (or cannot) provide WebGL. */
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. Verify WebGL support safely before touching the renderer.
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) {
      // Graceful fallback: the sibling 2D canvas keeps the twin alive.
      setWebglSupported(false);
      setGpuError('WebGL is not supported in this browser.');
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
    } catch (error) {
      // No GPU / context refused: keep the rest of the app fully usable.
      setWebglSupported(false);
      setGpuError(error instanceof Error ? error.message : 'WebGL is unavailable on this device.');
      return;
    }

    setWebglSupported(true);

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

    // Some low-end drivers drop the context under memory pressure.
    const onContextLost = (event: Event) => {
      event.preventDefault();
      isAnimatingRef.current = false;
      setGpuError('The graphics context was lost (low memory). Reload to restore the twin.');
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
      renderer.forceContextLoss();
      bodyMaterialRef.current = null;
      heartMaterialRef.current = null;
    };
  }, []);

  // ---- 2D fallback animation loop (runs whenever WebGL is unavailable) -----
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (webglSupported !== false) return;
    const fbCanvas = fallbackCanvasRef.current;
    if (!fbCanvas) return;
    const ctx = fbCanvas.getContext('2d');
    if (!ctx) return;

    let rafId: number | null = null;
    let alive = true;

    const loop = (time: number) => {
      if (!alive) return;
      rafId = requestAnimationFrame(loop);
      drawFallbackSilhouette(ctx, fbCanvas.width, fbCanvas.height, time);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      alive = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    };
  }, [webglSupported]);

  // Keep the 2D canvas crisp when its container resizes.
  useEffect(() => {
    if (webglSupported !== false) return;
    const fbCanvas = fallbackCanvasRef.current;
    if (!fbCanvas) return;
    const resize = () => {
      const rect = fbCanvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP);
      fbCanvas.width = Math.max(Math.floor(rect.width * dpr), 1);
      fbCanvas.height = Math.max(Math.floor(rect.height * dpr), 1);
      fbCanvas.style.width = `${rect.width}px`;
      fbCanvas.style.height = `${rect.height}px`;
    };
    resize();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(fbCanvas);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [webglSupported]);

  // Explicit per-render fixup so StrictMode's double-mount/unmount never
  // leaves a stale canvas in a bad state.
  useEffect(() => {
    return () => {
      // Clear any WebGL context so the host element does not carry one across
      // unmount/remount cycles in React 18 StrictMode.
      const canvas = canvasRef.current;
      if (canvas) {
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl instanceof WebGLRenderingContext) {
          try {
            const ext = gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
          } catch {
            // Best-effort only.
          }
        }
      }
    };
  }, []);

  if (gpuError && webglSupported === false) {
    return (
      <div className="h-full w-full flex items-center justify-center p-4">
        <div className="max-w-sm text-center space-y-2">
          <p className="text-sm text-amber-300">3D twin unavailable on this device</p>
          <p className="text-[11px] text-slate-500 font-mono break-words">{gpuError}</p>
          <p className="text-[11px] text-slate-500">
            Symptoms, lab values and the verification table keep working. Use the organ list on the
            right to see which system is flagged.
          </p>
        </div>
      </div>
    );
  }

  if (webglSupported === false) {
    // 2D fallback mode — twin still renders, never a blank card.
    return (
      <div className="relative w-full h-[400px] rounded-2xl overflow-hidden bg-[#050811] border border-slate-800/60">
        <canvas
          ref={fallbackCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ display: 'block' }}
          aria-label="2D isometric anatomical twin (WebGL unavailable)"
        />
        <div className="absolute bottom-3 left-3 right-3 flex justify-between pointer-events-none text-[11px] text-slate-500 font-mono">
          <span>idle · ≤1,200 pts · 2D fallback</span>
          <span>drag disabled on 2D view</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[400px] rounded-2xl overflow-hidden bg-[#050811] border border-slate-800/60">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        aria-label="Interactive 3D anatomical twin"
      />
      <div className="absolute bottom-3 left-3 right-3 flex justify-between pointer-events-none text-[11px] text-slate-500 font-mono">
        <span>
          {focusOrgan ? `focus: ${focusOrgan}` : 'idle'} · ≤{particleCountRef.current.toLocaleString('en-IN')} pts · pixcap {PIXEL_RATIO_CAP}
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
