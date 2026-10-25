import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {EnemyKind} from './enemy-kinds';
import {createSkullAnatomy} from './skull-anatomy';

/** Project-authored arachnid anatomy. All surface coordinates live in the same
 * anatomical space, including the instanced juveniles. */
export function createSpiderAnatomy(kind:EnemyKind,material:THREE.Material,size:number){
 const juvenile=kind==='spiderling',armored=kind==='spider2',detail=juvenile?8:14;
 const bodyParts:THREE.BufferGeometry[]=[],headParts:THREE.BufferGeometry[]=[];
 const add=(geometry:THREE.BufferGeometry,region=0,head=false,leg?:{hip:THREE.Vector3;phase:number})=>{
  const g=geometry.index?geometry.toNonIndexed():geometry; if(g!==geometry)geometry.dispose();
  g.deleteAttribute('uv');
  const semantic=g.getAttribute('creatureRegion');
  const p=g.getAttribute('position'),coords=new Float32Array(p.count*3),regions=new Float32Array(p.count),motion=new Float32Array(p.count),gait=new Float32Array(p.count*4);
  for(let i=0;i<p.count;i++){
   coords[i*3]=p.getX(i)/12;coords[i*3+1]=p.getY(i)/12;coords[i*3+2]=p.getZ(i)/12;regions[i]=region<0?semantic.getX(i):region;
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
 const abdomenWidth=armored?2.12:1.48,abdomenHeight=armored?1.85:1.25,abdomenLength=armored?2.65:1.95;
 const abdomenY=armored?.70:.45,abdomenZ=armored?-2.05:-1.65;
 ellipsoid([0,abdomenY,abdomenZ],[juvenile?.78:abdomenWidth,juvenile?.64:abdomenHeight,juvenile?1.25:abdomenLength]);
 ellipsoid([0,.13,.35],[armored?1.5:1.13,armored?.88:.65,armored?1.65:1.45]);
 ellipsoid([0,-.32,.2],[.87,.34,1.23],1);
 // Dorsal overlapping shields leave narrow dark sutures between their rims.
 if(!juvenile)for(let band=0;band<5;band++){
  const vertices:number[]=[],indices:number[]=[],rows=4,cols=16;
  for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
   const t=row/rows,a=-1.5+col/cols*3,z=armored?-4.4+band*.9+t*1.04:-3.35+band*.66+t*.77;
   const r=Math.sqrt(Math.max(.025,1-Math.pow((z-abdomenZ)/(abdomenLength+.03),2)));
   const lip=.045+Math.pow(t,6)*(armored?.16:.065),keel=Math.pow(Math.cos(a),12)*(armored?.18:.055);
   vertices.push(Math.sin(a)*(abdomenWidth*r+lip),abdomenY+Math.cos(a)*(abdomenHeight*r+lip)+keel,z);
  }
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const a=r*(cols+1)+c,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();add(g);
 }
 if(!juvenile)for(const side of [-1,1])for(let i=0;i<4;i++){
  const z=-.9-i*.7;
  tube(path([[side*(armored?1.7:1.12),armored?1.55:1.0,z],[side*(armored?2.35:1.55),armored?2.05:1.42,z-.28],[side*(armored?2.75:1.75),armored?2.17:1.46,z-.60]]),[armored?.27:.16,armored?.16:.10,.003],3);
 }
 // Eight legs: muscular coxa, rising femur, bowed tibia, tapering hooked tarsus.
 for(const side of [-1,1])for(let i=0;i<4;i++){
  const z=1.05-i*.76,hip=new THREE.Vector3(side*(armored?1.15:.8),.1,z),spread=[2.55,3.55,3.85,3.1][i]*(armored?1.32:1),sweep=[2.2,.8,-.95,-2.75][i]*(armored?1.24:1);
  const knee=new THREE.Vector3(side*spread,(armored?1.8:1.15)+(i===1||i===2?.35:0),z+sweep*.5),ankle=new THREE.Vector3(side*(spread+(armored?1.6:1.15)),-1.23,z+sweep),tip=new THREE.Vector3(side*(spread+(armored?1.95:1.38)),-2.52,z+sweep+.22);
  const leg={hip,phase:i*Math.PI+(side===1?Math.PI:0)};
  const thickness=armored?.38:juvenile?.12:.19;
  ellipsoid(hip.toArray(),[armored?.52:.35,armored?.4:.28,armored?.5:.37],1,false,leg);
  tube([hip,hip.clone().lerp(knee,.35).add(new THREE.Vector3(0,.15,0)),knee],[thickness*1.4,thickness*.95,thickness*.68],0,false,leg);
  ellipsoid(knee.toArray(),[thickness*.98,thickness*1.25,thickness*1.02],0,false,leg);
  tube([knee,knee.clone().lerp(ankle,.43).add(new THREE.Vector3(side*.13,.1,0)),ankle,tip],[thickness,armored?.25:.15*(juvenile?.6:1),armored?.12:.08,.009],0,false,leg);
  if(!juvenile){
   for(let bristle=0;bristle<4;bristle++){
    const p=knee.clone().lerp(ankle,.25+bristle*.14),q=p.clone().add(new THREE.Vector3(side*.13,.07,-.16));
    tube([p,q],[.025,.002],0,false,leg);
   }
   // Backward-facing keratin spurs break the silhouette without hair alpha cards.
   tube([knee.clone().lerp(ankle,.3),knee.clone().lerp(ankle,.3).add(new THREE.Vector3(side*.23,.28,-.38))],[.085,.006],3,false,leg);
   if(armored)tube([knee.clone().add(new THREE.Vector3(0,.1,0)),knee.clone().add(new THREE.Vector3(side*.5,1.05,-.45))],[.25,.008],3,false,leg);
  }
 }
 // The upper feeding face grows out of the cephalothorax. Deep skull
 // cavities sit above the held crystal, so the gem cannot hide the identity.
 // Keep the established combat pivot and its exposure/folding animation.
 let face=createSkullAnatomy(1,material).geometry;
 if(!juvenile){
  // Adults feed through this opening. A complete human mandible would cover
  // the held crystal, especially on the larger, deeper matriarch face.
  const source=face.getAttribute('position'),keep:number[]=[];
  for(let i=0;i<source.count;i+=3){const y=(source.getY(i)+source.getY(i+1)+source.getY(i+2))/3;if(y>=-.23)keep.push(i,i+1,i+2);}
  face.setIndex(keep);const trimmed=face.toNonIndexed();face.dispose();face=trimmed;
 }
 const faceScale=juvenile?[.92,.88,.72]:armored?[2.5,2.10,1.55]:[2.0,1.7,1.3];
 face.scale(faceScale[0],faceScale[1],faceScale[2]);face.translate(0,juvenile?.40:armored?1.18:.95,juvenile?.78:1.0);add(face,-1,true);
 ellipsoid([0,-.08,juvenile?.78:1.05],[juvenile?.40:.90,juvenile?.22:.38,juvenile?.16:.56],4,true);
 for(const side of [-1,1]){
  // Paired feeding tusks frame the functional mouth-held gem. Juveniles have
  // a shorter, forward biting claw instead of a miniature adult gem cradle.
  const reach=juvenile?.68:armored?1.65:1.38;
  ellipsoid([side*(juvenile?.48:.98),.05,1.15],[juvenile?.2:.37,juvenile?.23:.46,juvenile?.26:.44],0,true);
  tube(path([[side*(juvenile?.48:1.0),.10,1.26],[side*reach,-.15,juvenile?1.55:1.98],[side*reach*.90,juvenile?-.38:-.60,juvenile?1.90:2.75],[side*reach*.45,juvenile?-.24:-.38,juvenile?2.02:3.16]]),[juvenile?.15:armored?.38:.29,juvenile?.12:armored?.32:.25,juvenile?.065:.14,.004],3,true);
  tube(path([[side*(juvenile?.64:1.20),.20,.89],[side*(juvenile?.88:1.65),.16,1.50],[side*(juvenile?.70:1.48),-.12,juvenile?1.82:2.10]]),[juvenile?.09:.18,juvenile?.07:.14,.005],0,true);
  if(!juvenile){
   // Hooked temporal horns and splayed cheek flanges replace a naturalistic
   // multi-eye spider face with the reference's demonic feeding silhouette.
   tube(path([[side*1.0,1.45,.72],[side*(armored?1.95:1.55),armored?2.45:1.95,.20],[side*(armored?2.05:1.65),armored?3.10:2.12,-.65]]),[armored?.32:.23,armored?.22:.14,.005],3,true);
   for(let i=0;i<3;i++)tube(path([[side*(1.15+i*.03),1.15-i*.35,.76],[side*(1.62+i*.10),1.22-i*.45,.52],[side*(1.86+i*.10),1.15-i*.48,.20]]),[armored?.22:.15,.10,.004],3,true);
  }
 }

 if(armored){
  // A swept ivory crown and flared shoulder scutes distinguish the matriarch at range.
  for(const side of [-1,1]){
   for(let i=0;i<3;i++){
    tube(path([[side*1.25,1.35,-1.1-i*.85],[side*1.85,2.65-i*.12,-1.65-i*.85],[side*2.05,3.85-i*.18,-2.65-i*.85]]),[.38,.24,.005],3);
    ellipsoid([side*1.32,.58,.5-i*.7],[.65,.58,.7]);
    tube(path([[side*1.5,.85,.4-i*.7],[side*2.1,1.3,-.1-i*.7],[side*2.45,1.45,-.65-i*.7]]),[.24,.17,.005],3);
   }
  }
  // Pale sternal ribs articulate the heavy underside seen from the player's eye level.
  for(let i=0;i<5;i++){
   const z=-.65-i*.65,width=1.45-Math.abs(i-2)*.12;
   tube(path([[-width,-.55,z],[-width*.6,-1.05,z+.12],[0,-1.16,z+.18],[width*.6,-1.05,z+.12],[width,-.55,z]]),[.09,.13,.16,.13,.09],3);
  }
  // Raised interlocking dorsal keels add visible weight between the crown roots.
  for(let i=0;i<4;i++)tube(path([[0,2.02,-.9-i*.75],[0,2.65,-1.15-i*.75],[0,2.85,-1.65-i*.75]]),[.24,.18,.005],0);
 }
 const merge=(parts:THREE.BufferGeometry[],name:string)=>{const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());if(!g)throw Error('Spider anatomy merge failed');g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);mesh.name=name;return mesh;};
 const body=merge(bodyParts,'spider-carapace-and-legs'),head=new THREE.Group();head.name='spider-head-pivot';head.position.set(0,.2*size,size);head.add(merge(headParts,'spider-face-and-fangs'));
 const root=new THREE.Group();root.add(body,head);root.userData.anatomy='authored-eight-legged-arachnid';return {root,head};
}
