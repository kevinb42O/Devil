import * as THREE from 'three';
import type {OriginalWeapon} from './original-weapon';

const bodyGeometry=new THREE.CapsuleGeometry(.38,1.05,6,16);
const palmGeometry=new THREE.SphereGeometry(1,12,8);
const colors=[0xcde98b,0x62cfff,0xffbd66,0xd994ff];

// Curved, tapering horns, shared by every teammate.
const hornGeometry=(()=>{
 const positions:number[]=[],indices:number[]=[];
 const rings=[[0,0,.13],[.035,.14,.105],[.095,.29,.075],[.12,.43,.04],[.09,.56,0]];
 for(const [x,y,r] of rings)for(let j=0;j<8;j++){const a=j*Math.PI/4;positions.push(x+Math.cos(a)*r,y,Math.sin(a)*r);}
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<8;j++){const a=i*8+j,b=i*8+(j+1)%8;indices.push(a,b,a+8,b,b+8,a+8);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
})();

function mesh(parent:THREE.Object3D,name:string,geometry:THREE.BufferGeometry,material:THREE.Material,position:number[],scale:number[]){
 const part=new THREE.Mesh(geometry,material);part.name=name;part.position.set(position[0],position[1],position[2]);part.scale.set(scale[0],scale[1],scale[2]);parent.add(part);return part;
}

export function createCrewAvatar(index:number){
 const model=new THREE.Group();model.name='crew-devil';
 const color=colors[index%colors.length];
 const body=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.1,roughness:.8});
 const horns=new THREE.MeshStandardMaterial({color:0x39251e,roughness:.7});
 const sockets=new THREE.MeshStandardMaterial({color:0x170d09,roughness:1});
 const eyes=new THREE.MeshBasicMaterial({color:0xff6a32,toneMapped:false});
 model.userData.avatarMaterials=[body,horns,sockets,eyes];
 // Positions are relative to the player's eye height; the capsule reaches the floor.
 mesh(model,'pill-body',bodyGeometry,body,[0,-.7,0],[1,1,.88]);
 for(const side of [-1,1]){
  const horn=mesh(model,side<0?'left-horn':'right-horn',hornGeometry,horns,[side*.25,.04,0],[side,1,1]);
  horn.rotation.x=-.12;
  const socket=mesh(model,'eye-socket',palmGeometry,sockets,[side*.15,-.12,-.30],[.13,.08,.075]);socket.rotation.z=side*-.22;
  const eye=mesh(model,side<0?'left-eye':'right-eye',palmGeometry,eyes,[side*.15,-.12,-.357],[.082,.038,.025]);eye.rotation.z=side*-.22;

 }
 return model;
}

export function updateCrewArm(model:THREE.Group,weapon:OriginalWeapon,level:number){
 const previous=model.getObjectByName('crew-arm');
 if(previous?.userData.level===level)return;
 const arm=weapon.createCrewArm(level);if(!arm)return;
 if(previous){model.remove(previous);(previous.userData.material as THREE.Material).dispose();}
 model.add(arm);
}

export function disposeCrewAvatar(model:THREE.Group){
 const arm=model.getObjectByName('crew-arm');if(arm)(arm.userData.material as THREE.Material).dispose();
 for(const material of model.userData.avatarMaterials as THREE.Material[])material.dispose();
}
