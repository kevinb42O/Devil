/** Combat spread and burst escalation. Spread values are port tuning, not measured native constants.
 * Hand II onward doubles the travelling cone's diameter; twins widen further at each tier.
 * Launch radii stay compact so the stream still starts at the fingertips.
 */
export const WEAPON_PRESENTATION = [
  {streamSpread:.045,burstSpread:.17,burstParticles:8,flameSize:.085,emberSize:.05},
  {streamSpread:.14,burstSpread:.21,burstParticles:12,flameSize:.11,emberSize:.06},
  {streamSpread:.22,burstSpread:.26,burstParticles:18,flameSize:.145,emberSize:.075},
  {streamSpread:.31,burstSpread:.32,burstParticles:24,flameSize:.185,emberSize:.09},
  {streamSpread:.34,burstSpread:.32,burstParticles:24,flameSize:.185,emberSize:.09},
  {streamSpread:.37,burstSpread:.32,burstParticles:24,flameSize:.185,emberSize:.09},
  {streamSpread:.4,burstSpread:.32,burstParticles:24,flameSize:.185,emberSize:.09},
] as const;
export const LEGACY_STREAM_SPREAD = [.022,.045,.085,.13] as const;

/** Actual bullet-stream radius in camera-local metres. The launch positions
 * fill this disc and fan outward in a circular cone toward the aim target. Widen the stream's
 * cross-section without enlarging its bullets or changing its damage budget.
 */
export const STREAM_RADIUS = [.008,.01,.012,.003,.003,.003,.003] as const;
/** Replay revision III used a broad launch disc; current streams start at a tip. */
export const LEGACY_WIDE_STREAM_RADIUS = [.16,.25,.4,.55] as const;

/** Floor-shot launch speed by hand level; stronger bursts give more vertical reach.
 * A minimum launch speed preserves faster upward momentum without stacking boosts.
 */
export const SHOTGUN_LAUNCH_SPEED = [10.8,12.6,15,17,17,17,17] as const;

/** Camera-local clearance keeps launch meshes and bloom away from the hand. */
export const PROJECTILE_HAND_CLEARANCE=1.15;
/** Slim shard dimensions in world units; collision radii remain independent. */
export const DAGGER_PRESENTATION={width:.235,length:1.8,shotgunScale:1.3} as const;
/** Trail attaches inside the shard's rear section as visual size changes. */
export const PROJECTILE_TRAIL_OFFSET=DAGGER_PRESENTATION.length*(.17/.72);
/** Presentation response only: no camera deflection or changes to damage/cadence. */
export const WEAPON_FEEDBACK={flashDuration:.055,streamKick:.009,recovery:29,muzzleSpread:.7} as const;
/** Camera-local hand pullback grows at every tier, including twins. No tilt. */
export const SHOTGUN_FEEDBACK=[
 {kick:.095,recovery:30,hold:.014},
 {kick:.13,recovery:29,hold:.018},
 {kick:.25,recovery:25,hold:.028},
 {kick:.32,recovery:24,hold:.034},
 {kick:.37,recovery:23,hold:.04},
 {kick:.415,recovery:22,hold:.046},
 {kick:.46,recovery:21,hold:.052},
] as const;
export function shotgunFeedback(level:number){return SHOTGUN_FEEDBACK[Math.max(0,Math.min(6,Math.round(level)-1))];}

/** Sustained fire stays compact at the fingers; daggers carry the shot to the target.
 * Particle count rises gently with hand level without scaling a flame column.
 */
export const STREAM_PRESENTATION = [
  {particles:1,flameSize:.055,emberSize:.032},
  {particles:2,flameSize:.06,emberSize:.036},
  {particles:3,flameSize:.068,emberSize:.04},
  {particles:4,flameSize:.075,emberSize:.045},
  {particles:4,flameSize:.075,emberSize:.045},
  {particles:4,flameSize:.075,emberSize:.045},
  {particles:4,flameSize:.075,emberSize:.045},
] as const;

/** Floor rebound: preserve flight readability and convert steep shots to a fan. */
export const RICOCHET_TUNING={retention:.65,verticalRetention:.55,minRiseSpeed:4,steepRatio:2,fanSpeed:.4,agePenalty:.1} as const;

/** A dense close-range packet, with a broad outer scatter at every hand. */
export const SHOTGUN_TUNING={radius:.01,coreFraction:.8,coreSpread:.5,maxCoreSpread:.14,damage:2} as const;
/** Original warm regular dagger colour, shared by all shotgun pellets and effects. */
export const SHOTGUN_COLOR=[1,.12,.025] as const;
export const SHOTGUN_COLORS=Array.from({length:14},()=>SHOTGUN_COLOR);

/** Radius grows geometrically at a fixed distance, not at the emission point.
 * Convert radius multipliers to angles so tan(angle), rather than angle, scales. */
export const SHOTGUN_SPREAD = [.17,.21,.26,...Array.from({length:4},(_,i)=>Math.atan(Math.tan(.32)*1.5*1.4**i))] as const;
export const WIDE_SHOTGUN_TUNING={coreFraction:.6,coreSpread:.7} as const;

/** The travelling beam footprint grows at the same rate; fingertip radii stay tiny. */
export const BEAM_SPREAD=[.045,.14,.22,...Array.from({length:4},(_,i)=>Math.atan(Math.tan(.31)*1.5*1.4**i))] as const;
