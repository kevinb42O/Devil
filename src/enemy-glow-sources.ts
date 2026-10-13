import * as THREE from 'three';
import {enemyYaw} from './enemy-presentation';
import {isSkull} from './enemy-kinds';
import {type Enemy,type Vec} from './simulation';
import {type OriginalEnemies} from './original-enemies';

export type GlowSource={pos:THREE.Vector3;size:number};
/** Anchor light to actual mesh surfaces, including animated crystal transforms. */
export class EnemyGlowSources {
 private crystalNodes=new WeakMap<THREE.Group,THREE.Mesh[]>();
 private heads=new WeakMap<THREE.Group,THREE.Mesh>();
 private dummy=new THREE.Object3D();
 private size=new THREE.Vector3();
 private scale=new THREE.Vector3();
 constructor(private originals:OriginalEnemies){}
 sources(e:Enemy,player:Vec,camera:THREE.Camera,model?:THREE.Group):GlowSource[]{
  const root=model??this.originals.templates.get(e.kind);if(!root)return [];
  root.updateMatrixWorld(true);
  let nodes=this.crystalNodes.get(root);
  if(!nodes){nodes=[];root.traverse(o=>{if(o instanceof THREE.Mesh&&(o.name.startsWith('weak-point-')||o.name==='segment-weak-point'||o.name==='spider-held-gem'))nodes!.push(o);});this.crystalNodes.set(root,nodes);}
  if(nodes.length){
   return nodes.filter(n=>{for(let o:THREE.Object3D|null=n;o;o=o.parent)if(!o.visible)return false;return true;}).map(n=>{
    if(!n.geometry.boundingBox)n.geometry.computeBoundingBox();
    const pos=n.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(n.matrixWorld);
    n.getWorldScale(this.scale);n.geometry.boundingBox!.getSize(this.size).multiply(this.scale);
    // Put the halo at the visible crystal surface, not buried at its center.
    const radius=Math.max(this.size.x,this.size.y,this.size.z)*.5;
    pos.add(new THREE.Vector3().subVectors(camera.position,pos).normalize().multiplyScalar(radius+.035));
    return {pos,size:Math.max(.45,Math.min(1.25,radius*3.2))};
   });
  }
  let head=this.heads.get(root);
  if(!head){root.traverse(o=>{if(o instanceof THREE.Mesh&&(!head||/^(boid\d?|spiderhead|gigaspiderhead|spiderling|pedehead|thorn|immortalorb)$/.test(o.name)))head=o;});if(!head)return [];this.heads.set(root,head);}
  if(!head.geometry.boundingBox)head.geometry.computeBoundingBox();
  const box=head.geometry.boundingBox!;
  const points:THREE.Vector3[]=[];
  if(isSkull(e.kind)){
   // Paired sockets on the forward face, rather than a halo through the skull.
   const y=box.min.y+(box.max.y-box.min.y)*.61;
   for(const side of [-1,1])points.push(new THREE.Vector3(side*(box.max.x-box.min.x)*.22,y,box.max.z+.035));
  }else{const p=box.getCenter(new THREE.Vector3());p.z=box.max.z+.035;points.push(p);}
  if(!model){this.dummy.position.set(e.pos.x,e.pos.y,e.pos.z);this.dummy.rotation.set(0,enemyYaw(e,player),0);this.dummy.scale.setScalar(Math.min(1,e.age/1.1));this.dummy.updateMatrix();}
  return points.map(p=>{p.applyMatrix4(head!.matrixWorld);if(!model)p.applyMatrix4(this.dummy.matrix);return{pos:p,size:isSkull(e.kind)?.5:.65};});
 }
}
