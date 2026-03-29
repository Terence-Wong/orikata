"use client";

import { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ResolvedFrame } from "@/lib/fold-parser";
import { buildMeshFromFrame, normalizeGroup } from "@/lib/fold-to-mesh";

interface Viewer3DProps {
  frame: ResolvedFrame;
  /** Override vertex positions during animation (flat xyz array) */
  animatedPositions?: Float32Array | null;
}

export default function Viewer3D({ frame, animatedPositions }: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);

  // Initialize scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 100);
    camera.position.set(0, 0, 3);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-3, -2, -3);
    scene.add(dirLight2);

    // Animation loop
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      renderer.dispose();
      controls.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // Update model when frame changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old model
    if (modelGroupRef.current) {
      scene.remove(modelGroupRef.current);
      modelGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }

    const group = buildMeshFromFrame(frame);
    normalizeGroup(group);
    scene.add(group);
    modelGroupRef.current = group;
  }, [frame]);

  // Update vertex positions during animation
  useEffect(() => {
    if (!animatedPositions || !modelGroupRef.current) return;

    modelGroupRef.current.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const posAttr = obj.geometry.getAttribute("position") as THREE.BufferAttribute;
        // The mesh positions are in local space after normalizeGroup;
        // we need to apply the same normalization. Instead, update the raw
        // positions and re-normalize the group.
        posAttr.array.set(animatedPositions);
        posAttr.needsUpdate = true;
        obj.geometry.computeVertexNormals();
        obj.geometry.computeBoundingBox();
        obj.geometry.computeBoundingSphere();
      }
    });
  }, [animatedPositions]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[400px]"
    />
  );
}
