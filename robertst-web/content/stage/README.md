# Stage artwork

`night-temple.png` is the unlit source for the site's backdrop — the night sky
with the temple inside its fortress walls.

The shipped images are not this file. `npm run sky`
(`scripts/stage/build-sky.js`) paints the light into it — the temple burning
from within, the torches down the stair, the warm lift across the rock — and
writes `public/images/stage/night-temple.webp` and its 1000px cut. Only those
two are served.

The light is baked rather than layered in CSS because the sky is
`background-size: cover` with a crop that walks as the viewport narrows: a CSS
glow would have to track that crop at every breakpoint to stay on the temple.

**Every coordinate in the script is in this file's own 1672x941 space.** Replace
the source and all of them are wrong.
