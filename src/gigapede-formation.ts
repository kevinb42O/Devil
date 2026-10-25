import type {Enemy,Vec} from './simulation';
import {gigapedeMotion,GIGAPEDE_FORMATION_TUNING,type GigapedeFormationMember} from './gigapede-motion';

export type GigapedeFlightPlan={time:number;member:GigapedeFormationMember;center:Vec;mayApproach:boolean;avoid:Vec};
const length=(p:Vec)=>Math.hypot(p.x,p.y,p.z);

/** Snapshot planning precedes every enemy update: no snake sees a partly moved
 * neighbor. Persistent slots survive deaths, array reordering and checkpoints. */
export function planGigapedeFormation(enemies:readonly Enemy[],players:readonly Vec[],time:number):Map<Enemy,GigapedeFlightPlan>{
 const snakes=enemies.filter(e=>e.kind==='gigapede'&&e.hp>0).sort((a,b)=>a.id-b.id),plans=new Map<Enemy,GigapedeFlightPlan>();
 if(!players.length||!snakes.length)return plans;
 const unassigned=snakes.filter(e=>!e.gigapedeMotion?.formation);
 // A trio establishes a flight group. A lone newcomer keeps its solo behavior.
 for(let i=0;i+2<unassigned.length;i+=3){
  const group=unassigned.slice(i,i+3),angle=Math.atan2(group[0].pos.x,group[0].pos.z);
  group.forEach((e,slot)=>gigapedeMotion(e).formation={group:group[0].id,slot,angle:angle+slot*Math.PI*2/3,lastAttack:-Infinity});
 }
 const center=players.reduce((p,q)=>({x:p.x+q.x/players.length,y:0,z:p.z+q.z/players.length}),{x:0,y:0,z:0});
 const groups=new Map<number,Enemy[]>();
 for(const e of snakes){const member=e.gigapedeMotion?.formation;if(member){const group=groups.get(member.group)??[];group.push(e);groups.set(member.group,group);}}
 for(const group of groups.values()){
  const reserved=group.find(e=>['approach','pass'].includes(e.gigapedeMotion?.sweep?.stage??''));
  const lastAttack=Math.max(...group.map(e=>e.gigapedeMotion!.formation!.lastAttack));
  const waiting=group.filter(e=>e.gigapedeMotion?.sweep?.stage==='holding').sort((a,b)=>a.gigapedeMotion!.formation!.lastAttack-b.gigapedeMotion!.formation!.lastAttack||a.id-b.id);
  const selected=reserved??(time-lastAttack>=GIGAPEDE_FORMATION_TUNING.passGap?waiting[0]:undefined);
  for(const e of group){
   const member=e.gigapedeMotion!.formation!,avoid={x:0,y:0,z:0};
   if(e.age>8){
    const probe={x:e.pos.x+e.vel.x*GIGAPEDE_FORMATION_TUNING.lookAhead,y:e.pos.y+e.vel.y*GIGAPEDE_FORMATION_TUNING.lookAhead,z:e.pos.z+e.vel.z*GIGAPEDE_FORMATION_TUNING.lookAhead};
    for(const other of snakes){
     if(other===e)continue;
     // Test against trail spans, including pieces with destroyed crystals: the
     // armor remains present. Only the closest span contributes per neighbor.
     let nearest:Vec|undefined,min=Infinity,lead=other.pos;
     for(const segment of other.segments){
      const tail=segment.pos,dx=tail.x-lead.x,dy=tail.y-lead.y,dz=tail.z-lead.z;
      const u=Math.max(0,Math.min(1,((probe.x-lead.x)*dx+(probe.y-lead.y)*dy+(probe.z-lead.z)*dz)/(dx*dx+dy*dy+dz*dz||1)));
      const p={x:lead.x+dx*u,y:lead.y+dy*u,z:lead.z+dz*u},d=Math.hypot(probe.x-p.x,probe.y-p.y,probe.z-p.z);
      if(d<min){min=d;nearest=p;}lead=tail;
     }
     if(nearest&&min<GIGAPEDE_FORMATION_TUNING.bodyClearance){
      const weight=1-min/GIGAPEDE_FORMATION_TUNING.bodyClearance,scale=weight/Math.max(.25,min);
      avoid.x+=(probe.x-nearest.x)*scale;avoid.y+=(probe.y-nearest.y)*scale;avoid.z+=(probe.z-nearest.z)*scale;
      if(min<.25){avoid.x+=Math.sin(member.angle)*weight;avoid.z+=Math.cos(member.angle)*weight;}
     }
    }
   }
   const magnitude=length(avoid);if(magnitude>1){avoid.x/=magnitude;avoid.y/=magnitude;avoid.z/=magnitude;}
   plans.set(e,{time,member,center,mayApproach:selected===e,avoid});
  }
 }
 return plans;
}
