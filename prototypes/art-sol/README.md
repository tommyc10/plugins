# tblock / EMBER terminal studies

Thirteen original terminal artworks. This is an isolated, illustrative design
prototype: it never imports the production UI, reads a real session, writes role
configuration, or touches files outside this directory.

Run from `C:\coding\plugins`:

```powershell
node prototypes/art-sol/showcase.mjs
node prototypes/art-sol/showcase.mjs --still
```

The first command plays the entire sequence in a terminal (about 50 seconds,
including final-frame holds). The second prints every settled frame. Piping
automatically selects static, uncolored output. A 90-column, 24-row terminal
shows the complete canvas; smaller windows crop at complete cells without
wrapping. Every full scene is 88 columns by 22 rows.

## Scene commands

| Exact command | Artwork / motion |
| --- | --- |
| `node prototypes/art-sol/showcase.mjs launch` | **Needle jump.** A radial starfield accelerates into a huge extruded EMBER wordmark; a scan beam cuts through its reveal and launch rails converge underneath. |
| `node prototypes/art-sol/showcase.mjs thinking` | **Arc ignition.** A ribbed emitter ignites a white-hot energy field with orange/rose bloom, a traveling core, and heat sparks. Indeterminate activity rather than fake progress. |
| `node prototypes/art-sol/showcase.mjs orbit` | **Orbital quorum.** Three model-family satellites with fading tails orbit a shared context, connected by fine constellation rays. |
| `node prototypes/art-sol/showcase.mjs working` | **Silk mesh.** A planner fans out through a curved web into three colored agent lanes; packets travel the threads and each lane reports its own progress. |
| `node prototypes/art-sol/showcase.mjs doctor` | **Pulse bench.** An oscilloscope trace sweeps across a diagnostic grid while explicit PASS/WARN labels resolve below. |
| `node prototypes/art-sol/showcase.mjs roles` | **Switchboard.** Role sockets route through bent circuit traces into model-family terminals and an effort spectrum. Bright packets ride the connections. |
| `node prototypes/art-sol/showcase.mjs models` | **Spectral inventory.** Three family-colored aurora cards undulate independently, with stable family labels and effort annotations. |
| `node prototypes/art-sol/showcase.mjs tiers` | **Dune engine.** A ribbed sand creature breaches layered dunes beside an ascending teal-to-rose effort staircase. |
| `node prototypes/art-sol/showcase.mjs preset` | **Chamber.** A squared, serrated slide racks back and seats a glowing configuration; three mechanical lugs connect plan/build/check. |
| `node prototypes/art-sol/showcase.mjs watch` | **Night telemetry.** A striped hot sun and moving perspective grid frame a stable live-session instrument panel. |
| `node prototypes/art-sol/showcase.mjs dragon` | **Cinderwing.** An angular original dragon opens a ragged EMBER flame jet around a crisp molten wordmark. |
| `node prototypes/art-sol/showcase.mjs success` | **Seal struck.** A radial shower erupts around a concentric hot-metal seal and an oversized completion stroke. |
| `node prototypes/art-sol/showcase.mjs failure` | **Fracture.** A giant HALT monolith splits along an irregular white-hot fault; debris falls above a clear cause and recovery command. |

All names, silhouettes, typography, and motion are original. All session details,
percentages, mappings, and results are demonstration data, labeled in each frame.
No command actually performs the illustrated action.

## Controls and inspection

```powershell
# Inspect one scene without animation.
node prototypes/art-sol/showcase.mjs dragon --still

# Play just a category.
node prototypes/art-sol/showcase.mjs loaders
node prototypes/art-sol/showcase.mjs commands
node prototypes/art-sol/showcase.mjs outcomes

# Mix scenes, repeat, and choose frame rate / duration per scene.
node prototypes/art-sol/showcase.mjs launch dragon success --loop --fps=60 --duration=2

# ANSI capture; --animate overrides automatic static output on a pipe.
node prototypes/art-sol/showcase.mjs launch --still --color=truecolor
node prototypes/art-sol/showcase.mjs launch --still --color=256
node prototypes/art-sol/showcase.mjs launch --animate --duration=0.3

# Validate the complete set; no dependencies required.
node prototypes/art-sol/verify.mjs

# Optional Windows review image, using Node + built-in System.Drawing.
powershell -NoProfile -ExecutionPolicy Bypass -File prototypes/art-sol/render-gallery.ps1
```

Default animation is 40 fps; `--fps` accepts 30–60. Ctrl+C restores cursor visibility,
terminal styling, and stdin raw/flow state. Final frames remain in normal scrollback;
the showcase does not switch to or clear an alternate screen. A resize clips the
reserved scene region. `--duration` shortens or extends each selected scene and is
useful for quick reviews.

Truecolor detection follows the CLI's environment conventions (`COLORTERM`,
`WT_SESSION`, terminal program), with an xterm 256-color fallback. `--color=256`
explicitly tests that fallback. `NO_COLOR`, including an empty value, always wins
over forced color. For example:

```powershell
$env:NO_COLOR = '1'
node prototypes/art-sol/showcase.mjs --still
Remove-Item Env:NO_COLOR
```

Monochrome uses stippled shadows, solid luminous cores, explicit words, and the
same geometry. No status or family identity depends solely on color.

## First three ideas to ship into ui.mjs

1. **Needle jump** for interactive help: retain the seven-row wordmark and a short
   ignition/reveal (roughly 700–900 ms). Let the full starfield stay a showcase
   option. It gives the CLI a distinctive first impression.
2. **Arc ignition** as a compact two-row running indicator: keep the moving white
   core, hot gradient, and role/model label. It communicates ongoing thought
   without pretending to know completion percentage.
3. **Silk mesh** for watch: use real delegate states and one moving packet per
   active lane. The artwork explains orchestration rather than only decorating it.

Keep the other scene ideas available as design directions. In particular, the
switchboard could become a quiet signature for roles, and the pulse bench fits
doctor's existing PASS/WARN/FAIL vocabulary.

## Files and verification

- `showcase.mjs`: standalone renderer, all thirteen scenes, CLI, terminal lifecycle.
- `verify.mjs`: subprocess checks for every scene plus 351 sampled frames.
- `render-gallery.ps1`: optional Windows contact-sheet renderer.
- `gallery.png`: generated full-color still-frame contact sheet.
- `README.md`: this guide.

Verification covers every scene's `--still` output, 88-column/22-row limits with
ANSI stripped, monochrome/truecolor/256-color modes, NO_COLOR precedence, piped
defaults, groups, invalid arguments, and brief animation runs for every scene.
Real Windows terminal runs also verified natural exit and Ctrl+C cursor cleanup.
The 351 sampled frames span reveal, active motion, and settled compositions.
