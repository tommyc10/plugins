# tblock art prototypes (opus)

Design exploration only: nothing here is wired into `bin/`. Node built-ins only.

```
node prototypes/art-opus/showcase.mjs                 # every scene, animated, in sequence (~80s)
node prototypes/art-opus/showcase.mjs launch          # one scene; several names or a group also work
node prototypes/art-opus/showcase.mjs splash          # groups: splash, working, commands, outcomes
node prototypes/art-opus/showcase.mjs --still         # final frame of each scene as static text (auto when piped)
NO_COLOR=1 node prototypes/art-opus/showcase.mjs      # monochrome: shade blocks + braille, no escapes
node prototypes/art-opus/showcase.mjs --256 | --mono | --speed=2 | --list
node prototypes/art-opus/gallery.mjs                  # writes gallery.html (truecolor stills) for a browser
```

Scenes: launch (forge), hyperspace, dune, dragon · thinking, lanes · doctor, roles, models, preset, watch · success, failure.

- `engine.mjs` – canvas with three layers per cell (text › braille › half-block pixels + colour-only glow),
  truecolor / 256 / mono renderer, 5×5 caps font and the 12px "tblock" bitmap logo.
- Every scene is a pure function `draw(frame, t)`, so the still frame is just `draw(dur)`.
