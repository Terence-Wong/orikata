/**
 * Best-fit rigid transform between two point clouds (Kabsch). The solver is free to translate and
 * rotate the whole model, so its output is re-seated onto the pose the author intended before it is
 * drawn.
 */

export interface RigidTransform {
  /** Row-major 3×3 rotation. */
  rotation: Float64Array;
  translation: [number, number, number];
}

export const IDENTITY_TRANSFORM: RigidTransform = {
  rotation: Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  translation: [0, 0, 0],
};

/** The rotation and translation that best map `from` onto `to`, both xyz-interleaved. */
export function kabsch(from: Float64Array, to: Float64Array): RigidTransform {
  const count = from.length / 3;
  if (count === 0) return cloneIdentity();

  const fromCentre = centroid(from);
  const toCentre = centroid(to);

  // S[r][c] = Σ (from − fromCentre)_r (to − toCentre)_c
  const s = new Float64Array(9);
  for (let i = 0; i < count; i++) {
    const f = [
      from[3 * i]! - fromCentre[0],
      from[3 * i + 1]! - fromCentre[1],
      from[3 * i + 2]! - fromCentre[2],
    ];
    const t = [
      to[3 * i]! - toCentre[0],
      to[3 * i + 1]! - toCentre[1],
      to[3 * i + 2]! - toCentre[2],
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) s[3 * r + c] = s[3 * r + c]! + f[r]! * t[c]!;
    }
  }

  const rotation = rotationFromCovariance(s);
  const rotated = apply(rotation, fromCentre);
  return {
    rotation,
    translation: [toCentre[0] - rotated[0], toCentre[1] - rotated[1], toCentre[2] - rotated[2]],
  };
}

/**
 * Horn's quaternion solution: the rotation is the eigenvector of a 4×4 symmetric matrix built from
 * the covariance. Unlike a polar decomposition it stays well behaved when the points are coplanar
 * or collinear, which is the normal state of a flat-folded model.
 */
function rotationFromCovariance(s: Float64Array): Float64Array {
  const [sxx, sxy, sxz, syx, syy, syz, szx, szy, szz] = [
    s[0]!,
    s[1]!,
    s[2]!,
    s[3]!,
    s[4]!,
    s[5]!,
    s[6]!,
    s[7]!,
    s[8]!,
  ];
  const n = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  const q = largestEigenvector(n);
  const [w, x, y, z] = q;
  return Float64Array.from([
    w * w + x * x - y * y - z * z,
    2 * (x * y - w * z),
    2 * (x * z + w * y),
    2 * (y * x + w * z),
    w * w - x * x + y * y - z * z,
    2 * (y * z - w * x),
    2 * (z * x - w * y),
    2 * (z * y + w * x),
    w * w - x * x - y * y + z * z,
  ]);
}

/** Cyclic Jacobi eigenvalue iteration on a symmetric 4×4, returning the dominant eigenvector. */
function largestEigenvector(input: number[][]): [number, number, number, number] {
  const a = input.map((row) => [...row]);
  const v = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];

  for (let sweep = 0; sweep < 32; sweep++) {
    let off = 0;
    for (let p = 0; p < 4; p++) {
      for (let q = p + 1; q < 4; q++) off += a[p]![q]! * a[p]![q]!;
    }
    if (off < 1e-24) break;
    for (let p = 0; p < 4; p++) {
      for (let q = p + 1; q < 4; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-30) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 4; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }

  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i]![i]! > a[best]![best]!) best = i;
  const q: [number, number, number, number] = [
    v[0]![best]!,
    v[1]![best]!,
    v[2]![best]!,
    v[3]![best]!,
  ];
  const length = Math.hypot(...q);
  return length > 0
    ? (q.map((value) => value / length) as [number, number, number, number])
    : [1, 0, 0, 0];
}

/** Applies a rigid transform to every point of `coords`, in place. */
export function applyTransform(transform: RigidTransform, coords: Float64Array): void {
  const { rotation: r, translation: t } = transform;
  for (let i = 0; i < coords.length; i += 3) {
    const x = coords[i]!;
    const y = coords[i + 1]!;
    const z = coords[i + 2]!;
    coords[i] = r[0]! * x + r[1]! * y + r[2]! * z + t[0];
    coords[i + 1] = r[3]! * x + r[4]! * y + r[5]! * z + t[1];
    coords[i + 2] = r[6]! * x + r[7]! * y + r[8]! * z + t[2];
  }
}

/** Rotates vectors (velocities) without translating them. */
export function applyRotation(rotation: Float64Array, vectors: Float64Array): void {
  for (let i = 0; i < vectors.length; i += 3) {
    const x = vectors[i]!;
    const y = vectors[i + 1]!;
    const z = vectors[i + 2]!;
    vectors[i] = rotation[0]! * x + rotation[1]! * y + rotation[2]! * z;
    vectors[i + 1] = rotation[3]! * x + rotation[4]! * y + rotation[5]! * z;
    vectors[i + 2] = rotation[6]! * x + rotation[7]! * y + rotation[8]! * z;
  }
}

function cloneIdentity(): RigidTransform {
  return {
    rotation: Float64Array.from(IDENTITY_TRANSFORM.rotation),
    translation: [0, 0, 0],
  };
}

function centroid(coords: Float64Array): [number, number, number] {
  const count = coords.length / 3;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < coords.length; i += 3) {
    x += coords[i]!;
    y += coords[i + 1]!;
    z += coords[i + 2]!;
  }
  return [x / count, y / count, z / count];
}

function apply(r: Float64Array, v: readonly [number, number, number]): [number, number, number] {
  return [
    r[0]! * v[0] + r[1]! * v[1] + r[2]! * v[2],
    r[3]! * v[0] + r[4]! * v[1] + r[5]! * v[2],
    r[6]! * v[0] + r[7]! * v[1] + r[8]! * v[2],
  ];
}
