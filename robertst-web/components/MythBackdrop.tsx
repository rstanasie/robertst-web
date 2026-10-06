/**
 * The site's wallpaper: a night sky over a temple inside its fortress walls,
 * with the stage lit through it.
 *
 * Four stacked layers, back to front:
 *
 *   .myth-backdrop            the flat midnight ground, and the fallback if
 *                             the photograph never arrives
 *   .myth-backdrop__sky         the photograph itself, cover-sized
 *   .myth-backdrop__mist        a transparent drift of cloud, and the only
 *                               thing on this layer that moves. The photograph
 *                               is flattened, so its own clouds cannot breathe;
 *                               this is what breathes instead.
 *   .myth-backdrop__vignette  a soft darkening toward the edges that settles
 *                             the middle of the frame under the vessel
 *
 * Everything visual is declared in the `.myth-backdrop` block in
 * `app/globals.css` and tuned through the custom properties documented there.
 */
export default function MythBackdrop({ className = "" }: { className?: string }) {
  return (
    <div className={`myth-backdrop ${className}`.trimEnd()} aria-hidden="true">
      <div className="myth-backdrop__sky" />
      <div className="myth-backdrop__mist" />
      <div className="myth-backdrop__vignette" />
    </div>
  );
}
