"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Box3, Group, MathUtils, Mesh, MeshStandardMaterial, NeutralToneMapping, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { MODEL_PATH } from "@/lib/amphoraAssets";

const TARGET_HEIGHT = 1;
const CAMERA_DISTANCE = 2.05;
const CAMERA_FOV = 34;
const MAX_PIXEL_RATIO = 2;
// A vessel spinning on its axis is nearly always seen at a glancing angle, where
// anisotropic filtering is the difference between crisp painted lines and mush.
const TEXTURE_ANISOTROPY = 8;

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
      const standard = material as MeshStandardMaterial;
      for (const map of [standard.map, standard.roughnessMap, standard.metalnessMap, standard.normalMap]) {
        if (map) {
          map.anisotropy = TEXTURE_ANISOTROPY;
        }
      }
      // Fired clay is a dielectric with no environment to reflect. Leaving any
      // metalness or image-based reflection in place is what made the vessel
      // look like moulded plastic.
      standard.metalness = 0;
      standard.envMapIntensity = 0;
      standard.needsUpdate = true;
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
        {state.status === "loading" ? "Shaping the Amphora…" : "Could not load the Amphora."}
      </p>
    );
  }

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <Canvas
        frameloop={isActive ? "always" : "demand"}
        dpr={[1, MAX_PIXEL_RATIO]}
        gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping }}
        camera={{ position: [0, 0, CAMERA_DISTANCE], fov: CAMERA_FOV }}
      >
        {/* Sky-to-ground fill stands in for the place it is standing in: night
            sky from above, grey stone bounce from the column below. A flat
            ambient term gives the dead, evenly-lit look of a render, not of an
            object sitting somewhere.

            The ground half used to be terracotta, which was right when the
            vessel was terracotta and is wrong now: a brown bounce under a
            sandy pot drags its lower body back toward the orange the clay no
            longer is. */}
        <hemisphereLight args={["#9fb2ce", "#4b4a47", 1.35]} />
        {/* One soft key, a cool rim to separate the shoulder from the sky, and
            a weak bounce off the stone below. Intensities stay low because a
            broad rough surface blows out long before a smooth one does.

            The bounce is only lightly warmed. The brick body reddens fast
            under a warm bounce, and the point of a *soft* brick is that it
            stays dusty rather than going back to terracotta. */}
        <directionalLight position={[2.4, 2.9, 3.6]} intensity={1.55} color="#fff3dd" />
        <directionalLight position={[-3, 0.9, 1.4]} intensity={0.55} color="#aec2ea" />
        <directionalLight position={[-0.8, -1.6, 2.2]} intensity={0.26} color="#e4ddd2" />

        <RotatingModel model={state.model} angleRef={angleRef} isActive={isActive} />
      </Canvas>
    </div>
  );
}

export default memo(AmphoraModelViewer);
