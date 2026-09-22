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
import { buildRenderModel, CREASE_COLORS, fitCamera } from "./renderModel";

const FOV_DEGREES = 45;
const PAPER_FRONT = 0xf7f3ea;
const PAPER_BACK = 0xe0b36a;
const CREASE_WIDTH = 2;

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
  private readonly lineGeometry = new BufferGeometry();
  private readonly linePositions: Float32Array;
  private readonly lineColors: Float32Array;
  private readonly lineIndices: Uint32Array;
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
    this.lineIndices = render.lines;

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

    const position = new BufferAttribute(controller.positions, 3);
    position.setUsage(DynamicDrawUsage);
    this.meshGeometry.setAttribute("position", position);
    this.meshGeometry.setIndex(new BufferAttribute(render.triangles, 1));

    // The two sides of the paper are drawn as two meshes over one geometry, so the model reads as
    // folded rather than as a flat shape. Flat shading keeps each facet crisp without normals.
    for (const [side, color] of [
      [FrontSide, PAPER_FRONT],
      [BackSide, PAPER_BACK],
    ] as const) {
      this.scene.add(
        new Mesh(
          this.meshGeometry,
          new MeshStandardMaterial({
            color,
            roughness: 0.95,
            metalness: 0,
            side,
            flatShading: true,
            // Keep the crease lines in front of the surface they sit on.
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          }),
        ),
      );
    }

    // Creases get their own duplicated vertices so each edge can carry its own colour.
    this.linePositions = new Float32Array(this.lineIndices.length * 3);
    this.lineColors = new Float32Array(this.lineIndices.length * 3);
    this.lineGeometry.setAttribute(
      "position",
      new BufferAttribute(this.linePositions, 3).setUsage(DynamicDrawUsage),
    );
    this.lineGeometry.setAttribute(
      "color",
      new BufferAttribute(this.lineColors, 3).setUsage(DynamicDrawUsage),
    );
    this.scene.add(
      new LineSegments(
        this.lineGeometry,
        new LineBasicMaterial({ vertexColors: true, linewidth: CREASE_WIDTH }),
      ),
    );

    const fit = fitCamera(model, FOV_DEGREES, 1);
    this.camera = new PerspectiveCamera(FOV_DEGREES, 1, fit.radius / 100, fit.radius * 100);
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
    this.copyLinePositions();
    this.frameHandle = requestAnimationFrame(this.loop);
  }

  /** Call when the frame changes: crease assignments may differ between frames. */
  updateCreaseColors(): void {
    const assignments = this.controller.currentAssignments();
    const color = new Color();
    for (let e = 0; e < this.model.edgesVertices.length; e++) {
      color.setHex(CREASE_COLORS[assignments[e] as Assignment] ?? CREASE_COLORS.U);
      for (let k = 0; k < 2; k++) {
        const offset = (2 * e + k) * 3;
        this.lineColors[offset] = color.r;
        this.lineColors[offset + 1] = color.g;
        this.lineColors[offset + 2] = color.b;
      }
    }
    this.lineGeometry.getAttribute("color").needsUpdate = true;
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
      this.meshGeometry.getAttribute("position").needsUpdate = true;
      this.copyLinePositions();
      this.needsRender = true;
    }
    if (this.controls.enableDamping) this.controls.update();
    if (!this.needsRender) return;
    this.needsRender = false;
    this.renderer.render(this.scene, this.camera);
  };

  /** Creases share the model's vertices but need their own copy, one pair per edge. */
  private copyLinePositions(): void {
    const source = this.controller.positions;
    for (let i = 0; i < this.lineIndices.length; i++) {
      const v = this.lineIndices[i]! * 3;
      this.linePositions[3 * i] = source[v]!;
      this.linePositions[3 * i + 1] = source[v + 1]!;
      this.linePositions[3 * i + 2] = source[v + 2]!;
    }
    this.lineGeometry.getAttribute("position").needsUpdate = true;
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
