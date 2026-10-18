import * as THREE from 'three';
import {DAGGER_PRESENTATION} from './weapon-tuning';

/** A slender, bevelled shard, with +Z at the point. No guard or handle to
 * turn a fast projectile into a tiny, broad sword seen from behind. */
export function projectileGeometry(){
 const positions:number[]=[],edge:number[]=[];
 const rings=[[-.23,.005,.004],[-.13,.028,.012],[.02,.047,.019],[.19,.029,.012],[.49,0,0]];
 // Eight vertices per section: cutting edges, bevel shoulders and centre ridges.
 const section=(ring:number,i:number)=>{
  const [z,w,h]=rings[ring],points=[[w,0],[w*.72,h*.58],[0,h],[-w*.72,h*.58],[-w,0],[-w*.72,-h*.58],[0,-h],[w*.72,-h*.58]];
  return [points[i][0],points[i][1],z];
 };
 const vertex=(r:number,i:number)=>{positions.push(...section(r,i));edge.push(i%4===0?1:i%4===2?.42:0);};
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<8;i++){
  const j=(i+1)%8;
  vertex(r,i);vertex(r,j);vertex(r+1,j);
  if(r<rings.length-2){vertex(r,i);vertex(r+1,j);vertex(r+1,i);}
 }
 for(let i=0;i<8;i++){
  positions.push(0,0,rings[0][0]);edge.push(0);vertex(0,(i+1)%8);vertex(0,i);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('projectileEdge',new THREE.Float32BufferAttribute(edge,1));
 geometry.scale(DAGGER_PRESENTATION.width/.094,DAGGER_PRESENTATION.width/.094,DAGGER_PRESENTATION.length/.72);
 geometry.computeVertexNormals();geometry.computeBoundingSphere();
 return geometry;
}
