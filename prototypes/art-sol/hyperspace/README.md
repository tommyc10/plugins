# Hyperspace / art-sol

Five original launch studies, isolated from production tblock and the other art prototypes.
Only Node built-ins are required. The drawing canvas and lowercase 12px logo are imported
read-only from ../../art-opus/engine.mjs; nothing in that directory is modified.

## Run

From C:/coding/plugins:

    node prototypes/art-sol/hyperspace/showcase.mjs
    node prototypes/art-sol/hyperspace/showcase.mjs hyperspace-hyperlane
    node prototypes/art-sol/hyperspace/showcase.mjs hyperspace-vortex
    node prototypes/art-sol/hyperspace/showcase.mjs hyperspace-prism
    node prototypes/art-sol/hyperspace/showcase.mjs hyperspace-nebula-dive
    node prototypes/art-sol/hyperspace/showcase.mjs hyperspace-reactor-charge

No scene argument plays all five in sequence. Each lasts 5.2–5.4 seconds plus a short
final hold. Frames are 88 columns by 22 rows, including all titles and status text.
Playback defaults to 40 fps. The animation reserves only its own terminal region,
clips to smaller windows, and restores the cursor and original raw-input state on
completion, Ctrl+C, SIGINT, or SIGTERM. It does not clear the screen or use an alternate screen.

    node prototypes/art-sol/hyperspace/showcase.mjs hyperspace-vortex --still
    node prototypes/art-sol/hyperspace/showcase.mjs hyperspace-vortex --256
    node prototypes/art-sol/hyperspace/showcase.mjs hyperspace-vortex --color=truecolor
    node prototypes/art-sol/hyperspace/showcase.mjs hyperspace-vortex --mono
    node prototypes/art-sol/hyperspace/showcase.mjs --speed=2 --fps=60
    node prototypes/art-sol/hyperspace/showcase.mjs hyperspace-reactor-charge --loop

Piped output automatically prints final frames without cursor controls. NO_COLOR,
including an empty value, always overrides forced colour. Terminals without advertised
truecolor receive 256-colour output. --animate explicitly enables redirected animation
for recordings and smoke tests. --duration=SECONDS overrides wall-clock duration per scene.
--still wins over --animate. --list and --help document the interface.

PowerShell monochrome example:

    $env:NO_COLOR = '1'
    node prototypes/art-sol/hyperspace/showcase.mjs --still
    Remove-Item Env:NO_COLOR

## Motion directions

- **hyperlane:** A nav plot visits planner → delegate → reviewer, acquires the destination,
  then stretches the map geometry toward that lock. The landing retains its three-node route.
- **vortex:** Three family-colour currents braid into an accelerating corkscrew, collapse,
  and rotate logo pixels into coherence. The landing keeps a broken tricolour orbital wreath.
- **prism:** A white beam enters a faceted wireframe prism; rose, orange, and gold rays fan
  outward and write a displaced logo. The asymmetrical composition stays visible at rest.
- **nebula-dive:** Three noisy cloud shells have different parallax speeds. Lightning briefly
  illuminates the descent; a noise-mask reveal finds the logo glowing inside the core.
- **reactor-charge:** An annular, segmented drive fills through the effort spectrum around
  a 3–2–1 countdown, then launches a double shock ring as stars snap into radial streaks.

**Top pick: vortex.** The braided tunnel has the most distinctive motion silhouette,
and makes three model families feel like different forces cohering into one tool.
Hyperlane is the strongest alternative when role orchestration should be the central idea.

The example planner/claude, delegate/gpt, reviewer/gemini mapping is illustrative,
not a claim about the user's configuration. This prototype does not read production state.
All geometry and copy are original; no ships, franchise identities, or quoted lines.

## Verify and browse

    node prototypes/art-sol/hyperspace/verify.mjs
    node prototypes/art-sol/hyperspace/gallery.mjs

The verifier samples 825 frames across truecolor, 256-colour, and monochrome; checks
88-column/22-row bounds; invokes every scene with --still in all three modes; verifies
automatic non-TTY stills; runs every animation with a three-second timeout; and exercises
signal cleanup, resize/clipping, backpressure, argument validation, and deterministic output.
Signal tests emit SIGINT/SIGTERM in-process so they remain portable to Windows; forced OS
termination cannot be expected to execute JavaScript cleanup.

Open gallery.html to compare exact signature, arrival, and final frames. Its monochrome
toggle uses actual monochrome renders, not desaturated colour output. It is self-contained,
works offline, and does not load fonts, scripts, or images from the network.

## Files

- showcase.mjs — standalone CLI, colour selection, scheduling, cursor/input lifecycle.
- scenes.mjs — five pure time-based scenes plus shared composition helpers.
- verify.mjs — local standalone verification, Node built-ins only.
- gallery.mjs — builds the self-contained storyboard gallery.
- gallery.html — generated gallery artifact.
- README.md — commands and design notes.
