import {CREATURE_SCALE_RATIO} from './enemy-presentation';
import {touchesPlayer} from './player-contact';
import type {Vec} from './simulation';

// Contact spheres fitted to the prototype mesh, converted to the current rig scale.
// pedebody is asymmetric: its underside is -.19, not the old sphere's -.8.
// Offset the armor sphere upward and rotate that offset with the visible rig.
export function pedeContactCenter(pos:Vec,forward:Vec,size:number,head=false,nose=false):Vec{
 const yaw=Math.atan2(forward.x,forward.z),pitch=Math.atan2(forward.y,Math.hypot(forward.x,forward.z));
 const up=head?0:.43*CREATURE_SCALE_RATIO*size,ahead=head?(nose?1.1:.4)*CREATURE_SCALE_RATIO*size:0;
 const horizontal=ahead*Math.cos(pitch)-up*Math.sin(pitch);
 return {x:pos.x+Math.sin(yaw)*horizontal,y:pos.y+up*Math.cos(pitch)+ahead*Math.sin(pitch),z:pos.z+Math.cos(yaw)*horizontal};
}
export function touchesPede(from:Vec,to:Vec,forwardFrom:Vec,forwardTo:Vec,playerFrom:Vec,playerTo:Vec,size:number,head=false){
 const radius=(head?.65:.62)*CREATURE_SCALE_RATIO*size;
 if(touchesPlayer(pedeContactCenter(from,forwardFrom,size,head),pedeContactCenter(to,forwardTo,size,head),playerFrom,playerTo,radius))return true;
 return head&&touchesPlayer(pedeContactCenter(from,forwardFrom,size,true,true),pedeContactCenter(to,forwardTo,size,true,true),playerFrom,playerTo,radius);
}
