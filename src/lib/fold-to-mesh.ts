import * as THREE from "three";
import type { ResolvedFrame, EdgeAssignment } from "./fold-parser";

const EDGE_COLORS: Record<EdgeAssignment, THREE.Color> = {
  M: new THREE.Color(0xe63946), // red — mountain
  V: new THREE.Color(0x457b9d), // blue — valley
  B: new THREE.Color(0x2d3436), // dark — boundary
  F: new THREE.Color(0x999999), // grey — flat
  U: new THREE.Color(0x999999), // grey — unassigned
};

const FACE_FRONT_COLOR = new THREE.Color(0xf5f0e8); // paper white
const FACE_BACK_COLOR = new THREE.Color(0xd4c5a9);  // paper tan

/**
 * Triangulate a polygon face into triangle indices.
 * Uses a simple fan triangulation (works for convex polygons,
 * which is the common case for origami faces).
 */
function triangulateFace(face: number[]): number[] {
  const indices: number[] = [];
  for (let i = 1; i < face.length - 1; i++) {
    indices.push(face[0], face[i], face[i + 1]);
  }
  return indices;
}

/**
 * Build a three.js mesh group from a resolved FOLD frame.
 * Returns a group containing the face mesh and edge lines.
 */
export function buildMeshFromFrame(frame: ResolvedFrame): THREE.Group {
  const group = new THREE.Group();

  const coords = frame.vertices_coords;
  const is2D = coords.length > 0 && (coords[0].length === 2 || coords[0][2] === undefined);

  // Build vertex positions array (ensure 3D)
  const positions = new Float32Array(coords.length * 3);
  for (let i = 0; i < coords.length; i++) {
    positions[i * 3] = coords[i][0];
    positions[i * 3 + 1] = coords[i][1];
    positions[i * 3 + 2] = is2D ? 0 : (coords[i][2] ?? 0);
  }

  // Build face geometry
  const allTriIndices: number[] = [];
  for (const face of frame.faces_vertices) {
    allTriIndices.push(...triangulateFace(face));
  }

  const faceGeometry = new THREE.BufferGeometry();
  faceGeometry.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
  faceGeometry.setIndex(allTriIndices);
  faceGeometry.computeVertexNormals();

  const faceMaterial = new THREE.MeshPhongMaterial({
    color: FACE_FRONT_COLOR,
    side: THREE.DoubleSide,
    flatShading: true,
  });

  // Custom shader for front/back coloring
  faceMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.backColor = { value: FACE_BACK_COLOR };
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `uniform vec3 backColor;\nvoid main() {`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
       if (!gl_FrontFacing) {
         diffuseColor.rgb = backColor;
       }`
    );
  };

  const faceMesh = new THREE.Mesh(faceGeometry, faceMaterial);
  group.add(faceMesh);

  // Build edge lines
  for (let i = 0; i < frame.edges_vertices.length; i++) {
    const [v0, v1] = frame.edges_vertices[i];
    const assignment = frame.edges_assignment[i];
    const color = EDGE_COLORS[assignment] ?? EDGE_COLORS.U;

    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(6);
    linePositions[0] = positions[v0 * 3];
    linePositions[1] = positions[v0 * 3 + 1];
    linePositions[2] = positions[v0 * 3 + 2];
    linePositions[3] = positions[v1 * 3];
    linePositions[4] = positions[v1 * 3 + 1];
    linePositions[5] = positions[v1 * 3 + 2];
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      color,
      linewidth: assignment === "B" ? 2 : 1,
    });

    group.add(new THREE.LineSegments(lineGeometry, lineMaterial));
  }

  return group;
}

/**
 * Center and scale a group to fit within a unit sphere.
 */
export function normalizeGroup(group: THREE.Group) {
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 2 / maxDim : 1;

  group.position.sub(center);
  group.scale.setScalar(scale);
}
