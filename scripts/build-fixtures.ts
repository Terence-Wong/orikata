/**
 * Writes the fixtures too long to type out. The accordion pleat, waterbomb base and Miura-ori come
 * from closed forms; the paper airplane and crane are written as folding sequences (see
 * `folding-sequence.ts`). The working is in `fixtures/README.md`, and
 * `tests/unit/fixtures.test.ts` checks every result is a rigid fold of one sheet, so a mistake
 * fails the suite rather than slipping through.
 *
 * Run with `pnpm fixtures`.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadFold, type Assignment } from "@/fold";
import {
  apply,
  compose,
  FoldingSequence,
  foldAcross,
  invertMotion,
  motionFromTriangle,
  turnAbout,
  type FaceInfo,
  type Layers,
  type Motion,
  type Vec2,
  type Vec3,
} from "./folding-sequence";

type Vertex = [number, number, number];

interface Frame {
  title: string;
  description?: string;
  vertices: Vertex[];
  assignments?: Assignment[];
}

interface Fixture {
  title: string;
  patternTitle: string;
  patternDescription?: string;
  vertices: Vertex[];
  edges: [number, number][];
  assignments: Assignment[];
  faces: number[][];
  frames: Frame[];
}

/** Twelve significant digits: enough that the rigidity checks hold to 1e-8. */
function round(value: number): number {
  const rounded = Number(value.toPrecision(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function toFold(fixture: Fixture): string {
  const flat = fixture.vertices.map(([x, y]) => [round(x), round(y)]);
  const document = {
    file_spec: 1.1,
    file_creator: "Orikata fixtures (scripts/build-fixtures.ts)",
    file_title: fixture.title,
    file_classes: ["singleModel"],
    frame_title: fixture.patternTitle,
    ...(fixture.patternDescription ? { frame_description: fixture.patternDescription } : {}),
    frame_classes: ["creasePattern"],
    frame_unit: "unit",
    vertices_coords: flat,
    edges_vertices: fixture.edges,
    edges_assignment: fixture.assignments,
    faces_vertices: fixture.faces,
    file_frames: fixture.frames.map((frame, index) => ({
      frame_title: frame.title,
      ...(frame.description ? { frame_description: frame.description } : {}),
      frame_classes: ["foldedForm"],
      frame_parent: index,
      frame_inherit: true,
      vertices_coords: frame.vertices.map((v) => v.map(round)),
      ...(frame.assignments ? { edges_assignment: frame.assignments } : {}),
    })),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * An accordion pleat: a strip divided into equal panels by parallel creases that alternate
 * mountain and valley. Each panel keeps its width, so the profile is a zigzag whose panels make an
 * angle ±a with the flat sheet; the crease between them is then folded by 2a, and a = 90° folds
 * the pleat flat onto itself.
 */
function accordionPleat(): Fixture {
  const panels = 6;
  const width = 1 / panels;

  const profile = (halfAngle: number): [number, number][] => {
    const points: [number, number][] = [[0, 0]];
    let x = 0;
    let z = 0;
    for (let k = 0; k < panels; k++) {
      const direction = k % 2 === 0 ? halfAngle : -halfAngle;
      x += width * Math.cos(direction);
      z += width * Math.sin(direction);
      points.push([x, z]);
    }
    return points;
  };

  const vertices: Vertex[] = [];
  for (const [x] of profile(0)) {
    vertices.push([x, 0, 0], [x, 1, 0]);
  }

  const edges: [number, number][] = [];
  const assignments: Assignment[] = [];
  // The creases across the strip: the ends are boundary, the rest alternate mountain and valley.
  for (let k = 0; k <= panels; k++) {
    edges.push([2 * k, 2 * k + 1]);
    assignments.push(k === 0 || k === panels ? "B" : k % 2 === 1 ? "V" : "M");
  }
  // The two long edges of the strip.
  for (let k = 0; k < panels; k++) {
    edges.push([2 * k, 2 * k + 2]);
    assignments.push("B");
    edges.push([2 * k + 1, 2 * k + 3]);
    assignments.push("B");
  }

  const faces: number[][] = [];
  for (let k = 0; k < panels; k++) {
    faces.push([2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1]);
  }

  const frameAt = (degrees: number, title: string, description?: string): Frame => {
    const points = profile((degrees / 2) * (Math.PI / 180));
    const folded: Vertex[] = [];
    for (const [x, z] of points) {
      folded.push([x, 0, z], [x, 1, z]);
    }
    return { title, description, vertices: folded };
  };

  return {
    title: "Accordion pleat",
    patternTitle: "Strip with six panels",
    patternDescription: "Creases across the strip alternate valley and mountain.",
    vertices,
    edges,
    assignments,
    faces,
    frames: [
      frameAt(60, "Start the pleat", "Every crease folds by the same amount at once."),
      frameAt(120, "Press it further"),
      frameAt(180, "Flatten the pleat", "The panels stack on top of each other."),
    ],
  };
}

/**
 * A waterbomb base: the preliminary base's crease pattern with mountain and valley exchanged, so
 * the corners rise instead of falling. The collapse has one degree of freedom, and the same
 * rigidity equations apply mirrored in z.
 */
function waterbombBase(): Fixture {
  const vertices: Vertex[] = [
    [0, 0, 0],
    [1, 1, 0],
    [-1, 1, 0],
    [-1, -1, 0],
    [1, -1, 0],
    [1, 0, 0],
    [0, 1, 0],
    [-1, 0, 0],
    [0, -1, 0],
  ];

  const edges: [number, number][] = [
    [5, 1],
    [1, 6],
    [6, 2],
    [2, 7],
    [7, 3],
    [3, 8],
    [8, 4],
    [4, 5],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [0, 6],
    [0, 7],
    [0, 8],
  ];
  // Diagonals mountain, midlines valley: the opposite of the preliminary base.
  const assignments: Assignment[] = [
    ...(["B", "B", "B", "B", "B", "B", "B", "B"] as Assignment[]),
    ...(["M", "M", "M", "M"] as Assignment[]),
    ...(["V", "V", "V", "V"] as Assignment[]),
  ];
  const faces = [
    [0, 5, 1],
    [0, 1, 6],
    [0, 6, 2],
    [0, 2, 7],
    [0, 7, 3],
    [0, 3, 8],
    [0, 8, 4],
    [0, 4, 5],
  ];

  /**
   * Corners sit at radius rc and height hc, midpoints at rm and hm, on their original azimuths.
   * Rigidity gives rc² + hc² = 2, rm² + hm² = 1 and (rc/√2 − rm)² + (rc/√2)² + (hc − hm)² = 1.
   */
  const frameAt = (hc: number, title: string, description?: string): Frame => {
    const rc = Math.sqrt(Math.max(0, 2 - hc * hc));
    // Substituting the first two into the third leaves √2·rm + 2·hm·(hc/…) — solved per case below.
    const hm = solveMidpointHeight(rc, hc);
    const rm = Math.sqrt(Math.max(0, 1 - hm * hm));
    const s = Math.SQRT1_2;
    const corner = (sx: number, sy: number): Vertex => [sx * rc * s, sy * rc * s, hc];
    return {
      title,
      description,
      vertices: [
        [0, 0, 0],
        corner(1, 1),
        corner(-1, 1),
        corner(-1, -1),
        corner(1, -1),
        [rm, 0, hm],
        [0, rm, hm],
        [-rm, 0, hm],
        [0, -rm, hm],
      ],
    };
  };

  return {
    title: "Waterbomb base",
    patternTitle: "Precreased square",
    patternDescription: "Diagonals are mountains, midlines are valleys.",
    vertices,
    edges,
    assignments,
    faces,
    frames: [
      frameAt(1, "Begin the collapse", "The corners lift while the sides push outwards."),
      frameAt(Math.SQRT2, "Bring the corners together", "The four corners meet above the centre."),
    ],
  };
}

/**
 * Height of a midpoint when the corners are at (rc, hc). The corner-to-midpoint edge has length 1,
 * which with rm² + hm² = 1 gives a quadratic in hm; the root below is the one that folds rather
 * than the inverted one.
 */
function solveMidpointHeight(rc: number, hc: number): number {
  const s = Math.SQRT1_2;
  // (rc·s − rm)² + (rc·s)² + (hc − hm)² = 1, with rm² + hm² = 1.
  // Expanding and using rm² + hm² = 1: rc² − 2·rc·s·rm − 2·hc·hm + hc² = 0.
  // So rm = (rc² + hc² − 2·hc·hm) / (2·rc·s) when rc > 0.
  // Corners meeting on the axis: rm² + hm² = 1 and rm² + (hc − hm)² = 1 leave hm = hc/2.
  if (rc === 0) return hc / 2;
  const k = (rc * rc + hc * hc) / (2 * rc * s);
  const m = hc / (rc * s);
  // rm = k − m·hm, and rm² + hm² = 1.
  const a = 1 + m * m;
  const b = -2 * k * m;
  const c = k * k - 1;
  const discriminant = Math.sqrt(Math.max(0, b * b - 4 * a * c));
  // Two roots satisfy the lengths: the larger collapses every midpoint onto the axis, which is a
  // rigid but degenerate state. The smaller one is the fold.
  return (-b - discriminant) / (2 * a);
}

/**
 * A Miura-ori: a rigidly foldable tessellation of identical parallelograms with a single degree of
 * freedom, so the whole sheet folds and unfolds together. The largest fixture here, and the one
 * with the most creases moving at once.
 *
 * Flat, vertex (i, j) sits at (i·p + (j mod 2)·d, j·q): straight rows, columns that zigzag by d.
 * Folded, take
 *   P(i, j) = (i·S + (j mod 2)·D, j·L, (i mod 2)·H)
 * which keeps every face a parallelogram, hence planar. Rigidity then asks for
 *   S² + H² = p²            (the row edges keep their length)
 *   D² + L² = d² + q²       (the column edges keep theirs)
 *   S·D = p·d               (the angle between them is unchanged)
 * Those leave one free parameter: S, running from p (flat) down to p·d/√(d² + q²), where L reaches
 * zero and the sheet is folded flat. H, D and L follow.
 */
function miuraOri(): Fixture {
  const columns = 8;
  const rows = 6;
  const p = 0.16;
  const d = 0.07;
  const q = 0.13;

  const place = (s: number): Vertex[] => {
    const h = Math.sqrt(Math.max(0, p * p - s * s));
    const bigD = (p * d) / s;
    const l = Math.sqrt(Math.max(0, d * d + q * q - bigD * bigD));
    const vertices: Vertex[] = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= columns; i++) {
        vertices.push([i * s + (j % 2) * bigD, j * l, (i % 2) * h]);
      }
    }
    return vertices;
  };

  const index = (i: number, j: number) => j * (columns + 1) + i;
  const smallest = (p * d) / Math.sqrt(d * d + q * q);

  const edges: [number, number][] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < columns; i++) edges.push([index(i, j), index(i + 1, j)]);
  }
  for (let i = 0; i <= columns; i++) {
    for (let j = 0; j < rows; j++) edges.push([index(i, j), index(i, j + 1)]);
  }

  const faces: number[][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      faces.push([index(i, j), index(i + 1, j), index(i + 1, j + 1), index(i, j + 1)]);
    }
  }

  /** `fraction` runs 0 (flat) to 1 (as folded as this pattern goes). */
  const frameAt = (fraction: number, title: string, description?: string): Frame => ({
    title,
    description,
    vertices: place(p + fraction * (smallest - p)),
  });

  return {
    title: "Miura-ori",
    patternTitle: "Miura tessellation",
    patternDescription: "Straight rows and zigzagging columns, all folding as one.",
    vertices: place(p),
    edges,
    assignments: edges.map(() => "U" as Assignment),
    faces,
    frames: [
      frameAt(
        0.35,
        "Start collapsing",
        "The whole sheet folds at once: it has one degree of freedom.",
      ),
      frameAt(0.7, "Keep going"),
      frameAt(0.97, "Nearly closed", "The parallelograms stack into a compact block."),
    ],
  };
}

/**
 * The classic dart, from a sheet in the proportions of A4. Every step is a plain fold of the layers
 * on one side of a line, so mountain and valley come straight from the direction each layer turns.
 */
function paperAirplane(): Fixture {
  const h = Math.SQRT2;
  const all: Layers = () => true;
  const tan22 = Math.SQRT2 - 1;
  // The wing crease runs parallel to the keel, this far from it once the plane is folded in half.
  const keel = 0.13;

  const sequence = new FoldingSequence([
    [-0.5, 0],
    [0.5, 0],
    [0.5, h],
    [-0.5, h],
  ])
    .step({
      title: "Crease down the middle",
      description: "Fold the sheet in half lengthways, behind.",
      operations: [
        {
          kind: "fold",
          line: [
            [0, 0],
            [0, 1],
          ],
          side: [0.25, 0.5],
          groups: [{ layers: all, angle: -180 }],
        },
      ],
    })
    .step({
      title: "Unfold",
      operations: [
        {
          kind: "fold",
          line: [
            [0, 0],
            [0, 1],
          ],
          side: [-0.25, 0.5],
          groups: [{ layers: ({ cp }) => cp[0] > 0, angle: -180 }],
        },
      ],
    })
    .step({
      title: "Fold the top corners to the centre",
      operations: [
        {
          kind: "fold",
          line: [
            [0, h],
            [-0.5, h - 0.5],
          ],
          side: [-0.45, h - 0.02],
          groups: [{ layers: all, angle: 180 }],
        },
        {
          kind: "fold",
          line: [
            [0, h],
            [0.5, h - 0.5],
          ],
          side: [0.45, h - 0.02],
          groups: [{ layers: all, angle: 180 }],
        },
      ],
    })
    .step({
      title: "Fold the slanted edges to the centre",
      description: "The nose narrows to a point.",
      operations: [
        {
          kind: "fold",
          line: [
            [0, h],
            [-0.5, h - 0.5 / tan22],
          ],
          side: [-0.49, 1],
          groups: [{ layers: all, angle: 180 }],
        },
        {
          kind: "fold",
          line: [
            [0, h],
            [0.5, h - 0.5 / tan22],
          ],
          side: [0.49, 1],
          groups: [{ layers: all, angle: 180 }],
        },
      ],
    })
    .step({
      title: "Fold in half",
      description: "Fold the left half behind, so the flaps end up outside.",
      operations: [
        {
          kind: "fold",
          line: [
            [0, 0],
            [0, 1],
          ],
          side: [-0.2, 0.5],
          groups: [{ layers: all, angle: -180 }],
        },
      ],
    })
    .step({
      title: "Fold the wings down",
      description: "One wing to the front, the other behind, along a line parallel to the keel.",
      operations: [
        {
          kind: "fold",
          line: [
            [keel, 0],
            [keel, 1],
          ],
          side: [0.4, 0.5],
          groups: [
            { layers: ({ cp }) => cp[0] > 0, angle: 180, tag: "front wing" },
            { layers: ({ cp }) => cp[0] < 0, angle: -180, tag: "back wing" },
          ],
        },
      ],
    })
    .step({
      title: "Open the wings",
      description: "Lift both wings level, square to the body.",
      operations: [
        {
          kind: "fold",
          line: [
            [keel, 0],
            [keel, 1],
          ],
          side: [keel - 0.1, 0.5],
          groups: [
            { layers: ({ tags }) => tags.has("front wing"), angle: 90 },
            { layers: ({ tags }) => tags.has("back wing"), angle: -90 },
          ],
        },
      ],
    });

  return {
    title: "Paper airplane",
    patternTitle: "A4 sheet",
    patternDescription: "The creases of the classic dart.",
    ...sequence.build(),
  };
}

function unitVector([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

/**
 * The angle, in `turnAbout`'s convention for this line and side, that turns `from` to `to`. Both
 * points must be the same distance from the line.
 */
function signedTurn(line: readonly [Vec2, Vec2], side: Vec2, from: Vec3, to: Vec3): number {
  // `turnAbout` by a right angle shows which way positive goes; measure against that.
  const quarter = apply(turnAbout(line, side, 90), from);
  const [a] = line;
  const foot = (p: Vec3): Vec3 => {
    const axis = unitVector([line[1][0] - a[0], line[1][1] - a[1], 0]);
    const t = (p[0] - a[0]) * axis[0] + (p[1] - a[1]) * axis[1];
    return [a[0] + t * axis[0], a[1] + t * axis[1], 0];
  };
  const base = foot(from);
  const u: Vec3 = [from[0] - base[0], from[1] - base[1], from[2] - base[2]];
  const v: Vec3 = [quarter[0] - base[0], quarter[1] - base[1], quarter[2] - base[2]];
  const w: Vec3 = [to[0] - base[0], to[1] - base[1], to[2] - base[2]];
  const along = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  const across = v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
  return (Math.atan2(across, along) * 180) / Math.PI;
}

/**
 * The traditional crane, from a square of half-width 1 centred on the origin, as in
 * `preliminary-base`. It collapses the same way (frames 1–3 use that fixture's closed form, stood
 * upright), then kite folds, petal folds front and back, reverse folds the neck, tail and head, and
 * spreads the wings. Model coordinates below are the flat, upright preliminary base: centre of the
 * sheet at the top (0, 0), the corners together at the bottom (0, −√2).
 */
function crane(): Fixture {
  const r2 = Math.SQRT2;
  const bottom: Vec2 = [0, -r2];
  // The kite creases meet the sides of the base at K; the petal fold's hinge runs through both.
  const k = r2 - 1;
  const kRight: Vec2 = [k, -k];
  const kLeft: Vec2 = [-k, -k];
  const hingeY = -k;
  const hinge = [kLeft, kRight] as const;
  const hingeCentre: Vec2 = [0, hingeY];

  // Layers by where they came from in the crease pattern: quadrants, and the wedges around each
  // edge midpoint (the four "arms" of the preliminary base, two layers each).
  const q1 = ({ cp }: FaceInfo) => cp[0] > 0 && cp[1] > 0;
  const q2 = ({ cp }: FaceInfo) => cp[0] < 0 && cp[1] > 0;
  const q3 = ({ cp }: FaceInfo) => cp[0] < 0 && cp[1] < 0;
  const q4 = ({ cp }: FaceInfo) => cp[0] > 0 && cp[1] < 0;
  const right = ({ cp }: FaceInfo) => cp[0] > Math.abs(cp[1]);
  const top = ({ cp }: FaceInfo) => cp[1] > Math.abs(cp[0]);
  const left = ({ cp }: FaceInfo) => -cp[0] > Math.abs(cp[1]);
  const under = ({ cp }: FaceInfo) => -cp[1] > Math.abs(cp[0]);
  const tagged =
    (name: string) =>
    ({ tags }: FaceInfo) =>
      tags.has(name);
  const belowHinge = ({ world }: FaceInfo) => world[1] < hingeY - 1e-6;
  const and =
    (...all: Layers[]): Layers =>
    (face) =>
      all.every((layers) => layers(face));
  const not =
    (layers: Layers): Layers =>
    (face) =>
      !layers(face);

  // The collapse. Vertex j of the base sits at azimuth j·45° in the crease pattern: even j are edge
  // midpoints at radius 1, odd j corners at radius √2. `place` gives each vertex's position in
  // preliminary-base's coordinates (z up); `upright` turns that so the flat base lies in z = 0.
  const upright = ([x, y, z]: Vec3): Vec3 => [x, z, -y];
  const collapse = (place: (j: number) => Vec3) => (face: FaceInfo) => {
    const sector = Math.floor(
      (((Math.atan2(face.cp[1], face.cp[0]) * 180) / Math.PI + 360) % 360) / 45,
    );
    const flat = (j: number): Vec2 => {
      const radius = j % 2 === 0 ? 1 : r2;
      const azimuth = (j * Math.PI) / 4;
      return [radius * Math.cos(azimuth), radius * Math.sin(azimuth)];
    };
    const j0 = sector;
    const j1 = (sector + 1) % 8;
    return motionFromTriangle(
      [[0, 0], flat(j0), flat(j1)],
      [[0, 0, 0], upright(place(j0)), upright(place(j1))],
    );
  };
  const onAzimuth = (j: number, radius: number, height: number): Vec3 => {
    const azimuth = (j * Math.PI) / 4;
    return [radius * Math.cos(azimuth), radius * Math.sin(azimuth), height];
  };
  const partial = (j: number) =>
    j % 2 === 0 ? onAzimuth(j, (2 * r2) / 3, -1 / 3) : onAzimuth(j, 1, -1);
  const cornersMeet = (j: number) =>
    j % 2 === 0 ? onAzimuth(j, r2 / 2, -r2 / 2) : ([0, 0, -r2] as Vec3);
  const flattened = (j: number): Vec3 =>
    j % 2 === 1 ? [0, 0, -r2] : j === 0 || j === 2 ? [r2 / 2, 0, -r2 / 2] : [-r2 / 2, 0, -r2 / 2];

  // Kite folds: the lower edges of the front flaps to the centre line.
  const kite = (line: readonly [Vec2, Vec2], side: Vec2, layers: Layers, tag: string) => ({
    kind: "fold" as const,
    line,
    side,
    groups: [{ layers, angle: 180, tag }],
  });
  const rightPoint: Vec2 = [r2 / 2, -r2 / 2];
  const leftPoint: Vec2 = [-r2 / 2, -r2 / 2];

  /**
   * The petal fold, lifted `degrees` of the way. Around each K point four hinges close a loop:
   * the base (which does not move), the petal turning up about the hinge line, the kite flap on
   * the petal, and the layer behind the flap, hinged to the base. That loop is a spherical four-bar
   * linkage, so it moves rigidly with one degree of freedom: given the petal's turn, the flap and
   * the layer behind it must meet where two circles on a sphere cross. The circles cross twice;
   * the fold is the crossing reached continuously from flat, so the linkage is followed a degree
   * at a time. (Flat at the end, the circles only touch, so there the known flat result is used.)
   * `front` false mirrors everything for the back of the model.
   */
  const petalLift = (degrees: number, front: boolean) => {
    // Every stage of the lift is measured from the flat base before it.
    const from = front ? "front unfolded" : "front petal";
    const toward = front ? 1 : -1;
    const petal = turnAbout(hinge, bottom, toward * degrees);
    const middle = front ? q4 : q2;
    // The petal itself, by where it is in the crease pattern rather than where it has turned to:
    // past the side of the central diamond, the line through the two K points.
    const diamond = 2 - r2;
    const petalPart = front
      ? ({ cp }: FaceInfo) => cp[0] - cp[1] > diamond
      : ({ cp }: FaceInfo) => cp[1] - cp[0] > diamond;
    const kiteRight = front ? "kite front right" : "kite back right";
    const kiteLeft = front ? "kite front left" : "kite back left";
    const place = (
      right: { flap: Motion; behind: Motion },
      left: { flap: Motion; behind: Motion },
    ) => ({
      kind: "place" as const,
      groups: [
        {
          layers: and(middle, petalPart, not(tagged(kiteRight)), not(tagged(kiteLeft))),
          then: petal,
          from,
        },
        { layers: and(middle, tagged(kiteRight)), then: right.flap, from },
        { layers: and(middle, tagged(kiteLeft)), then: left.flap, from },
        { layers: and(q1, tagged(kiteRight)), then: right.behind, from },
        { layers: and(q3, tagged(kiteLeft)), then: left.behind, from },
      ],
    });
    // Flat, the answer is exact: the flap is folded along its kite crease under the petal, and the
    // layer behind lies folded along the same line.
    if (degrees === 180) {
      const folded = (kPoint: Vec2) => ({
        flap: compose(petal, foldAcross(bottom, kPoint)),
        behind: foldAcross(bottom, kPoint),
      });
      return place(folded(kRight), folded(kLeft));
    }
    const side = (kPoint: Vec2, edgePoint: Vec2) => {
      // Before the lift, flap and layer behind lie on each other, hinged along the kite line
      // from the bottom point to K, and meet at the edge midpoint.
      const line = [bottom, kPoint] as const;
      const corner: Vec3 = [edgePoint[0], edgePoint[1], 0];
      const axis = unitVector([kPoint[0] - bottom[0], kPoint[1] - bottom[1], 0]);
      const behind = (angle: number) => apply(turnAbout(line, edgePoint, angle), corner);
      // Where the layer behind puts the shared corner, taken back through the petal's turn, must
      // lie on the circle the flap can swing it round: the plane through `corner` square to the
      // kite line.
      const gapAt = (petalDegrees: number, angle: number) => {
        const p = apply(
          invertMotion(turnAbout(hinge, bottom, toward * petalDegrees)),
          behind(angle),
        );
        return (p[0] - corner[0]) * axis[0] + (p[1] - corner[1]) * axis[1];
      };
      // Follow the linkage from flat, a degree at a time, keeping to the crossing nearest the
      // last: the two circles cross twice, and only continuity says which crossing is the fold.
      let angle = 0;
      for (let turned = 1; turned <= degrees; turned++) {
        const gap = (a: number) => gapAt(turned, a);
        let found: number | undefined;
        for (let reach = 0.25; reach <= 60 && found === undefined; reach += 0.25) {
          for (const [lo, hi] of [
            [angle, angle + reach],
            [angle - reach, angle],
          ] as const) {
            if (Math.sign(gap(lo)) === Math.sign(gap(hi)) || gap(lo) === 0) continue;
            let [a, b] = [lo, hi];
            for (let i = 0; i < 80; i++) {
              const mid = (a + b) / 2;
              if (Math.sign(gap(mid)) === Math.sign(gap(a))) a = mid;
              else b = mid;
            }
            found = (a + b) / 2;
            break;
          }
        }
        if (found === undefined) throw new Error(`petal fold: linkage lost at ${turned}°`);
        angle = found;
      }
      const meet = behind(angle);
      // The flap's own turn about the kite line takes its corner to where the petal's inverse puts
      // the meeting point.
      const target = apply(invertMotion(petal), meet);
      const flapAngle = signedTurn(line, edgePoint, corner, target);
      return {
        behind: turnAbout(line, edgePoint, angle),
        flap: compose(petal, turnAbout(line, edgePoint, flapAngle)),
      };
    };
    return place(side(kRight, rightPoint), side(kLeft, leftPoint));
  };

  /** The precreases the back's petal fold needs: its kite lines, and the hinge. */
  const backPrecreases = [
    {
      kind: "crease" as const,
      line: [bottom, kRight] as const,
      layers: top,
      tag: { side: rightPoint, name: "kite back right" },
    },
    {
      kind: "crease" as const,
      line: [bottom, kLeft] as const,
      layers: left,
      tag: { side: leftPoint, name: "kite back left" },
    },
    {
      kind: "crease" as const,
      line: hinge,
      layers: and(
        (f: FaceInfo) => top(f) || left(f),
        not(tagged("kite back right")),
        not(tagged("kite back left")),
      ),
    },
  ];

  // Inside reverse folds: the front layers of a flap turn behind and the back layers forward, so
  // the flap's spine flips from valley to mountain and the tip goes up between them.
  const reverse = (
    line: readonly [Vec2, Vec2],
    side: Vec2,
    front: Layers,
    back: Layers,
    tag: string,
  ) => ({
    kind: "fold" as const,
    line,
    side,
    groups: [
      { layers: front, angle: -180, tag },
      { layers: back, angle: 180, tag },
    ],
  });

  const neckLine = [
    hingeCentre,
    [Math.cos(Math.PI / 12), hingeY - Math.sin(Math.PI / 12)],
  ] as const;
  const tailLine = [
    hingeCentre,
    [-Math.cos(Math.PI / 12), hingeY - Math.sin(Math.PI / 12)],
  ] as const;
  const tip = apply(foldAcross(...neckLine), [bottom[0], bottom[1], 0]);
  const spine: Vec2 = [tip[0] - hingeCentre[0], tip[1] - hingeCentre[1]];
  const spineLength = Math.hypot(...spine);
  const s: Vec2 = [spine[0] / spineLength, spine[1] / spineLength];
  // The head turns a quarter-turn down from the neck, so the crease bisects the two directions.
  const headAt: Vec2 = [hingeCentre[0] + 0.78 * spine[0], hingeCentre[1] + 0.78 * spine[1]];
  const headLine = [headAt, [headAt[0] + s[0] + s[1], headAt[1] + s[1] - s[0]]] as const;

  const frontOfRightLeg = and(q1, right, belowHinge);
  const backOfRightLeg = and(q1, top, belowHinge);
  const frontOfLeftLeg = and(q3, under, belowHinge);
  const backOfLeftLeg = and(q3, left, belowHinge);
  const wingLine = [
    [-1, 0],
    [1, 0],
  ] as const;

  const sequence = new FoldingSequence([
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ])
    .step({
      title: "Collapse the precreased square",
      description: "Diagonals are valleys, midlines mountains; the corners start to drop.",
      operations: [
        {
          kind: "crease",
          line: [
            [-1, -1],
            [1, 1],
          ],
          layers: () => true,
        },
        {
          kind: "crease",
          line: [
            [-1, 1],
            [1, -1],
          ],
          layers: () => true,
        },
        {
          kind: "crease",
          line: [
            [-1, 0],
            [1, 0],
          ],
          layers: () => true,
        },
        {
          kind: "crease",
          line: [
            [0, -1],
            [0, 1],
          ],
          layers: () => true,
        },
        { kind: "place", groups: [{ layers: () => true, set: collapse(partial) }] },
      ],
    })
    .step({
      title: "Bring the corners together",
      operations: [{ kind: "place", groups: [{ layers: () => true, set: collapse(cornersMeet) }] }],
    })
    .step({
      title: "Flatten into a preliminary base",
      description: "Two flaps to each side.",
      operations: [{ kind: "place", groups: [{ layers: () => true, set: collapse(flattened) }] }],
    })
    .step({
      title: "Fold the edges to the centre",
      description: "Top layer only: a kite shape.",
      operations: [
        kite([bottom, kRight], rightPoint, right, "kite front right"),
        kite([bottom, kLeft], leftPoint, under, "kite front left"),
      ],
    })
    .step({
      name: "front unfolded",
      title: "Unfold the kite",
      description:
        "Crease across the top of the kite as well. On paper that is a fold down and back, which bends the layers at the spine; here it is only the crease it leaves.",
      operations: [
        {
          kind: "fold",
          line: [bottom, kRight],
          side: [0.1, -0.8],
          groups: [{ layers: tagged("kite front right"), angle: 180 }],
        },
        {
          kind: "fold",
          line: [bottom, kLeft],
          side: [-0.1, -0.8],
          groups: [{ layers: tagged("kite front left"), angle: 180 }],
        },
        { kind: "crease", line: hinge, layers: (f) => right(f) || under(f) },
      ],
    })
    .step({
      title: "Petal fold: lift the bottom corner",
      description:
        "Lift the top layer's bottom corner up along the horizontal crease. The sides swing in along the kite creases.",
      operations: [petalLift(90, true)],
    })
    .step({
      name: "front petal",
      title: "Petal fold: flatten",
      description: "Press the sides in flat under the petal.",
      operations: [petalLift(180, true)],
    })
    .step({
      title: "Petal fold the back: lift",
      description: "Turn over and repeat: crease the kite and its top, then lift.",
      operations: [...backPrecreases, petalLift(90, false)],
    })
    .step({
      title: "Petal fold the back: flatten",
      description: "This is the bird base.",
      operations: [petalLift(180, false)],
    })
    .step({
      title: "Reverse fold the neck",
      description: "Push the right-hand lower flap up inside, between the layers.",
      operations: [reverse(neckLine, bottom, frontOfRightLeg, backOfRightLeg, "neck")],
    })
    .step({
      title: "Reverse fold the tail",
      operations: [reverse(tailLine, bottom, frontOfLeftLeg, backOfLeftLeg, "tail")],
    })
    .step({
      title: "Reverse fold the head",
      operations: [
        reverse(
          headLine,
          [tip[0], tip[1]],
          and(tagged("neck"), right),
          and(tagged("neck"), top),
          "head",
        ),
      ],
    })
    .step({
      title: "Fold the wings down",
      description: "Front wing forwards, back wing behind.",
      operations: [
        {
          kind: "fold",
          line: wingLine,
          side: [0, 0.3],
          groups: [
            { layers: q4, angle: 180, tag: "front wing" },
            { layers: q2, angle: -180, tag: "back wing" },
          ],
        },
      ],
    })
    .step({
      title: "Spread the wings",
      operations: [
        {
          kind: "fold",
          line: wingLine,
          side: [0, -0.3],
          groups: [
            { layers: tagged("front wing"), angle: 90 },
            { layers: tagged("back wing"), angle: -90 },
          ],
        },
      ],
    });

  return {
    title: "Crane",
    patternTitle: "Crease pattern",
    patternDescription: "The traditional orizuru, from a square.",
    ...sequence.build(),
  };
}

const FIXTURES: [string, () => Fixture][] = [
  ["accordion-pleat", () => withMeasuredAssignments(accordionPleat())],
  ["waterbomb-base", () => withMeasuredAssignments(waterbombBase())],
  ["miura-ori", () => withMeasuredAssignments(miuraOri())],
  ["paper-airplane", paperAirplane],
  ["crane", crane],
];

/**
 * Replaces the crease assignments with the ones the first folded frame actually shows: boundary
 * where an edge has one face, otherwise mountain or valley by the sign of its fold angle. Writing
 * them by hand for a tessellation is a guessing game, and a wrong letter would fail the fixture
 * checks rather than mislead quietly.
 */
function withMeasuredAssignments(fixture: Fixture): Fixture {
  const probe = loadFold(toFold(fixture));
  if (!probe.ok) throw new Error(`could not measure: ${probe.errors[0]?.message}`);
  const folded = probe.model.frames[1]!;
  const assignments = probe.model.edgesFaces.map((faces, edge): Assignment => {
    if (faces.length < 2) return "B";
    const angle = folded.foldAngles[edge]!;
    if (!Number.isFinite(angle) || Math.abs(angle) < 1e-6) return "F";
    return angle > 0 ? "V" : "M";
  });
  return { ...fixture, assignments };
}

const only = process.argv.slice(2);
for (const [name, make] of FIXTURES) {
  if (only.length > 0 && !only.includes(name)) continue;
  const fixture = make();
  const path = join(process.cwd(), "fixtures", "valid", `${name}.fold`);
  writeFileSync(path, toFold(fixture));
  process.stdout.write(
    `${name}: ${fixture.vertices.length} vertices, ${fixture.edges.length} edges, ${fixture.faces.length} faces, ${fixture.frames.length + 1} frames\n`,
  );
}
