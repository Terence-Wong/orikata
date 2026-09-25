import {
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  FrontSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Assignment, ResolvedModel } from "@/fold";
import type { ViewerController } from "./controller";
import {
  buildRenderModel,
  CREASE_COLORS,
  fitCamera,
  writeCreases,
  writeTriangles,
  type RenderModel,
} from "./renderModel";

const FOV_DEGREES = 45;
const PAPER_FRONT = 0xf7f3ea;
const PAPER_BACK = 0xe0b36a;
const CREASE_WIDTH = 2;
/**
 * How far apart successive layers of paper are held in depth, as a fraction of the model's size.
 * Only depth is moved (see `liftDepth`), so this sorts sheets folded flat onto each other without
 * showing as thickness or gaps; it only has to be enough for the depth buffer to tell them apart.
 */
const PAPER_THICKNESS = 0.001;

/**
 * Draws a vertex where it is but gives it the depth it would have at `position + lift`, so stacked
 * sheets sort by layer while nothing moves on screen.
 */
function liftDepth(material: MeshStandardMaterial | LineBasicMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute vec3 lift;\n${shader.vertexShader}`.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vec4 liftedClip = projectionMatrix * modelViewMatrix * vec4(transformed + lift, 1.0);
      gl_Position.z = liftedClip.z / liftedClip.w * gl_Position.w;`,
    );
  };
}

/**
 * Owns the Three.js scene and the render loop. Reads vertex positions from the controller every
 * frame; knows nothing about React.
 */
export class ViewerScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly meshGeometry = new BufferGeometry();
  private readonly render: RenderModel;
  private readonly meshPositions: Float32Array;
  private readonly meshLifts: Float32Array;
  private readonly thickness: number;
  private readonly lineGeometry = new BufferGeometry();
  private readonly linePositions: Float32Array;
  private readonly lineLifts: Float32Array;
  private readonly lineColors: Float32Array;
  private readonly resizeObserver: ResizeObserver;
  private frameHandle = 0;
  private lastTime = 0;
  private needsRender = true;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly model: ResolvedModel,
    private readonly controller: ViewerController,
  ) {
    const render = buildRenderModel(model);
    this.render = render;

    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));

    this.scene.background = null;
    this.scene.add(new AmbientLight(0xffffff, 1.7));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(1, -1.4, 2.2);
    this.scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.7);
    fill.position.set(-1.2, 1.1, -1.6);
    this.scene.add(fill);

    // The mesh keeps its own vertices so each face can sit on its own layer; see writeTriangles.
    this.thickness = fitCamera(model, FOV_DEGREES, 1).radius * PAPER_THICKNESS;
    this.meshPositions = new Float32Array(render.triangleSource.length * 3);
    this.meshLifts = new Float32Array(render.triangleSource.length * 3);
    this.meshGeometry.setAttribute(
      "position",
      new BufferAttribute(this.meshPositions, 3).setUsage(DynamicDrawUsage),
    );
    this.meshGeometry.setAttribute(
      "lift",
      new BufferAttribute(this.meshLifts, 3).setUsage(DynamicDrawUsage),
    );

    // The two sides of the paper are drawn as two meshes over one geometry, so the model reads as
    // folded rather than as a flat shape. Flat shading keeps each facet crisp without normals.
    for (const [side, color] of [
      [FrontSide, PAPER_FRONT],
      [BackSide, PAPER_BACK],
    ] as const) {
      const material = new MeshStandardMaterial({
        color,
        roughness: 0.95,
        metalness: 0,
        side,
        flatShading: true,
      });
      liftDepth(material);
      this.scene.add(new Mesh(this.meshGeometry, material));
    }

    // Each crease is drawn once per face and side it borders, so it can carry its own colour and
    // sit on its own sheet; see writeCreases.
    const lineVertexCount = render.creaseVertices.length;
    this.linePositions = new Float32Array(lineVertexCount * 3);
    this.lineLifts = new Float32Array(lineVertexCount * 3);
    this.lineColors = new Float32Array(lineVertexCount * 3);
    this.lineGeometry.setAttribute(
      "position",
      new BufferAttribute(this.linePositions, 3).setUsage(DynamicDrawUsage),
    );
    this.lineGeometry.setAttribute(
      "lift",
      new BufferAttribute(this.lineLifts, 3).setUsage(DynamicDrawUsage),
    );
    this.lineGeometry.setAttribute(
      "color",
      new BufferAttribute(this.lineColors, 3).setUsage(DynamicDrawUsage),
    );
    const lineMaterial = new LineBasicMaterial({ vertexColors: true, linewidth: CREASE_WIDTH });
    liftDepth(lineMaterial);
    this.scene.add(new LineSegments(this.lineGeometry, lineMaterial));

    const fit = fitCamera(model, FOV_DEGREES, 1);
    // Depth precision is set mostly by the near plane; this one leaves enough to sort sheets a
    // thousandth of the model apart. Only zooming right in brings paper nearer than it.
    this.camera = new PerspectiveCamera(FOV_DEGREES, 1, fit.radius / 20, fit.radius * 30);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(
      fit.center[0] + fit.distance * 0.45,
      fit.center[1] - fit.distance * 0.75,
      fit.center[2] + fit.distance * 0.49,
    );

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target = new Vector3(...fit.center);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.addEventListener("change", this.requestRender);
    this.controls.update();

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    this.resize();

    this.updateCreaseColors();
    this.copyMeshPositions();
    this.copyLinePositions();
    this.frameHandle = requestAnimationFrame(this.loop);
  }

  /**
   * Call when the frame changes: crease assignments may differ between frames, and so may the
   * order the sheets are stacked in.
   */
  updateCreaseColors(): void {
    const assignments = this.controller.currentAssignments();
    const color = new Color();
    this.render.creaseEdge.forEach((e, copy) => {
      color.setHex(CREASE_COLORS[assignments[e] as Assignment] ?? CREASE_COLORS.U);
      for (let k = 0; k < 2; k++) {
        const offset = (2 * copy + k) * 3;
        this.lineColors[offset] = color.r;
        this.lineColors[offset + 1] = color.g;
        this.lineColors[offset + 2] = color.b;
      }
    });
    this.lineGeometry.getAttribute("color").needsUpdate = true;
    this.copyMeshPositions();
    this.copyLinePositions();
    this.requestRender();
  }

  requestRender = (): void => {
    this.needsRender = true;
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.requestRender);
    this.controls.dispose();
    this.meshGeometry.dispose();
    this.lineGeometry.dispose();
    this.renderer.dispose();
  }

  private loop = (time: number): void => {
    if (this.disposed) return;
    this.frameHandle = requestAnimationFrame(this.loop);
    const dt = this.lastTime === 0 ? 0 : Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    if (this.controller.tick(dt)) {
      this.copyMeshPositions();
      this.copyLinePositions();
      this.needsRender = true;
    }
    if (this.controls.enableDamping) this.controls.update();
    if (!this.needsRender) return;
    this.needsRender = false;
    this.renderer.render(this.scene, this.camera);
  };

  /** The stacking order to draw in: that of the frame the paper is nearer (see the controller). */
  private layers(): Int32Array {
    return this.render.layersAt(this.controller.stackingFrame());
  }

  private copyMeshPositions(): void {
    writeTriangles(
      this.controller.positions,
      this.render,
      this.layers(),
      this.thickness,
      this.meshPositions,
      this.meshLifts,
    );
    this.meshGeometry.getAttribute("position").needsUpdate = true;
    this.meshGeometry.getAttribute("lift").needsUpdate = true;
    this.meshGeometry.computeBoundingSphere();
  }

  private copyLinePositions(): void {
    writeCreases(
      this.controller.positions,
      this.render,
      this.layers(),
      this.thickness,
      this.linePositions,
      this.lineLifts,
    );
    this.lineGeometry.getAttribute("position").needsUpdate = true;
    this.lineGeometry.getAttribute("lift").needsUpdate = true;
    this.lineGeometry.computeBoundingSphere();
  }

  private resize = (): void => {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const fit = fitCamera(this.model, FOV_DEGREES, this.camera.aspect);
    this.controls.minDistance = fit.radius * 0.2;
    this.controls.maxDistance = fit.radius * 12;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  };
}
