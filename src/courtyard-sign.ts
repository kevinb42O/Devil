import * as THREE from 'three';

/** A physical plaque: its face, metal rim and backing stay in one wall plane. */
export function createCourtyardSign(name:string,width:number,height:number,map?:THREE.Texture){
 const face=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map,toneMapped:false}));face.name=name;
 const rim=new THREE.MeshStandardMaterial({color:0x806b4e,roughness:.7,metalness:.35});
 const backing=new THREE.Mesh(new THREE.BoxGeometry(width+.08,height+.08,.08),new THREE.MeshStandardMaterial({color:0x182125,roughness:.85}));backing.position.z=-.045;face.add(backing);
 for(const side of [-1,1]){const vertical=new THREE.Mesh(new THREE.BoxGeometry(.035,height+.08,.025),rim);vertical.position.set(side*(width/2+.025),0,-.003);const horizontal=new THREE.Mesh(new THREE.BoxGeometry(width+.08,.035,.025),rim);horizontal.position.set(0,side*(height/2+.025),-.003);face.add(vertical,horizontal);}
 return face;
}
