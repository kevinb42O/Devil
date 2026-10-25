import type {EnemyKind} from './enemy-kinds';
import {towerSpitPulse} from './enemy-presentation';

export type TowerOrganicMotion={kind:'tendril'|'jaw'|'breath';index:number;segment?:number};
/** Match-time articulation shared by the visible creature and projectile armor. */
export function towerOrganicPose(age:number,kind:EnemyKind,motion:TowerOrganicMotion,originalCadence=true){
 const phase=motion.index*2.399,slow=age*(kind==='squid3'?.85:1.15)+phase;
 if(motion.kind==='tendril'){
  const segment=motion.segment??0,travel=age*(kind==='squid3'?1.7:2.05)+phase-segment*.78;
  // Curvature accumulates through the joints: slow power stroke, delayed tip curl.
  const amplitude=.12+segment*.035;
  return {rx:Math.sin(travel)*amplitude+.045,rz:Math.cos(travel*.91+.7)*amplitude*.72,sy:1};
 }
 if(motion.kind==='jaw')return {rx:-towerSpitPulse(age,kind,originalCadence)*.26,rz:Math.sin(slow)*.012,sy:1};
 return {rx:0,rz:0,sy:1+Math.sin(age*1.65+phase)*.018};
}

/** Small breathing lift above the articulated underside clearance. */
export function towerHoverOffset(age:number,kind:EnemyKind){
 return .04+Math.sin(age*.95+(kind==='squid3'?1.7:kind==='squid2'?.8:0))*.025;
}
