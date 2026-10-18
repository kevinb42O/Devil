import * as THREE from 'three';
import {ENTRANCE_PLATFORM} from './entrance-layout';
export const SOLO_FLOOR_TEXTURE='/assets/materials/solo-sanctuary/sanctuary-basalt-c521541c.png';
/** Hand-laid half-bond stone: the arena and multiplayer never use this material or mesh. */
export class SoloFloor {
 readonly mesh:THREE.InstancedMesh;readonly inlay:THREE.InstancedMesh;readonly ready:Promise<void>;
 constructor(scene:THREE.Scene){
  const shape=new THREE.Shape(),w=2.45,d=1.21;shape.moveTo(-w/2,-d/2);shape.lineTo(w/2,-d/2);shape.lineTo(w/2,d/2);shape.lineTo(-w/2,d/2);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.008,bevelThickness:.008,curveSegments:1});geometry.rotateX(-Math.PI/2);geometry.translate(0,-.168,0);
  const material=new THREE.MeshStandardMaterial({color:0x9ba3ad,roughness:.7,metalness:.08});
  const uniforms={sanctuaryStone:{value:new THREE.Texture()}};
  material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,uniforms);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float sanctuarySeed;varying float sanctuaryStoneSeed;varying vec3 sanctuaryStonePosition;').replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
    sanctuaryStonePosition=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;sanctuaryStoneSeed=sanctuarySeed;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    uniform sampler2D sanctuaryStone;varying float sanctuaryStoneSeed;varying vec3 sanctuaryStonePosition;
    vec3 sanctuaryRelief(vec3 n,vec3 viewPosition,float height){
     vec3 dx=dFdx(viewPosition),dy=dFdy(viewPosition),rx=cross(dy,n),ry=cross(n,dx);float det=dot(dx,rx);
     vec3 gradient=sign(det)*(dFdx(height)*rx+dFdy(height)*ry);
     return normalize(abs(det)*n-gradient*.006);
    }`)
    .replace('#include <map_fragment>',`
     float angle=floor(sanctuaryStoneSeed*4.)*1.5707963;mat2 turn=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
     vec2 stoneUV=turn*sanctuaryStonePosition.xz*.72+vec2(sanctuaryStoneSeed*19.,sanctuaryStoneSeed*31.);
     vec3 stonePigment=texture2D(sanctuaryStone,stoneUV).rgb;
     diffuseColor.rgb*=stonePigment;
     float mineral=dot(stonePigment,vec3(.2126,.7152,.0722));
    `)
    .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
     float approach=1.-smoothstep(1.,3.,abs(sanctuaryStonePosition.x));
     roughnessFactor=clamp(.78-mineral*.40-approach*.10+(sanctuaryStoneSeed-.5)*.04,.48,.80);
    `)
    .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     normal=sanctuaryRelief(normal,-vViewPosition,mineral);
    `);
  };
  material.customProgramCacheKey=()=> 'solo-sanctuary-bespoke-basalt-v1';
  const rows=22,columns=7,count=165;this.mesh=new THREE.InstancedMesh(geometry,material,count);this.mesh.name='solo-bespoke-stone-floor';
  const transform=new THREE.Object3D(),seeds=new Float32Array(count);let i=0;
  const left=-ENTRANCE_PLATFORM.width/2,back=ENTRANCE_PLATFORM.centerZ-ENTRANCE_PLATFORM.depth/2;
  for(let row=0;row<rows;row++){
   const odd=row%2===1,lengths=odd?[1.24,...Array(columns-1).fill(2.48),1.24]:Array(columns).fill(2.48);let x=left;
   for(const length of lengths){const random=Math.sin(i*127.1+19.7)*43758.5453,seed=random-Math.floor(random);seeds[i]=seed;
    transform.position.set(x+length/2,0,back+(row+.5)*1.24);transform.scale.set(length/2.48,1,1);transform.updateMatrix();this.mesh.setMatrixAt(i,transform.matrix);
    this.mesh.setColorAt(i,new THREE.Color().setRGB(.84+seed*.16,.86+seed*.14,.90+seed*.1));x+=length;i++;
   }
  }
  geometry.setAttribute('sanctuarySeed',new THREE.InstancedBufferAttribute(seeds,1));scene.add(this.mesh);
  const mortar=new THREE.Mesh(new THREE.BoxGeometry(ENTRANCE_PLATFORM.width,.10,ENTRANCE_PLATFORM.depth),new THREE.MeshStandardMaterial({color:0x121619,roughness:1}));mortar.position.set(0,-.09,ENTRANCE_PLATFORM.centerZ);mortar.name='solo-recessed-mortar-bed';scene.add(mortar);
  const bronze=new THREE.MeshStandardMaterial({color:0x6d5840,metalness:.78,roughness:.46});
  this.inlay=new THREE.InstancedMesh(new THREE.BoxGeometry(.012,.007,16),bronze,2);this.inlay.name='solo-aged-bronze-approach';const matrix=new THREE.Matrix4();for(let i=0;i<2;i++){matrix.makeTranslation(i?1.55:-1.55,.001,.2);this.inlay.setMatrixAt(i,matrix);}scene.add(this.inlay);
  this.ready=new THREE.TextureLoader().loadAsync(SOLO_FLOOR_TEXTURE).then(texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=8;uniforms.sanctuaryStone.value=texture;material.map=texture;material.needsUpdate=true;});
 }
 updateSide(cameraY:number){const material=this.mesh.material as THREE.MeshStandardMaterial,side=cameraY<=0?THREE.DoubleSide:THREE.FrontSide;if(material.side!==side){material.side=side;material.needsUpdate=true;}}
 get diagnostics(){const material=this.mesh.material as THREE.MeshStandardMaterial;return {texture:SOLO_FLOOR_TEXTURE,slabs:this.mesh.count,bevelled:true,loaded:!!material.map,scope:'single-player-only'};}
}
