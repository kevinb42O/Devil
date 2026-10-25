import {descentAt} from './descent';
const ease=(v:number)=>{const x=Math.max(0,Math.min(1,v));return x*x*(3-2*x);};
/** Shared by visible rain, wet floor shading, and the footstep material mix.
 * Reconstructs directly at replay/practice times without accumulating history. */
export function rainAt(time:number){
 const s=descentAt(time),rain=s.chapter===0?s.blend:s.chapter===1?1-s.blend:0;
 return {rain,wetness:ease((s.phaseTime-51)/32)*(1-ease((s.phaseTime-144)/85))};
}
