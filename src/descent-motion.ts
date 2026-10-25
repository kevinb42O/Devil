import {ESCAPE_START,ESCAPE_SPACE,environmentClock} from './descent';

/** Presentation distance, independent of simulation coordinates and frame rate.
 * The release accelerates into a continuous fall; it never stops at the last chapter. */
export function descentDistance(time:number):number {
  const t=Number.isFinite(time)?Math.max(0,time):0;
  return 4.8*(t-1.8*(1-Math.exp(-t/1.8)));
}

export const PASSAGE_BOTTOM=-92;
export const PASSAGE_SPAN=240;
/** Recycle outside the visible band, with opacity zero at either end. */
export function passageHeight(distance:number,offset:number):number {
  return ((distance+offset-PASSAGE_BOTTOM)%PASSAGE_SPAN+PASSAGE_SPAN)%PASSAGE_SPAN+PASSAGE_BOTTOM;
}

export const DESCENT_BOUNDARIES=[27,64,137,253,372,465] as const;
/** Nearest physical layer boundary. Pure sampling also supports backward seeks. */
export function descentBoundary(time:number):number {
  let nearest:number=DESCENT_BOUNDARIES[0];
  for(const boundary of DESCENT_BOUNDARIES)if(Math.abs(time-boundary)<Math.abs(time-nearest))nearest=boundary;
  return nearest;
}

/** Decelerate in the depths, then reverse the scenery with an accelerating launch.
 * The arena and simulation never move. Travel resets while the scenery is hidden beyond the universe. */
export function passageDistance(time:number):number {
  time=environmentClock(time);
  if(time<=480)return descentDistance(time);
  const brake=Math.min(2,time-480),launch=Math.max(0,Math.min(ESCAPE_SPACE-ESCAPE_START,time-ESCAPE_START));
  return descentDistance(480)+4.8*(brake-brake*brake/4)-7*launch*launch;
}
