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
  return miura({
    columns: 8,
    rows: 6,
    p: 0.16,
    d: 0.07,
    q: 0.13,
    title: "Miura-ori",
    patternTitle: "Miura tessellation",
    patternDescription: "Straight rows and zigzagging columns, all folding as one.",
    frames: [
      [0.35, "Start collapsing", "The whole sheet folds at once: it has one degree of freedom."],
      [0.7, "Keep going"],
      [0.97, "Nearly closed", "The parallelograms stack into a compact block."],
    ],
  });
}

/**
 * The Miura map fold, taken all the way: the fold used for road maps and solar panels, where
 * pulling two corners apart opens the whole sheet at once. Ten columns by eight rows, folded
 * completely flat at the end, so all eighty panels lie in one stack, each crease flat. A test of
 * how deep a stack the viewer can order and draw.
 */
function miuraMap(): Fixture {
  return miura({
    columns: 10,
    rows: 8,
    p: 0.1,
    d: 0.02,
    q: 0.13,
    title: "Miura map fold",
    patternTitle: "Map sheet",
    patternDescription: "A Miura pattern: slightly slanted columns make the creases fold together.",
    frames: [
      [0.3, "Pull the corners together", "Every crease in the sheet moves at once."],
      [0.7, "Keep closing", "Rows stack onto rows, columns onto columns."],
      [0.95, "Nearly closed"],
      [1, "Folded flat", "All eighty panels lie in one stack."],
    ],
  });
}

interface MiuraOptions {
  columns: number;
  rows: number;
  /** Width of a column, the zigzag's offset, and the height of a row, flat. */
  p: number;
  d: number;
  q: number;
  title: string;
  patternTitle: string;
  patternDescription: string;
  /** Each frame: how far folded, 0 flat to 1 folded flat, then its title and description. */
  frames: Array<[number, string, string?]>;
}

function miura(options: MiuraOptions): Fixture {
  const { columns, rows, p, d, q } = options;

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

  return {
    title: options.title,
    patternTitle: options.patternTitle,
    patternDescription: options.patternDescription,
    vertices: place(p),
    edges,
    assignments: edges.map(() => "U" as Assignment),
    faces,
    // `fraction` runs 0 (flat) to 1 (as folded as this pattern goes).
    frames: options.frames.map(([fraction, title, description]) => ({
      title,
      description,
      vertices: place(p + fraction * (smallest - p)),
    })),
  };
}

/**
 * A road map, folded the everyday way: accordion the sheet into eight panels, then fold the strip
 * in half three times. Every step is a plain fold of everything folded so far, so each new crease
 * runs through all the layers before it and the folds nest inside one another: 64 layers at the
 * end, the sequential counterpart of the Miura map's all-at-once collapse.
 */
function roadMap(): Fixture {
  const width = 1.6;
  const panels = 8;
  const panel = width / panels;
  const all: Layers = () => true;

  let sequence = new FoldingSequence([
    [0, 0],
    [width, 0],
    [width, 1],
    [0, 1],
  ]);
  for (let k = 1; k < panels; k++) {
    const x = k * panel;
    sequence = sequence.step({
      title: k === 1 ? "Fold the first panel over" : `Accordion: fold ${k} of ${panels - 1}`,
      description:
        k === 1
          ? "Pleat the map into eight panels, alternating forwards and back."
          : k === panels - 1
            ? "The whole map is now a strip eight panels thick."
            : undefined,
      operations: [
        {
          kind: "fold",
          line: [
            [x, 0],
            [x, 1],
          ],
          side: [x - panel / 2, 0.5],
          groups: [{ layers: all, angle: k % 2 === 1 ? 180 : -180 }],
        },
      ],
    });
  }
  const halves: Array<[number, number, string, string]> = [
    [0.5, 180, "Fold the strip in half", "Sixteen layers."],
    [0.25, -180, "And in half again", "Thirty-two layers, each new crease through all of them."],
    [0.125, 180, "And once more", "Sixty-four layers: small enough for a glovebox."],
  ];
  for (const [y, angle, title, description] of halves) {
    sequence = sequence.step({
      title,
      description,
      operations: [
        {
          kind: "fold",
          line: [
            [width - panel, y],
            [width, y],
          ],
          side: [width - panel / 2, y + y / 2],
          groups: [{ layers: all, angle }],
        },
      ],
    });
  }

  return {
    title: "Road map",
    patternTitle: "Map sheet",
    patternDescription: "Eight panels across, then halved three times.",
    ...sequence.build(),
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
   * The petal fold's end, flat: the lower part of the top layer turned up about the hinge through
   * the two K points, each kite flap folded along its kite crease under it, and the layer behind
   * each flap folded along the same line. The rigid states on the way are found by
   * `rigid-in-between.ts` (the step's `inBetween`): around each K point the base, the petal, the
   * flap and the layer behind it close a loop of four hinges, a spherical four-bar linkage that
   * moves rigidly with one degree of freedom. `front` false is the back of the model.
   */
  const petalLift = (front: boolean) => {
    const from = front ? "front unfolded" : "front petal";
    const petal = turnAbout(hinge, bottom, front ? 180 : -180);
    const middle = front ? q4 : q2;
    // The petal itself, by where it is in the crease pattern: past the side of the central
    // diamond, the line through the two K points.
    const diamond = 2 - r2;
    const petalPart = front
      ? ({ cp }: FaceInfo) => cp[0] - cp[1] > diamond
      : ({ cp }: FaceInfo) => cp[1] - cp[0] > diamond;
    const kiteRight = front ? "kite front right" : "kite back right";
    const kiteLeft = front ? "kite front left" : "kite back left";
    const flap = (kPoint: Vec2) => compose(petal, foldAcross(bottom, kPoint));
    return {
      kind: "place" as const,
      groups: [
        {
          layers: and(middle, petalPart, not(tagged(kiteRight)), not(tagged(kiteLeft))),
          then: petal,
          from,
        },
        { layers: and(middle, tagged(kiteRight)), then: flap(kRight), from },
        { layers: and(middle, tagged(kiteLeft)), then: flap(kLeft), from },
        { layers: and(q1, tagged(kiteRight)), then: foldAcross(bottom, kRight), from },
        { layers: and(q3, tagged(kiteLeft)), then: foldAcross(bottom, kLeft), from },
      ],
    };
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
      name: "front petal",
      inBetween: [
        { at: 0.5, title: "Petal fold: lift the bottom corner" },
        { at: 150 / 180, title: "Petal fold: bring the sides in" },
      ],
      driver: [(3 * (2 - r2)) / 4, -(2 - r2) / 4],
      title: "Petal fold: flatten",
      description: "Press the sides in flat under the petal.",
      operations: [petalLift(true)],
    })
    .step({
      inBetween: [
        {
          at: 0.5,
          title: "Petal fold the back: lift",
          description: "Turn over and repeat: crease the kite and its top, then lift.",
        },
        { at: 150 / 180, title: "Petal fold the back: bring the sides in" },
      ],
      driver: [-(2 - r2) / 4, (3 * (2 - r2)) / 4],
      title: "Petal fold the back: flatten",
      description: "This is the bird base.",
      operations: [...backPrecreases, petalLift(false)],
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

/**
 * The traditional kabuto, the samurai helmet folded for Children's Day, from a square of side 2
 * standing on a corner: corners at (0, ±√2) and (±√2, 0). Every step is a plain fold of some of
 * the layers, and most of them only the front ones, so it is a test of picking out layers. With
 * a = √2, the finished helmet is a diamond from (0, 0) to (0, −a), horns out to either side.
 */
function samuraiHelmet(): Fixture {
  const a = Math.SQRT2;
  const all: Layers = () => true;
  const tagged =
    (name: string): Layers =>
    ({ tags }) =>
      tags.has(name);
  // Layers by the half of the sheet they came from: the top half ends up in front after step 1.
  const front: Layers = ({ cp, tags }) =>
    cp[1] > 0 && !tags.has("left flap") && !tags.has("right flap");
  const back: Layers = ({ cp, tags }) =>
    cp[1] < 0 && !tags.has("left flap") && !tags.has("right flap");
  // The horns turn out along a line from the middle of each flap's lower edge, a quarter-turn and
  // a half from upright, so the points stick out beyond the sides.
  const hornTurn = Math.PI / 8;
  const hornEnd = a / 2 / (Math.cos(hornTurn) + Math.sin(hornTurn));
  const hornLine = (sign: 1 | -1) =>
    [
      [0, -a / 2],
      [sign * hornEnd * Math.sin(hornTurn), -a / 2 + hornEnd * Math.cos(hornTurn)],
    ] as const;

  const sequence = new FoldingSequence([
    [0, -a],
    [a, 0],
    [0, a],
    [-a, 0],
  ])
    .step({
      title: "Fold in half into a triangle",
      description: "Top corner down to the bottom corner.",
      operations: [
        {
          kind: "fold",
          line: [
            [-a, 0],
            [a, 0],
          ],
          side: [0, a / 2],
          groups: [{ layers: all, angle: 180 }],
        },
      ],
    })
    .step({
      title: "Fold the corners down to the bottom",
      description: "Left and right corners meet at the bottom point, making a square.",
      operations: [
        {
          kind: "fold",
          line: [
            [0, 0],
            [-a / 2, -a / 2],
          ],
          side: [-a / 2, -0.2 * a],
          groups: [{ layers: all, angle: 180, tag: "left flap" }],
        },
        {
          kind: "fold",
          line: [
            [0, 0],
            [a / 2, -a / 2],
          ],
          side: [a / 2, -0.2 * a],
          groups: [{ layers: all, angle: 180, tag: "right flap" }],
        },
      ],
    })
    .step({
      title: "Fold the points up to the top",
      description: "The two flaps only; the bottom of the square stays.",
      operations: [
        {
          kind: "fold",
          line: [
            [-a / 2, -a / 2],
            [a / 2, -a / 2],
          ],
          side: [0, -0.8 * a],
          groups: [
            { layers: tagged("left flap"), angle: 180, tag: "left point" },
            { layers: tagged("right flap"), angle: 180, tag: "right point" },
          ],
        },
      ],
    })
    .step({
      title: "Fold the points out into horns",
      description: "Only the layers just folded up turn out.",
      operations: [
        {
          kind: "fold",
          line: hornLine(-1),
          side: [-0.01 * a, -0.1 * a],
          groups: [{ layers: tagged("left point"), angle: 180 }],
        },
        {
          kind: "fold",
          line: hornLine(1),
          side: [0.01 * a, -0.1 * a],
          groups: [{ layers: tagged("right point"), angle: 180 }],
        },
      ],
    })
    .step({
      title: "Fold the front point up",
      description: "Front layer of the bottom triangle only, its point to the middle.",
      operations: [
        {
          kind: "fold",
          line: [
            [-a / 2, (-3 * a) / 4],
            [a / 2, (-3 * a) / 4],
          ],
          side: [0, -0.9 * a],
          groups: [{ layers: front, angle: 180 }],
        },
      ],
    })
    .step({
      title: "Fold it up again to make the brim",
      description: "Up over the base of the horns.",
      operations: [
        {
          kind: "fold",
          line: [
            [-a / 2, -a / 2],
            [a / 2, -a / 2],
          ],
          side: [0, -0.6 * a],
          groups: [{ layers: front, angle: 180 }],
        },
      ],
    })
    .step({
      title: "Fold the back point up behind",
      description: "The helmet is done; open the bottom to wear it.",
      operations: [
        {
          kind: "fold",
          line: [
            [-a / 2, -a / 2],
            [a / 2, -a / 2],
          ],
          side: [0, -0.8 * a],
          groups: [{ layers: back, angle: -180 }],
        },
      ],
    });

  return {
    title: "Samurai helmet",
    patternTitle: "Crease pattern",
    patternDescription: "The traditional kabuto, from a square.",
    ...sequence.build(),
  };
}

/**
 * The traditional masu box, from a square of side 2√2 standing on a corner: corners at (0, ±2)
 * and (±2, 0). Folding the corners to the centre (a blintz) leaves the square [−1, 1]², and the
 * box is the middle half of that: floor [−0.5, 0.5]², walls 0.5 high, every wall two layers.
 *
 * The first steps are plain folds that leave the creases. Then the sides stand up, and each end
 * rises with its corners folding in: a corner square [0.5, 1]² splits along its diagonal into a
 * half hinged on the end wall (A) and one hinged on the side wall (B), which fold flat against the
 * inside of the end wall. The end's corner flap, unfolded, is folded back over the wall and into
 * the box: the part over the wall lines it, its tip lies on the floor, and the ears either side
 * fold back over the corners and lock them. Positions below are for the north end and its
 * north-east corner; `sx` mirrors east to west, and the south end mirrors y.
 */
function masuBox(): Fixture {
  const all: Layers = () => true;
  const tagged =
    (name: string): Layers =>
    ({ tags }) =>
      tags.has(name);
  type Place = (x: number, y: number) => Vec3;
  /** The motion that places the crease pattern as `place` says; `place` must be a rigid map. */
  const motionOf = (place: Place): Motion =>
    motionFromTriangle(
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      [place(0, 0), place(1, 0), place(0, 1)],
    );

  /** Where each part of the north end goes, by where it is in the crease pattern. */
  const north =
    (standing: boolean) =>
    (x: number, y: number): Place => {
      const sx = x < 0 ? -1 : 1;
      const ax = Math.abs(x);
      if (ax < 0.5 && y < 1) return (px, py) => [px, 0.5, py - 0.5]; // end wall
      if (ax < 0.5) {
        // The flap: standing, it carries the wall on up; folded in, it lines it and lies on the floor.
        if (standing) return (px, py) => [px, 0.5, py - 0.5];
        if (y < 1.5) return (px, py) => [px, 0.5, 1.5 - py];
        return (px, py) => [px, 2 - py, 0];
      }
      if (y > 1) {
        // The ear, beside the flap: with the corner's half A until the flap folds over.
        if (standing) return (px, py) => [sx * (1 - sx * px), 0.5, py - 0.5];
        return (px, py) => [sx * (1 - sx * px), 0.5, 1.5 - py];
      }
      if (ax < 1) {
        if (y > ax) return (px, py) => [sx * (1 - sx * px), 0.5, py - 0.5]; // A
        return (px, py) => [sx * (1 - py), 0.5, sx * px - 0.5]; // B
      }
      // The side's corner flap, folded onto B since the blintz.
      return (px, py) => [sx * (1 - py), 0.5, 1.5 - sx * px];
    };
  const south =
    (standing: boolean) =>
    (x: number, y: number): Place => {
      const place = north(standing)(x, -y);
      return (px, py) => {
        const [X, Y, Z] = place(px, -py);
        return [X, -Y, Z];
      };
    };
  const placeEnd =
    (end: typeof north, standing: boolean) =>
    ({ cp }: FaceInfo): Motion =>
      motionOf(end(standing)(cp[0], cp[1]));

  const fold = (
    line: readonly [Vec2, Vec2],
    side: Vec2,
    layers: Layers,
    angle: number,
    tag?: string,
  ) => ({
    kind: "fold" as const,
    line,
    side,
    groups: [{ layers, angle, tag }],
  });

  const sequence = new FoldingSequence([
    [0, -2],
    [2, 0],
    [0, 2],
    [-2, 0],
  ])
    .step({
      title: "Fold the corners to the centre",
      operations: [
        fold(
          [
            [-1, 1],
            [1, 1],
          ],
          [0, 1.5],
          all,
          180,
          "north flap",
        ),
        fold(
          [
            [1, -1],
            [1, 1],
          ],
          [1.5, 0],
          all,
          180,
          "east flap",
        ),
        fold(
          [
            [-1, -1],
            [1, -1],
          ],
          [0, -1.5],
          all,
          180,
          "south flap",
        ),
        fold(
          [
            [-1, -1],
            [-1, 1],
          ],
          [-1.5, 0],
          all,
          180,
          "west flap",
        ),
      ],
    })
    .step({
      title: "Fold the top and bottom edges to the centre",
      operations: [
        fold(
          [
            [-1, 0.5],
            [1, 0.5],
          ],
          [0, 0.75],
          all,
          180,
          "top edge",
        ),
        fold(
          [
            [-1, -0.5],
            [1, -0.5],
          ],
          [0, -0.75],
          all,
          180,
          "bottom edge",
        ),
      ],
    })
    .step({
      title: "Unfold",
      operations: [
        fold(
          [
            [-1, 0.5],
            [1, 0.5],
          ],
          [0, 0.25],
          tagged("top edge"),
          180,
        ),
        fold(
          [
            [-1, -0.5],
            [1, -0.5],
          ],
          [0, -0.25],
          tagged("bottom edge"),
          180,
        ),
      ],
    })
    .step({
      title: "Fold the sides to the centre",
      operations: [
        fold(
          [
            [0.5, -1],
            [0.5, 1],
          ],
          [0.75, 0],
          all,
          180,
          "right edge",
        ),
        fold(
          [
            [-0.5, -1],
            [-0.5, 1],
          ],
          [-0.75, 0],
          all,
          180,
          "left edge",
        ),
      ],
    })
    .step({
      title: "Unfold",
      operations: [
        fold(
          [
            [0.5, -1],
            [0.5, 1],
          ],
          [0.25, 0],
          tagged("right edge"),
          180,
        ),
        fold(
          [
            [-0.5, -1],
            [-0.5, 1],
          ],
          [-0.25, 0],
          tagged("left edge"),
          180,
        ),
      ],
    })
    .step({
      title: "Unfold the top and bottom corners",
      description: "And crease the small corner squares along their diagonals.",
      operations: [
        fold(
          [
            [-1, 1],
            [1, 1],
          ],
          [0, 0.5],
          tagged("north flap"),
          180,
        ),
        fold(
          [
            [-1, -1],
            [1, -1],
          ],
          [0, -0.5],
          tagged("south flap"),
          180,
        ),
        // Only the corner squares of the sheet itself, which the flaps no longer cover.
        ...[1, -1].flatMap((sx) =>
          [1, -1].map((sy) => ({
            kind: "crease" as const,
            line: [
              [0.5 * sx, 0.5 * sy],
              [sx, sy],
            ] as const,
            layers: ({ cp }: FaceInfo) =>
              cp[0] * sx > 0.5 && cp[0] * sx < 1 && cp[1] * sy > 0.5 && cp[1] * sy < 1,
          })),
        ),
      ],
    })
    .step({
      title: "Stand the sides up",
      description: "Along the creases a quarter of the way in, the corners going up with them.",
      operations: [
        fold(
          [
            [0.5, -2],
            [0.5, 2],
          ],
          [0.75, 0],
          ({ world }) => world[0] > 0,
          90,
        ),
        // Each side only: a fold's line runs on across the model, and the east side is standing.
        fold(
          [
            [-0.5, -2],
            [-0.5, 2],
          ],
          [-0.75, 0],
          ({ world }) => world[0] < 0,
          90,
        ),
      ],
    })
    .step({
      inBetween: [
        { at: 0.35, title: "Raise the top end", description: "The corners start to fold in." },
        { at: 0.75, title: "Raise the top end: push the corners in" },
      ],
      driver: [0, 0.5],
      title: "Raise the top end: corners flat against it",
      description: "Each corner folds in half and lies against the inside of the end wall.",
      operations: [
        {
          kind: "place",
          groups: [{ layers: ({ cp }) => cp[1] > 0.5, set: placeEnd(north, true) }],
        },
      ],
    })
    .step({
      title: "Fold the top flap over into the box",
      description: "It lines the end wall, its point on the floor, its ears over the corners.",
      operations: [
        {
          kind: "place",
          groups: [{ layers: ({ cp }) => cp[1] > 1, set: placeEnd(north, false) }],
        },
      ],
      // Over the top of the wall the flap folds onto the wall's inside, a valley; beside it the
      // ears fold over the corner halves the other way.
      signs: ([x, y]) => (Math.abs(y - 1) < 1e-9 ? (Math.abs(x) < 0.5 ? "V" : "M") : undefined),
    })
    .step({
      inBetween: [
        { at: 0.35, title: "Raise the bottom end" },
        { at: 0.75, title: "Raise the bottom end: push the corners in" },
      ],
      driver: [0, -0.5],
      title: "Raise the bottom end: corners flat against it",
      operations: [
        {
          kind: "place",
          groups: [{ layers: ({ cp }) => cp[1] < -0.5, set: placeEnd(south, true) }],
        },
      ],
    })
    .step({
      title: "Fold the bottom flap over into the box",
      description: "The box is done: every wall two layers thick, held by the flaps.",
      operations: [
        {
          kind: "place",
          groups: [{ layers: ({ cp }) => cp[1] < -1, set: placeEnd(south, false) }],
        },
      ],
      signs: ([x, y]) => (Math.abs(y + 1) < 1e-9 ? (Math.abs(x) < 0.5 ? "V" : "M") : undefined),
    });

  return {
    title: "Masu box",
    patternTitle: "Crease pattern",
    patternDescription: "The traditional masu, from a square.",
    ...sequence.build(),
  };
}

const FIXTURES: [string, () => Fixture][] = [
  ["accordion-pleat", () => withMeasuredAssignments(accordionPleat())],
  ["waterbomb-base", () => withMeasuredAssignments(waterbombBase())],
  ["miura-ori", () => withMeasuredAssignments(miuraOri())],
  ["miura-map", () => withMeasuredAssignments(miuraMap())],
  ["road-map", roadMap],
  ["paper-airplane", paperAirplane],
  ["crane", crane],
  ["samurai-helmet", samuraiHelmet],
  ["masu-box", masuBox],
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
