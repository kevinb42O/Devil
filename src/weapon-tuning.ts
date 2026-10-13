/** Combat spread and burst escalation. Spread values are port tuning, not measured native constants. */
export const WEAPON_PRESENTATION = [
  {streamSpread:.022,burstSpread:.17,burstParticles:8,flameSize:.085,emberSize:.05},
  {streamSpread:.045,burstSpread:.21,burstParticles:12,flameSize:.11,emberSize:.06},
  {streamSpread:.085,burstSpread:.26,burstParticles:18,flameSize:.145,emberSize:.075},
  {streamSpread:.13,burstSpread:.32,burstParticles:24,flameSize:.185,emberSize:.09},
] as const;

/** Camera-local clearance keeps launch meshes and bloom away from the hand. */
export const PROJECTILE_HAND_CLEARANCE=1.15;
/** Visible flying daggers: broader silhouettes and short, separated streaks. */
export const DAGGER_PRESENTATION={width:2.2,length:1.8} as const;

/** Sustained fire stays compact at the fingers; daggers carry the shot to the target.
 * Particle count rises gently with hand level without scaling a flame column.
 */
export const STREAM_PRESENTATION = [
  {particles:1,flameSize:.055,emberSize:.032},
  {particles:2,flameSize:.06,emberSize:.036},
  {particles:3,flameSize:.068,emberSize:.04},
  {particles:4,flameSize:.075,emberSize:.045},
] as const;
