import * as THREE from 'three';
import {ARENA_DIMENSION,TILE_SIZE} from './arena';

export const FURNACE_NOISE=`float fHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float fNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fHash(i),fHash(i+vec2(1,0)),f.x),mix(fHash(i+vec2(0,1)),fHash(i+vec2(1,1)),f.x),f.y);}`;
const CRACK=`float furnaceCrack(vec2 p){
 p+=vec2(fNoise(p*2.8),fNoise(p*2.8+31.))*.23;
 p+=vec2(fNoise(p*13.),fNoise(p*13.+17.))*.055;
 vec2 cell=floor(p),local=fract(p);float first=9.,second=9.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 offset=vec2(float(x),float(y)),id=cell+offset;
  vec2 point=offset+vec2(fHash(id),fHash(id+47.))*.76+.12-local;
  float d=dot(point,point);if(d<first){second=first;first=d;}else second=min(second,d);
 }
 return sqrt(second)-sqrt(first);
}`;
export const FURNACE_FLOOR_SPAN=ARENA_DIMENSION*TILE_SIZE;
/** Static basalt fractures are baked once, with filtered emissive coverage.
 * Animation and fire lighting still run on the floor every frame. */
export class FurnaceFloorCache{
 readonly target=new THREE.WebGLRenderTarget(2048,2048,{depthBuffer:false,stencilBuffer:false,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter});
 private ready=false;
 prepare(renderer:THREE.WebGLRenderer){
  if(this.ready)return;
  const material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
   vertexShader:'varying vec2 fieldUV;void main(){fieldUV=uv;gl_Position=vec4(position.xy,0.,1.);}',
   fragmentShader:`varying vec2 fieldUV;${FURNACE_NOISE}${CRACK}
    void main(){vec2 stone=(fieldUV-.5)*${FURNACE_FLOOR_SPAN.toFixed(6)};
     float seam=furnaceCrack(stone*.58),aa=max(fwidth(seam)*.6,.002);
     float fissure=(1.-smoothstep(.004,.024+aa,seam))*.024/(.024+aa*.5);
     gl_FragColor=vec4(fissure,exp(-seam*12.),fNoise(stone*.4),fNoise(stone*1.7));
    }`});
  const geometry=new THREE.PlaneGeometry(2,2),scene=new THREE.Scene();scene.add(new THREE.Mesh(geometry,material));
  const previous=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
  try{renderer.setScissorTest(false);renderer.setRenderTarget(this.target);renderer.render(scene,new THREE.Camera());this.ready=true;}
  finally{renderer.setRenderTarget(previous);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);geometry.dispose();material.dispose();}
 }
 dispose(){this.target.dispose();}
}
