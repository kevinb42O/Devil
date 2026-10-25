# Gigapede: cobalt and ivory

Snake 2 receives a distinct cobalt enamel palette, dark indigo recesses, worn brass piping, cold blue eyes and recessed gills. Its amber damage crystals retain their original positions, size and hit behavior. Ivory horns, a swept three-blade crown, cheek shields, lateral fins and a pale-tipped dorsal fin establish a different silhouette from Centipede and Ghostpede.

Solid fins merge into the existing finish geometry. The 50-piece body retains five instanced batches. The controlled in-game capture changed from 358,599 to 338,355 triangles and from 27 to 29 scene draws (two additional crown finishes). This is a geometry/draw comparison, not a measured frame-rate improvement.

`before-*` and `after-*` are fixed-light studio and in-game captures. Centipede and Ghostpede segment PNGs are byte-identical across the change. `gigapede-cobalt.mp4` shows 16 seconds of the new appearance in the actual game renderer, beginning as it emerges. Capture is invulnerable and uses an external camera to expose the silhouette.

Validation: production build; final TypeScript check; 28 targeted movement, contact and combat balance regression tests; finite geometry and aligned/destroyed crystal browser checks; zero errors in the isolated serpent capture; Impeccable detector reported no findings.

The capture harness skips unused skull4/transmuted4 swarm batches because unrelated in-progress Drake anatomy does not merge for instancing in this working tree. No Drake code was changed for this task.
