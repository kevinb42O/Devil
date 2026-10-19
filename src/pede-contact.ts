import {CREATURE_SCALE_RATIO} from './enemy-presentation';
import {touchesPlayer} from './player-contact';
import type {Vec} from './simulation';

// Contact spheres fitted to the prototype mesh, converted to the current rig scale.
// pedebody is asymmetric: its underside is -.19, not the old sphere's -.8.
// Offset the armor sphere upward and rotate that offset with the visible rig.
export function pedeContactCenter(pos:Vec,forward:Vec,size:number,head=false,nose=false,scale=CREATURE_SCALE_RATIO):Vec{
 const yaw=Math.atan2(forward.x,forward.z),pitch=Math.atan2(forward.y,Math.hypot(forward.x,forward.z));
 const up=head?0:.43*scale*size,ahead=head?(nose?1.1:.4)*scale*size:0;
 const horizontal=ahead*Math.cos(pitch)-up*Math.sin(pitch);
 return {x:pos.x+Math.sin(yaw)*horizontal,y:pos.y+up*Math.cos(pitch)+ahead*Math.sin(pitch),z:pos.z+Math.cos(yaw)*horizontal};
}
export function touchesPede(from:Vec,to:Vec,forwardFrom:Vec,forwardTo:Vec,playerFrom:Vec,playerTo:Vec,size:number,head=false,scale=CREATURE_SCALE_RATIO){
 const radius=(head?.65:.62)*scale*size;
 if(touchesPlayer(pedeContactCenter(from,forwardFrom,size,head,false,scale),pedeContactCenter(to,forwardTo,size,head,false,scale),playerFrom,playerTo,radius))return true;
 return head&&touchesPlayer(pedeContactCenter(from,forwardFrom,size,true,true,scale),pedeContactCenter(to,forwardTo,size,true,true,scale),playerFrom,playerTo,radius);
}
