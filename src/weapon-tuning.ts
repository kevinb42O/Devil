/** Combat spread and burst escalation. Spread values are port tuning, not measured native constants. */
export const WEAPON_PRESENTATION = [
  {streamSpread:.045,burstSpread:.17,burstParticles:8,flameSize:.085,emberSize:.05},
  {streamSpread:.07,burstSpread:.21,burstParticles:12,flameSize:.11,emberSize:.06},
  {streamSpread:.11,burstSpread:.26,burstParticles:18,flameSize:.145,emberSize:.075},
  {streamSpread:.155,burstSpread:.32,burstParticles:24,flameSize:.185,emberSize:.09},
] as const;
export const LEGACY_STREAM_SPREAD = [.022,.045,.085,.13] as const;

/** Actual bullet-stream radius in camera-local metres. The launch positions
 * fill this disc and fan outward in a circular cone toward the aim target. Widen the stream's
 * cross-section without enlarging its bullets or changing its damage budget.
 */
export const STREAM_RADIUS = [.008,.01,.012,.015] as const;
/** Replay revision III used a broad launch disc; current streams start at a tip. */
export const LEGACY_WIDE_STREAM_RADIUS = [.16,.25,.4,.55] as const;

/** Floor-shot launch speed by hand level; stronger bursts give more vertical reach.
 * A minimum launch speed preserves faster upward momentum without stacking boosts.
 */
export const SHOTGUN_LAUNCH_SPEED = [10.8,12.6,15,17] as const;

/** Camera-local clearance keeps launch meshes and bloom away from the hand. */
export const PROJECTILE_HAND_CLEARANCE=1.15;
/** Small individual blades; projectile trajectories supply the stream's width. */
export const DAGGER_PRESENTATION={width:1.25,length:1.2} as const;

/** Sustained fire stays compact at the fingers; daggers carry the shot to the target.
 * Particle count rises gently with hand level without scaling a flame column.
 */
export const STREAM_PRESENTATION = [
  {particles:1,flameSize:.055,emberSize:.032},
  {particles:2,flameSize:.06,emberSize:.036},
  {particles:3,flameSize:.068,emberSize:.04},
  {particles:4,flameSize:.075,emberSize:.045},
] as const;
