# Endless progression after heaven

Status: proposed balance work; not implemented. Sanctuary, sourced choir and 50-gem arrival reward are implemented separately.

## Current behavior and the reported plateau

The environment repeats every 510 seconds. Combat uses absolute survival time and does not reset its schedule, enemies, upgrades or reserve at an environment boundary. First heaven arrival is at 498 seconds. The next visual descent begins at 510 seconds.

`src/survival.ts` enters its endless encounter recipe around 456 seconds. The recipe repeats with a countdown rate of `1 + wave / 8`; every third endless wave substitutes a Ghostpede for its Gigapede. The recipe otherwise repeats the same composition. It adds no new heaven-specific challenge. Tower emissions retain a 20-second cadence. Basic swarm pursuit speeds and enemy health do not automatically rise with survival time. Weapon progression ends at VII (800 collected gems).

The exact schedule audit is saved in `artifacts/progression-audit/schedule.json`:

| Survival interval | Scheduled major spawns | Longest schedule gap |
| --- | ---: | ---: |
| 500–550 s | 17 | 8.90 s |
| 600–650 s | 23 | 7.27 s |
| 650–700 s | 22 | 6.67 s |
| 700–750 s | 26 | 5.72 s |
| 750–800 s | 30 | 5.33 s |
| 900–950 s | 41 | 3.82 s |

At approximately 750 seconds the scheduler reaches wave 7, about 1.875× its starting endless countdown rate. These are scheduled major enemies, not total threats: surviving towers emit additional enemies and player kills change pressure. There is no captured input trace for the reported run, so the audit establishes the repetitive structure, not the exact cause of that run's easy stretch.

Working diagnosis: a powerful player can clear the familiar spawn recipe faster than it establishes overlapping threats. Repetition plus increased player power can flatten perceived progression even as the nominal arrival rate rises. The 50-gem reward must be included in balancing this section.

## Target experience

Heaven is a milestone and reward before a more demanding descent. Scenery may repeat; the opening combat sequence never restarts. Short relief should last seconds, followed by escalating encounters that demand different priorities and movement. By 650–750 seconds a strong VII player should face mixed threats rather than long cleanup stretches.

## Implementation order

1. **Measure the actual plateau.** Add a development-only trace of active threats by role, spawn-to-death time, longest low-pressure interval, reserve and weapon tier. Exercise 450–900 seconds continuously, retaining the player's earned state, and compare fresh practice starts separately. Inspect a replay of the reported run if available. Do not equate raw entity count with danger.

2. **Add permanent post-heaven escalation.** Keep a combat clock independent of the environment clock. Every completed heaven arrival advances a permanent escalation stage; continuous pressure grows between those milestones. Do not reset or clear existing enemies. Preserve the pre-heaven encounter introduction as the baseline.

3. **Give the reward a short beat.** Keep the 50-gem shower at full arrival. Delay only new supplemental pressure packets for roughly 4–5 seconds while it falls; existing enemies remain active. Ramp the new layer in over the following 10–15 seconds. Avoid an abrupt pile-on or an extended safe zone.

4. **Use three authored encounter packets.** Alternate a pursuit packet (direct higher-tier skull pressure), a siege packet (tower plus gem-stealing spider pressure), and a crossing packet (serpent route plus a smaller pursuit group). Reuse existing enemies and telegraphs. After the first heaven, begin with approximately one packet every 20 seconds; trial 16–18 seconds by 650–750 seconds. The packet supplements the existing schedule rather than spawning an entire old wave again. Numbers are initial playtest settings, not promised final balance.

5. **Increase composition and overlap.** Gradually replace supplemental basic threats with higher-tier threats. Stagger arrivals from different directions so the player must choose between a spawner, a pursuer and a crossing route. Reserve recovery must require a decision to stop firing. Maintain escape paths and readable approach cues. No blanket health multiplier or untelegraphed universal speed increase in the first pass.

6. **Guard against empty stretches and overload.** Check pressure at packet boundaries. If the arena has been below its target threat range for 6–8 seconds outside the reward beat, advance one eligible, telegraphed packet. Defer extra packets when the arena is already dangerous. Never build a deferred queue that dumps several packets at once. Bound entity cost and overlap; keep the rising challenge through threat quality and combinations as well as cadence.

7. **Mark subsequent descents.** Briefly announce “DESCENT II”, “DESCENT III”, etc. at departure from heaven. Each must correspond to a real escalation stage. Keep the continuous survival timer visible. Reuse the same art journey while its combat sequence continues evolving.

## Validation and acceptance

- Compare continuous runs across 450–550, 600–750, 750–900 and 1000+ seconds, with the reward enabled and realistic weapon/reserve states.
- Measure active dangerous overlap and low-pressure time as well as spawn counts; avoid a 60–100 second late-game interval dominated by trivial cleanup.
- Test an aggressive player, a skilled player who rapidly kills spawners, a mobile player and a co-op crew. Do not balance exclusively against an invulnerable auto-aim bot.
- Use solo and co-op replay flags/checkpoints for the new rules; historical recordings retain their prior schedule. Dedicated deterministic RNG must not perturb earlier encounter placement.
- Confirm challenge does not reset when the visual cycle wraps at 510 or 1020 seconds.
- Check low quality/mobile rendering budgets and readability during combined threats.
- Produce a 600–800 second playtest clip before broadening the design. Judge whether the player must change movement and target priorities, not merely hold fire for longer.

## Scope

First pass changes the late-game encounter structure, pressure tracing and a small descent indicator. It does not require new enemy models, a new weapon tier, permanent save progression or a new upgrade menu. Tune the packet layer before adding mechanics or more content.
