/** Shared by the authoritative start gate and its presentation. */
export const CREW_COUNTDOWN_SECONDS=3;
export const CREW_COUNTDOWN_MS=CREW_COUNTDOWN_SECONDS*1000;
/** Let the arena transition settle before the first spoken number. */
export const ARENA_SETTLE_MS=1000;
export const ARENA_START_DELAY_MS=ARENA_SETTLE_MS+CREW_COUNTDOWN_MS;
