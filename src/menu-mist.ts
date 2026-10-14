import * as THREE from 'three';

const vertex=`varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const fragment=`precision highp float;
varying vec2 vUv;
uniform sampler2D sceneDepth;
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform vec3 eye;
uniform float time;
uniform int steps;
float hash(vec3 p){p=fract(p*0.3183099+vec3(.1,.2,.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 unproject(float depth){vec4 p=inverseProjection*vec4(vUv*2.0-1.0,depth*2.0-1.0,1.0);return (cameraWorld*vec4(p.xyz/p.w,1.0)).xyz;}
void main(){
 float depth=texture2D(sceneDepth,vUv).x;
 vec3 surface=unproject(depth),ray=normalize(surface-eye);
 // Bound the actual 3D mist to the lower chamber. Scene depth clips it around the body and altar.
 vec3 invRay=1.0/(ray+vec3(0.000001));
 vec3 a=(vec3(-16.0,-2.15,-7.0)-eye)*invRay,b=(vec3(16.0,1.0,7.0)-eye)*invRay;
 vec3 lo=min(a,b),hi=max(a,b);
 float start=max(0.0,max(lo.x,max(lo.y,lo.z)));
 float end=min(min(hi.x,min(hi.y,hi.z)),min(length(surface-eye),35.0));
 if(end<=start){gl_FragColor=vec4(0.0);return;}
 float stride=(end-start)/float(steps);
 float jitter=fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))*.65;
 vec4 fog=vec4(0.0);
 for(int i=0;i<32;i++){
  if(i>=steps)break;
  vec3 p=eye+ray*(start+(float(i)+jitter)*stride);
  vec3 drift=p*vec3(.55,1.3,.65)+vec3(-time*.16,0.0,time*.045);
  float broad=noise(drift);
  float curl=noise(drift*2.13+vec3(time*.025,2.7,-time*.02));
  float detail=noise(drift*4.3);
  float cloud=smoothstep(.32,.72,broad*.62+curl*.28+detail*.10);
  float height=exp(-max(0.0,p.y+1.65)*1.6);
  float edge=smoothstep(-2.15,-1.8,p.y)*(1.0-smoothstep(.1,1.0,p.y));
  float density=cloud*height*edge*.21;
  float alpha=1.0-exp(-density*stride);
  float flame=exp(-length((p-vec3(0.0,-1.05,0.6))*vec3(.6,1.0,.65))*.7);
  float shaft=pow(max(0.0,1.0-abs(p.x-p.y*.55-1.7)*.24),8.0)*.035;
  vec3 light=mix(vec3(.095,.125,.16),vec3(.35,.16,.075),flame*.8)+vec3(.19,.24,.30)*shaft;
  fog.rgb+=(1.0-fog.a)*light*alpha;
  fog.a+=(1.0-fog.a)*alpha;
  if(fog.a>.9)break;
 }
 gl_FragColor=fog;
}`;

/** Half-resolution, depth-aware volume integration. No smoke images or extra animation loop. */
export class MenuMist {
 private color=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
 private volume=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
 private quadScene=new THREE.Scene();
 private quadCamera=new THREE.Camera();
 private mistMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{sceneDepth:{value:null},inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},eye:{value:new THREE.Vector3()},time:{value:0},steps:{value:24}}});
 private composite=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:`varying vec2 vUv;
uniform sampler2D sceneColor;
uniform sampler2D mist;
void main(){vec4 fog=texture2D(mist,vUv);gl_FragColor=vec4(texture2D(sceneColor,vUv).rgb*(1.0-fog.a)+fog.rgb,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,depthTest:false,depthWrite:false,uniforms:{sceneColor:{value:this.color.texture},mist:{value:this.volume.texture}}});
 private quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.mistMaterial);
 private size=new THREE.Vector2();
 private quality='high';
 private enabled=true;
 get diagnostics(){return {enabled:this.enabled,width:this.volume.width,height:this.volume.height,steps:this.mistMaterial.uniforms.steps.value,time:this.mistMaterial.uniforms.time.value};}
 constructor(){this.color.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);this.mistMaterial.uniforms.sceneDepth.value=this.color.depthTexture;this.quadScene.add(this.quad);}
 configure(quality:string,enabled=true){this.enabled=enabled;this.quality=quality;this.mistMaterial.uniforms.steps.value=quality==='high'?20:12;}
 render(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,time:number){
  if(!this.enabled){renderer.render(scene,camera);return;}
  renderer.getDrawingBufferSize(this.size);const w=this.size.x,h=this.size.y;
  if(this.color.width!==w||this.color.height!==h)this.color.setSize(w,h);
  const scale=Math.min(this.quality==='high'?.45:.3,(this.quality==='high'?640:320)/w),fw=Math.max(1,Math.round(w*scale)),fh=Math.max(1,Math.round(h*scale));
  if(this.volume.width!==fw||this.volume.height!==fh)this.volume.setSize(fw,fh);
  const previous=renderer.getRenderTarget();
  renderer.setRenderTarget(this.color);renderer.render(scene,camera);
  camera.updateMatrixWorld();const u=this.mistMaterial.uniforms;u.inverseProjection.value.copy(camera.projectionMatrixInverse);u.cameraWorld.value.copy(camera.matrixWorld);u.eye.value.copy(camera.position);u.time.value=time;
  this.quad.material=this.mistMaterial;renderer.setRenderTarget(this.volume);renderer.render(this.quadScene,this.quadCamera);
  this.quad.material=this.composite;renderer.setRenderTarget(previous);renderer.render(this.quadScene,this.quadCamera);
 }
}
