import * as THREE from 'three';
import {towerOutletHeight,towerRadius,towerOutlets} from './enemy-presentation';
import type {EnemyKind} from './enemy-kinds';

/** Shared visible architecture and projectile armor, including moving crowns. */
export function buildTowerStructure(rig:THREE.Group,kind:EnemyKind,material:(finish:'stone'|'metal'|'interior'|'glow')=>THREE.Material){
 const mesh=(parent:THREE.Object3D,geometry:THREE.BufferGeometry,finish:THREE.Material,name:string,x=0,y=0,z=0)=>{const part=new THREE.Mesh(geometry,finish);part.name=name;part.position.set(x,y,z);parent.add(part);return part;};
 const hoop=(parent:THREE.Object3D,radius:number,tube:number,y:number,finish:THREE.Material,name:string)=>{const part=mesh(parent,new THREE.TorusGeometry(radius,tube,5,16),finish,name,0,y,0);part.rotation.x=Math.PI/2;return part;};
 const tier=Number(kind.slice(5))||1,height=towerOutletHeight(kind),radius=towerRadius(kind);
 const stone=material('stone'),edge=material('metal'),dark=material('interior');
 const foundation=new THREE.Group();foundation.name='tower-foundation';rig.add(foundation);
 // Unit-height foot telescopes to the actual terrain while the upper tower
 // follows the existing entrance/orbit root.
 mesh(foundation,new THREE.CylinderGeometry(radius*.9,radius*1.12,1,6),stone,'tower-foot',0,.5,0);
 const plinth=mesh(rig,new THREE.CylinderGeometry(radius*1.12,radius*1.3,.6,6),stone,'tower-plinth',0,.3,0);
 plinth.userData.groundAnchor=true;foundation.userData.groundAnchor=true;
 mesh(rig,new THREE.CylinderGeometry(radius*.6,radius*.6,height*.88,12),stone,'tower-core',0,height*.44,0);
 // Buttresses frame the central shaft and leave the crown crystals exposed.
 const supports=tier===1?4:tier===2?6:9;
 for(let i=0;i<supports;i++){
  const angle=(i+.5)*Math.PI*2/supports,x=Math.sin(angle),z=Math.cos(angle);
  const pillar=mesh(rig,new THREE.BoxGeometry(.22+tier*.06,height+.5,.3+tier*.08),stone,'tower-buttress',x*radius*.76,height/2-.35,z*radius*.76);pillar.rotation.y=angle;
  const rib=mesh(rig,new THREE.BoxGeometry(.055,height*.7,.08),edge,'tower-inlay',x*radius*.94,height*.5,z*radius*.94);rib.rotation.y=angle;
 }
 // A tall central chimney, twin chimneys, or three satellite turrets distinguish
 // the three tiers even when their crystals have already been destroyed.
 for(const {x,z,radius:shaftRadius} of towerOutlets(kind)){
  mesh(rig,new THREE.CylinderGeometry(shaftRadius,shaftRadius*1.15,height*.72,6,1,true),stone,'tower-chimney',x,height*.52,z);
  mesh(rig,new THREE.CylinderGeometry(shaftRadius*.94,shaftRadius*.94,.08,6),dark,'tower-exhaust',x,height-.06,z);
  const glow=mesh(rig,new THREE.TorusGeometry(shaftRadius*.9,.055,4,6),material('glow'),'tower-exhaust-rim',x,height,z);glow.rotation.x=Math.PI/2;
 }
 hoop(rig,radius,.1+tier*.025,height*.35,edge,'tower-brace');
 const crown=new THREE.Group();crown.name='warden-crest';crown.position.y=height+.12;rig.add(crown);
 hoop(crown,radius*1.03,.14+tier*.02,0,edge,'tower-crown-band');
 for(let i=0;i<supports;i++){
  const angle=i*Math.PI*2/supports,fin=mesh(crown,new THREE.ConeGeometry(.18+tier*.04,.65+tier*.23,4),stone,'tower-merlon',Math.sin(angle)*radius,.25,Math.cos(angle)*radius);fin.rotation.y=angle;
 }
}
