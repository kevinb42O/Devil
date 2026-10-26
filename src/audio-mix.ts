/** One shared effects-bus headroom stage. It preserves the relative levels of
 * every original recording; this is not a recovered native-engine mixer. */
export const ORIGINAL_EFFECTS_HEADROOM=.25;
/** Explicit user exception: preserve the existing footstep mix exactly. */
export const roleMixGain=(role:string)=>role==='footstep'?5:1;
/** Restore the long soundscapes against the native weapon bank. Apply only to
 * beds: ascent effects and the heaven bell already have their own authored levels. */
export const ENVIRONMENT_BED_GAIN=3.2;
/** Explicit user exception: preserve the authored environment bed behavior. */
export const environmentMixGain=(combat:boolean)=>combat?.4:.7;
