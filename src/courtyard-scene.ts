import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadEntranceEnvironment} from './entrance-environment';
import {PIT,COURTYARD_FLOOR_TILES,FOOTBALL,FOOTBALL_PASSAGE,pitIsOpen} from './courtyard-state';
import type {World} from './simulation';
import {TILE_SIZE} from './arena';

/** Downloaded final meshes; the only generated geometry is transient social feedback. */
export class CourtyardScene{
 readonly scene=new THREE.Scene();readonly ready:Promise<void>;private propsLoaded=false;private hasSkull=false;error='';
 get loaded(){return this.propsLoaded&&this.hasSkull;}
 private hatch=new THREE.Group();private skull=new THREE.Group();private skullLights=new THREE.Group();
 private shaft:THREE.PointLight;private sparks:THREE.Points;
 private plaques=new Map<string,THREE.Sprite>();private goalScore='';
 constructor(){
  this.scene.background=new THREE.Color(0x090b11);this.scene.fog=new THREE.FogExp2(0x090b11,.008);
  this.scene.add(new THREE.HemisphereLight(0xc7b8a4,0x301623,1.65));
  this.shaft=new THREE.PointLight(0xec693e,26,14,1.6);this.shaft.position.set(PIT.x,-2.5,PIT.z);this.scene.add(this.shaft);
  const positions=new Float32Array(40*3);this.sparks=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)),new THREE.PointsMaterial({color:0xffbc77,size:.035,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));this.scene.add(this.sparks);
  // This rig belongs exclusively to the courtyard scene, never to the combat skull template.
  this.skullLights.name='football-skull-lighting';
  const key=new THREE.PointLight(0xffe3b8,7,2.8,2),fill=new THREE.PointLight(0xb8d9ff,3,2.4,2);
  key.position.set(.65,1,.85);fill.position.set(-.7,.45,-.65);this.skullLights.add(key,fill);this.skullLights.visible=false;
  this.scene.add(this.hatch,this.skull,this.skullLights);
  this.ready=this.load().then(()=>{this.propsLoaded=true;}).catch(e=>{this.error='Courtyard assets could not load. Reload to retry.';throw e;});
  // Loading failure is surfaced in the courtyard HUD; avoid an unhandled rejection at menu startup.
  void this.ready.catch(()=>{});
 }
 setSkull(model:THREE.Group){
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  model.position.sub(center);const fit=new THREE.Group();fit.add(model);const scale=.72/Math.max(size.x,size.y,size.z);fit.scale.setScalar(scale);
  // Share the existing mesh and texture; use courtyard lighting instead of the combat lighting shader.
  model.traverse(o=>{if(o instanceof THREE.Mesh){const original=o.material as THREE.MeshBasicMaterial;o.material=new THREE.MeshStandardMaterial({map:original.map,color:0xfff3dd,emissive:0xffe1b6,emissiveMap:original.map,emissiveIntensity:.32,roughness:.75,flatShading:true});}});
  this.skull.add(fit);this.hasSkull=true;
 }
 setFloor(geometry:THREE.BufferGeometry,map:THREE.Texture){
  const matrices:THREE.Matrix4[]=[];
  const tiles=[...COURTYARD_FLOOR_TILES];for(let x=9;x<=59;x+=2)for(let z=-28;z<=32;z+=2){if(x<14&&(z<FOOTBALL_PASSAGE.minZ-1||z>FOOTBALL_PASSAGE.maxZ+1))continue;if(x>FOOTBALL.x-18&&x<FOOTBALL.x+18&&z>FOOTBALL.z-25&&z<FOOTBALL.z+25)continue;tiles.push({x,z});}
  for(const {x,z} of tiles){const m=new THREE.Matrix4().makeScale(2/TILE_SIZE,1,2/TILE_SIZE);m.setPosition(x,0,z);matrices.push(m);}
  const floor=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({map,color:0xaaa29a,roughness:.95}),matrices.length);for(let i=0;i<matrices.length;i++)floor.setMatrixAt(i,matrices[i]);this.scene.add(floor);
 }
 private async load(){
  const failures:string[]=[],manager=new THREE.LoadingManager();manager.onError=url=>failures.push(url);const loader=new GLTFLoader(manager),names=['template-wall','gate-metal-bars','gate','altar-stone','candle-multiple','pillar-small','stone-wall','stone-wall-column','detail-bowl'];
  const models=await Promise.all(names.map(async name=>[name,(await loader.loadAsync('/models/courtyard/'+name+'.glb')).scene] as const));
  if(failures.length)throw Error('Missing courtyard textures: '+failures.join(', '));
  const templates=new Map(models);
  for(const [name,model]of models)model.traverse(o=>{if(o instanceof THREE.Mesh){const m=(o.material as THREE.MeshStandardMaterial).clone();if(name!=='candle-multiple')m.color.multiplyScalar(.64);o.material=m;}});

  const place=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,rotation=0,parent:THREE.Object3D=this.scene)=>{
   const root=new THREE.Group(),model=templates.get(name)!.clone(true);model.rotation.y=rotation;root.add(model);root.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   model.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));root.scale.set(w/Math.max(.001,size.x),h/Math.max(.001,size.y),d/Math.max(.001,size.z));root.position.set(x,y,z);parent.add(root);return root;
  };
  await loadEntranceEnvironment(this.scene,true);
  // Existing authored game tiles are instanced around the aperture by setFloor.
  for(const x of [PIT.x-2.2,PIT.x+2.2]){place('template-wall',x,-8,PIT.z,.4,8,4.8);place('stone-wall',x,.01,PIT.z,.3,.12,4.8);}
  for(const z of [PIT.z-2.2,PIT.z+2.2]){place('template-wall',0,-8,z,4,8,.4);place('stone-wall',0,.01,z,4.6,.12,.3);}
  // Rotate the authored iron gate horizontally before fitting its bounding box.
  const gate=templates.get('gate-metal-bars')!;gate.rotation.x=-Math.PI/2;
  place('gate-metal-bars',PIT.x,-.06,PIT.z,4,.1,4,0,this.hatch);
  place('altar-stone',3.3,-.025,-4.6,.85,1.125,.85);
  place('candle-multiple',3.3,1.1,-4.6,.45,.35,.4);
  this.label('football-wayfinding','FOOTBALL →',new THREE.Vector3(6.5,2.8,PIT.z),2,.35);
  const textureLoader=new THREE.TextureLoader(manager);
  const [pitchAsset,goalAsset,grass,normal,net]=await Promise.all([
   loader.loadAsync('/models/football/pitch.glb'),loader.loadAsync('/models/football/goal.glb'),
   textureLoader.loadAsync('/models/football/grass-color.jpg'),textureLoader.loadAsync('/models/football/grass-normal.jpg'),textureLoader.loadAsync('/models/football/net.png'),
  ]);
  if(failures.length)throw Error('Missing football assets: '+failures.join(', '));
  grass.colorSpace=net.colorSpace=THREE.SRGBColorSpace;grass.wrapS=grass.wrapT=normal.wrapS=normal.wrapT=THREE.RepeatWrapping;grass.anisotropy=normal.anisotropy=4;net.wrapS=net.wrapT=THREE.RepeatWrapping;net.repeat.set(1,1);
  const mapMaterials=(mesh:THREE.Mesh,change:(m:THREE.MeshStandardMaterial)=>THREE.MeshStandardMaterial)=>{mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>change(m as THREE.MeshStandardMaterial)):change(mesh.material as THREE.MeshStandardMaterial);};
  const pitch=pitchAsset.scene;pitch.traverse(o=>{if(o instanceof THREE.Mesh){mapMaterials(o,m=>{m.roughness=1;if(m.name==='Green'){m.map=grass;m.normalMap=normal;m.normalScale.set(.35,.35);m.color.set(0x9bb68a);}else{m.color.set(0xe9e4c7);m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-1;}return m;});}});
  const box=new THREE.Box3().setFromObject(pitch),size=box.getSize(new THREE.Vector3());pitch.scale.set(FOOTBALL.width/size.x,Math.min(FOOTBALL.width/size.x,FOOTBALL.length/size.z),FOOTBALL.length/size.z);pitch.position.set(FOOTBALL.x,0,FOOTBALL.z);this.scene.add(pitch);
  const fitGoal=(z:number,index:number)=>{
   const root=new THREE.Group(),model=goalAsset.scene.clone(true);root.add(model);const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());model.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));
   model.traverse(o=>{if(o instanceof THREE.Mesh)mapMaterials(o,material=>{const m=material.clone();if(m.name==='Net'){m.map=net;m.alphaTest=.01;m.transparent=true;m.depthWrite=false;m.side=THREE.DoubleSide;m.color.set(0xd4d9cf);}else m.color.set(0xe6e2d7);return m;});});
   root.scale.set(FOOTBALL.goalHalfWidth*2/size.x,FOOTBALL.goalHeight/size.y,FOOTBALL.goalDepth/size.z);root.rotation.y=index?Math.PI:0;root.position.set(FOOTBALL.x,0,z+(index?1:-1)*FOOTBALL.goalDepth/2);this.scene.add(root);
  };
  FOOTBALL.goalZ.forEach(fitGoal);
  // Broad overhead light keeps the full pitch readable without a field of point lights.
  const fieldLight=new THREE.DirectionalLight(0xd6e5dc,2.2);fieldLight.position.set(FOOTBALL.x,24,FOOTBALL.z+10);fieldLight.target.position.set(FOOTBALL.x,0,FOOTBALL.z);this.scene.add(fieldLight,fieldLight.target);


 }
 private label(id:string,text:string,pos:THREE.Vector3,w:number,h:number){
  const old=this.plaques.get(id);if(old){old.material.map?.dispose();old.material.dispose();old.removeFromParent();}
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;const ctx=canvas.getContext('2d')!;ctx.font='500 38px "Barlow Condensed",sans-serif';ctx.textAlign='center';ctx.fillStyle='#e5c49c';ctx.shadowColor='#000';ctx.shadowBlur=10;ctx.fillText(text,512,92,980);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthWrite:false,toneMapped:false}));sprite.position.copy(pos);sprite.scale.set(w,h,1);this.scene.add(sprite);this.plaques.set(id,sprite);
 }
 private scoreLabel(index:number,goals:readonly number[]){
  const id='football-score-'+index,old=this.plaques.get(id);if(old){old.material.map?.dispose();old.material.dispose();old.removeFromParent();}
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#111714f2';ctx.fillRect(0,0,768,256);ctx.strokeStyle='#94836a';ctx.lineWidth=3;ctx.strokeRect(3,3,762,250);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='500 28px "DM Sans",sans-serif';ctx.fillStyle='#b9c5bb';ctx.fillText('NORTH GOAL',204,55);ctx.fillText('SOUTH GOAL',564,55);
  ctx.font='600 112px "Barlow Condensed",sans-serif';ctx.fillStyle='#f4e8ca';ctx.fillText(String(goals[0]),204,163);ctx.fillText(String(goals[1]),564,163);ctx.font='500 58px "Barlow Condensed",sans-serif';ctx.fillStyle='#8b9a8f';ctx.fillText(':',384,156);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthWrite:false,toneMapped:false}));sprite.name=id;sprite.userData.goals=[...goals];
  sprite.position.set(FOOTBALL.x,4.7,FOOTBALL.goalZ[index]+(index?1:-1)*.2);sprite.scale.set(5.4,1.8,1);this.scene.add(sprite);this.plaques.set(id,sprite);
 }
 get diagnostics(){return {skullVisible:this.skull.visible,lightingVisible:this.skullLights.visible,lightPosition:this.skullLights.position.toArray(),scores:[0,1].map(i=>{const board=this.plaques.get('football-score-'+i);return board?{goals:board.userData.goals,position:board.position.toArray()}:null;})};}
 update(world:World,members:{id:string;ready:boolean;color?:string;loaded?:number}[],reduced=false){
  const c=world.courtyard;if(!c){this.skullLights.visible=false;return;}const t=world.tick/120;
  const opening=c.phase==='gathering'?0:c.phase==='opening'?Math.max(0,Math.min(1,(world.tick-c.phaseTick)/PIT.openingTicks)):1;
  this.hatch.visible=opening<1;
  this.skull.position.set(c.skull.pos.x,c.skull.pos.y,c.skull.pos.z);this.skull.rotation.set(c.skull.rotation.x,c.skull.rotation.y,c.skull.rotation.z);this.skull.visible=!c.skull.resetAt;this.skullLights.position.copy(this.skull.position);this.skullLights.visible=this.skull.visible;
  this.shaft.intensity=pitIsOpen(c)?32:10+opening*15;
  const a=this.sparks.geometry.getAttribute('position'),arrival=[...c.events].reverse().find(e=>(e.kind==='arrival'||e.kind==='highfive'||e.kind==='goal')&&world.tick-e.tick<100&&world.tick>=e.tick);for(let i=0;i<40;i++){const k=reduced?i*.1:t;const center=arrival?.pos??{x:0,y:0,z:0};a.setXYZ(i,center.x+Math.sin(i*127.1+k)*.45,center.y+(i*.071+k*.4)%1.5,center.z+Math.cos(i*79.3+k)*.45);}a.needsUpdate=true;this.sparks.visible=!!arrival;
  const score=c.skull.goals.join(' : ');if(score!==this.goalScore){this.goalScore=score;this.scoreLabel(0,c.skull.goals);this.scoreLabel(1,c.skull.goals);}

 }
}
