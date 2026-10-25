/** Runtime balance after asset mastering, shared by direct sound and room sends.
 * Keep sustained weapons readable without making every transient equally loud. */
const ROLE_TRIM:Readonly<Record<string,number>>={
 'weapon-stream':1.4,'weapon-homing-stream':1.4,'weapon-start':1.4,
 'weapon-burst':.6,'homing-launch':.75,
 upgrade:.55,explosion:.7,'enemy-spawn':.8,'enemy-death':.85,
 // These recordings were previously buried by an additional 6–10 dB trim.
 // Steps remain well beneath fire; gem feedback is a readable secondary cue.
 footstep:5,'crystal-hit':.65,'crystal-break':.6,'gem-chatter':.8,pickup:1.1,
};
export const roleMixGain=(role:string)=>ROLE_TRIM[role]??1;

/** Long, repeated effects share headroom across enemies and crew members.
 * Do not attenuate a weapon, player death or upgrade because incidental voices
 * happen to be playing. Crystal contacts and breaks share the same decay pool. */
export function overlapGroup(role:string){
 if(role==='crystal-hit'||role==='crystal-break')return 'crystal';
 if(role==='enemy-death'||role==='explosion'||role==='enemy-spawn')return role;
 return undefined;
}
export const environmentMixGain=(combat:boolean)=>combat?.4:.7;
