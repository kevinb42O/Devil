import * as THREE from 'three';
import {floorHeight} from './arena';
import {isPede, type EnemyKind} from './enemy-kinds';

export const hasCreatureDeath=(kind:string)=>kind==='spider'||kind==='spider2'||kind==='spiderling'||isPede(kind as EnemyKind)||kind==='leviathan';
const DURATION=2.6;
type Part={node:THREE.Object3D;position:THREE.Vector3;rotation:THREE.Euler;scale:THREE.Vector3;bottom:number;height:number;delay:number;side:number};
type Corpse={model:THREE.Group;started:number;parts:Part[]};

/** Keep the actual last combat pose, then collapse it without touching shared materials. */
export class EnemyDeaths {
 private corpses=new Map<number,Corpse>();
 constructor(private scene:THREE.Scene){}
 begin(id:number,model:THREE.Group,time:number){
  if(this.corpses.has(id))return;
  // Bound simultaneous remains, including explosions through juvenile swarms.
  if(this.corpses.size>=64)this.remove(this.corpses.keys().next().value!);
  model.visible=true;
  model.traverse(node=>{if(node.name.includes('weak-point')||node.name==='spider-held-gem')node.visible=false;});
  model.updateWorldMatrix(true,true);
  const snake=isPede(model.name as EnemyKind),nodes=snake?model.children:[model];
  const parts=nodes.map((node,index)=>{
   const box=new THREE.Box3().setFromObject(node),center=box.getCenter(new THREE.Vector3());
   const floor=Math.max(-5,floorHeight(center.x,center.z,time));
   return {node,position:node.position.clone(),rotation:node.rotation.clone(),scale:node.scale.clone(),bottom:Math.max(0,box.min.y-floor),height:Math.max(.2,box.max.y-box.min.y),delay:snake?Math.min(.55,index*.035):0,side:(index+id)%2?1:-1};
  });
  this.scene.add(model);this.corpses.set(id,{model,started:time,parts});
 }
 update(time:number,present:Set<number>){
  for(const [id,corpse] of this.corpses){
   const age=time-corpse.started;
   if(age<0||age>=DURATION||present.has(id)){this.remove(id);continue;}
   corpse.model.visible=true;
   for(const p of corpse.parts){
    const t=Math.max(0,age-p.delay),collapse=1-Math.exp(-t*7),settle=Math.min(1,t/.65);
    const sink=Math.pow(Math.max(0,(t-1.25)/(DURATION-p.delay-1.25)),2);
    p.node.position.copy(p.position);
    p.node.position.y-=Math.min(p.bottom,10*t*t)+p.height*(.22*collapse+sink);
    p.node.rotation.copy(p.rotation);
    p.node.rotation.z+=p.side*(collapse*.5+Math.sin(t*23)*Math.exp(-t*5)*.16);
    p.node.rotation.x+=collapse*.22;
    // A dying spine breaks its continuous silhouette as each vertebra drops.
    if(p.node!==corpse.model){p.node.position.x+=p.side*settle*.65;p.node.position.z+=Math.sin(id+p.delay*9)*settle*.35;}
    p.node.scale.copy(p.scale);p.node.scale.y*=1-.28*collapse;
    p.node.scale.multiplyScalar(Math.max(.001,1-sink));
   }
   corpse.model.updateWorldMatrix(true,true);
  }
 }
 addSegments(add:(model:THREE.Group)=>void){for(const corpse of this.corpses.values())if(isPede(corpse.model.name as EnemyKind))add(corpse.model);}
 hide(){for(const corpse of this.corpses.values())corpse.model.visible=false;}
 private remove(id:number){this.corpses.get(id)?.model.removeFromParent();this.corpses.delete(id);}
 clear(){for(const id of this.corpses.keys())this.remove(id);}
}
