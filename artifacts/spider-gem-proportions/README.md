# Spider crystal proportions fix

Spider I previously used its enlarged damage radius to scale the rendered crystal, while Spider II used a separate smaller visual radius. The adult skull's lower jaw also obscured Spider II's crystal.

Both construction and animation now use `spiderCrystalVisualRadius` from `src/enemy-presentation.ts`. Spider I's diameter in the mature current rig is 0.9207 world units. Spider II's is 2.30175 units, matching its feeding face's 2.5× size relative to Spider I. The lower adult mandible/teeth are trimmed to leave an exposed feeding opening; surrounding tusks remain.

`spiderCrystalRadius`, target centers, HP and combat hit tolerances are unchanged. Transforms, head folding and hit feedback retain the existing behavior.

The presentation regression checks the 2.5× visual size ratio independently of folded-world bounding boxes, raycasts the visible crystal centers to catch occlusion, checks both target positions, and verifies green hit brightening, isolation and restoration. The broader brood and gait fixtures cover pose combinations and instanced juveniles. `index.html` shows the corrected feeding faces; the linked brood gallery and simulation clip are refreshed.
