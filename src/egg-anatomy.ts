import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {sweepAnatomy,type AnatomyPoint} from './creature-geometry';

/** Closed organic brood sac. Raised longitudinal ribs and recessed splits
 * replace the equatorial ring and crystal tip, in a single instanced material. */
export function createEggAnatomy(armored:boolean,material:THREE.Material){
 const radius=armored?.75:.6,parts:THREE.BufferGeometry[]=[];
 const add=(source:THREE.BufferGeometry,region:number)=>{
  const g=source.index?source.toNonIndexed():source;if(g!==source)source.dispose();
  const p=g.getAttribute('position'),count=p.count,coords=new Float32Array(count*3),regions=new Float32Array(count);
  for(let i=0;i<count;i++){coords[i*3]=p.getX(i)/(radius*3);coords[i*3+1]=p.getY(i)/(radius*3);coords[i*3+2]=p.getZ(i)/(radius*3);regions[i]=region;}
  g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(count*2),2));g.setAttribute('creatureCoord',new THREE.BufferAttribute(coords,3));g.setAttribute('creatureRegion',new THREE.BufferAttribute(regions,1));g.setAttribute('motionWeight',new THREE.BufferAttribute(new Float32Array(count),1));parts.push(g);
 };
 const point=(v:number,a:number,out=0):AnatomyPoint=>{
  const belly=Math.pow(Math.max(0,Math.sin(v*Math.PI)),.78)*(1.07-v*.22),rib=1+(armored?.085:.045)*Math.cos(a*(armored?8:6)+v*.5);
  const r=radius*belly*rib+out;
  return [Math.sin(a)*r+Math.sin(v*Math.PI)*radius*.045,(v*2-1)*radius*1.3,Math.cos(a)*r];
 };
 const positions:number[]=[],indices:number[]=[],rows=10,cols=armored?24:20;
 for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++)positions.push(...point(row/rows,col/cols*Math.PI*2));
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const a=row*(cols+1)+col,b=a+cols+1;
  // Poles are single fans, without zero-area triangles at the tips.
  if(row>0)indices.push(a,a+1,b);if(row<rows-1)indices.push(a+1,b+1,b);
 }
 const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));shell.setIndex(indices);shell.computeVertexNormals();add(shell,0);
 const ribs=armored?8:6;
 for(let i=0;i<ribs;i++){
  const angle=i/ribs*Math.PI*2;
  const path=Array.from({length:7},(_,j)=>point(.07+j*.145,angle+(j%2)*.025,radius*(armored?.015:.008)));
  add(sweepAnatomy(path,[.006,.018,.027,.030,.024,.016,.003].map(r=>r*(armored?1.65:1)),5),armored?3:1);
  if(i%2===0){
   // A dark wound follows the shell length. Sparse lit tissue is confined to
   // its deepest central part; there is no manufactured ring around the sac.
   const seam=Array.from({length:5},(_,j)=>point(.23+j*.12,angle+.17+Math.sin(j*2)*.045,radius*.006));
   add(sweepAnatomy(seam,[.003,.008,.011,.007,.002],4),4);
   if(i===0)add(sweepAnatomy(seam.slice(1,4).map(([x,y,z]):AnatomyPoint=>[x+Math.sin(angle)*.009,y,z+Math.cos(angle)*.009]),[.003,.005,.001],4),5);
  }
 }
 if(armored)for(let band=0;band<3;band++)for(let i=0;i<8;i++){
  const v=.22+band*.20,a=i*Math.PI/4+.05,verts:AnatomyPoint[]=[],tris:number[]=[];
  // Overlapping scutes conform to the body instead of floating as flat studs.
  for(let row=0;row<3;row++)for(let col=0;col<3;col++)verts.push(point(v+row*.065+(row===2?(col===1?.045:-.015):0),a+col*.32+(row===2?(1-col)*.045:0),radius*(.020+row*.018+(col===1?.012:0))));
  for(let row=0;row<2;row++)for(let col=0;col<2;col++){const k=row*3+col;tris.push(k,k+1,k+3,k+1,k+4,k+3);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts.flat(),3));g.setIndex(tris);g.computeVertexNormals();add(g,0);
 }
 const geometry=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const mesh=new THREE.Mesh(geometry,material);mesh.name=armored?'armored-brood-sac':'living-brood-sac';return mesh;
}
