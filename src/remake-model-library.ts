import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {creatureRegion} from './enemy-material-profiles';
import {MeshoptSimplifier} from 'meshoptimizer';

export const REMAKE_MODELS=['armabee','armabee-evolved','goleling','goleling-evolved','ghost','hywirl','squidle','dragon','dragon-evolved','spider'] as const;
export type RemakeModel=typeof REMAKE_MODELS[number];
type Model={geometry:THREE.BufferGeometry;swarm:THREE.BufferGeometry;size:THREE.Vector3};

/** Bake a shared flying/idle mesh while retaining anatomical material regions
 * and stable surface coordinates, including on simplified instanced creatures. */
export class RemakeModelLibrary{
 readonly models=new Map<RemakeModel,Model>();
 readonly palette=new THREE.DataTexture(new Uint8Array(256*4),256,1);
 private colors=new Map<string,number>();private point=new THREE.Vector3();
 constructor(){this.palette.colorSpace=THREE.SRGBColorSpace;this.palette.magFilter=this.palette.minFilter=THREE.NearestFilter;this.palette.generateMipmaps=false;}
 async load(){
  const loader=new GLTFLoader();await MeshoptSimplifier.ready;
  await Promise.all(REMAKE_MODELS.map(async name=>{
   const gltf=await loader.loadAsync(`/assets/models/remake/${name}.glb`),root=gltf.scene;
   const mixer=new THREE.AnimationMixer(root),clip=gltf.animations.find(a=>/Flying_Idle|Spider_Idle/.test(a.name));
   if(clip){mixer.clipAction(clip).play();mixer.setTime(.17);}
   root.updateMatrixWorld(true);const geometries:THREE.BufferGeometry[]=[];
   root.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;
    if(Array.isArray(node.material))throw Error(`Unexpected multi-material primitive: ${name}`);
    const source=node.geometry,geometry=source.clone(),position=geometry.getAttribute('position');
    if(node instanceof THREE.SkinnedMesh)node.skeleton.update();
    const sourceMaterial=node.material as THREE.MeshStandardMaterial,color=sourceMaterial.color.clone(),label=sourceMaterial.name;
    const regions=new Float32Array(position.count);regions.fill(creatureRegion(name,label));
    const motion=new Float32Array(position.count),skin=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight');
    for(let i=0;i<position.count;i++){
     this.point.fromBufferAttribute(position,i);
     if(node instanceof THREE.SkinnedMesh){
      node.applyBoneTransform(i,this.point);
      if(skin&&weights){let wingWeight=0;for(let j=0;j<4;j++){
       const bone=node.skeleton.bones[skin.getComponent(i,j)]?.name??'',weight=weights.getComponent(i,j);
       if(/Wing|Leg|Tentacle|Tail/i.test(bone))motion[i]+=weight;
       if(/Wing/i.test(bone))wingWeight+=weight;
      }if(wingWeight>.65&&regions[i]<2)regions[i]=2;}
     }
     this.point.applyMatrix4(node.matrixWorld);position.setXYZ(i,this.point.x,this.point.y,this.point.z);
    }
    // Use one mineral/metal palette across packs. Dark sockets and ember pupils
    // replace the source creatures' broad white cartoon eyes without new textures.
    if(/Eye_White/i.test(label))color.setHex(0x17212d);
    else if(/Eye_Black/i.test(label))color.setHex(0xffa36b);
    else if(name==='spider'&&label==='Material.001')color.setHex(0xe99662);
    else if(/Wings/i.test(label))color.setHex(0x647582);
    else if(/Main/i.test(label))color.lerp(new THREE.Color(0x465768),.55).multiplyScalar(.82);
    else if(/Secondary|Tongue/i.test(label))color.lerp(new THREE.Color(0x795644),.35).multiplyScalar(.8);
    const hex=color.getHexString();
    let index=this.colors.get(hex);
    if(index===undefined){index=this.colors.size;if(index>=256)throw Error('Creature palette overflow');this.colors.set(hex,index);const value=new THREE.Color('#'+hex),srgb=value.clone().convertLinearToSRGB(),pixels=this.palette.image.data;pixels[index*4]=Math.round(srgb.r*255);pixels[index*4+1]=Math.round(srgb.g*255);pixels[index*4+2]=Math.round(srgb.b*255);pixels[index*4+3]=255;}
    const uv=new Float32Array(position.count*2);for(let i=0;i<position.count;i++){uv[i*2]=(index+.5)/256;uv[i*2+1]=.5;}
    for(const attribute of Object.keys(geometry.attributes))if(attribute!=='position')geometry.deleteAttribute(attribute);
    geometry.setAttribute('creatureRegion',new THREE.BufferAttribute(regions,1));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setAttribute('motionWeight',new THREE.BufferAttribute(motion,1));geometry.computeVertexNormals();if(geometry.index){geometries.push(geometry.toNonIndexed());geometry.dispose();}else geometries.push(geometry);
   });
   const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!geometry)throw Error(`Empty creature: ${name}`);
   geometry.computeBoundingBox();const center=geometry.boundingBox!.getCenter(new THREE.Vector3()),size=geometry.boundingBox!.getSize(new THREE.Vector3());
   const span=Math.max(size.x,size.y,size.z);geometry.translate(-center.x,-center.y,-center.z).scale(1/span,1/span,1/span);size.divideScalar(span);geometry.computeBoundingBox();geometry.computeBoundingSphere();
   geometry.setAttribute('creatureCoord',geometry.getAttribute('position').clone());
   let swarm=geometry;
   if(['armabee','armabee-evolved','hywirl','dragon','ghost','spider'].includes(name)){
    // Faceted source normals split every edge. Weld using position, palette UV,
    // and motion weight, then rebuild normals after bounded-error reduction.
    const smooth=geometry.clone();smooth.deleteAttribute('normal');
    swarm=mergeVertices(smooth,1e-5);smooth.dispose();
    const [indices]=MeshoptSimplifier.simplify(new Uint32Array(swarm.index!.array),swarm.getAttribute('position').array as Float32Array,3,700*3,.025);
    swarm.setIndex(new THREE.BufferAttribute(indices,1));swarm.computeVertexNormals();swarm.computeBoundingBox();swarm.computeBoundingSphere();
   }
   this.models.set(name,{geometry,swarm,size});mixer.stopAllAction();mixer.uncacheRoot(root);
   root.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();if(!Array.isArray(node.material))node.material.dispose();}});
  }));
  this.palette.needsUpdate=true;
 }
 mesh(name:RemakeModel,span:number,material:THREE.Material,swarm=false){
  const model=this.models.get(name);if(!model)throw Error(`Creature not loaded: ${name}`);
  const mesh=new THREE.Mesh(swarm?model.swarm:model.geometry,material);mesh.name=`community-${name}`;mesh.scale.setScalar(span/Math.max(model.size.x,model.size.y,model.size.z));return mesh;
 }
}
