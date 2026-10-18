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
