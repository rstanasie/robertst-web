"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Box3, Group, MathUtils, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { MODEL_PATH } from "@/lib/amphoraAssets";

const TARGET_HEIGHT = 1;
const CAMERA_DISTANCE = 2.15;
const CAMERA_FOV = 35;
const MAX_PIXEL_RATIO = 2;
const TEXTURE_ANISOTROPY = 4;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; model: Group }
  | { status: "error" };

type Props = {
  angleRef: RefObject<number>;
  isActive: boolean;
  onError: () => void;
};

function prepareModel(scene: Group): Group {
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;

  scene.scale.setScalar(scale);
  scene.position.set(-centre.x * scale, -centre.y * scale, -centre.z * scale);

  scene.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const map = (material as MeshStandardMaterial).map;
      if (map) {
        map.anisotropy = TEXTURE_ANISOTROPY;
      }
    }
  });

  return scene;
}

function RotatingModel({
  model,
  angleRef,
  isActive,
}: {
  model: Group;
  angleRef: RefObject<number>;
  isActive: boolean;
}) {
  const group = useRef<Group>(null);
  const invalidate = useThree((state) => state.invalidate);

  useFrame(() => {
    if (group.current) {
      group.current.rotation.y = MathUtils.degToRad(angleRef.current);
    }
  });

  useEffect(() => {
    invalidate();
  }, [invalidate, isActive]);

  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  );
}

function AmphoraModelViewer({ angleRef, isActive, onError }: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();

    loader.load(
      MODEL_PATH,
      (gltf) => {
        if (!cancelled) {
          setState({ status: "ready", model: prepareModel(gltf.scene) });
        }
      },
      undefined,
      () => {
        if (!cancelled) {
          setState({ status: "error" });
          onErrorRef.current();
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status !== "ready") {
    return (
      <p className="absolute inset-0 grid place-items-center text-center text-sm opacity-70">
        {state.status === "loading" ? "Shaping the amphora…" : "Could not load the amphora."}
      </p>
    );
  }

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <Canvas
        frameloop={isActive ? "always" : "demand"}
        dpr={[1, MAX_PIXEL_RATIO]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0, CAMERA_DISTANCE], fov: CAMERA_FOV }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[2.5, 3, 4]} intensity={2.2} />
        <directionalLight position={[-3, 1, -2]} intensity={0.8} />

        <RotatingModel model={state.model} angleRef={angleRef} isActive={isActive} />
      </Canvas>
    </div>
  );
}

export default memo(AmphoraModelViewer);
