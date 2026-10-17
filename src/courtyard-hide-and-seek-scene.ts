import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCourtyardSign} from './courtyard-sign';
import {HIDE_WALLS,HIDE_PARTITIONS,HIDE_COVER,HIDE_PROPS,HIDE_ISLANDS,HIDE_ZONES,HIDE_GATEPOSTS,hideLocal,type HideBlock} from './courtyard-hide-and-seek';

/** An enclosed lantern-lit repository. All cover is built from the physics layout. */
export class CourtyardHideAndSeekScene{
 readonly root=new THREE.Group();
 loaded=false;
 private motes:THREE.Points;
 private moteOrigins:Float32Array;
 private batches=new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[];matrices:THREE.Matrix4[]}>();
 private templates=new Map<string,THREE.Group>();
 private stone:THREE.MeshStandardMaterial;
 private trim=new THREE.MeshStandardMaterial({color:0x6c665c,roughness:.84});
 private brass=new THREE.MeshStandardMaterial({color:0x9e7e4d,metalness:.55,roughness:.55});
 private unit=new THREE.BoxGeometry(1,1,1);
 constructor(){
  this.root.name='forgotten-repository';
  this.stone=new THREE.MeshStandardMaterial({map:this.stoneTexture(),color:0xc2c4bc,emissive:0x586575,emissiveIntensity:.24,roughness:1});
  const positions=new Float32Array(108*3);
  for(let i=0;i<108;i++){positions[i*3]=-80+this.random(i*3)*60;positions[i*3+1]=.5+this.random(i*3+1)*5.5;positions[i*3+2]=-24+this.random(i*3+2)*52;}
  this.moteOrigins=positions.slice();
  this.motes=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)),new THREE.PointsMaterial({color:0xd8c59b,size:.035,transparent:true,opacity:.48,depthWrite:false,sizeAttenuation:true}));
  this.motes.name='repository-dust';this.root.add(this.motes);
 }
 private random(i:number){const v=Math.sin(i*127.1+91.7)*43758.5453;return v-Math.floor(v);}
 private stoneTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#252a2b';ctx.fillRect(0,0,256,256);
  for(let row=0;row<8;row++)for(let col=-1;col<4;col++){
   const x=col*86+(row%2)*43,y=row*32,v=95+Math.floor(this.random(row*8+col)*26);
   ctx.fillStyle=`rgb(${v},${v+2},${v+3})`;ctx.fillRect(x+1,y+1,83,29);
   ctx.fillStyle='rgba(204,199,178,.12)';ctx.fillRect(x+2,y+2,81,1);
  }
  for(let i=0;i<4200;i++){const v=this.random(i+992);ctx.fillStyle=v>.5?'rgba(208,208,191,.05)':'rgba(0,0,0,.12)';ctx.fillRect(this.random(i+21)*256,this.random(i+49)*256,1+v*2,1);}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2,2);map.anisotropy=4;return map;
 }
 private cubes(name:string,blocks:readonly HideBlock[],material:THREE.Material,y=0){
  const mesh=new THREE.InstancedMesh(this.unit,material,blocks.length),matrix=new THREE.Matrix4();mesh.name=name;
  blocks.forEach((b,i)=>{matrix.makeScale(b.w,b.h,b.d);matrix.setPosition(b.x,y+b.h/2,b.z);mesh.setMatrixAt(i,matrix);});
  mesh.computeBoundingSphere();this.root.add(mesh);return mesh;
 }
 private sign(title:string,subtitle:string,x:number,y:number,z:number,width:number,rotation=0,color='#dec79c'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#121b20';ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#766b51';ctx.lineWidth=2;ctx.strokeRect(12,12,1000,232);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.font='500 64px "Barlow Condensed",sans-serif';ctx.fillText(title,512,95,948);
  ctx.fillStyle='#abaea6';ctx.font='26px "DM Sans",sans-serif';ctx.fillText(subtitle,512,181,940);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const sign=createCourtyardSign('repository-sign',width,width/4,map);sign.position.set(x,y,z);sign.rotation.y=rotation;this.root.add(sign);
 }
 private instance(name:string,x:number,y:number,z:number,w:number,h:number,d:number,rotation=0){
  const template=this.templates.get(name)!;
  const fit=new THREE.Group(),clone=template.clone(true);clone.rotation.y=rotation;fit.add(clone);fit.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(fit),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  clone.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));fit.scale.set(w/size.x,h/size.y,d/size.z);fit.position.set(x,y,z);fit.updateMatrixWorld(true);
  fit.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const materials=Array.isArray(o.material)?o.material:[o.material],key=o.geometry.uuid+':'+materials.map(m=>m.uuid).join(',');let batch=this.batches.get(key);if(!batch){batch={geometry:o.geometry,material:o.material,matrices:[]};this.batches.set(key,batch);}batch.matrices.push(o.matrixWorld.clone());});
 }
 async load(){
  const names=['crypt-a','crypt-b','crypt-small','crypt-small-roof','coffin','coffin-old','hay-bale','hay-bale-bundled','column-large','pillar-obelisk','pillar-square','stone-wall','stone-wall-column','altar-stone','rocks-tall','lantern-candle','urn-square','candle-multiple'];
  const manager=new THREE.LoadingManager(),failures:string[]=[];manager.onError=url=>failures.push(url);
  const loader=new GLTFLoader(manager);
  const models=await Promise.all(names.map(async name=>({name,scene:(await loader.loadAsync('/models/hide-and-seek/'+name+'.glb')).scene})));
  if(failures.length)throw new Error('Missing repository textures: '+failures.join(', '));
  for(const {name,scene}of models){
   scene.traverse(o=>{if(o instanceof THREE.Mesh){const tune=(material:THREE.Material)=>{const m=material as THREE.MeshStandardMaterial;m.roughness=.92;m.color.multiplyScalar(name==='lantern-candle'||name==='candle-multiple'?.9:.68);if(name==='lantern-candle'){m.map=null;m.color.setHex(0x8c6b43);m.metalness=.55;m.roughness=.5;}};if(Array.isArray(o.material))o.material.forEach(tune);else tune(o.material);}});
   this.templates.set(name,scene);
  }
  this.architecture();this.dress();
  for(const [key,batch]of this.batches){const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);mesh.name='repository-props-'+key;batch.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();this.root.add(mesh);}
  this.batches.clear();this.loaded=true;
 }
 private architecture(){
  this.cubes('repository-walls',[...HIDE_WALLS,...HIDE_PARTITIONS],this.stone);
  for(const zone of HIDE_ZONES){const material=this.stone.clone();material.color.setHex(zone.color);material.emissive.setHex(zone.color);material.emissiveIntensity=.09;const blocks=HIDE_ISLANDS.flatMap((island,i)=>island.zone===zone.id?HIDE_COVER.slice(i*3,i*3+3):[]);this.cubes('repository-cover-'+zone.id,blocks,material);}
  // Continuous roof, including the passage. No walkable upper level or open seams.
  this.cubes('repository-vault',[{x:-50,z:2,w:65.4,d:57.4,h:.45},{x:-12.15,z:2,w:12.4,d:8.7,h:.45}],new THREE.MeshStandardMaterial({color:0x252b30,roughness:1}),8);
  const floorMap=this.stoneTexture();floorMap.repeat.set(25,22);
  this.cubes('repository-floor',[{x:-50,z:2,w:64,d:56,h:.16},{x:-12.15,z:2,w:12.3,d:8,h:.16}],new THREE.MeshStandardMaterial({map:floorMap,color:0x85817b,roughness:.95}),-.16);
  const caps=[...HIDE_PARTITIONS,...HIDE_COVER].map(b=>({...b,w:b.w+.12,d:b.d+.12,h:.16}));
  this.cubes('repository-coping',caps,this.trim,4.8);
  this.cubes('repository-arch-posts',HIDE_GATEPOSTS,this.trim);
  const arch=new THREE.Shape();arch.absarc(0,0,3.05,0,Math.PI,false);arch.lineTo(-2.67,0);arch.absarc(0,0,2.67,Math.PI,0,true);arch.closePath();
  const archGeometry=new THREE.ExtrudeGeometry(arch,{depth:.65,bevelEnabled:false,curveSegments:24});archGeometry.translate(0,4.8,-.325);
  const arches=new THREE.InstancedMesh(archGeometry,this.trim,6);let archIndex=0;for(const z of [-8,12])for(const x of [-69,-51,-32])arches.setMatrixAt(archIndex++,new THREE.Matrix4().makeTranslation(x,0,z));arches.name='repository-stone-arches';this.root.add(arches);
  const beams:HideBlock[]=[];
  for(let x=-80;x<=-20;x+=10)beams.push({x,z:2,w:.38,d:56,h:.55});
  for(const z of [-25,-8,12,29])beams.push({x:-50,z,w:64,d:.38,h:.65});
  this.cubes('repository-roof-ribs',beams,this.trim,7.35);
  // Low borders and brass seams make the circulation loops legible at eye level.
  this.cubes('repository-plinths',[...HIDE_COVER,...HIDE_PARTITIONS].map(b=>({...b,w:b.w+.06,d:b.d+.06,h:.16})),this.trim);
  const seams:HideBlock[]=[];
  for(const z of [-10.2,9.8])seams.push({x:-50,z,w:60,d:.045,h:.006});
  for(const x of [-80,-49,-20])seams.push({x,z:2,w:.045,d:52,h:.006});
  this.cubes('repository-brass-inlay',seams,this.brass,.006);
  // Warm archway frames the new opening from the existing courtyard.
  this.cubes('repository-entrance-pillars',[{x:-6.6,z:-2.15,w:.9,d:.7,h:6.4},{x:-6.6,z:6.15,w:.9,d:.7,h:6.4}],this.trim);
  this.cubes('repository-entrance-lintel',[{x:-6.6,z:2,w:.9,d:9,h:.8}],this.trim,6.4);
  this.sign('HIDE & SEEK','THE FORGOTTEN REPOSITORY',-6.08,5.65,2,5,Math.PI/2);
  this.sign('COURTYARD →','The pit and your friends are this way.',-17.25,5.9,2,6,-Math.PI/2);
  for(const zone of HIDE_ZONES){
   const z=zone.z===-18?-25.94:zone.z===22?29.94:11.61;
   const facing=zone.z===-18?0:Math.PI;
   this.sign(zone.title,zone.subtitle,zone.x,5.5,z,zone.id==='arrival'?8:7,facing,'#'+zone.color.toString(16));
  }
  // The arrival board is readable immediately after rounding the entrance screen.
  this.sign('HIDE & SEEK','Pick a seeker · Count to 25 · Find your friends',-27.34,3.25,2,5.1,-Math.PI/2);
 }
 private dress(){
  for(const prop of HIDE_PROPS)this.instance(prop.model,prop.x,0,prop.z,prop.w,prop.h,prop.d,prop.rotation??0);
  for(const i of HIDE_ISLANDS){
   for(const side of [-1,1]){
    const p=hideLocal(i,side*2.4,side*2.8);
    this.instance('pillar-square',p.x,0,p.z,.85,5.05,.85);
    const lamp=hideLocal(i,side*2.4,side*2.8);
    this.instance('lantern-candle',lamp.x,5.05,lamp.z,.42,.7,.42);
   }
   // Original authored stone relief sits on each cover wall, with no extra collision.
   const c=hideLocal(i,0,0);
   this.instance('stone-wall',c.x,4.15,c.z,i.turn?.72:5.45,.6,i.turn?5.45:.72,i.turn?Math.PI/2:0);
   if(i.zone==='crypt'){
    for(const side of [-1,1]){const p=hideLocal(i,-side*1.25,side*.48);this.instance('urn-square',p.x,0,p.z,.45,.75,.35);}
   }
   if(i.zone==='stores'){
    // Supplies ride above the screen; they cannot obstruct a hiding pocket.
    this.instance('coffin-old',c.x,4.96,c.z,i.turn?.65:3.4,.55,i.turn?3.4:.65,i.turn?Math.PI/2:0);
   }
   if(i.zone==='monuments')this.instance('column-large',c.x,4.96,c.z,.8,2.1,.8);
   if(i.zone==='shrine')this.instance('candle-multiple',c.x,4.96,c.z,1.1,.55,.5);
  }
  for(const x of [-75,-64,-53]){
   this.instance('candle-multiple',x,1.25,28.1,1.2,.6,.55);
   this.instance('crypt-small-roof',x,4.4,-23.8,5.45,.9,3.85);
  }
  // Column rhythm and hanging warm lamps give the large hall a human scale.
  for(const x of [-80.8,-48.8,-19.2])for(const z of [-25, -8,12,29]){
   this.instance('stone-wall-column',x,0,z,.9,7.9,.9);
   this.instance('lantern-candle',x,5.5,z,.5,.8,.5);
  }
  for(const z of [-1,5])this.instance('lantern-candle',-6.2,3.4,z,.55,.85,.55);
  const warm=new THREE.PointLight(0xffb36b,34,17,2);warm.position.set(-23,5.8,2);
  const violet=new THREE.PointLight(0xb893e9,40,25,2);violet.position.set(-64,6.5,23);this.root.add(warm,violet);
  // Small opaque emissive flames remain occluded by stone, without dozens of lights.
  const flames=HIDE_ISLANDS.flatMap(i=>[-1,1].map(side=>{const p=hideLocal(i,side*2.4,side*2.8);return {x:p.x,z:p.z,w:.09,d:.09,h:.18};}));
  this.cubes('repository-lantern-flames',flames,new THREE.MeshBasicMaterial({color:0xffd39c}),5.35);
  // Baked-looking pools of amber add warmth without a point light per lantern.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(255,194,106,.22)');gradient.addColorStop(.35,'rgba(255,167,70,.10)');gradient.addColorStop(1,'rgba(255,154,55,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const pools=new THREE.InstancedMesh(new THREE.PlaneGeometry(6,6).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-1}),flames.length);
  pools.name='repository-lantern-pools';flames.forEach((f,i)=>pools.setMatrixAt(i,new THREE.Matrix4().makeTranslation(f.x,.022,f.z)));this.root.add(pools);
  // A quiet shrine medallion is a landmark, not a reveal marker.
  const ring=new THREE.Mesh(new THREE.RingGeometry(2.8,2.84,64),this.brass);ring.rotation.x=-Math.PI/2;ring.position.set(-64,.014,25);this.root.add(ring);
 }
 update(time:number,reduced:boolean){
  if(!this.loaded)return;
  const positions=this.motes.geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++){const j=i*3,t=reduced?0:time*.12;positions.setXYZ(i,this.moteOrigins[j]+Math.sin(t+i)*.16,this.moteOrigins[j+1]+Math.sin(t*.6+i*2)*.12,this.moteOrigins[j+2]+Math.cos(t+i)*.16);}
  positions.needsUpdate=true;
 }
 get diagnostics(){return {loaded:this.loaded,spots:30,islands:HIDE_ISLANDS.length,models:this.templates.size};}
}
