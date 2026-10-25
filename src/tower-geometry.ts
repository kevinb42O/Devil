import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {towerOutletHeight,towerRadius,towerOutlets,SQUID_I_GEM,SQUID_II_GEMS,SQUID_III_GEMS} from './enemy-presentation';
import type {TowerOrganicMotion} from './tower-anatomy-motion';
import type {EnemyKind} from './enemy-kinds';

type Point=[number,number,number];
/** Original creature anatomy, also used verbatim for the projectile armor. */
export function buildTowerStructure(rig:THREE.Group,kind:EnemyKind,material:(finish:'stone'|'metal'|'interior'|'glow')=>THREE.Material){
 const tier=Number(kind.slice(5))||1,h=towerOutletHeight(kind),r=towerRadius(kind);
 // Keep the material IDs for existing lighting/diagnostic integrations.
 const flesh=material('stone'),bone=material('metal'),cavity=material('interior');
 const mesh=(parent:THREE.Object3D,g:THREE.BufferGeometry,m:THREE.Material,name:string)=>{
  // Light belongs to particular tissues. Bake anatomical masks before merging
  // so membranes, wet cavities and sucker lips keep their own thickness field.
  const positions=g.getAttribute('position'),uv=g.getAttribute('uv'),organ=new Float32Array(positions.count*3);
  const visceral=/viscera|abdomen|mantle|shoulder|cranium/.test(name),tentacle=/tentacle/.test(name),sucker=/sucker/.test(name),mouth=/maw|socket|exhaust/.test(name),siphon=/siphon/.test(name);
  for(let i=0;i<positions.count;i++){
   const u=uv?.getX(i)??0,v=uv?.getY(i)??0;
   let emission=0,spill=0;
   if(m===flesh){
    if(/lumen/.test(name)){emission=.82;spill=.38;}else if(visceral){
     const chamber=Math.pow(Math.max(0,Math.sin(v*Math.PI)),.7),lobe=.5+.5*Math.cos(u*Math.PI*2*(tier===3?6:4)+Math.sin(v*8.)*.45);
     emission=chamber*(.045+.42*Math.pow(lobe,5.));spill=chamber*.42;
    }else if(tentacle){const channel=Math.pow(Math.max(0,Math.cos((u-.24)*Math.PI*2)),12.);emission=.035+channel*.56;spill=.14;}
    else if(sucker){emission=.48;spill=.26;}
    else if(siphon){emission=.08+.65*Math.pow(v,3.);spill=.48;}
   }else if(m===cavity&&mouth){emission=name==='tower-exhaust'?.72:.42;spill=.35;}
   else if(m===bone&&/cheekbone|teeth|mandible|tusk|rib/.test(name)){spill=.22;}
   organ[i*3]=emission;organ[i*3+1]=spill;organ[i*3+2]=positions.getY(i)*.65+u*3.;
  }
  if(!g.hasAttribute('towerOrgan'))g.setAttribute('towerOrgan',new THREE.BufferAttribute(organ,3));
  const part=new THREE.Mesh(g,m);part.name=name;parent.add(part);return part;
 };
 const ellipsoid=(parent:THREE.Object3D,p:Point,size:Point,m:THREE.Material,name:string)=>{
  const g=new THREE.SphereGeometry(1,16,12);g.scale(...size);g.translate(...p);return mesh(parent,g,m,name);
 };
 // Tapered curved tissue and keratin, with continuous normals along the bend.
 const tendon=(parent:THREE.Object3D,source:Point[],widths:number[],m:THREE.Material,name:string,sides=8)=>{
  const curve=new THREE.CatmullRomCurve3(source.map(p=>new THREE.Vector3(...p))),steps=(source.length-1)*5,points=curve.getPoints(steps),frames=curve.computeFrenetFrames(steps,false);
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=0;i<=steps;i++){
   const f=i/steps*(widths.length-1),j=Math.min(widths.length-2,Math.floor(f)),radius=THREE.MathUtils.lerp(widths[j],widths[j+1],f-j);
   for(let side=0;side<=sides;side++){
    const a=side/sides*Math.PI*2,flute=1+.045*Math.cos(a*4+i*.22),p=points[i].clone().addScaledVector(frames.normals[i],Math.cos(a)*radius*flute).addScaledVector(frames.binormals[i],Math.sin(a)*radius*flute);
    positions.push(p.x,p.y,p.z);uv.push(side/sides,i/steps);
    if(i&&side<sides){const a=(i-1)*(sides+1)+side,b=a+1,c=i*(sides+1)+side,d=c+1;indices.push(a,b,c,b,d,c);}
   }
  }
  for(let side=1;side<sides-1;side++)indices.push(0,side+1,side,steps*(sides+1),steps*(sides+1)+side,steps*(sides+1)+side+1);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return mesh(parent,g,m,name);
 };
 const profile=(parent:THREE.Object3D,levels:number[][],m:THREE.Material,name:string,lobes=5,offset:Point=[0,0,0])=>{
  const positions:number[]=[],indices:number[]=[],uv:number[]=[],sides=32;
  for(let i=0;i<levels.length;i++)for(let j=0;j<=sides;j++){
   const [y,radius,stretch=1]=levels[i],a=j/sides*Math.PI*2,fold=1+.075*Math.cos(a*lobes+.3)+.025*Math.sin(a*3+y);
   positions.push(Math.sin(a)*radius*fold+offset[0],y+offset[1],Math.cos(a)*radius*stretch*fold+offset[2]);uv.push(j/sides,i/(levels.length-1));
   if(i&&j<sides){const a=(i-1)*(sides+1)+j,b=a+1,c=i*(sides+1)+j,d=c+1;indices.push(a,b,c,b,d,c);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return mesh(parent,g,m,name);
 };
 const animated=(parent:THREE.Object3D,p:Point,motion:TowerOrganicMotion,angle=0)=>{
  // A fixed orientation parent lets the shared local articulation stay simple.
  const frame=new THREE.Group();frame.position.set(...p);frame.rotation.y=angle;parent.add(frame);
  const group=new THREE.Group();group.name=`creature-${motion.kind}-${motion.index}`;group.userData.towerOrganicMotion=motion;frame.add(group);return group;
 };
 const crown=new THREE.Group();crown.name='warden-crest';crown.position.y=h+.12;rig.add(crown);
 const breast=animated(rig,[0,h*.52,0],{kind:'breath',index:0});
 if(tier===1){
  // A lean flayed lantern: pinched belly, wide skull, four exposed tendon legs.
  profile(breast,[[-h*.37,.12],[-h*.30,.47],[-h*.09,.75],[h*.13,.91],[h*.27,.65],[h*.35,.45]],flesh,'lantern-viscera',5);
  for(const side of [-1,1]){
   tendon(rig,[[side*.45,1,0],[side*.86,h*.45,.25],[side*.98,h*.72,.1],[side*.62,h-.4,-.25]],[.19,.24,.3,.16],bone,'lantern-cheek-root');
   tendon(crown,[[side*.7,-.4,.2],[side*1.3,.35,.05],[side*1.18,1.16,-.23],[side*.75,1.45,-.5]],[.28,.22,.12,.008],bone,'lantern-horn');
  }
 }else if(tier===2){
  // A long lean brood sac, opposing faces and a forked occipital crest.
  profile(breast,[[-h*.37,.14],[-h*.27,.58],[-h*.03,1.18,.83],[h*.12,1.42,.8],[h*.29,1.16,.86],[h*.36,.64]],flesh,'brood-abdomen',6);
  for(const side of [-1,1]){
   tendon(crown,[[0,-.55,side*.85],[side*.55,.25,side*1.5],[side*.62,1.9,side*1.4],[side*.30,2.5,side*.65]],[.40,.30,.14,.006],bone,'brood-crest');
   ellipsoid(rig,[0,h*.7,side*1.05],[.94,1.4,.8],flesh,'brood-shoulder');
  }
 }else{
  // A tall three-headed predator: pinched waist and long radial neck tendons.
  profile(breast,[[-h*.37,.15],[-h*.34,.56],[-h*.13,1.10],[h*.07,1.64],[h*.21,1.84],[h*.31,1.30],[h*.36,.68]],flesh,'sovereign-mantle',9);
  for(let i=0;i<3;i++){
   const a=i*Math.PI*2/3,x=Math.sin(a),z=Math.cos(a);
   tendon(rig,[[x*.42,1.2,z*.42],[x*1.10,h*.42,z*1.10],[x*1.72,h*.72,z*1.72],[x*2.3,h-.9,z*2.3]],[.25,.34,.44,.52],bone,'matriarch-neck');
   tendon(crown,[[x*1.48,-.55,z*1.48],[x*2.16,.4,z*2.16],[x*1.96,1.9,z*1.96],[x*1.44,2.85,z*1.44]],[.40,.3,.15,.006],bone,'matriarch-crown-horn');
  }
 }
 // Raised translucent seams follow the sacs' lobes, with darker dermis
 // between them. Their curved cross-section catches light in bright scenes
 // and exposes the contained organ light in darkness.
 const sacRadii=tier===1?[.52,.77,.92,.73]:tier===2?[.63,1.10,1.44,1.18]:[.76,1.27,1.86,1.46];
 const seamCount=tier===1?4:tier===2?6:9;
 for(let i=0;i<seamCount;i++){
  const a=(i+.35)*Math.PI*2/seamCount;
  const points=sacRadii.map((radius,j):Point=>{const bend=a+Math.sin(j*1.4+i)*.055;return [Math.sin(bend)*(radius+.035),h*[-.28,-.09,.10,.24][j],Math.cos(bend)*(radius+.035)*(tier===2?.83:1)];});
  tendon(breast,points,[r*.012,r*.023,r*.022,.006],flesh,'lumen-membrane-seam',7);
 }
 // Exposed ribs sweep around the viscera, leaving torn tissue between them.
 if(tier>1)for(const side of [-1,1])for(let i=0;i<(tier===2?4:6);i++){
  const y=h*(.48+i*.045),width=r*(.36+i*.035);
  tendon(rig,[[side*.25,y+.18,-r*.35],[side*width*.9,y+.1,-r*.18],[side*width,y-.12,r*.12],[side*width*.62,y-.32,r*.36]],[r*.055,r*.065,r*.055,.008],bone,'exposed-visceral-rib',7);
 }
 // Hanging muscular tentacles, each articulated around its anatomical origin.
 const tentacles=tier===1?4:tier===2?6:9;
 for(let i=0;i<tentacles;i++){
  const a=(i+.3)*Math.PI*2/tentacles,x=Math.sin(a),z=Math.cos(a),hip=r*(tier===1?.43:.49),length=h*(tier===1?.48:.47);
  const sweep=(i%2?1:-1)*r*.2;
  const centerline=new THREE.CatmullRomCurve3([[0,0,0],[sweep*.25,-length*.3,r*.16],[sweep,-length*.7,r*.28],[sweep*.75,-length*.98,r*.08],[sweep*.3,-length*1.02,-r*.07]].map(p=>new THREE.Vector3(...p as Point)));
  let parent:THREE.Object3D=rig,previous=new THREE.Vector3();
  for(let segment=0;segment<5;segment++){
   const t=segment/5,start=centerline.getPoint(t);
   const position:Point=segment===0?[x*hip,h*.60,z*hip]:start.clone().sub(previous).toArray() as Point;
   const joint=animated(parent,position,{kind:'tendril',index:i,segment},segment===0?a:0);
   const curvePoints=Array.from({length:4},(_,j)=>centerline.getPoint(t+j/15).sub(start).toArray() as Point);
   const width=(f:number)=>Math.max(.012,r*.15*Math.pow(1-f,1.12));
   tendon(joint,curvePoints,[width(t),width(t+1/15),width(t+2/15),width((segment+1)/5)],flesh,'articulated-tentacle',10);
   // Fleshy sucker lips follow the same local joint, giving the moving underside
   // a readable anatomical rhythm without independent draw calls.
   for(let sucker=0;sucker<2;sucker++){
    const u=t+(sucker+.4)/10,p=centerline.getPoint(u).sub(start),rr=width(u);
    ellipsoid(joint,[p.x,p.y,p.z+rr*.77],[rr*.62,rr*.45,rr*.40],flesh,'tentacle-sucker');
   }
   parent=joint;previous=start;
  }
 }
 // The upper openings are muscular siphons at the exact emission coordinates.
 for(const [i,{x,z,radius}] of towerOutlets(kind).entries()){
  profile(rig,[[-1.3,radius*.6],[-.85,radius],[-.28,radius*.9],[-.04,radius*.76]],flesh,'spawning-siphon',7,[x,h,z]);
  const disk=new THREE.CylinderGeometry(radius*.74,radius*.74,.08,16);const exhaust=mesh(rig,disk,cavity,'tower-exhaust');exhaust.position.set(x,h-.06,z);
  // Teeth encircle the opening, while leaving the center clear for the stream.
  for(let tooth=0;tooth<7;tooth++){
   const a=(tooth+.25)*Math.PI*2/7,rr=radius*.8;
   tendon(rig,[[x+Math.sin(a)*rr,h-.27,z+Math.cos(a)*rr],[x+Math.sin(a)*rr*.96,h+.13,z+Math.cos(a)*rr*.96],[x+Math.sin(a)*rr*.73,h+.24,z+Math.cos(a)*rr*.73]],[radius*.105,radius*.06,.006],bone,`siphon-fang-${i}`);
  }
 }
 const gems=tier===1?[SQUID_I_GEM]:tier===2?SQUID_II_GEMS:SQUID_III_GEMS;
 for(const [index,gem] of gems.entries()){
  const a=Math.atan2(gem.x,gem.z),distance=Math.hypot(gem.x,gem.z),headWidth=tier===1?.84:tier===2?.95:1.05,front=distance*.37;
  const frame=new THREE.Group();frame.position.set(gem.x*.58,h-1.0,gem.z*.58);frame.rotation.y=a;rig.add(frame);
  // A heavy skull grown around the gem: brow, empty mouth, cheek arches.
  ellipsoid(frame,[0,.02,-.15],[headWidth,1.2,tier===1?.69:1.0],flesh,'spawner-cranium');
  ellipsoid(frame,[0,-.35,front*.82],[headWidth*.67,.85,.2],cavity,'spawner-open-maw');
  for(const side of [-1,1]){
   tendon(frame,[[side*.1,.88,front*.58],[side*headWidth*.78,.72,front*.87],[side*headWidth,.1,front*.72],[side*headWidth*.68,-.7,front*.94]],[headWidth*.23,headWidth*.31,headWidth*.22,.05],bone,'spawner-cheekbone');
   tendon(frame,[[side*headWidth*.63,.5,-.15],[side*headWidth*1.12,.85,-.65],[side*headWidth*1.05,1.43,-1.05]],[headWidth*.3,headWidth*.19,.008],bone,'spawner-temple-horn');
   for(let tooth=0;tooth<4;tooth++){
    const x=side*(.18+tooth*.16)*headWidth;
    tendon(frame,[[x,.16-tooth*.045,front],[x*.93,-.13-tooth*.075,front+.04],[x*.85,-.21-tooth*.07-(tooth%2)*.1,front-.04]],[headWidth*.075,headWidth*.05,.005],bone,'upper-maw-teeth',6);
   }
  }
  // Lower mandible opens independently; crystal target stays on the skull.
  const jaw=animated(frame,[0,-.62,front*.40],{kind:'jaw',index});
  for(const side of [-1,1]){
   tendon(jaw,[[side*headWidth*.8,.18,0],[side*headWidth*.72,-.34,front*.5],[side*.18,-.48,front*.6],[0,-.42,front*.63]],[headWidth*.2,headWidth*.21,headWidth*.16,.09],bone,'spawner-mandible');
   tendon(jaw,[[side*headWidth*.6,-.22,front*.55],[side*headWidth*.59,.18,front*.65],[side*headWidth*.42,.5,front*.57]],[headWidth*.15,headWidth*.095,.006],bone,'spawner-tusk');
  }
  // Organic collar behind the fixed crystal, with an exposed front hemisphere.
  ellipsoid(frame,[0,.61,front-.34],[headWidth*.49,.5,.28],cavity,'crystal-eye-socket');
 }
 // One draw per tissue in each independently articulated part.
 rig.traverse(parent=>{
  for(const finish of new Set([flesh,bone,cavity])){
   const parts=parent.children.filter((node):node is THREE.Mesh=>node instanceof THREE.Mesh&&node.material===finish&&!['tower-exhaust','tower-plinth'].includes(node.name));
   if(parts.length<2)continue;
   const geometries=parts.map(part=>{part.updateMatrix();const g=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();g.applyMatrix4(part.matrix);return g;});
   const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
   if(merged){for(const part of parts){parent.remove(part);part.geometry.dispose();}mesh(parent,merged,finish,`creature-tissue-${[flesh,bone,cavity].indexOf(finish)}`);}
  }
 });
}
