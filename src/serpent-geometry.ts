import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {prepareEnemySurfaceGeometry,type EnemySurfaceRole} from './enemy-surface-material';
import type {EnemyKind} from './enemy-kinds';

type V=[number,number,number];
type Finish=EnemySurfaceRole;
type Surface=(role:Finish)=>THREE.Material;
/** Sculpted anatomy is authored along +Z, the same axis as the convoy path.
 * Static details are welded by finish before the existing segment instancer sees
 * them: a row of vertebrae costs five draws, regardless of its length. */
class Sculpt {
 private parts=new Map<Finish,THREE.BufferGeometry[]>();
 add(role:Finish,g:THREE.BufferGeometry){for(const name of Object.keys(g.attributes))if(name!=='position'&&name!=='normal')g.deleteAttribute(name);const list=this.parts.get(role)??[];list.push(g.index?g.toNonIndexed():g);if(g.index)g.dispose();this.parts.set(role,list);}
 ellipsoid(role:Finish,p:V,s:V){this.add(role,new THREE.SphereGeometry(1,16,10).scale(...s).translate(...p));}
 sweep(role:Finish,points:V[],radii:number[],flatten=1,sides=8){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),steps=(points.length-1)*5,frames=curve.computeFrenetFrames(steps,false),vertices:number[]=[],indices:number[]=[];
  for(let i=0;i<=steps;i++){
   const t=i/steps*(radii.length-1),k=Math.min(radii.length-2,Math.floor(t)),r=THREE.MathUtils.lerp(radii[k],radii[k+1],t-k),p=curve.getPointAt(i/steps);
   for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2,v=p.clone().addScaledVector(frames.normals[i],Math.cos(a)*r).addScaledVector(frames.binormals[i],Math.sin(a)*r*flatten);vertices.push(v.x,v.y,v.z);}
  }
  for(let i=0;i<steps;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,a+1,b,b,a+1,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();this.add(role,g);
 }
 /** A thick curved scute with rolled lips, central keel and an undercut edge. */
 scute(role:Finish,start:number,end:number,radius:number,z:number,length:number){
  if(start>end)[start,end]=[end,start];
  const rows=8,cols=16,vertices:number[]=[],indices:number[]=[];
  for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
   const u=i/rows,v=j/cols,a=THREE.MathUtils.lerp(start,end,v),ridge=Math.pow(Math.sin(v*Math.PI),5)*.12;
   const r=radius+Math.sin(u*Math.PI)*.13+ridge-Math.pow(Math.abs(u-.5)*2,8)*.07;
   vertices.push(Math.sin(a)*r,Math.cos(a)*r*.89,z+(u-.5)*length-.14*Math.sin(v*Math.PI));
  }
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();this.add(role,g);
  // The reversed inner layer closes the silhouette at grazing angles.
  const inner=g.clone().scale(.94,.94,1);const idx=inner.index!;for(let i=0;i<idx.count;i+=3){const b=idx.getX(i+1);idx.setX(i+1,idx.getX(i+2));idx.setX(i+2,b);}inner.computeVertexNormals();this.add(role,inner);
  for(const u of [-.5,.5]){
   const points:V[]=[];for(let j=0;j<=8;j++){const v=j/8,a=THREE.MathUtils.lerp(start,end,v),r=radius+Math.pow(Math.sin(v*Math.PI),5)*.12-.07;points.push([Math.sin(a)*r,Math.cos(a)*r*.89,z+u*length-.14*Math.sin(v*Math.PI)]);}
   this.sweep('metal',points,points.map(()=>.034),1,5);
  }
 }
 finish(parent:THREE.Group,surface:Surface,prefix:string){
  for(const [role,parts] of this.parts){for(const g of parts)prepareEnemySurfaceGeometry(g,role);const merged=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,surface(role));mesh.name=`${prefix}-${role}`;parent.add(mesh);}
 }
}

export function buildSerpentHead(parent:THREE.Group,kind:EnemyKind,surface:Surface){
 const size=kind==='gigapede'?1.5:kind==='ghostpede'?2:1,ghost=kind==='ghostpede',gilded=kind==='gigapede';
 const head=new THREE.Group();head.name='serpent-skull';head.scale.setScalar(size);parent.add(head);const s=new Sculpt();
 // Long muzzle and heavy orbital ridges give the head a readable forward gaze.
 s.ellipsoid('shell',[0,.18,-.08],[.96,.53,1.12]);
 s.ellipsoid('shell',[0,-.04,.89],[.52,.25,1.0]);
 s.ellipsoid('shell',[0,.40,.48],[.40,.18,.90]);
 s.ellipsoid('body',[0,-.30,.87],[.48,.12,.84]);
 s.scute('shell',-.98,.98,.86,-.55,1.05);
 for(const side of [-1,1]){
  // Deep sockets, blade-shaped luminous eyes and a protective overhanging brow.
  s.ellipsoid('body',[side*.73,.23,.64],[.14,.13,.35]);
  s.ellipsoid('rift',[side*.84,.24,.70],[.045,.065,.23]);
  s.sweep('shell',[[side*.27,.61,1.12],[side*.69,.65,.87],[side*1.03,.46,.31],[side*.97,.29,-.38]],[.12,.15,.15,.07],.65);
  s.sweep('metal',[[side*.27,.72,1.12],[side*.72,.78,.72],[side*1.03,.53,.05]],[.025,.047,.01],1,6);
  // Horns sweep backward, with a separate ivory cutting edge.
  s.sweep('shell',[[side*.76,.51,-.30],[side*1.12,.92,-.63],[side*1.40,1.12,-1.35],[side*(ghost?1.24:1.60),ghost?1.85:1.40,-2.02]],[.29,.23,.13,.003],.78,10);
  s.sweep('bone',[[side*1.25,1.03,-1.04],[side*1.44,1.22,-1.60],[side*(ghost?1.24:1.60),ghost?1.85:1.40,-2.02]],[.10,.065,.002],.75);
  s.sweep('shell',[[side*.88,-.10,.14],[side*1.28,-.13,-.20],[side*1.65,-.27,-1.12]],[.24,.20,.002],.44);
  s.ellipsoid('body',[side*.22,.15,1.65],[.065,.025,.10]);
  // Four hooked fangs and smaller interdental teeth sit inside the dark mouth.
  for(let i=0;i<4;i++){const x=side*(.48-i*.085),z=.55+i*.31;s.sweep('bone',[[x,-.18,z],[x*1.08,-.40-i*.025,z+.05],[x*.88,-.51-i*.025,z-.06]],[i===0?.13:.075,.055,.001],1,6);}
  // Small cheek gills add a second scale of detail to the broad skull masses.
  for(let i=0;i<3;i++)s.sweep('metal',[[side*.94,.13,-.25-i*.18],[side*1.05,-.05,-.19-i*.18],[side*.88,-.30,-.1-i*.18]],[.03,.045,.015],.7,6);
 }
 s.sweep('metal',[[0,.66,1.35],[0,.80,.67],[0,.91,-.25],[0,1.12,-.91]],[.025,.065,.10,.002],.6);
 s.finish(head,surface,'serpent-cranium');
 const jaw=new THREE.Group();jaw.name='serpent-mandible';jaw.position.set(0,-.34,-.13);jaw.userData.serpentMotion='jaw';head.add(jaw);const lower=new Sculpt();
 lower.ellipsoid('shell',[0,-.20,.93],[.49,.13,.83]);
 for(const side of [-1,1])lower.sweep('bone',[[side*.48,-.17,1.38],[side*.61,-.02,1.67],[side*.51,.26,1.61]],[.11,.07,.001],.8);
 lower.sweep('metal',[[0,-.31,1.63],[0,-.38,.84],[0,-.25,.20]],[.015,.06,.025],.65);lower.finish(jaw,surface,'serpent-jaw');
 if(gilded){const crest=new Sculpt();for(const side of [-1,1])crest.sweep('metal',[[side*.31,.72,-.1],[side*.48,1.12,-.44],[side*.40,1.55,-1.08]],[.12,.11,.002],.45);crest.finish(head,surface,'serpent-crown');}
}

export function buildSerpentArmor(parent:THREE.Group,kind:EnemyKind,surface:Surface){
 const armor=new THREE.Group();armor.name='serpent-carapace';armor.userData.serpentMotion='vertebra';parent.add(armor);const s=new Sculpt(),ghost=kind==='ghostpede',gilded=kind==='gigapede';
 // Separated overlapping dorsal, lateral and ventral scutes protect a hollow
 // vertebra. The crystal is exposed through the anterior window and side gaps.
 s.scute('shell',-.84,.84,1.10,-.06,.97);
 for(const side of [-1,1]){
  s.scute('shell',side*.94,side*2.12,1.09,.06,.78);
  s.sweep('shell',[[side*.90,.20,-.36],[side*1.34,.09,-.38],[side*1.80,-.20,-.72]],[.20,.18,.002],.35);
  s.sweep('bone',[[side*1.32,.09,-.39],[side*1.57,-.03,-.54],[side*1.80,-.20,-.72]],[.065,.05,.001],.4,6);
  // Swept rib struts support the open gem cage; dark flexible joints recede.
  s.sweep('body',[[side*.70,.60,-.33],[side*.91,-.20,-.27],[side*.51,-.78,-.20],[0,-.86,-.24]],[.11,.13,.12,.08],1,6);
  s.sweep('metal',[[side*.86,.44,.44],[side*1.03,-.11,.39],[side*.72,-.69,.27]],[.045,.055,.025],1,6);
  if(gilded)s.sweep('metal',[[side*.71,.65,-.38],[side*.94,.48,-.12],[side*.96,.11,.35]],[.025,.034,.012],1,5);
 }
 s.scute('shell',2.40,3.88,.94,-.10,.70);
 s.sweep('shell',[[0,.99,.12],[0,1.30,-.23],[0,ghost?1.92:1.54,-.80]],[.20,.17,.001],.45);
 s.sweep(ghost?'metal':'bone',[[0,1.29,-.24],[0,ghost?1.65:1.45,-.58],[0,ghost?1.92:1.54,-.80]],[.07,.05,.001],.5,6);
 s.finish(armor,surface,'serpent-vertebra');return armor;
}
