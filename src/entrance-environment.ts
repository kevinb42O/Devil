import * as THREE from 'three';
import {FOOTBALL_WALLS} from './courtyard-state';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** Authored Poly Haven architecture and scanned rock, shared across instances. */
export async function loadEntranceEnvironment(scene:THREE.Scene,multiplayer=false){
 const loader=new GLTFLoader();
 const [fort,rock,lantern]=await Promise.all([
  loader.loadAsync('/models/entrance/fort/model.gltf'),
  loader.loadAsync('/models/entrance/rock/model.gltf'),
  loader.loadAsync('/models/entrance/lantern/model.gltf'),
 ]);
 const place=(source:THREE.Object3D,x:number,z:number,scale:number,rotation=0,y=0)=>{
  const model=source.clone(true);model.position.set(0,0,0);model.rotation.set(0,rotation,0);model.scale.setScalar(scale);
  const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
  model.position.set(x-center.x,y-bounds.min.y,z-center.z);scene.add(model);return model;
 };
 const piece=(suffix:string)=>{
  const model=fort.scene.getObjectByName(`modular_fort_01_${suffix}`);
  if(!model)throw new Error(`Missing entrance architecture: ${suffix}`);
  return model;
 };
 // Keep the actual gate opening centered on the seal and the approach clear.
 place(piece(multiplayer?'wall_thin_straight_03':'wall_thin_gate_01'),0,-7.85,1.1,Math.PI/2);
 for(const side of [-1,1]){
  place(piece('wall_thin_straight_03'),side*8.15,-7.85,1.1,Math.PI/2);
  if(!multiplayer)place(piece('wall_thin_straight_02'),side*7.65,1.7,.9,side<0?Math.PI:0);
  if(!multiplayer)place(piece('tower_round'),side*12,-14,.8);
  if(!multiplayer)place(piece('wall_thick_end_01'),side*7.6,10,.85);
  // Cliff shoulders and rubble continue beyond the courtyard walls.
  for(let i=0;i<(multiplayer?0:4);i++)place(rock.scene,side*(11.5+i*1.2),-9+i*6,2.4,side*(.4+i*.65),-.5);
  for(let i=0;i<(multiplayer?0:3);i++)place(rock.scene,side*(4.9+i*.25),-5+i*4,.25+i*.04,side*i*1.2,-.08);
 }
 if(multiplayer){
  for(const wall of FOOTBALL_WALLS){
   const alongX=wall.w>wall.d,length=alongX?wall.w:wall.d,count=Math.ceil(length/5);
   for(let i=0;i<count;i++){const segment={...wall,x:wall.x+(alongX?(i+.5)*length/count-length/2:0),z:wall.z+(!alongX?(i+.5)*length/count-length/2:0),w:alongX?length/count:wall.w,d:alongX?wall.d:length/count};
   const source=piece('wall_thin_straight_03'),model=source.clone(true);model.position.set(0,0,0);model.rotation.set(0,segment.w>segment.d?Math.PI/2:0,0);model.scale.setScalar(1);model.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
   const group=new THREE.Group();model.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));group.add(model);group.scale.set(segment.w/size.x,segment.h/size.y,segment.d/size.z);group.position.set(segment.x,0,segment.z);scene.add(group);
   }
  }
 }
 place(piece('wall_thin_straight_01'),0,12,.95,Math.PI/2);
 place(rock.scene,-5,-21,3.3,.3,-1);
 if(!multiplayer)place(rock.scene,6,-23,4.1,-.7,-1);
 const moon=new THREE.DirectionalLight(0x91a9c2,1.4);moon.position.set(-8,16,5);scene.add(moon);
 for(const side of [-1,1]){
  const pedestal=place(piece('wall_thick_end_01'),side*4.5,-6,.16);
  const top=new THREE.Box3().setFromObject(pedestal).max.y;
  place(lantern.scene,side*4.5,-6,1.5,side*.2,top);
  const wash=new THREE.PointLight(0xff994f,18,12,2);wash.position.set(side*4.5,top+.28,-5.9);scene.add(wash);
 }
}
