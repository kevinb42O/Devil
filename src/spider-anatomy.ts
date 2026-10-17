import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {EnemyKind} from './enemy-kinds';

/** Project-authored arachnid anatomy. All surface coordinates live in the same
 * anatomical space, including the instanced juveniles. */
export function createSpiderAnatomy(kind:EnemyKind,material:THREE.Material,size:number){
 const juvenile=kind==='spiderling',armored=kind==='spider2',detail=juvenile?8:14;
 const bodyParts:THREE.BufferGeometry[]=[],headParts:THREE.BufferGeometry[]=[];
 const add=(geometry:THREE.BufferGeometry,region=0,head=false,leg?:{hip:THREE.Vector3;phase:number})=>{
  const g=geometry.index?geometry.toNonIndexed():geometry; if(g!==geometry)geometry.dispose();
  g.deleteAttribute('uv');
  const p=g.getAttribute('position'),coords=new Float32Array(p.count*3),regions=new Float32Array(p.count),motion=new Float32Array(p.count),gait=new Float32Array(p.count*4);
  for(let i=0;i<p.count;i++){
   coords[i*3]=p.getX(i)/12;coords[i*3+1]=p.getY(i)/12;coords[i*3+2]=p.getZ(i)/12;regions[i]=region;
   if(leg){gait[i*4]=leg.hip.x*size;gait[i*4+1]=leg.hip.z*size;gait[i*4+2]=Math.min(1,Math.abs(p.getX(i)-leg.hip.x)/3.7);gait[i*4+3]=leg.phase;}
  }
  g.setAttribute('creatureCoord',new THREE.BufferAttribute(coords,3));g.setAttribute('creatureRegion',new THREE.BufferAttribute(regions,1));g.setAttribute('motionWeight',new THREE.BufferAttribute(motion,1));g.setAttribute('spiderGait',new THREE.BufferAttribute(gait,4));g.scale(size,size,size);(head?headParts:bodyParts).push(g);
 };
 const ellipsoid=(center:number[],scale:number[],region=0,head=false,leg?:{hip:THREE.Vector3;phase:number})=>{
  const g=new THREE.SphereGeometry(1,detail,juvenile?6:10);g.scale(scale[0],scale[1],scale[2]);g.translate(center[0],center[1],center[2]);add(g,region,head,leg);
 };
 const tube=(points:THREE.Vector3[],radii:number[],region=0,head=false,leg?:{hip:THREE.Vector3;phase:number})=>{
  const positions:number[]=[],indices:number[]=[],sides=juvenile?5:10;
  // Interpolate the taper and centerline so limbs bend like cuticle rather than rods.
  if(!juvenile){const curve=new THREE.CatmullRomCurve3(points),count=(points.length-1)*4,source=radii;points=curve.getPoints(count);radii=points.map((_,i)=>{const f=i/count*(source.length-1),a=Math.min(source.length-2,Math.floor(f));return THREE.MathUtils.lerp(source[a],source[a+1],f-a);});}
  for(let i=0;i<points.length;i++){
   const tangent=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).normalize();
   const u=new THREE.Vector3(0,0,1).cross(tangent).normalize();if(u.lengthSq()<.01)u.set(1,0,0);const v=tangent.clone().cross(u).normalize();
   for(let j=0;j<sides;j++){const a=j/sides*Math.PI*2,p=points[i].clone().addScaledVector(u,Math.cos(a)*radii[i]).addScaledVector(v,Math.sin(a)*radii[i]);positions.push(p.x,p.y,p.z);}
   if(i)for(let j=0;j<sides;j++){const a=(i-1)*sides+j,b=(i-1)*sides+(j+1)%sides,c=i*sides+j,d=i*sides+(j+1)%sides;indices.push(a,b,c,b,d,c);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();add(g,region,head,leg);
 };
 const path=(p:number[][])=>p.map(v=>new THREE.Vector3(...v as [number,number,number]));
 // A pear-shaped abdomen rises behind the low, broad cephalothorax.
 ellipsoid([0,.35,-1.65],[juvenile?.78:1.48,juvenile?.64:1.1,juvenile?1.25:1.95]);
 ellipsoid([0,.13,.35],[1.13,.65,1.45]);
 ellipsoid([0,-.32,.2],[.87,.34,1.23],1);
 // Dorsal overlapping shields leave narrow dark sutures between their rims.
 if(!juvenile)for(let band=0;band<5;band++){
  const vertices:number[]=[],indices:number[]=[],rows=4,cols=16;
  for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
   const t=row/rows,a=-1.5+col/cols*3,z=-3.35+band*.66+t*.77;
   const r=Math.sqrt(Math.max(.025,1-Math.pow((z+1.65)/1.98,2)));
   const lip=.045+Math.pow(t,6)*.065,keel=Math.pow(Math.cos(a),12)*.055;
   vertices.push(Math.sin(a)*(1.48*r+lip),.35+Math.cos(a)*(1.10*r+lip)+keel,z);
  }
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const a=r*(cols+1)+c,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();add(g);
 }
 // Eight legs: muscular coxa, rising femur, bowed tibia, tapering hooked tarsus.
 for(const side of [-1,1])for(let i=0;i<4;i++){
  const z=1.05-i*.76,hip=new THREE.Vector3(side*.8,.1,z),spread=[2.55,3.55,3.85,3.1][i],sweep=[2.2,.8,-.95,-2.75][i];
  const knee=new THREE.Vector3(side*spread,1.15+(i===1||i===2?.35:0),z+sweep*.5),ankle=new THREE.Vector3(side*(spread+1.15),-1.23,z+sweep),tip=new THREE.Vector3(side*(spread+1.38),-2.52,z+sweep+.22);
  const leg={hip,phase:i*Math.PI+(side===1?Math.PI:0)};
  const thickness=armored?.25:juvenile?.12:.19;
  ellipsoid(hip.toArray(),[.35,.28,.37],1,false,leg);
  tube([hip,hip.clone().lerp(knee,.35).add(new THREE.Vector3(0,.15,0)),knee],[thickness*1.4,thickness*.95,thickness*.68],0,false,leg);
  ellipsoid(knee.toArray(),[thickness*.98,thickness*1.25,thickness*1.02],0,false,leg);
  tube([knee,knee.clone().lerp(ankle,.43).add(new THREE.Vector3(side*.13,.1,0)),ankle,tip],[thickness,.15*(juvenile?.6:1),.08,.009],0,false,leg);
  if(!juvenile){
   for(let bristle=0;bristle<4;bristle++){
    const p=knee.clone().lerp(ankle,.25+bristle*.14),q=p.clone().add(new THREE.Vector3(side*.13,.07,-.16));
    tube([p,q],[.025,.002],0,false,leg);
   }
   // Backward-facing keratin spurs break the silhouette without hair alpha cards.
   tube([knee.clone().lerp(ankle,.3),knee.clone().lerp(ankle,.3).add(new THREE.Vector3(side*.23,.28,-.38))],[.085,.006],3,false,leg);
   if(armored)tube([knee.clone().add(new THREE.Vector3(0,.1,0)),knee.clone().add(new THREE.Vector3(side*.35,.65,-.25))],[.18,.008],3,false,leg);
  }
 }
 // Head geometry is relative to the combat pivot (0, .2, 1).
 ellipsoid([0,.04,.58],[.99,.57,.86],0,true);
 ellipsoid([0,-.25,1.04],[.64,.24,.46],4,true);
 for(const side of [-1,1]){
  for(let i=0;i<3;i++){
   const x=side*(.31+i*.23),y=.34-i*.055,z=1.28-i*.13,r=i===0?.095:.062;
   ellipsoid([x,y,z],[r*1.43,r*1.4,r*.72],4,true);
   ellipsoid([x,y+.006,z+.045],[r,r*.68,r*.54],5,true);
  }
  ellipsoid([side*.64,-.3,1.18],[.29,.4,.37],0,true);
  tube(path([[side*.69,-.42,1.26],[side*.8,-.72,1.59],[side*.65,-.9,1.94],[side*.35,-.78,2.13]]),[.21,.18,.1,.006],3,true);
  tube(path([[side*.86,-.17,.89],[side*1.27,-.29,1.41],[side*1.12,-.48,1.92]]),[.15,.12,.008],0,true);
  if(armored)tube(path([[side*.67,.27,.68],[side*.95,.74,.37],[side*1.01,1.2,-.17]]),[.26,.17,.005],3,true);
 }
 if(armored)for(const side of [-1,1])for(let i=0;i<3;i++)tube(path([[side*.85,.95,-1-i*.6],[side*1.2,1.7,-1.3-i*.6],[side*1.35,2.1,-1.75-i*.6]]),[.25,.17,.005],3);
 const merge=(parts:THREE.BufferGeometry[],name:string)=>{const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());if(!g)throw Error('Spider anatomy merge failed');g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);mesh.name=name;return mesh;};
 const body=merge(bodyParts,'spider-carapace-and-legs'),head=new THREE.Group();head.name='spider-head-pivot';head.position.set(0,.2*size,size);head.add(merge(headParts,'spider-face-and-fangs'));
 const root=new THREE.Group();root.add(body,head);root.userData.anatomy='authored-eight-legged-arachnid';return {root,head};
}
