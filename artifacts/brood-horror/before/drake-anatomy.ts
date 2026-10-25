import * as THREE from 'three';
import {prepareEnemySurfaceGeometry,type EnemySurfaceRole} from './enemy-surface-material';

/** A broad, angular hunting skull replaces the source dragon's round smiling
 * face. Retain its licensed wing membranes and their animation attributes. */
export function createDrakeAnatomy(wings:THREE.Mesh,material:(role:EnemySurfaceRole)=>THREE.Material){
 const root=new THREE.Group();root.name='drake-anatomy';
 const geometry=wings.geometry.clone(),region=geometry.getAttribute('creatureRegion');
 const indices:number[]=[],source=geometry.index;
 for(let i=0;i<(source?.count??region.count);i+=3){
  const ids=[0,1,2].map(j=>source?source.getX(i+j):i+j);
  if(ids.every(id=>Math.abs(region.getX(id)-2)<.5))indices.push(...ids);
 }
 geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();wings.geometry=geometry;root.add(wings);
 const add=(name:string,g:THREE.BufferGeometry,role:EnemySurfaceRole)=>{
  prepareEnemySurfaceGeometry(g,role);
  if(!g.hasAttribute('uv'))g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
  // Authored rigid anatomy must not inherit the wing deformation.
  g.setAttribute('motionWeight',new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count),1));
  const mesh=new THREE.Mesh(g,material(role));mesh.name=name;root.add(mesh);return mesh;
 };
 // Eight-point sections make a flattened wedge, with cheekbones extending
 // beyond the jaws. The front is a brow-heavy mask rather than a round muzzle.
 const sections=[{z:-.95,w:1.15,h:.85,y:.05},{z:.35,w:1.65,h:1.05,y:.05},{z:1.18,w:1.28,h:.72,y:-.02}];
 const positions:number[]=[],triangles:number[]=[];
 for(const s of sections)for(let i=0;i<8;i++){const a=Math.PI/8+i*Math.PI/4;positions.push(Math.cos(a)*s.w,s.y+Math.sin(a)*s.h,s.z);}
 for(let ring=0;ring<2;ring++)for(let i=0;i<8;i++){const a=ring*8+i,b=ring*8+(i+1)%8,c=a+8,d=b+8;triangles.push(a,b,c,b,d,c);}
 for(let i=1;i<7;i++)triangles.push(0,i+1,i,16,16+i,17+i);
 const skull=new THREE.BufferGeometry();skull.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));skull.setIndex(triangles);skull.computeVertexNormals();
 // Shell role keeps the large rigid head out of the animated swarm body path.
 add('drake-skull',skull,'shell');
 const plate=(name:string,points:number[][],role:EnemySurfaceRole)=>{
  const g=new THREE.BufferGeometry(),p=points.flat(),idx:number[]=[];
  for(let i=1;i<points.length-1;i++){const a=points[0],b=points[i],c=points[i+1];
   const facing=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
   if(facing<0)idx.push(0,i+1,i);else idx.push(0,i,i+1);
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return add(name,g,role);
 };
 const dark=new THREE.MeshStandardMaterial({color:0x080608,roughness:.9,toneMapped:false});
 dark.name='drake-recessed-sockets';dark.userData.enemySurface={...material('shell').userData.enemySurface,description:'Recessed black eye sockets and a closed downturned mouth seam.'};
 const cold=material('shell').userData.enemySurface.kind==='transmuted4';
 const ember=new THREE.MeshStandardMaterial({color:cold?0x163f39:0x6e1d0a,emissive:cold?0x69dcc9:0xe85a18,emissiveIntensity:.4,roughness:.5,toneMapped:false});
 ember.name='drake-narrow-eye-slits';ember.userData.enemySurface={...material('shell').userData.enemySurface,description:'Narrow ember slits beneath a heavy angular brow.'};
 for(const side of [-1,1]){
  const points=[[.22,.22,1.205],[1.13,.52,1.205],[1.05,.02,1.215],[.38,.02,1.22]].map(([x,y,z])=>[x*side,y,z]);
  if(side<0)points.reverse();const socket=plate('drake-recessed-eye',points,'shell');socket.material=dark;
  const slit=[[.35,.13,1.235],[.98,.34,1.235],[.91,.21,1.24],[.40,.07,1.24]].map(([x,y,z])=>[x*side,y,z]);
  if(side<0)slit.reverse();plate('drake-eye-slit',slit,'shell').material=ember;
  const browShape=new THREE.Shape();
  const browPoints=[[.16,.37],[1.40,.72],[1.29,.48],[.30,.20]];
  browPoints.forEach(([x,y],i)=>{if(i===0)browShape.moveTo(x*side,y);else browShape.lineTo(x*side,y);});browShape.closePath();
  const brow=add('drake-heavy-brow',new THREE.ExtrudeGeometry(browShape,{depth:.18,bevelEnabled:false}),'shell');brow.position.z=1.20;
  const cheek=add('drake-jaw-blade',new THREE.ConeGeometry(.32,1.15,4),'bone');cheek.position.set(side*1.15,-.65,.92);cheek.rotation.z=side*.22;cheek.rotation.x=Math.PI;
  const horn=add('drake-swept-horn',new THREE.ConeGeometry(.27,1.65,5),'bone');horn.position.set(side*1.20,1.30,-.30);horn.rotation.z=-side*.50;horn.rotation.x=-.55;
 }
 // A short broken horizontal seam, with downturned ends: no upturned mouth.
 const mouth=plate('drake-mouth-seam',[[-.83,-.38,1.24],[-.47,-.28,1.24],[0,-.34,1.24],[.47,-.28,1.24],[.83,-.38,1.24],[.62,-.49,1.24],[0,-.43,1.24],[-.62,-.49,1.24]],'shell');mouth.material=dark;
 const keel=add('drake-chin-keel',new THREE.ConeGeometry(.44,.78,3),'shell');keel.position.set(0,-.91,.62);keel.rotation.x=Math.PI;
 return root;
}
