import type {Vec} from './simulation';
/** Fade parallax correction outside a silhouette in inverse-distance space.
 * This keeps the launch direction continuous when a crosshair grazes its edge. */
export function sphereAimDistance(eye:Vec,forward:Vec,center:Vec,radius:number,fallback:number){
 const x=center.x-eye.x,y=center.y-eye.y,z=center.z-eye.z,depth=x*forward.x+y*forward.y+z*forward.z;
 if(depth<=0||depth-radius>fallback)return fallback;
 const lateral=Math.sqrt(Math.max(0,x*x+y*y+z*z-depth*depth)),margin=.35;
 const t=Math.max(0,Math.min(1,(lateral-radius)/margin)),weight=1-t*t*(3-2*t);
 if(weight===0)return fallback;
 const contact=Math.max(.6,depth-Math.sqrt(Math.max(0,radius*radius-lateral*lateral)));
 return 1/(weight/contact+(1-weight)/fallback);
}
