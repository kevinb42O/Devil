import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

type Point=[number,number,number];
/** Newly authored bone anatomy. Forward is +Z. All parts bake into one mesh,
 * including recessed cavities, so the combat swarm retains one draw per kind. */
export function createSkullAnatomy(tier:number,material:THREE.Material){
 if(tier<1||tier>3)throw Error(`Unsupported skull anatomy tier: ${tier}`);
 const parts:THREE.BufferGeometry[]=[];
 const add=(g:THREE.BufferGeometry,region:number,motion=0)=>{
  const geometry=g.index?g.toNonIndexed():g;if(geometry!==g)g.dispose();
  const p=geometry.getAttribute('position'),count=p.count;
  const coord=new Float32Array(count*3),regions=new Float32Array(count),weights=new Float32Array(count);
  for(let i=0;i<count;i++){
   coord[i*3]=p.getX(i)/3;coord[i*3+1]=p.getY(i)/3;coord[i*3+2]=p.getZ(i)/3;
   regions[i]=region;weights[i]=motion*Math.max(0,Math.min(1,(-p.getY(i)+.05)/1.4));
  }
  if(!geometry.hasAttribute('normal'))geometry.computeVertexNormals();
  geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(count*2),2));
  geometry.setAttribute('creatureCoord',new THREE.BufferAttribute(coord,3));
  geometry.setAttribute('creatureRegion',new THREE.BufferAttribute(regions,1));
  geometry.setAttribute('motionWeight',new THREE.BufferAttribute(weights,1));parts.push(geometry);
 };
 const surface=(points:Point[],indices:number[],region:number,motion=0)=>{
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.setIndex(indices);g.computeVertexNormals();add(g,region,motion);
 };
 const solid=(points:Point[],depth:number,region=3,motion=0)=>{
  const contour=points.map(([x,y])=>new THREE.Vector2(x,y));
  const indices=THREE.ShapeUtils.triangulateShape(contour,[]).flat(),n=points.length;
  const p:Point[]=[...points,...points.map(([x,y,z]):Point=>[x,y,z-depth])];
  for(let i=0;i<indices.length;i+=3){const a=indices[i],b=indices[i+1],c=indices[i+2];
   // Triangulation winding is normalized independently of mirrored contours.
   if((points[b][0]-points[a][0])*(points[c][1]-points[a][1])-(points[b][1]-points[a][1])*(points[c][0]-points[a][0])<0)[indices[i+1],indices[i+2]]=[c,b];
  }
  const front=[...indices];for(let i=0;i<front.length;i+=3)indices.push(front[i]+n,front[i+2]+n,front[i+1]+n);
  const area=THREE.ShapeUtils.area(contour);
  for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(...(area>0?[i,n+i,j,j,n+i,n+j]:[i,j,n+i,j,n+j,n+i]));}
  surface(p,indices,region,motion);
 };
 const sweep=(points:Point[],radii:number[],region=3,sides=7,steps=0,fluting=0,motion=0)=>{
  if(steps){
   const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),source=radii;
   points=curve.getPoints(steps).map(p=>p.toArray() as Point);
   radii=points.map((_,i)=>{const t=i/steps*(source.length-1),j=Math.min(source.length-2,Math.floor(t));return THREE.MathUtils.lerp(source[j],source[j+1],t-j);});
  }
  const vertices:Point[]=[],indices:number[]=[];
  for(let i=0;i<points.length;i++){
   const center=new THREE.Vector3(...points[i]),tangent=new THREE.Vector3(...points[Math.min(i+1,points.length-1)]).sub(new THREE.Vector3(...points[Math.max(0,i-1)])).normalize();
   const across=new THREE.Vector3(0,0,1).cross(tangent).normalize();if(across.lengthSq()<.01)across.set(1,0,0);
   const up=tangent.clone().cross(across).normalize();
   for(let j=0;j<sides;j++){
    const a=j/sides*Math.PI*2,r=radii[i]*(1+fluting*Math.cos(j*Math.PI+i*.8));
    vertices.push(center.clone().addScaledVector(across,Math.cos(a)*r).addScaledVector(up,Math.sin(a)*r*.86).toArray() as Point);
   }
  }
  for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c);}
  for(let j=1;j<sides-1;j++)indices.push(0,j+1,j,(points.length-1)*sides,(points.length-1)*sides+j,(points.length-1)*sides+j+1);
  surface(vertices,indices,region,motion);
 };
 const mirror=(points:Point[],side:number)=>points.map(([x,y,z]):Point=>[x*side,y,z]);
 const ellipsoid=(position:Point,size:Point,region:number)=>{
  const g=new THREE.SphereGeometry(1,8,4);g.scale(...size);g.translate(...position);add(g,region);
 };
 // A continuous deep cranial vault, with orbital and nasal apertures cut
 // through the facial surface. Orbital walls descend into black recesses.
 const width=tier===1?.50:tier===3?.52:.46,top=tier===3?.76:tier===2?.66:.72;
 const outline:Point[]=[
  [0,top,.08],[-width*.60,top-.07,.15],[-width*.93,top-.24,.14],[-width,top-.46,.17],
  [-width*.96,.02,.23],[-width*1.07,-.15,.32],[-width*.69,-.24,.46],[-width*.51,-.32,.50],
  [0,-.28,.55],[width*.51,-.32,.50],[width*.69,-.24,.46],[width*1.07,-.15,.32],
  [width*.96,.02,.23],[width,top-.46,.17],[width*.93,top-.24,.14],[width*.60,top-.07,.15],
 ];
 const eye:Point[]=tier===3?[[.10,.13,.46],[.29,.20,.40],[.46,.15,.25],[.40,-.08,.39],[.26,-.16,.47],[.13,-.07,.49]]:[[.10,.16,.42],[.24,.23,.36],[.43,.20,.23],[.39,-.045,.34],[.26,-.13,.42],[.13,-.055,.46]];
 const nose:Point[]=[[-.048,-.065,.51],[0,.04,.48],[.052,-.065,.51],[.075,-.23,.54],[0,-.19,.57],[-.068,-.23,.54]];
 const holes=[mirror(eye,-1),eye,nose],all=[...outline,...holes.flat()];
 const face=THREE.ShapeUtils.triangulateShape(outline.map(p=>new THREE.Vector2(p[0],p[1])),holes.map(h=>h.map(p=>new THREE.Vector2(p[0],p[1]))));
 const faceIndices:number[]=[];
 for(const [a,b,c]of face){const u=all[a],v=all[b],w=all[c];faceIndices.push(...((v[0]-u[0])*(w[1]-u[1])-(v[1]-u[1])*(w[0]-u[0])>0?[a,b,c]:[a,c,b]));}
 // Subdivide the facial courses once to give the frontal bone a real crown
 // and the cheek a shallow convex surface, without adding separate brow rods.
 const sculpted:Point[]=[...all],sculptIndices:number[]=[];
 for(let i=0;i<faceIndices.length;i+=3){
  const [a,b,c]=faceIndices.slice(i,i+3),p=all[a],q=all[b],r=all[c];
  const x=(p[0]+q[0]+r[0])/3,y=(p[1]+q[1]+r[1])/3;
  const bulge=.085*Math.max(0,1-Math.abs(x)/width)*THREE.MathUtils.smoothstep(y,.16,.44);
  const m=sculpted.length;sculpted.push([x,y,(p[2]+q[2]+r[2])/3+bulge]);sculptIndices.push(a,b,m,b,c,m,c,a,m);
 }
 surface(sculpted,sculptIndices,3);
 // Rear courses round away from the exposed face; the broad skull is a volume,
 // rather than an ornamental front plate attached to a sphere.
 const vault:Point[]=[...outline],vaultIndices:number[]=[],n=outline.length;
 for(const [factor,z,yOffset]of [[1.035,-.12,.02],[.86,-.43,.06],[.48,-.61,.13]])
  for(const [x,y]of outline)vault.push([x*factor,(y-.12)*factor+.12+yOffset,z]);
 for(let ring=0;ring<3;ring++)for(let i=0;i<n;i++){
  const a=ring*n+i,b=ring*n+(i+1)%n,c=a+n,d=b+n;vaultIndices.push(a,c,b,b,c,d);
 }
 vault.push([0,.27,-.69]);for(let i=0;i<n;i++)vaultIndices.push(3*n+i,4*n,3*n+(i+1)%n);
 surface(vault,vaultIndices,3);
 for(const hole of holes){
  const bevel=hole.map(([x,y,z]):Point=>[x*.96,y*.97,z-.035]);
  const inside=hole.map(([x,y]):Point=>[x*.83,y*.91,-.015]);
  const area=THREE.ShapeUtils.area(hole.map(p=>new THREE.Vector2(p[0],p[1]))),count=hole.length;
  for(const [front,back,region]of [[hole,bevel,3],[bevel,inside,4]] as [Point[],Point[],number][]){
   const indices:number[]=[];
   for(let i=0;i<count;i++){const j=(i+1)%count;indices.push(...(area>0?[i,j,i+count,j,j+count,i+count]:[i,i+count,j,j,i+count,j+count]));}
   surface([...front,...back],indices,region);
  }
 }
 // Deep sockets and throat remain enclosed from every viewing angle.
 for(const side of [-1,1]){
  ellipsoid([side*.25,.065,-.04],[.205,.19,.09],4);
  // Tiny irregular coals leave the orbital hollows dominant at close range.
  solid(mirror([[.19,.045,.065],[.245,.075,.065],[.285,.045,.065],[.25,.012,.070],[.205,.018,.070]],side),.025,5);
 }
 ellipsoid([0,-.15,.045],[.075,.14,.075],4);
 const jawDrop=tier===1?.61:tier===2?.55:.94;
 ellipsoid([0,-.35,.06],[.285,tier===3?.45:.27,.15],4);
 // One wedge-shaped mandible. Its open center is actual negative space, with
 // a projecting chin and rearward rami; no round horseshoe tubing.
 const jaw:Point[]=[[-.43,-.12,.08],[-.46,-.32,.17],[-.32,-jawDrop+.04,.43],[-.09,-jawDrop-.10,.53],
  [.085,-jawDrop-.12,.52],[.33,-jawDrop+.045,.43],[.46,-.30,.18],[.43,-.12,.08],
  [.32,-.25,.17],[.25,-jawDrop+.18,.43],[.04,-jawDrop+.065,.49],[-.055,-jawDrop+.08,.49],[-.25,-jawDrop+.19,.42],[-.32,-.27,.17]];
 solid(jaw,.13,3);
 for(const side of [-1,1]){
  // Cheek blades sweep toward the temporal bone, not into raised eyebrows.
  solid(mirror([[.29,-.13,.43],[.55,-.07,.19],[.48,-.27,.10],[.29,-.34,.47],[.23,-.24,.50]],side),.12,3);
  for(let i=0;i<4;i++){
   if(side===-1&&i===1&&tier===1)continue;
   const x=side*(.065+i*.075),y=-.28-Math.abs(i-1)*.018,length=[.11,.16,.23,.13][i]*(tier===3?1.2:1);
   sweep([[x,y,.50],[x*.93,y-length*.65,.55],[x*.84,y-length,.57]],[i===2?.048:.036,.024,.002],3,4);
   const bottom=-jawDrop+.14+(i===3?.07:0);
   sweep([[x,bottom,.48],[x*.92,bottom+.09+(i%2)*.045,.54]],[.031,.002],3,4);
  }
  // Desiccated temporal roots, flexing slightly behind rigid facial anatomy.
  sweep([[side*.34,-.15,-.29],[side*.26,-.48,-.38],[side*.13,-.68,-.42]],[.07,.043,.003],1,5,0,0,.3);
 }
 if(tier>=2){
  // Broad descending ram horns, rooted at the temple. Tier III has a heavier
  // rearward curl, raised growth collars and a serrated outer profile.
  for(const side of [-1,1]){
   const heavy=tier===3;
   const points:Point[]=[[side*.36,.40,-.16],[side*.72,.43,-.22],[side*.99,.18,-.18],[side*1.04,-.18,-.04],[side*.89,-.49,.10],[side*.64,-.70,.31],[side*.50,-.94,.43]];
   for(let i=1;i<points.length;i++){points[i][0]*=heavy?1.0:.88;if(heavy)points[i][2]-=.10;}
   if(side===-1){points[3][1]+=.055;points[5][0]*=.96;}
   sweep(points,heavy?[.25,.32,.30,.24,.17,.10,.002]:[.20,.27,.25,.20,.13,.07,.002],0,7,12,heavy?.07:.025);
   if(heavy)for(let i=0;i<5;i++){
    const p=points[i],q=points[i+1],t=.35;
    const center=new THREE.Vector3(p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,p[2]+(q[2]-p[2])*t);
    // The barb starts on the horn's outer surface. Starting it at the
    // centerline would bury the whole serration inside the curved horn.
    const outward=new THREE.Vector3(side*(i<2?.45:.9),i<2?.9:i<3?.2:-.45,-.15).normalize();
    const base=center.clone().addScaledVector(outward,.22-i*.018),tip=center.clone().addScaledVector(outward,.48-i*.025);
    tip.z-=.10;
    sweep([base.toArray() as Point,tip.toArray() as Point],[.12,.002],0,5);
   }
  }
 }
 if(tier===3){
  // A sagittal bone keel and small occipital barbs carry the apex silhouette
  // around the back without the previous cloth/tissue skirt.
  solid([[-.055,.51,.20],[0,1.01,-.13],[.065,.65,-.44],[.045,.31,-.62],[-.045,.31,-.62]],.075,3);
  for(const side of [-1,1])sweep([[side*.24,.35,-.47],[side*.46,.19,-.70],[side*.52,-.15,-.79]],[.12,.08,.002],3,5);
  // A small recessed throat ember; it never traces decorative lines on bone.
  solid([[-.055,-.42,.23],[.04,-.46,.23],[.06,-.63,.24],[-.03,-.71,.23]],.025,5);
 }
 const geometry=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const mesh=new THREE.Mesh(geometry,material);mesh.name=['','skull-shrieker','skull-executioner','skull-reliquary'][tier];
 // Tier III's larger horn mass makes it legible at the same camera distance.
 if(tier===3)mesh.scale.setScalar(1.1);
 return mesh;
}
