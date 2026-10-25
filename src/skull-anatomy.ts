import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

type Point=[number,number,number];
/** Authored swarm anatomy. One material and one merged mesh per creature keep
 * the same cost per draw at one enemy or a thousand. Forward is local +Z. */
export function createSkullAnatomy(tier:number,material:THREE.Material){
 const parts:THREE.BufferGeometry[]=[];
 const add=(geometry:THREE.BufferGeometry,region:number,position:Point=[0,0,0],scale:Point=[1,1,1],motion=0)=>{
  geometry.scale(...scale);geometry.translate(...position);
  const g=geometry.index?geometry.toNonIndexed():geometry;
  if(g!==geometry)geometry.dispose();
  const p=g.getAttribute('position'),n=p.count,coord=new Float32Array(n*3),regions=new Float32Array(n),weights=new Float32Array(n);
  for(let i=0;i<n;i++){
   coord[i*3]=p.getX(i)/3;coord[i*3+1]=p.getY(i)/3;coord[i*3+2]=p.getZ(i)/3;
   regions[i]=region;weights[i]=motion*Math.max(0,Math.min(1,(-p.getY(i)+.1)/1.7));
  }
  if(!g.hasAttribute('normal'))g.computeVertexNormals();
  if(!g.hasAttribute('uv'))g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(n*2),2));
  g.setAttribute('creatureCoord',new THREE.BufferAttribute(coord,3));g.setAttribute('creatureRegion',new THREE.BufferAttribute(regions,1));g.setAttribute('motionWeight',new THREE.BufferAttribute(weights,1));parts.push(g);
 };
 const ellipsoid=(center:Point,size:Point,region:number,segments=8)=>add(new THREE.SphereGeometry(1,segments,6),region,center,size);
 // Tapered polygonal sweeps make hooked horns, exposed roots and thin ribs.
 const tendon=(points:Point[],radii:number[],region:number,sides=5,motion=0)=>{
  // Curved centerlines remove the elbow joints of primitive cone chains.
  if(Math.max(...radii)>.08&&points.length>2&&points.length<6){
   const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
   const count=(points.length-1)*2,source=radii;
   points=Array.from({length:count+1},(_,i)=>curve.getPoint(i/count).toArray() as Point);
   radii=Array.from({length:count+1},(_,i)=>{const t=i/count*(source.length-1),j=Math.min(source.length-2,Math.floor(t));return THREE.MathUtils.lerp(source[j],source[j+1],t-j);});
  }
  const positions:number[]=[],indices:number[]=[];
  for(let i=0;i<points.length;i++){
   const center=new THREE.Vector3(...points[i]),tangent=new THREE.Vector3(...points[Math.min(i+1,points.length-1)]).sub(new THREE.Vector3(...points[Math.max(0,i-1)])).normalize();
   const across=new THREE.Vector3(0,0,1).cross(tangent).normalize();if(across.lengthSq()<.1)across.set(1,0,0);
   const up=tangent.clone().cross(across).normalize();
   for(let j=0;j<sides;j++){const a=j*Math.PI*2/sides,p=center.clone().addScaledVector(across,Math.cos(a)*radii[i]).addScaledVector(up,Math.sin(a)*radii[i]);positions.push(...p.toArray());}
  }
  for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c);}
  for(let j=1;j<sides-1;j++)indices.push(0,j+1,j,(points.length-1)*sides,(points.length-1)*sides+j,(points.length-1)*sides+j+1);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();add(g,region,[0,0,0],[1,1,1],motion);
 };
 const plate=(points:Point[],depth:number,region:number,motion=0)=>{
  const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
  if(area<0)points=[...points].reverse();
  const n=points.length,indices:number[]=[],center=points.reduce((v,p)=>v.add(new THREE.Vector3(...p)),new THREE.Vector3()).multiplyScalar(1/n);
  // A shallow rolled bevel gives plates a readable edge and real thickness.
  const bevel=region===3||region===7?Math.min(.035,depth*.28):0;
  const inset=points.map(([x,y,z]):Point=>{
   const dx=center.x-x,dy=center.y-y,len=Math.max(.001,Math.hypot(dx,dy));
   return [x+dx/len*bevel,y+dy/len*bevel,z+bevel*.45];
  });
  const positions=[...inset.flat(),...points.flatMap(([x,y,z])=>[x,y,z-bevel]),...points.flatMap(([x,y,z])=>[x,y,z-depth])];
  const faces=THREE.ShapeUtils.triangulateShape(inset.map(p=>new THREE.Vector2(p[0],p[1])),[]);
  for(const [a,b,c]of faces)indices.push(a,b,c,2*n+a,2*n+c,2*n+b);
  for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,n+i,j,j,n+i,n+j,n+i,2*n+i,n+j,n+j,2*n+i,2*n+j);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);
  // Smooth across triangulation diagonals; the separate perimeter courses
  // carry the bevel shape without turning broad masks into triangular shards.
  g.computeVertexNormals();add(g,region,[0,0,0],[1,1,1],motion);
 };
 const mirror=(points:Point[],side:number):Point[]=>{const out=points.map(([x,y,z]):Point=>[x*side,y,z]);return side<0?out.reverse():out;};
 if(tier===1){
  // A continuous cranial vault with actual cutouts, orbital rims and a
  // separate horseshoe mandible. No overlapping flat face plates.
  const courses=[
   [.79,.08,.09,-.13],[.72,.30,.26,-.10],[.55,.44,.34,-.08],
   [.34,.48,.34,-.06],[.13,.44,.29,-.03],[-.06,.36,.24,.01],[-.20,.26,.20,.05],
  ];
  const positions:number[]=[],indices:number[]=[],sides=16;
  for(const [y,w,d,z] of courses)for(let j=0;j<sides;j++){
   const a=j*Math.PI*2/sides;
   positions.push(Math.sin(a)*w,y,z+Math.cos(a)*d);
  }
  for(let i=0;i<courses.length-1;i++)for(let j=0;j<sides;j++){
   const angle=(j+.5)*Math.PI*2/sides;
   // Open front orbital fossae. The black recess sits behind these rims.
   if(i>=3&&i<=4&&Math.cos(angle)>.30)continue;
   const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;
   indices.push(a,c,b,b,c,d);
  }
  for(let j=1;j<sides-1;j++)indices.push(0,j,j+1);
  const cranium=new THREE.BufferGeometry();cranium.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));cranium.setIndex(indices);cranium.computeVertexNormals();add(cranium,3);
  // The mouth is deep behind the teeth, rather than a black oval pasted on.
  ellipsoid([0,-.39,.03],[.27,.39,.15],4,12);
  for(const side of [-1,1]){
   ellipsoid([side*.245,.22,.17],[.185,.19,.075],4,12);
   // Brow flows into the temple; cheekbone returns below the socket.
   tendon([[side*.045,.30,.30],[side*.20,.39,.34],[side*.37,.42,.29],[side*.44,.24,.15]],[.07,.095,.085,.045],3,6);
   tendon([[side*.44,.24,.15],[side*.40,.05,.26],[side*.27,-.025,.36],[side*.13,.035,.36]],[.065,.09,.07,.04],3,6);
   // Small embers are buried inside the cavity with shadow above and below.
   plate(mirror([[.19,.205,.254],[.29,.235,.254],[.265,.192,.258],[.21,.18,.258]],side),.008,5);
   tendon([[side*.13,.035,.35],[side*.13,-.14,.38],[side*.065,-.205,.40]],[.065,.07,.025],3,6);
   // Zygomatic arch and rounded mandibular ramus; the right edge is chipped.
   if(side===1)tendon([[-.40,.065,.09],[-.43,-.21,.11],[-.36,-.61,.25],[-.22,-.77,.38],[0,-.81,.42],[.22,-.77,.38],[.36,-.61,.25],[.43,-.21,.11],[.40,.065,.09]],[.08,.085,.09,.09,.085,.09,.09,.085,.08],3,6);
   tendon([[side*.38,.49,-.22],[side*.48,.59,-.42],[side*.49,.40,-.61]],[.10,.07,.001],3,6);
   // Uneven small incisors and heavier outer canines, not a row of cones.
   for(let i=0;i<3;i++){
    const x=side*(.06+i*.085),y=-.16-i*.025,length=i===2?.24:.12+i*.025;
    tendon([[x,y,.39],[x*.94,y-length*.65,.43],[x*.91,y-length,.42]],[i===2?.045:.032,.023,.006],3,5);
    tendon([[x,-.745,.41],[x*.92,-.62+(i===2?.035:0),.43]],[.034,.008],3,5);
   }
  }
  // Ember channels embedded into the inner orbital rims and mandibular bone.
  for(const side of [-1,1]){
   tendon([[side*.35,.035,.277],[side*.39,-.20,.155],[side*.33,-.56,.285]],[.012,.016,.004],5,4);
   tendon([[side*.13,.53,.207],[side*.23,.61,.194],[side*.34,.55,.167]],[.006,.011,.002],5,4);
  }
  // A recessed nasal aperture and narrow connected bridge complete the skull.
  tendon([[0,.42,.27],[0,.16,.35],[0,-.025,.39]],[.065,.055,.024],3,6);
  plate([[-.052,.045,.40],[0,.095,.405],[.052,.045,.40],[.035,-.09,.42],[-.035,-.09,.42]],.025,4);
  tendon([[0,-.46,-.16],[.035,-.75,-.26],[-.035,-.96,-.44]],[.10,.06,.001],1,6,.25);
 }else if(tier===2){
  // A long iron death mask. A single buried slit replaces expressive eyes;
  // the lower mask breaks open into an irregular, interlocking iron maw.
  ellipsoid([0,.12,-.22],[.55,.66,.40],7,12);
  plate([[-.44,.57,.17],[-.20,.77,.10],[.27,.71,.10],[.49,.42,.18],[.38,.04,.39],[.19,-.17,.47],[-.23,-.11,.47],[-.42,.10,.35]],.24,7);
  // Broad overhanging brow is a solid forged ledge, without cartoon eyebrows.
  plate([[-.55,.30,.34],[-.35,.46,.30],[.36,.43,.30],[.56,.28,.34],[.43,.14,.53],[.02,.16,.59],[-.43,.13,.53]],.15,7);
  plate([[-.43,.125,.55],[.43,.135,.55],[.35,.035,.59],[-.34,.025,.59]],.035,4);
  // Three tiny breaks in the slit keep the light deep in the helmet.
  for(const [x,w]of [[-.24,.115],[0,.06],[.22,.13]])
   plate([[x-w,.092,.602],[x+w,.097,.602],[x+w*.85,.065,.606],[x-w*.9,.061,.606]],.008,5);
  plate([[-.055,.18,.63],[.065,.18,.63],[.115,-.33,.66],[0,-.51,.73],[-.10,-.29,.66]],.13,7);
  // The dark maw sits behind cheek blades and jagged teeth, with no face vents.
  plate([[-.34,-.15,.49],[.32,-.17,.49],[.29,-.57,.50],[.08,-.81,.47],[-.14,-.78,.47],[-.35,-.48,.50]],.07,4);
  for(const side of [-1,1]){
   plate(mirror([[.25,.035,.49],[.49,.13,.36],[.52,-.31,.31],[.29,-.71,.52],[.18,-.42,.64]],side),.15,7);
   // Rearward antler blades rather than a friendly symmetrical U-shaped crown.
   const broken=side<0;
   tendon([[side*.38,.49,-.16],[side*.64,.82,-.37],[side*.76,broken?1.03:1.22,-.67],[side*(broken?.72:.68),broken?1.07:1.42,-.92]],[.18,.14,.085,broken?.055:.001],3,6);
   tendon([[side*.45,-.14,-.04],[side*.78,-.31,.01],[side*1.02,-.53,.24],[side*.85,-.73,.48]],[.17,.13,.075,.001],7,5);
   for(let i=0;i<3;i++){
    const x=side*(.13+i*.075),y=-.24-i*.035;
    tendon([[x,y,.59],[x*.87,y-.20-(i===1?.06:0),.65]],[.047,.002],7,4);
    tendon([[x,-.73+i*.035,.54],[x*.93,-.56+i*.032,.61]],[.04,.002],3,4);
   }
   tendon([[side*.28,-.63,.31],[side*.19,-.89,.40],[side*.06,-1.01,.47]],[.09,.06,.001],7,5);
  }
  // Flush cyan inlays follow forged plate edges and horn roots.
  for(const side of [-1,1]){
   tendon([[side*.15,.67,.252],[side*.34,.54,.285],[side*.43,.32,.403]],[.009,.012,.004],5,4);
   tendon([[side*.49,-.19,.354],[side*.37,-.49,.521],[side*.25,-.65,.548]],[.009,.012,.003],5,4);
  }
  tendon([[0,.75,.20],[0,.46,.37],[0,.30,.51]],[.055,.045,.015],7,5);
  tendon([[0,.60,-.28],[0,.99,-.58],[0,1.11,-.98]],[.14,.08,.001],7,5);
 }else{
  // Eyeless reliquary: two exposed facial halves around a vertical wound.
  ellipsoid([0,.33,-.16],[.40,.67,.29],6);
  ellipsoid([0,.02,.15],[.15,.62,.19],4);
  for(const side of [-1,1]){
   plate(mirror([[.065,.91,.13],[.37,.77,.12],[.48,.34,.16],[.32,-.13,.32],[.15,-.48,.35],[.19,.12,.39],[.09,.43,.35]],side),.18,3);
   tendon([[side*.30,.72,-.15],[side*.62,.98,-.35],[side*.86,1.22,-.60]],[.13,.08,.001],3);
   // Broad torn tissue gives a downward, triangular silhouette, no humanoid arms.
   const folds=[[.16,.30,.45,-.14],[-.10,.24,.72,-.22],[-.44,.20,.91,-.31],[-.77,.16,.68,-.32],[-1.06,.12,.72,-.36],[-1.45,.22,.28,-.29]];
   const cloth:number[]=[],stitches:number[]=[];
   for(const [y,inner,outer,z] of folds)for(let j=0;j<4;j++){
    const u=j/3;cloth.push(side*(inner+(outer-inner)*u),y,z+Math.sin(u*Math.PI*2.5)*.10);
   }
   for(let i=0;i<folds.length-1;i++)for(let j=0;j<3;j++){
    const a=i*4+j,b=a+1,c=a+4,d=c+1;
    stitches.push(...(side>0?[a,c,b,b,c,d]:[a,b,c,b,d,c]));
   }
   const veil=new THREE.BufferGeometry();veil.setAttribute('position',new THREE.Float32BufferAttribute(cloth,3));veil.setIndex(stitches);veil.computeVertexNormals();add(veil,1,[0,0,0],[1,1,1],.8);
   // The reverse is a separate surface, so folded tissue remains visible when
   // the wraith turns without making the entire swarm material double-sided.
   const reverse=new THREE.BufferGeometry();reverse.setAttribute('position',new THREE.Float32BufferAttribute(cloth.map((v,i)=>i%3===2?v-.012:v),3));
   reverse.setIndex(stitches.flatMap((_,i)=>i%3===0?[stitches[i],stitches[i+2],stitches[i+1]]:[]));reverse.computeVertexNormals();add(reverse,1,[0,0,0],[1,1,1],.8);
   for(let i=0;i<4;i++){
    const y=.08-i*.23;
    tendon([[side*.16,y,.12],[side*(.48-i*.055),y-.14,.18],[side*(.44-i*.06),y-.34,.29],[side*.16,y-.43,.32]],[.055,.06,.041,.001],3,4,.35);
   }
   for(let i=0;i<4;i++)tendon([[side*(.10+i*.012),.46-i*.19,.37],[side*.015,.37-i*.19,.42]],[.034,.001],3,4);
  }
  // Subdermal capillaries and lit rib roots belong to the folded anatomy.
  for(const side of [-1,1]){
   tendon([[side*.15,.73,.272],[side*.29,.51,.204],[side*.32,.27,.211]],[.008,.011,.002],5,4);
   for(let i=0;i<3;i++){
    const y=-.08-i*.23;
    tendon([[side*.17,y,.145],[side*(.40-i*.055),y-.13,.203]],[.013,.002],5,4,.3);
   }
  }
  // A thin red cleft, never a pair of glowing cartoon eyes.
  tendon([[0,.69,.32],[.025,.27,.39],[-.025,-.05,.36],[0,-.44,.29]],[.025,.035,.027,.001],5,4);
  tendon([[0,-.37,-.10],[.06,-.98,-.18],[-.07,-1.64,-.36]],[.12,.07,.001],6,5,.7);
 }
 const geometry=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const mesh=new THREE.Mesh(geometry,material);mesh.name=['','skull-shrieker','skull-executioner','skull-reliquary'][tier];
 // Tier III must exceed the broad executioner silhouette at equal distance.
 if(tier===3)mesh.scale.setScalar(1.4);
 return mesh;
}
