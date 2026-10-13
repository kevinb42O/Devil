import type {World,Vec} from './simulation';

/** Camera translation and flying daggers must be sampled at the same tick time.
 * Aim remains immediate; interpolation adds at most one 120 Hz tick to translation.
 */
export function samplePlayerPosition(world:World,alpha:number,out:Vec):Vec{
 const a=world.previousPlayerPosition,b=world.player.pos,t=Math.max(0,Math.min(1,alpha));
 out.x=a.x+(b.x-a.x)*t;out.y=a.y+(b.y-a.y)*t;out.z=a.z+(b.z-a.z)*t;return out;
}
