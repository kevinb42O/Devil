import type {Vec} from './simulation';

// Fixed arena-centered bounds never follow a living teammate or a falling body.
export const SPECTATOR_BUBBLE={center:{x:0,y:8,z:0},radius:50,minY:1};
export class SpectatorCamera {
 position:Vec|null=null;
 reset(){this.position=null;}
 start(position:Vec){if(this.position)return;this.position={...position};this.clamp();}
 move(dt:number,yaw:number,pitch:number,forward:number,strafe:number,vertical:number,fast=false){
  const p=this.position;if(!p)return;
  const sin=Math.sin(yaw),cos=Math.cos(yaw),cp=Math.cos(pitch);
  const x=-sin*cp*forward+cos*strafe,y=Math.sin(pitch)*forward+vertical,z=-cos*cp*forward-sin*strafe;
  const scale=Math.min(.05,Math.max(0,dt))*(fast?24:12)/Math.max(1,Math.hypot(x,y,z));
  p.x+=x*scale;p.y+=y*scale;p.z+=z*scale;this.clamp();
 }
 private clamp(){
  const p=this.position!;const {center,radius,minY}=SPECTATOR_BUBBLE;
  p.y=Math.max(minY,p.y);
  const x=p.x-center.x,y=p.y-center.y,z=p.z-center.z,d=Math.hypot(x,y,z);
  if(d>radius){p.x=center.x+x*radius/d;p.y=center.y+y*radius/d;p.z=center.z+z*radius/d;}
 }
}
