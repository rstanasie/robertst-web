"use client";

import { handleHitBoxes } from "@/lib/amphora";
import type { AmphoraPointerHandlers } from "@/lib/useAmphoraRotation";

/**
 * The only part of the vessel a hand can take hold of.
 *
 * Two transparent regions tracking where the handles actually are at the
 * current angle — they sweep across the silhouette as it turns, so they cannot
 * be pinned to the left and right edges. Everything else, body and neck and
 * foot and the space around them, is inert.
 *
 * This knows nothing about rotation beyond the angle it is handed: where the
 * handles are is geometry, what a drag means is physics, and the two are kept
 * apart. Sized in percentages of the stage box, so they follow the vessel
 * wherever it is scaled to.
 */
export default function AmphoraHandles({
  angle,
  isHolding,
  handlers,
}: {
  angle: number;
  isHolding: boolean;
  handlers: AmphoraPointerHandlers;
}) {
  return (
    <>
      {handleHitBoxes(angle).map((box) => (
        <div
          key={box.id}
          data-amphora="handle"
          // Both are always in the DOM. A handle that turns out of sight is only
          // made unreachable, and not even that while a hand is on the vessel:
          // unmounting the element under a live pointer capture would strand the
          // gesture with no pointerup to finish it.
          data-occluded={box.occluded && !isHolding ? "" : undefined}
          aria-hidden="true"
          onPointerDown={handlers.onPointerDown}
          onPointerMove={handlers.onPointerMove}
          onPointerUp={handlers.onPointerUp}
          onPointerCancel={handlers.onPointerUp}
          style={{
            left: `${box.left * 100}%`,
            top: `${box.top * 100}%`,
            width: `${box.width * 100}%`,
            height: `${box.height * 100}%`,
          }}
        />
      ))}
    </>
  );
}
