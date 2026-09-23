/**
 * Writes the fixtures whose coordinates come from a closed form rather than a short table: an
 * accordion pleat, a waterbomb base and a Miura-ori. The formulas are derived in
 * `fixtures/README.md`, and `tests/unit/fixtures.test.ts` checks the result is a rigid fold of one
 * sheet, so a mistake in a formula fails the suite rather than slipping through.
 *
 * Run with `pnpm fixtures`.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadFold, type Assignment } from "@/fold";

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

const FIXTURES: [string, Fixture][] = [
  ["accordion-pleat", accordionPleat()],
  ["waterbomb-base", waterbombBase()],
  ["miura-ori", miuraOri()],
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

for (const [name, source] of FIXTURES) {
  const fixture = withMeasuredAssignments(source);
  const path = join(process.cwd(), "fixtures", "valid", `${name}.fold`);
  writeFileSync(path, toFold(fixture));
  process.stdout.write(
    `${name}: ${fixture.vertices.length} vertices, ${fixture.edges.length} edges, ${fixture.faces.length} faces, ${fixture.frames.length + 1} frames\n`,
  );
}
