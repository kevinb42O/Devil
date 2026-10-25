# Armored Matriarch presence

Spider II now has a wider stance, a heavier plated abdomen, thick proximal limbs, flared shoulder scutes, a tall swept ivory crown, hooked mandibles and pale sternal ribs visible from the player's eye level. Its blue chitin has clearer secondary tones and its recessed copper eyes are brighter.

Neutral anatomy bounds grew 34.4% in width, 25.7% in height and 16.3% in depth. See size-comparison.json. Spider I and spiderlings retain their anatomy. The matriarch's visible crystal returns to its compact authored size; its position and forgiving simulation hit radius remain unchanged. HP, movement, spawn placement and simulation state are unchanged.

Validation: `SPIDER_OUTPUT=artifacts/matriarch/after node tests/spider-polish-browser.mjs`. Covers finite anatomy attributes, visible animated gait, crystal alignment across head poses and yaw, relative adult silhouette sizes, and a scene with both adult types plus 400 instanced juveniles. The harness now applies the same emergence scale as the game renderer when inspecting models. The final stress scene uses the current gameplay body height.

The before/ folder contains initial visual captures made before the changes. That initial run exposed the old harness's missing root-scale transform in its crystal-alignment check; corrected final checks and measurements are in after/report.json.
