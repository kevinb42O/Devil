import * as THREE from 'three';
import {enemyYaw} from './enemy-presentation';
import {isSkull,isEgg} from './enemy-kinds';
import {type Enemy,type Vec} from './simulation';
import {type OriginalEnemies} from './original-enemies';

export type GlowSource={pos:THREE.Vector3;size:number;strength?:number};
/** Anchor light to actual mesh surfaces, including animated crystal transforms. */
export class EnemyGlowSources {
 private crystalNodes=new WeakMap<THREE.Group,THREE.Mesh[]>();
 private orbHearts=new WeakMap<THREE.Group,THREE.Mesh>();
 private thornNodes=new WeakMap<THREE.Group,THREE.Mesh[]>();
 private heads=new WeakMap<THREE.Group,THREE.Mesh>();
 private templateMatrices=new WeakSet<THREE.Group>();
 private sourceBuffers=new WeakMap<Enemy,GlowSource[]>();
 private socketPoints=new WeakMap<THREE.Mesh,THREE.Vector3[]>();
 private towardCamera=new THREE.Vector3();
 private dummy=new THREE.Object3D();
 private size=new THREE.Vector3();
 private scale=new THREE.Vector3();
 constructor(private originals:OriginalEnemies){}
 sources(e:Enemy,player:Vec,camera:THREE.Camera,model?:THREE.Group):GlowSource[]{
  // Bone sockets and brood-shell splits carry their own surface light. Bounding-box
  // anchors would draw floating white dots over the new faces and horns.
  if(isSkull(e.kind)||isEgg(e.kind)||e.kind==='spiderling')return [];
  const root=model??this.originals.templates.get(e.kind);if(!root)return [];
  // Instanced creatures use immutable templates; update each template once.
  // Animated individual rigs still refresh their complete world transforms.
  if(model)root.updateMatrixWorld(true);
  else if(!this.templateMatrices.has(root)){root.updateMatrixWorld(true);this.templateMatrices.add(root);}
  let output=this.sourceBuffers.get(e);if(!output){output=[];this.sourceBuffers.set(e,output);}
  let count=0;
  const source=()=>{const index=count++;return output![index]??(output![index]={pos:new THREE.Vector3(),size:0});};
  let nodes=this.crystalNodes.get(root);
  if(!nodes){nodes=[];root.traverse(o=>{if(o instanceof THREE.Mesh&&(o.name.startsWith('weak-point-')||o.name==='segment-weak-point'||o.name==='spider-held-gem'))nodes!.push(o);});this.crystalNodes.set(root,nodes);}
  if(nodes.length){
   for(const n of nodes){
    let visible=true;for(let o:THREE.Object3D|null=n;o;o=o.parent)if(!o.visible){visible=false;break;}
    if(!visible)continue;
    if(!n.geometry.boundingBox)n.geometry.computeBoundingBox();
    const glow=source(),pos=n.geometry.boundingBox!.getCenter(glow.pos).applyMatrix4(n.matrixWorld);
    // World matrices are already current. getWorldScale would update the
    // ancestor chain again for every crystal, including long centipede rigs.
    this.scale.setFromMatrixScale(n.matrixWorld);n.geometry.boundingBox!.getSize(this.size).multiply(this.scale);
    const radius=Math.max(this.size.x,this.size.y,this.size.z)*.5;
    pos.add(this.towardCamera.subVectors(camera.position,pos).normalize().multiplyScalar(radius+.035));
    glow.size=n.name==='spider-held-gem'?Math.max(.18,Math.min(.45,radius*.6)):Math.max(.45,Math.min(1.25,radius*3.2));
   }
   output.length=count;return output;
  }
  if(e.kind==='orb'){
   let heart=this.orbHearts.get(root);
   if(!heart){const node=root.getObjectByName('rift-heart');if(!(node instanceof THREE.Mesh))return [];heart=node;this.orbHearts.set(root,heart);}
   if(!model){this.dummy.position.set(e.pos.x,e.pos.y,e.pos.z);this.dummy.rotation.set(0,enemyYaw(e,player),0);this.dummy.scale.setScalar(Math.min(1,e.age/1.1));this.dummy.updateMatrix();}
   // Zero-area anchors feed the shared mist field without drawing the aura's
   // white-centered sprite over the recessed, surface-shaded polar wells.
   for(const pole of [-1,1]){const glow=source();glow.pos.set(0,pole*2.4,0).applyMatrix4(heart.matrixWorld);if(!model)glow.pos.applyMatrix4(this.dummy.matrix);glow.size=0;glow.strength=.12;}
   output.length=count;return output;
  }
  if(e.kind==='thorn'){
   // Small glows live inside the lower spike cluster rather than at the old
   // generic front-of-bounds socket. Mesh transforms keep taller rigs aligned.
   let spikes=this.thornNodes.get(root);
   if(!spikes){spikes=[];root.traverse(o=>{if(o instanceof THREE.Mesh&&o.name==='fracture-spire')spikes!.push(o);});this.thornNodes.set(root,spikes);}
   if(!model){this.dummy.position.set(e.pos.x,e.pos.y,e.pos.z);this.dummy.rotation.set(0,enemyYaw(e,player),0);this.dummy.scale.setScalar(Math.min(1,e.age/1.1));this.dummy.updateMatrix();}
   for(const [i,spike] of spikes.entries()){
    if(i!==0&&i%2===0)continue;
    if(!spike.geometry.boundingBox)spike.geometry.computeBoundingBox();
    const box=spike.geometry.boundingBox!,glow=source();
    glow.pos.set(0,box.min.y+(box.max.y-box.min.y)*(i===0?.34:.25),0).applyMatrix4(spike.matrixWorld);
    if(!model)glow.pos.applyMatrix4(this.dummy.matrix);
    glow.size=i===0?.48:.32;glow.strength=.3;
   }
   output.length=count;return output;
  }
  let head=this.heads.get(root);
  if(!head){root.traverse(o=>{if(o instanceof THREE.Mesh&&(!head||/^(boid\d?|spiderhead|gigaspiderhead|spiderling|pedehead|thorn|immortalorb)$/.test(o.name)))head=o;});if(!head)return [];this.heads.set(root,head);}
  if(!head.geometry.boundingBox)head.geometry.computeBoundingBox();
  let points=this.socketPoints.get(head);
  if(!points){
   const box=head.geometry.boundingBox!;points=[];
   if(isSkull(e.kind)){
    const y=box.min.y+(box.max.y-box.min.y)*.61;
    for(const side of [-1,1])points.push(new THREE.Vector3(side*(box.max.x-box.min.x)*.22,y,box.max.z+.035));
   }else{const p=box.getCenter(new THREE.Vector3());p.z=box.max.z+.035;points.push(p);}
   this.socketPoints.set(head,points);
  }
  if(!model){this.dummy.position.set(e.pos.x,e.pos.y,e.pos.z);this.dummy.rotation.set(0,enemyYaw(e,player),0);this.dummy.scale.setScalar(Math.min(1,e.age/1.1));this.dummy.updateMatrix();}
  for(const point of points){const glow=source();glow.pos.copy(point).applyMatrix4(head.matrixWorld);if(!model)glow.pos.applyMatrix4(this.dummy.matrix);glow.size=isSkull(e.kind)?.5:.65;}
  output.length=count;return output;
 }
}
