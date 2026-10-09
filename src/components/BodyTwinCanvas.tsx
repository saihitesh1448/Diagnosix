import { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * One hue per organ.
 *
 * The lungs used to be drawn in the same blue as the body shell, so two lobes
 * inside a blue torso were invisible as separate anatomy and the chest read as
 * one undifferentiated balloon. Every part now owns a colour no neighbour
 * shares, which is what lets a first-time (or young) viewer name the parts.
 */
const COLOURS = {
  /** Anatomical blue, matching the reference plate rather than the UI's cyan. */
  body: new THREE.Color('#3b82f6'),
  bodyDim: new THREE.Color('#1d4ed8'),
  brain: new THREE.Color('#f472b6'),
  brainFold: new THREE.Color('#ec4899'),
  lung: new THREE.Color('#22d3ee'),
  airway: new THREE.Color('#a5f3fc'),
  heart: new THREE.Color('#ef4444'),
  heartCritical: new THREE.Color('#ff2f2f'),
  arteries: new THREE.Color('#dc2626'),
  liver: new THREE.Color('#fb923c'),
  stomach: new THREE.Color('#c084fc'),
  pancreas: new THREE.Color('#facc15'),
  kidney: new THREE.Color('#34d399'),
  gut: new THREE.Color('#818cf8'),
  bladder: new THREE.Color('#2dd4bf'),
};

/**
 * Parts named on the twin itself and listed in the legend under it.
 * `organ` links a part to the alert-driven organ nodes where one exists.
 */
export interface TwinPart {
  name: string;
  colour: string;
  organ?: OrganKey;
  /** Plain-language job of the part, for a viewer meeting anatomy for the first time. */
  does: string;
}

export const TWIN_PARTS: TwinPart[] = [
  { name: 'Brain', colour: '#f472b6', organ: 'brain', does: 'Thinks, remembers, controls the body' },
  { name: 'Lungs', colour: '#22d3ee', organ: 'lungs', does: 'Fill with air so the blood gets oxygen' },
  { name: 'Heart', colour: '#ef4444', organ: 'heart', does: 'Pumps blood around the body' },
  { name: 'Liver', colour: '#fb923c', does: 'Cleans the blood and stores energy' },
  { name: 'Stomach', colour: '#c084fc', does: 'Mixes the food you eat' },
  { name: 'Pancreas', colour: '#facc15', organ: 'pancreas', does: 'Controls sugar in the blood' },
  { name: 'Kidneys', colour: '#34d399', organ: 'kidneys', does: 'Filter the blood into urine' },
  { name: 'Intestines', colour: '#818cf8', does: 'Take the goodness out of food' },
];
/**
 * three.js types a renderable `.material` as `Material | Material[]`; both shapes
 * expose `dispose()`, so normalise here instead of casting per call site.
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

/**
 * Fresnel hologram shell.
 *
 * A smooth translucent surface that only brightens where it turns away from the
 * camera. That is what makes a clinical hologram read as a glowing solid instead
 * of the flat, blocky look you get from a cloud of point sprites — overlapping
 * square points saturate to white and destroy the silhouette.
 */
function createHologramMaterial(
  color: THREE.Color,
  opacity: number,
  power = 2.4,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uOpacity: { value: opacity },
      uPower: { value: power },
      /** 0 = normal, 1 = fully lit as a problem area. Driven per organ. */
      uAlert: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uPower;
      uniform float uAlert;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 v = normalize(vViewDir);
        float fres = pow(1.0 - abs(dot(n, v)), uPower);
        // Lambert-style key light plus a rim term. A single flat fill (the old
        // 0.62 constant) is exactly what made a shaded body look like a
        // cardboard cut-out; shading the surface is what makes it read as a
        // smooth anatomical form.
        float key = max(dot(n, normalize(vec3(-0.35, 0.55, 0.75))), 0.0);
        float shade = 0.36 + 0.52 * key * key;
        vec3 healthy = uColor * (shade + fres * 0.8);
        // A flagged organ burns red on the body itself, instead of quietly
        // keeping its healthy colour while only the side panel mentions it.
        vec3 alarm = vec3(1.0, 0.23, 0.2) * (shade + fres * 1.15);
        vec3 shaded = mix(healthy, alarm, clamp(uAlert, 0.0, 1.0));
        gl_FragColor = vec4(shaded, uOpacity + fres * 0.4 + uAlert * 0.25);
      }
    `,
    transparent: true,
    // The shell must *tint*, not *add*: additive shells saturate to white where
    // the body overlaps itself (chest, shoulders), which is what made the old
    // twin read as a blown-out blob instead of an anatomical body.
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Smooth capsule spanning two joints, so limbs read as tapered volumes. */
function capsuleBetween(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  radius: number,
  material: THREE.Material,
  taper = 1,
): THREE.Mesh {
  const start = new THREE.Vector3(from[0], from[1], from[2]);
  const end = new THREE.Vector3(to[0], to[1], to[2]);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(direction.length() - radius * 2, 0.004);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 18), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.clone().normalize());
  if (taper !== 1) mesh.scale.set(taper, 1, taper);
  return mesh;
}

/**
 * One continuous tapered limb, lathed from a profile.
 *
 * The arms and legs used to be two capsules plus a sphere at every joint, so a
 * knee was a ball and a calf was a balloon — exactly the "legs look like
 * balloons or circles" report. A single lathe from ankle to hip (or wrist to
 * shoulder) keeps the calf bulge, knee and thigh in one smooth silhouette, the
 * way they are modelled in the anatomical reference.
 *
 * `profile` is `[radius, metres]`, measured from the distal joint (ankle or
 * wrist) toward the proximal one — absolute sizes, like the reference photo,
 * instead of a fraction of a guessed limb length.
 */
function limbBetween(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  profile: readonly (readonly [number, number])[],
  material: THREE.Material,
  segments = 22,
  /** Squash across the limb's own Z axis — a shin is not a perfect cylinder. */
  flattenZ = 1,
): THREE.Mesh {
  const start = new THREE.Vector3(from[0], from[1], from[2]);
  const direction = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  // The lathe grows along +Y from its own origin, so it is anchored at the
  // distal joint and rotated toward the proximal one. Positioning it at the
  // midpoint instead (as a centred capsule is) left every arm and leg drawn at
  // half length — thighs stopping at the knee, hands floating at the hips.
  const geometry = new THREE.LatheGeometry(
    profile.map(([radius, metres]) => new THREE.Vector2(radius, metres)),
    segments,
  );
  const mesh = new THREE.Mesh(geometry, material);
  if (flattenZ !== 1) mesh.scale.z = flattenZ;
  mesh.position.copy(start);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.clone().normalize());
  return mesh;
}

/** Glowing tube through a set of control points — the vessel network. */
function vessel(
  points: readonly (readonly [number, number, number])[],
  radius: number,
  color: THREE.Color,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
  );
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 44, radius * 1.15, 6, false),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      // Painted, not glowed: additive tubes clipped to white over the shell and
      // lost their red/blue identity, which is the whole point of the network.
      blending: THREE.NormalBlending,
      depthWrite: false,
    }),
  );
  // Drawn after the shell so the network stays crisp on top of the body, the
  // way it is printed on an anatomical plate.
  mesh.renderOrder = 2;
  return mesh;
}

/**
 * Whole twin is generated in-memory from arithmetic — no .glb/.gltf download, so
 * first paint costs zero network bytes and a few KB of VRAM.
 */
export function buildSkeleton() {
  const group = new THREE.Group();

  /**
   * Organ -> the materials that must burn red when that organ is flagged.
   *
   * This is what puts the *problem* on the body itself: a critical pancreas is
   * not just a line in the side panel, the pancreas glows red inside the twin.
   */
  const alertTargets: Partial<Record<OrganKey, THREE.ShaderMaterial[]>> = {};
  const markAlert = (organ: OrganKey, material: THREE.ShaderMaterial) => {
    const list = alertTargets[organ] ?? [];
    if (!list.includes(material)) list.push(material);
    alertTargets[organ] = list;
  };

  // ---- Translucent body shell ----------------------------------------------
  // Thinner than a painted skin: the organs inside must stay readable through it.
  // Thicker than the first pass so a user who 'can't see the body' actually
  // sees a solid translucent silhouette instead of a faint contour; thin enough
  // that the named organs still stay readable through it.
  const bodyMaterial = createHologramMaterial(COLOURS.body, 0.62);
  const shell = new THREE.Group();

  // Torso lathed from a profile: shoulders, chest, waist, hips, pelvis.
  // Proportions follow a 1.75 m standing adult: shoulder width ≈ 0.24 of the
  // height, hip at 0.53, head 0.10. The first pass was ~50% too wide, which is
  // what made the twin read as a blocky snowman rather than a person.
  const profile = (
    [
      [0.104, 0.84],
      [0.148, 0.92],
      [0.156, 1.0],
      [0.142, 1.08],
      [0.132, 1.15],
      [0.15, 1.23],
      [0.168, 1.3],
      [0.172, 1.36],
      [0.156, 1.42],
      [0.115, 1.46],
    ] as const
  ).map(([r, y]) => new THREE.Vector2(r, y));
  // A real torso is an ellipse, not a cylinder: flatten it front-to-back.
  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), bodyMaterial);
  torso.scale.z = 0.62;
  shell.add(torso);

  // Head: cranium, brow, nose and jaw on a slim neck. A face is the first thing
  // a child looks for, so the features are modelled even at this scale.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.079, 28, 20), bodyMaterial);
  head.position.set(0, 1.638, 0);
  head.scale.set(0.9, 1.06, 0.96);
  shell.add(head);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.056, 20, 16), bodyMaterial);
  jaw.position.set(0, 1.578, 0.008);
  jaw.scale.set(0.86, 0.8, 0.98);
  shell.add(jaw);
  const brow = new THREE.Mesh(new THREE.SphereGeometry(0.062, 18, 12), bodyMaterial);
  brow.position.set(0, 1.657, 0.026);
  brow.scale.set(0.84, 0.4, 0.92);
  shell.add(brow);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, 12), bodyMaterial);
  nose.position.set(0, 1.612, 0.07);
  nose.rotation.x = Math.PI * 0.5;
  nose.scale.set(0.85, 1, 1);
  shell.add(nose);
  shell.add(capsuleBetween([0, 1.45, -0.004], [0, 1.55, -0.002], 0.05, bodyMaterial));

  // Arms: one continuous tapered limb per side, held a little away from the
  // body with the palms forward — the pose in the anatomical reference — ending
  // in a palm with four fingers and a thumb.
  const ARM_PROFILE: readonly (readonly [number, number])[] = [
    [0.021, 0],
    [0.027, 0.05],
    [0.032, 0.15],
    [0.029, 0.235],
    [0.034, 0.3],
    [0.042, 0.4],
    [0.048, 0.47],
    [0.043, 0.55],
  ];
  for (const side of [-1, 1] as const) {
    shell.add(
      limbBetween(
        [side * 0.318, 0.86, 0.02],
        [side * 0.168, 1.405, 0],
        ARM_PROFILE,
        bodyMaterial,
        22,
        0.86,
      ),
    );
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.042, 18, 14), bodyMaterial);
    palm.position.set(side * 0.336, 0.795, 0.028);
    palm.scale.set(0.62, 1.25, 0.4);
    shell.add(palm);
    for (let finger = 0; finger < 4; finger += 1) {
      const spread = (finger - 1.5) * 0.021;
      shell.add(
        capsuleBetween(
          [side * (0.336 + spread * 0.25), 0.762, 0.03 + spread * 0.4],
          [side * (0.338 + spread * 0.5), 0.708, 0.033 + spread * 0.9],
          0.0092,
          bodyMaterial,
        ),
      );
    }
    shell.add(
      capsuleBetween(
        [side * 0.318, 0.775, 0.042],
        [side * 0.294, 0.744, 0.056],
        0.0115,
        bodyMaterial,
      ),
    );
  }

  // Legs: a single lathe from ankle to hip. The calf bulge, knee and thigh then
  // flow into one another — the thigh capsule + shin capsule + ball knee of the
  // previous build is exactly the "balloons and circles" being reported.
  // They get their own material so a swollen-legs flag can light them up alone.
  const legMaterial = createHologramMaterial(COLOURS.body, 0.44);
  markAlert('legs', legMaterial);
  const LEG_PROFILE: readonly (readonly [number, number])[] = [
    [0.028, 0],
    [0.037, 0.05],
    [0.05, 0.16],
    [0.057, 0.26],
    [0.052, 0.36],
    [0.044, 0.46],
    [0.045, 0.52],
    [0.058, 0.62],
    [0.069, 0.72],
    [0.078, 0.82],
    [0.082, 0.88],
    [0.076, 0.92],
  ];
  for (const side of [-1, 1] as const) {
    shell.add(
      limbBetween([side * 0.072, 0.055, 0], [side * 0.084, 0.9, 0], LEG_PROFILE, legMaterial, 24, 0.88),
    );
    // Foot: a wedge that widens from the ankle into the toes, pointing forward.
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 14), legMaterial);
    foot.position.set(side * 0.072, 0.032, 0.058);
    foot.scale.set(0.72, 0.42, 1.85);
    shell.add(foot);
    for (let toe = 0; toe < 4; toe += 1) {
      const spread = (toe - 1.5) * 0.017;
      shell.add(
        capsuleBetween(
          [side * (0.072 + spread), 0.024, 0.128],
          [side * (0.072 + spread * 1.1), 0.022, 0.152],
          0.0088,
          legMaterial,
        ),
      );
    }
  }

  // Ribcage: five thin hoops at the skin surface. Cheap, and the fastest way to
  // make a torso read as a chest rather than a plain blue tube.
  const ribMaterial = createHologramMaterial(new THREE.Color('#bfdbfe'), 0.34, 2.2);
  const RIB_LEVELS: [number, number][] = [
    [1.405, 0.158],
    [1.345, 0.172],
    [1.285, 0.169],
    [1.225, 0.151],
    [1.165, 0.133],
  ];
  for (const [y, radius] of RIB_LEVELS) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.0042, 6, 32),
      ribMaterial,
    );
    rib.rotation.x = Math.PI / 2;
    rib.position.set(0, y, 0);
    rib.scale.z = 0.62;
    shell.add(rib);
  }

  group.add(shell);

  // ---- Vessel network: arteries red, veins blue ----------------------------
  const vessels = new THREE.Group();
  const artery = new THREE.Color('#ef4444');
  const vein = new THREE.Color('#60a5fa');

  // Aorta down the midline, then the vena cava alongside it.
  vessels.add(vessel([[0, 1.32, 0.015], [0, 1.16, 0.01], [0, 0.98, 0], [0, 0.8, 0]], 0.009, artery));
  vessels.add(
    vessel([[0.03, 1.3, -0.015], [0.033, 1.08, -0.01], [0.028, 0.9, 0], [0.024, 0.8, 0]], 0.011, vein),
  );

  for (const side of [-1, 1] as const) {
    // Carotid up the neck into the skull.
    vessels.add(
      vessel([[side * 0.032, 1.36, 0.01], [side * 0.034, 1.48, 0], [side * 0.026, 1.6, 0]], 0.006, artery),
    );
    // Subclavian out to the shoulder, then the brachial line down the arm. The
    // paths follow the new limb axis so the vessels sit *inside* the arm the way
    // the red/blue lines do in the anatomical reference.
    vessels.add(
      vessel(
        [
          [side * 0.045, 1.37, 0.015],
          [side * 0.13, 1.35, 0.015],
          [side * 0.19, 1.31, 0.012],
          [side * 0.235, 1.18, 0.014],
          [side * 0.262, 1.075, 0.016],
        ],
        0.0058,
        artery,
      ),
    );
    // Radial + ulnar pair continuing to the wrist — two lines per forearm, as in
    // the reference, instead of one tube that stops at the elbow.
    vessels.add(
      vessel(
        [
          [side * 0.262, 1.075, 0.022],
          [side * 0.292, 0.97, 0.024],
          [side * 0.314, 0.885, 0.024],
        ],
        0.005,
        artery,
      ),
    );
    vessels.add(
      vessel(
        [
          [side * 0.262, 1.075, -0.012],
          [side * 0.3, 0.97, -0.01],
          [side * 0.322, 0.9, -0.008],
        ],
        0.0055,
        vein,
      ),
    );
    // Femoral vein down the thigh, behind the bone.
    vessels.add(
      vessel(
        [[side * 0.062, 0.87, -0.014], [side * 0.08, 0.7, -0.012], [side * 0.078, 0.5, -0.012]],
        0.006,
        vein,
      ),
    );
    // Femoral artery slightly forward of it, down to the knee.
    vessels.add(
      vessel(
        [[side * 0.05, 0.86, 0.02], [side * 0.078, 0.7, 0.018], [side * 0.074, 0.5, 0.018]],
        0.006,
        artery,
      ),
    );
    // Popliteal loop: the arc of vessels behind the knee that makes the joint
    // read as a knee rather than a bend in a pipe.
    vessels.add(
      vessel(
        [
          [side * 0.074, 0.52, -0.024],
          [side * 0.092, 0.47, -0.03],
          [side * 0.074, 0.425, -0.024],
        ],
        0.005,
        artery,
      ),
    );
    // Anterior tibial (red) and posterior tibial (blue) down to the ankle.
    vessels.add(
      vessel(
        [[side * 0.074, 0.44, 0.02], [side * 0.07, 0.3, 0.022], [side * 0.072, 0.1, 0.024]],
        0.005,
        artery,
      ),
    );
    vessels.add(
      vessel(
        [[side * 0.076, 0.43, -0.016], [side * 0.072, 0.28, -0.014], [side * 0.074, 0.09, -0.012]],
        0.0055,
        vein,
      ),
    );
  }

  group.add(vessels);

  // ---- Organs ---------------------------------------------------------------
  // Every part is built from simple primitives but shaped so it can be named on
  // sight: a brain has two folded halves, the lungs have a windpipe and two
  // bronchi, the gut is a coiled tube. Plain spheres read as balloons, which is
  // exactly the complaint this rewrite answers.
  const organs = new THREE.Group();

  // ---- Brain: two hemispheres, folds, cerebellum, brainstem ----------------
  const brainMaterial = createHologramMaterial(COLOURS.brain, 0.74, 1.5);
  const foldMaterial = createHologramMaterial(COLOURS.brainFold, 0.8, 1.2);
  markAlert('brain', brainMaterial);
  markAlert('brain', foldMaterial);
  const brainGroup = new THREE.Group();
  for (const side of [-1, 1] as const) {
    const hemisphere = new THREE.Mesh(new THREE.SphereGeometry(0.052, 22, 16), brainMaterial);
    hemisphere.position.set(side * 0.024, 1.664, 0);
    hemisphere.scale.set(0.95, 0.85, 1.15);
    hemisphere.renderOrder = 1;
    brainGroup.add(hemisphere);
    // Stacked rings = the wrinkled surface that says "brain" instead of "ball".
    for (let i = 0; i < 4; i += 1) {
      const radius = 0.026 + 0.02 * Math.sin(Math.PI * (0.22 + 0.62 * (i / 3)));
      const fold = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.0055, 6, 18),
        foldMaterial,
      );
      fold.position.set(side * 0.024, 1.628 + i * 0.025, 0);
      fold.rotation.x = Math.PI / 2;
      fold.rotation.z = side * 0.18;
      fold.scale.set(1, 1, 1.12);
      fold.renderOrder = 1;
      brainGroup.add(fold);
    }
  }
  // The groove between the left and right halves.
  const fissure = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.088, 0.112), foldMaterial);
  fissure.position.set(0, 1.664, 0);
  fissure.renderOrder = 1;
  brainGroup.add(fissure);
  // Shrink the brain to *inside* the cranium. At full size the hemispheres poked
  // through the skull, which made the head read as a pink ball on a stick.
  // 0.82 keeps the widest fold inside the cranium (measured: the lobes were
  // flush with the skull, which is what made the head read as a pink ball).
  brainGroup.scale.setScalar(0.82);
  brainGroup.position.y = 1.664 * 0.18;
  const cerebellum = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), brainMaterial);
  cerebellum.position.set(0, 1.63, -0.05);
  cerebellum.scale.set(1.15, 0.75, 0.85);
  cerebellum.renderOrder = 1;
  brainGroup.add(cerebellum);
  brainGroup.add(
    capsuleBetween([0, 1.642, -0.014], [0, 1.562, -0.004], 0.014, brainMaterial),
  );
  organs.add(brainGroup);

  // ---- Lungs: a lathed lobe each, fed by a windpipe and two bronchi ---------
  const lungGroup = new THREE.Group();
  const lungMaterial = createHologramMaterial(COLOURS.lung, 0.62, 1.9);
  const airwayMaterial = createHologramMaterial(COLOURS.airway, 0.85, 1.2);
  markAlert('lungs', lungMaterial);
  // Narrow at the top (apex), broad at the base — the shape of a real lobe.
  const lungProfile = (
    [
      [0.004, 0],
      [0.048, 0.012],
      [0.064, 0.055],
      [0.068, 0.135],
      [0.058, 0.215],
      [0.036, 0.272],
      [0.012, 0.3],
    ] as const
  ).map(([r, y]) => new THREE.Vector2(r, y));
  const lungGeometry = new THREE.LatheGeometry(lungProfile, 22);
  for (const side of [-1, 1] as const) {
    const lung = new THREE.Mesh(lungGeometry, lungMaterial);
    // Nosed in and slimmed: measured against the torso profile the old lobes
    // poked ~2 cm out of the ribs, so the chest looked like it had two balloons
    // stuck on it instead of lungs inside it.
    lung.position.set(side * 0.096, 1.155, 0);
    lung.scale.set(0.62, 1, 0.5);
    lung.rotation.z = -side * 0.07;
    lung.rotation.y = side * 0.22;
    lung.renderOrder = 1;
    lungGroup.add(lung);
  }
  // Windpipe down the throat, splitting into a bronchus per lung.
  lungGroup.add(
    capsuleBetween([0, 1.5, 0.012], [0, 1.44, 0.008], 0.013, airwayMaterial),
  );
  for (const side of [-1, 1] as const) {
    lungGroup.add(
      vessel(
        [
          [0, 1.442, 0.008],
          [side * 0.045, 1.425, 0.006],
          [side * 0.082, 1.4, 0.004],
        ],
        0.007,
        COLOURS.airway,
      ),
    );
  }
  group.add(lungGroup);

  // ---- Heart: two atria over a tapered ventricle, with its own vessels ------
  // Sits on the patient's left (screen right) like a real heart, not mirrored.
  const heartGroup = new THREE.Group();
  const heartMaterial = createHologramMaterial(COLOURS.heart, 0.8, 1.5);
  markAlert('heart', heartMaterial);
  const heartMesh = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 20), heartMaterial);
  heartMesh.rotation.z = Math.PI;
  heartMesh.rotation.x = 0.12;
  heartMesh.position.set(0, -0.028, 0);
  heartMesh.scale.set(1, 1, 0.82);
  heartMesh.renderOrder = 1;
  heartGroup.add(heartMesh);
  const atria = new THREE.Mesh(new THREE.SphereGeometry(0.034, 18, 14), heartMaterial);
  atria.position.set(0, 0.028, 0);
  atria.scale.set(1.25, 0.72, 0.9);
  atria.renderOrder = 1;
  heartGroup.add(atria);
  // Aortic arch — the candy-cane tube every diagram shows on top of the heart.
  heartGroup.add(
    vessel([[0.006, 0.03, 0.01], [0.01, 0.075, -0.005], [-0.02, 0.086, -0.03], [-0.036, 0.04, -0.036]], 0.007, COLOURS.heart),
  );
  heartGroup.add(
    vessel([[0.004, 0.032, 0.012], [-0.03, 0.05, 0.006], [-0.062, 0.056, -0.004]], 0.006, new THREE.Color('#60a5fa')),
  );
  heartGroup.position.set(0.036, 1.253, 0.046);
  organs.add(heartGroup);

  // ---- Liver (patient's right), stomach, pancreas, gut ---------------------
  const liverMaterial = createHologramMaterial(COLOURS.liver, 0.7, 1.6);
  const liver = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 14), liverMaterial);
  liver.position.set(-0.068, 1.105, 0.028);
  liver.scale.set(1.35, 0.85, 0.8);
  liver.rotation.z = 0.18;
  liver.renderOrder = 1;
  organs.add(liver);
  const liverLobe = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), liverMaterial);
  liverLobe.position.set(-0.016, 1.115, 0.032);
  liverLobe.scale.set(1.25, 0.8, 0.8);
  liverLobe.renderOrder = 1;
  organs.add(liverLobe);

  const stomachMaterial = createHologramMaterial(COLOURS.stomach, 0.72, 1.6);
  const stomach = new THREE.Mesh(
    new THREE.TorusGeometry(0.042, 0.024, 10, 20, Math.PI * 1.05),
    stomachMaterial,
  );
  stomach.position.set(0.074, 1.062, 0.018);
  stomach.rotation.z = Math.PI * 0.34;
  stomach.scale.set(1, 1.15, 0.85);
  stomach.renderOrder = 1;
  organs.add(stomach);
  organs.add(
    vessel([[0.012, 1.42, 0.01], [0.045, 1.24, 0.014], [0.062, 1.12, 0.016]], 0.008, COLOURS.stomach),
  );

  const pancreasMaterial = createHologramMaterial(COLOURS.pancreas, 0.72, 1.8);
  markAlert('pancreas', pancreasMaterial);
  const pancreas = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 14), pancreasMaterial);
  pancreas.position.set(-0.004, 1.022, -0.024);
  pancreas.scale.set(1.7, 0.28, 0.42);
  pancreas.rotation.z = -0.12;
  pancreas.renderOrder = 1;
  organs.add(pancreas);

  // Coiled tube through the lower abdomen. Kept close to one depth so the coil
  // pattern stays legible from the front, the way it is drawn in school books.
  organs.add(
    vessel(
      [
        [-0.074, 0.972, 0.052],
        [0.0, 0.968, 0.055],
        [0.076, 0.958, 0.052],
        [0.076, 0.928, 0.05],
        [0.0, 0.922, 0.054],
        [-0.078, 0.914, 0.05],
        [-0.078, 0.884, 0.048],
        [0.0, 0.878, 0.052],
        [0.074, 0.868, 0.048],
        [0.074, 0.838, 0.046],
        [0.0, 0.832, 0.05],
        [-0.072, 0.824, 0.046],
      ],
      0.017,
      COLOURS.gut,
    ),
  );

  // ---- Kidneys: bean each, with a ureter down to the bladder ---------------
  const kidneyMaterial = createHologramMaterial(COLOURS.kidney, 0.74, 1.7);
  markAlert('kidneys', kidneyMaterial);
  for (const side of [-1, 1] as const) {
    const kidney = new THREE.Mesh(new THREE.SphereGeometry(0.042, 20, 14), kidneyMaterial);
    kidney.position.set(side * 0.1, 0.985, -0.048);
    kidney.scale.set(0.72, 1.25, 0.7);
    kidney.rotation.z = side * 0.12;
    kidney.renderOrder = 1;
    organs.add(kidney);
    organs.add(
      vessel(
        [
          [side * 0.096, 0.94, -0.042],
          [side * 0.06, 0.9, -0.014],
          [side * 0.022, 0.872, 0.014],
        ],
        0.006,
        COLOURS.kidney,
      ),
    );
  }
  const bladder = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 16, 12),
    createHologramMaterial(COLOURS.bladder, 0.7, 1.6),
  );
  bladder.position.set(0, 0.858, 0.016);
  bladder.scale.set(1, 0.85, 0.9);
  bladder.renderOrder = 1;
  organs.add(bladder);

  group.add(organs);

  /**
   * Where each part's name is pinned in model space. Projected to screen and
   * spread apart every frame by the label layer, so names never collide.
   */
  const labelAnchors: {
    name: string;
    colour: string;
    position: THREE.Vector3;
    /** Organ this part maps to, so its chip can show its own alert colour. */
    organ?: OrganKey;
  }[] = [
    { name: 'Brain', colour: '#f472b6', position: new THREE.Vector3(0, 1.748, 0), organ: 'brain' },
    { name: 'Lungs', colour: '#22d3ee', position: new THREE.Vector3(0.126, 1.36, 0.01), organ: 'lungs' },
    { name: 'Heart', colour: '#ef4444', position: new THREE.Vector3(0.052, 1.238, 0.06), organ: 'heart' },
    { name: 'Liver', colour: '#fb923c', position: new THREE.Vector3(-0.098, 1.15, 0.03) },
    { name: 'Stomach', colour: '#c084fc', position: new THREE.Vector3(0.098, 1.09, 0.03) },
    { name: 'Pancreas', colour: '#facc15', position: new THREE.Vector3(-0.06, 1.022, -0.02), organ: 'pancreas' },
    { name: 'Kidneys', colour: '#34d399', position: new THREE.Vector3(0.104, 0.99, -0.048), organ: 'kidneys' },
    { name: 'Intestines', colour: '#818cf8', position: new THREE.Vector3(0.05, 0.848, 0.04) },
  ];

  // Report the real triangle load so the render-budget panel stays honest.
  let triangleCount = 0;
  group.traverse((object) => {
    const geometry = (object as THREE.Mesh).geometry;
    if (!geometry) return;
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    triangleCount += index ? index.count / 3 : position ? position.count / 3 : 0;
  });

  return {
    group,
    bodyMaterial,
    heartGroup,
    lungGroup,
    labelAnchors,
    alertTargets,
    triangleCount: Math.round(triangleCount),
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
  /** Display name printed next to the node. */
  name: string;
  x: number;
  y: number;
  z: number;
  colour: string;
  glow: string;
  radius: number;
  /** Draws as a rounded body part instead of a plain node dot. */
  shape: 'node' | 'lobe';
  /** Organ this node stands for, so it can be painted as a problem area. */
  organ?: OrganKey;
}

/** Same organs, same sides and same colours as the WebGL twin. */
const ORGAN_NODES: OrganNode[] = [
  { name: 'Brain', x: 0, y: 1.665, z: 0, colour: '#f472b6', glow: '244, 114, 182', radius: 8, shape: 'lobe', organ: 'brain' },
  { name: 'Lungs', x: 0.104, y: 1.3, z: 0, colour: '#22d3ee', glow: '34, 211, 238', radius: 7, shape: 'lobe', organ: 'lungs' },
  { name: 'Lungs', x: -0.104, y: 1.3, z: 0, colour: '#22d3ee', glow: '34, 211, 238', radius: 7, shape: 'lobe', organ: 'lungs' },
  { name: 'Heart', x: 0.048, y: 1.24, z: 0.05, colour: '#ef4444', glow: '239, 68, 68', radius: 6, shape: 'node', organ: 'heart' },
  { name: 'Liver', x: -0.062, y: 1.11, z: 0.03, colour: '#fb923c', glow: '251, 146, 60', radius: 6, shape: 'lobe' },
  { name: 'Stomach', x: 0.078, y: 1.065, z: 0.02, colour: '#c084fc', glow: '192, 132, 252', radius: 5.5, shape: 'node' },
  { name: 'Pancreas', x: 0, y: 1.022, z: -0.026, colour: '#facc15', glow: '250, 204, 21', radius: 5, shape: 'node', organ: 'pancreas' },
  { name: 'Kidneys', x: -0.104, y: 0.988, z: -0.05, colour: '#34d399', glow: '52, 211, 153', radius: 5, shape: 'lobe', organ: 'kidneys' },
  { name: 'Kidneys', x: 0.104, y: 0.988, z: -0.05, colour: '#34d399', glow: '52, 211, 153', radius: 5, shape: 'lobe', organ: 'kidneys' },
  { name: 'Intestines', x: 0.01, y: 0.878, z: 0.03, colour: '#818cf8', glow: '129, 140, 248', radius: 7, shape: 'lobe' },
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
  /** Organ -> severity, so problem areas are painted red in this path too. */
  severities: Partial<Record<OrganKey, MarkerStatus>> = {},
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
    const grow = organ.name === 'Heart' ? 1 + 0.4 * beat : 1 + 0.1 * Math.sin(time * 0.002);
    const base = Math.max(3, organ.radius * Math.max(0.75, scale / 200));
    const r = base * grow;

    const level = organ.organ ? severities[organ.organ] : undefined;
    const flagged = level === 'critical' || level === 'borderline';
    // Same rule as the WebGL twin: a problem area is painted alarm red, so the
    // 2D fallback answers "where is the problem?" identically.
    const glow = level === 'critical' ? '255, 77, 77' : flagged ? '251, 146, 60' : organ.glow;
    const fill = level === 'critical' ? '#ff4d4d' : flagged ? '#fb923c' : organ.colour;

    const organHalo = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.4);
    organHalo.addColorStop(0, `rgba(${glow}, 0.8)`);
    organHalo.addColorStop(0.4, `rgba(${glow}, 0.28)`);
    organHalo.addColorStop(1, `rgba(${glow}, 0)`);
    ctx.fillStyle = organHalo;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 3.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = fill;
    ctx.beginPath();
    // Lobes are drawn as ovals so a pair (lungs, kidneys) reads as two organs.
    if (organ.shape === 'lobe') {
      ctx.ellipse(sx, sy, r * 0.9, r * 1.3, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, r + 1.6, 0, Math.PI * 2);
    ctx.stroke();

    if (flagged) {
      // Pulsing warning ring: the flagged organ is obvious even at a glance.
      const warn = 0.5 + 0.5 * Math.sin(time * 0.006);
      ctx.strokeStyle = `rgba(248, 113, 113, ${0.45 + 0.5 * warn})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 5 + warn * 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Part names: pushed apart vertically so dense organs stay readable, each
  // tied back to its organ with a dashed leader line.
  const labels = organs
    .filter((entry, index, all) => all.findIndex((other) => other.organ.name === entry.organ.name) === index)
    .map((entry) => ({ name: entry.organ.name, colour: entry.organ.colour, anchorX: entry.sx, anchorY: entry.sy, y: entry.sy }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i += 1) {
    if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
  }
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'middle';
  for (const label of labels) {
    const right = label.anchorX >= cx;
    const textX = right ? label.anchorX + 14 : label.anchorX - 14;
    ctx.textAlign = right ? 'left' : 'right';
    ctx.strokeStyle = label.colour;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(label.anchorX, label.anchorY);
    ctx.lineTo(textX, label.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = label.colour;
    ctx.fillText(label.name, right ? textX + 2 : textX - 2, label.y);
  }
}

export function BodyTwinCanvas() {
  /**
   * Whichever twin canvas is mounted. Only one of the two branches below is in
   * the tree at a time, so a single ref is unambiguous — and it is also the
   * element the visibility pause watches.
   */
  const stageRef = useRef<HTMLCanvasElement>(null);
  /**
   * Which twin is live: `'gl'` is the three.js WebGL twin, `'2d'` is the
   * fail-proof HTML5 hologram. Probed once, offscreen, before either mounts.
   */
  const [mode, setMode] = useState<'gl' | '2d'>(() => (canUseWebGL() ? 'gl' : '2d'));
  const bodyMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const heartGroupRef = useRef<THREE.Group | null>(null);
  const lungGroupRef = useRef<THREE.Group | null>(null);
  // Mirrored into state so the render-budget caption updates once known.
  const [triangleCount, setTriangleCount] = useState(0);
  /** Part names shown on the twin; filled in once the geometry is built. */
  const [labelSpecs, setLabelSpecs] = useState<
    { name: string; colour: string; position: THREE.Vector3; organ?: OrganKey }[]
  >([]);
  /** Name chips and their leader lines, moved imperatively — never re-rendered. */
  const labelElsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const leaderElsRef = useRef<(SVGLineElement | null)[]>([]);
  const isAnimatingRef = useRef(true);
  const rotationRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  const { alerts, focusOrgan, setFocusOrgan } = useDiagnostics();

  // Latest diagnostics state, read inside the RAF loop without re-creating it.
  /** Severity per organ, read inside the RAF loop without re-creating it. */
  const severityRef = useRef<Partial<Record<OrganKey, MarkerStatus>>>({});
  /** Organ -> materials that light up red when that organ is flagged. */
  const alertTargetsRef = useRef<Partial<Record<OrganKey, THREE.ShaderMaterial[]>>>({});
  const focusOrganRef = useRef<OrganKey | null>(null);
  const setFocusOrganRef = useRef(setFocusOrgan);

  setFocusOrganRef.current = setFocusOrgan;

  const severityByOrgan = useMemo(() => {
    const next: Partial<Record<OrganKey, MarkerStatus>> = {};
    for (const alert of alerts) next[alert.organ] = alert.severity;
    return next;
  }, [alerts]);

  useEffect(() => {
    severityRef.current = severityByOrgan;
  }, [severityByOrgan]);

  useEffect(() => {
    focusOrganRef.current = focusOrgan;
  }, [focusOrgan]);

  useVisibilityPause(isAnimatingRef, stageRef);

  // ---- WebGL twin: only ever mounted when the offscreen probe succeeded -----
  useEffect(() => {
    if (mode !== 'gl') return;
    const canvas = stageRef.current;
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
    // Framed on the whole standing figure (feet to head): the legs are the part
    // the user reported as unreadable, so they must never be cropped off.
    camera.position.set(0, 0.95, 3.05);
    camera.lookAt(0, 0.87, 0);

    const {
      group,
      bodyMaterial,
      heartGroup,
      lungGroup,
      labelAnchors,
      alertTargets,
      triangleCount: built,
    } = buildSkeleton();
    bodyMaterialRef.current = bodyMaterial;
    heartGroupRef.current = heartGroup;
    lungGroupRef.current = lungGroup;
    alertTargetsRef.current = alertTargets;
    setTriangleCount(built);
    setLabelSpecs(labelAnchors);
    scene.add(group);

    scene.add(new THREE.AmbientLight(0x404060, 0.5));
    const dirLight = new THREE.DirectionalLight(0x06b6d4, 0.8);
    dirLight.position.set(2, 3, 4);
    scene.add(dirLight);

    let rafId: number | null = null;
    let wakeTimer: number | null = null;
    let alive = true;
    /** Timestamp of the last frame the loop actually drew, for drag fallbacks. */
    let lastFrameAt = 0;

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
      lastFrameAt = performance.now();

      // ---- Alert-driven orbit toward the flagged organ ---------------------
      const focus = focusOrganRef.current;
      if (focus && !isDraggingRef.current) {
        const view = ORGAN_VIEW[focus];
        rotationRef.current.y = lerpAngle(rotationRef.current.y, view.yaw, 0.06);
        rotationRef.current.x = lerp(rotationRef.current.x, view.tilt, 0.06);
      }

      applyRotation();
      placeLabels();

      // ---- Heart beat: scale the whole organ so it reads at a distance -------
      const severity = severityRef.current.heart ?? null;
      if (heartGroupRef.current) {
        let swell: number;
        if (severity === 'critical') {
          // Fast double-thump, the shape of an anxious pulse.
          const beat = Math.abs(Math.sin(time * 0.005));
          const thump = Math.abs(Math.sin(time * 0.005) * Math.sin(time * 0.0055));
          swell = 1 + 0.22 * beat + 0.1 * thump;
        } else if (severity === 'borderline') {
          swell = 1 + 0.12 * Math.abs(Math.sin(time * 0.0035));
        } else {
          swell = 1 + 0.04 * Math.sin(time * 0.002);
        }
        heartGroupRef.current.scale.setScalar(swell);
      }

      // ---- Breathing: lungs and shell expand together ------------------------
      if (lungGroupRef.current) {
        const breath = 1 + 0.022 * Math.sin(time * 0.0015);
        lungGroupRef.current.scale.set(breath, breath, breath);
      }

      if (bodyMaterialRef.current) {
        // Slow shimmer on the shell so the hologram stays alive at near-zero cost.
        const uniform = bodyMaterialRef.current.uniforms.uOpacity;
        if (uniform) uniform.value = 0.62 + 0.06 * (0.5 + 0.5 * Math.sin(time * 0.0015));
      }

      // ---- Problem areas: a flagged organ burns red on the body itself -------
      // A critical organ pulses, a borderline one holds a steady amber-red tint,
      // so "where is the problem?" is answered by looking at the twin.
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.004);
      for (const [organ, materials] of Object.entries(alertTargetsRef.current)) {
        const level = severityRef.current[organ as OrganKey];
        const target =
          level === 'critical' ? 0.55 + 0.45 * pulse : level === 'borderline' ? 0.34 : 0;
        for (const material of materials) {
          const uniform = material.uniforms.uAlert;
          if (uniform) uniform.value = target;
        }
      }

      renderer.render(scene, camera);
    };

    /**
     * Pin every part name to its organ, then spread the names apart so two
     * dense organs (heart/liver/stomach) never print on top of each other.
     * Runs imperatively on the DOM: no React state changes per frame.
     */
    const projected = new THREE.Vector3();
    const placeLabels = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      group.updateMatrixWorld(true);

      const placed: { x: number; y: number; anchorX: number; anchorY: number; index: number }[] = [];
      for (let index = 0; index < labelAnchors.length; index += 1) {
        const spec = labelAnchors[index];
        projected.copy(spec.position).applyMatrix4(group.matrixWorld);
        const depth = projected.z;
        projected.project(camera);
        if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) continue;
        const anchorX = (projected.x * 0.5 + 0.5) * width;
        const anchorY = (-projected.y * 0.5 + 0.5) * height;
        // Names on the far side of the body stay visible but dimmed, so the
        // viewer can still tell which kidney/intestine is being pointed at.
        const element = labelElsRef.current[index];
        if (element) element.style.opacity = depth < -0.015 ? '0.42' : '1';
        const side = anchorX >= width * 0.5 ? 1 : -1;
        placed.push({
          index,
          anchorX,
          anchorY,
          x: clamp(anchorX + side * 46, 40, width - 40),
          y: anchorY,
        });
      }

      // Push overlapping names apart along Y (classic label-placement pass).
      placed.sort((a, b) => a.y - b.y);
      const MIN_GAP = 15;
      for (let i = 1; i < placed.length; i += 1) {
        if (placed[i].y - placed[i - 1].y < MIN_GAP) placed[i].y = placed[i - 1].y + MIN_GAP;
      }
      const overflow = placed.length ? placed[placed.length - 1].y - (height - 12) : 0;
      if (overflow > 0) for (const entry of placed) entry.y -= overflow;

      for (const entry of placed) {
        const element = labelElsRef.current[entry.index];
        if (element) {
          element.style.transform = `translate3d(${entry.x}px, ${entry.y}px, 0) translate(-50%, -50%)`;
        }
        const leader = leaderElsRef.current[entry.index];
        if (leader) {
          leader.setAttribute('x1', String(entry.anchorX));
          leader.setAttribute('y1', String(entry.anchorY));
          leader.setAttribute('x2', String(entry.x));
          leader.setAttribute('y2', String(entry.y));
          leader.setAttribute('visibility', 'visible');
        }
      }
    };

    /** Push the orbit angles onto the model. */
    const applyRotation = () => {
      group.rotation.y = rotationRef.current.y;
      group.rotation.x = rotationRef.current.x;
    };

    const onPointerDown = (event: PointerEvent) => {
      isDraggingRef.current = true;
      // The user takes manual control: stop auto-orbiting.
      if (focusOrganRef.current) setFocusOrganRef.current(null);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      // Touching the twin always wakes it: if the visibility pause had parked the
      // loop, a drag would otherwise change nothing on screen.
      isAnimatingRef.current = true;
      startLoop();
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic or already-released pointer — dragging still works without it.
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      rotationRef.current.y += dx * 0.01;
      rotationRef.current.x = clamp(rotationRef.current.x + dy * 0.005, -1.2, 1.2);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      // If the loop has not drawn recently (parked by the visibility pause, or a
      // frozen rAF), draw here so the drag still tracks the pointer. A live loop
      // picks the angles up on its next frame — no double render.
      if (performance.now() - lastFrameAt > 120) {
        applyRotation();
        placeLabels();
        renderer.render(scene, camera);
        lastFrameAt = performance.now();
      }
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
      applyRotation();
      placeLabels();
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
      heartGroupRef.current = null;
      lungGroupRef.current = null;
      alertTargetsRef.current = {};
    };
  }, [mode]);

  // ---- 2D hologram: sizing first so the first frame is already crisp -------
  useEffect(() => {
    if (mode !== '2d') return;
    const fbCanvas = stageRef.current;
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
    const fbCanvas = stageRef.current;
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
        severityRef.current,
      );
    };
    rafId = requestAnimationFrame(loop);

    const onPointerDown = (event: PointerEvent) => {
      isDraggingRef.current = true;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      try {
        fbCanvas.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic or already-released pointer — dragging still works without it.
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      rotationRef.current.y += dx * 0.01;
      rotationRef.current.x = clamp(rotationRef.current.x + dy * 0.005, -1.2, 1.2);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      // Paint straight away so the drag never feels dead if the loop is parked.
      drawHologram(
        ctx,
        fbCanvas.width,
        fbCanvas.height,
        performance.now(),
        rotationRef.current.y,
        rotationRef.current.x,
        severityRef.current,
      );
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
          ref={stageRef}
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
        ref={stageRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        aria-label="Interactive 3D anatomical twin"
      />

      {/* Leader lines: dashes from each organ out to its name. */}
      <svg className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true">
        {labelSpecs.map((spec, index) => (
          <line
            key={`leader-${spec.name}`}
            ref={(element) => {
              leaderElsRef.current[index] = element;
            }}
            stroke={spec.colour}
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity="0.7"
            visibility="hidden"
          />
        ))}
      </svg>

      {/* Part names. Moved straight on the DOM each frame, so naming every organ
          costs no React renders. */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {labelSpecs.map((spec, index) => {
          const level = spec.organ ? severityByOrgan[spec.organ] : undefined;
          const flagged = level === 'critical' || level === 'borderline';
          return (
            <span
              key={spec.name}
              ref={(element) => {
                labelElsRef.current[index] = element;
              }}
              className={`absolute left-0 top-0 whitespace-nowrap rounded-full border px-1.5 py-[1px] text-[9px] font-medium ${
                level === 'critical'
                  ? 'border-red-400/90 bg-red-950/90 text-red-100'
                  : level === 'borderline'
                    ? 'border-amber-400/80 bg-amber-950/85 text-amber-100'
                    : 'border-slate-700/70 bg-slate-950/85 text-slate-200'
              }`}
              style={{ transform: 'translate3d(-999px, -999px, 0)', willChange: 'transform' }}
            >
              <span
                className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{ background: flagged ? '#f87171' : spec.colour }}
              />
              {flagged ? '⚠ ' : ''}
              {spec.name}
            </span>
          );
        })}
      </div>

      <div className="absolute bottom-3 left-3 right-3 flex justify-between pointer-events-none text-[11px] text-slate-500 font-mono">
        <span>
          {`${focusOrgan ? `focus: ${focusOrgan}` : 'idle'}${
            triangleCount > 0 ? ` · ≤${triangleCount.toLocaleString('en-IN')} tris` : ''
          } · pixcap ${PIXEL_RATIO_CAP}`}
        </span>
        <span>
          {Object.keys(severityByOrgan).length
            ? 'drag to rotate · problem areas glow red'
            : 'drag to rotate'}
        </span>
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
