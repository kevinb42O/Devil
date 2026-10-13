import type {Vec} from './simulation';

export const PLAYER_CONTACT_RADIUS=.35;
// The camera is at eye height; the hurt body extends down to the feet.
const BODY_BOTTOM=-1.7+PLAYER_CONTACT_RADIUS;

/** Sweep an enemy sphere against the moving player's vertical capsule.
 * A vertical hazard (thorn) extends upward from its base by height. */
export function touchesPlayer(from:Vec,to:Vec,playerFrom:Vec,playerTo:Vec,radius:number,height=0){
 const ax=from.x-playerFrom.x,ay=from.y-playerFrom.y,az=from.z-playerFrom.z;
 const dx=to.x-playerTo.x-ax,dy=to.y-playerTo.y-ay,dz=to.z-playerTo.z-az;
 const bottom=BODY_BOTTOM-height,top=0,r=radius+PLAYER_CONTACT_RADIUS;
 const cuts=[0,1];
 if(Math.abs(dy)>1e-12)for(const y of [bottom,top]){const t=(y-ay)/dy;if(t>0&&t<1)cuts.push(t);}
 cuts.sort((a,b)=>a-b);
 for(let i=1;i<cuts.length;i++){
  const lo=cuts[i-1],hi=cuts[i],middleY=ay+dy*(lo+hi)/2;
  const cap=middleY<bottom?bottom:middleY>top?top:null;
  const vy=cap===null?0:dy,oy=cap===null?0:ay-cap;
  const speed=dx*dx+vy*vy+dz*dz;
  const t=speed>1e-12?Math.max(lo,Math.min(hi,-(ax*dx+oy*vy+az*dz)/speed)):lo;
  if((ax+dx*t)**2+(oy+vy*t)**2+(az+dz*t)**2<=r*r)return true;
 }
 return false;
}
