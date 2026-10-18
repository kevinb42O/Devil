import * as THREE from 'three';

/** Small, repeatable 3D turbulence field shared by every fire volume. */
export function createFireNoise(){
 const size=64,data=new Uint8Array(size**3);let state=0x7193ab;
 for(let i=0;i<data.length;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;data[i]=state>>>24;}
 const texture=new THREE.Data3DTexture(data,size,size,size);
 texture.format=THREE.RedFormat;texture.type=THREE.UnsignedByteType;
 texture.minFilter=texture.magFilter=THREE.LinearFilter;
 texture.wrapS=texture.wrapT=texture.wrapR=THREE.RepeatWrapping;
 texture.unpackAlignment=1;texture.needsUpdate=true;return texture;
}

export const FIRE_VOLUME_VERTEX=`
attribute vec4 furnaceAnchor;
attribute vec2 furnaceSize;
varying vec3 fireWorld,fireOrigin,fireScale;
varying float fireSeed;
void main(){
 fireOrigin=furnaceAnchor.xyz;
 fireScale=vec3(furnaceSize.x,furnaceSize.y,furnaceSize.x*.72);
 fireSeed=furnaceAnchor.w;
 fireWorld=fireOrigin+(position+vec3(0.,.5,0.))*fireScale;
 gl_Position=projectionMatrix*viewMatrix*vec4(fireWorld,1.);
}`;

export const FIRE_VOLUME_FRAGMENT=`
precision highp sampler3D;
uniform sampler3D fireNoise;
uniform float furnaceClock,furnaceFire,fireSteps;
uniform vec3 furnaceCamera;
varying vec3 fireWorld,fireOrigin,fireScale;
varying float fireSeed;
float noise3(vec3 p){return texture(fireNoise,p/64.).r;}
float turbulence(vec3 p){return noise3(p)*.57+noise3(p*2.03+17.1)*.29+noise3(p*4.07-9.2)*.14;}
vec3 medium(vec3 p,float t){
 float y=p.y;
 // Advected 3D eddies bend the plume as it rises. Sampling in world volume
 // coordinates makes the same curls visible from every viewing direction.
 vec3 flow=vec3(p.x*6.,y*4.-t*2.7,p.z*6.)+fireSeed*117.;
 vec2 curl=vec2(noise3(flow*.55+13.),noise3(flow*.55+39.))-.5;
 vec2 center=curl*(.22+y*.48)+vec2(sin(t*.7+fireSeed*21.+y*4.),cos(t*.61+y*5.))*.055*y;
 float radius=mix(.43,.035,pow(clamp(y,0.,1.),.8));
 float radial=length((p.xz-center)*vec2(1.,1.08))/radius;
 float n=turbulence(flow*1.8+vec3(curl*2.4,0.));
 float field=1.-radial+(n-.50)*(1.8+y*2.3);
 float density=smoothstep(.02,.62,field)*(1.-smoothstep(.72,1.,y));
 density*=smoothstep(0.,.035,y);
 float temperature=clamp(field*.43+(1.-y)*.20+(n-.5)*.3,0.,1.);
 float smokeField=.65-length(p.xz-center)/(.25+y*.17)+(n-.5)*1.3;
 float smoke=max(0.,smokeField)*smoothstep(.42,.72,y)*(1.-smoothstep(.78,1.,y));
 return vec3(density,temperature,smoke);
}
vec3 emission(float heat){
 vec3 red=vec3(.75,.016,.001),orange=vec3(2.5,.23,.006),gold=vec3(3.6,1.15,.12),white=vec3(4.5,2.8,.85);
 vec3 c=mix(red,orange,smoothstep(.05,.40,heat));
 c=mix(c,gold,smoothstep(.35,.76,heat));
 return mix(c,white,smoothstep(.72,1.,heat));
}
void main(){
 vec3 ro=(furnaceCamera-fireOrigin)/fireScale;
 vec3 rd=normalize((fireWorld-furnaceCamera)/fireScale);
 vec3 safeRD=mix(vec3(.00001),rd,step(vec3(.00001),abs(rd)));
 vec3 a=(vec3(-.5,0.,-.5)-ro)/safeRD,b=(vec3(.5,1.,.5)-ro)/safeRD;
 vec3 lo=min(a,b),hi=max(a,b);
 float begin=max(0.,max(lo.x,max(lo.y,lo.z))),end=min(hi.x,min(hi.y,hi.z));
 if(end<=begin)discard;
 float stepLength=(end-begin)/fireSteps;
 // Stable sub-step jitter avoids ray bands without temporal grain or pause drift.
 float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
 float t=furnaceClock*(.8+fireSeed*.3)+fireSeed*83.;
 vec3 radiance=vec3(0.);float transmittance=1.;
 for(int i=0;i<48;i++){
  if(float(i)>=fireSteps||transmittance<.018)break;
  vec3 p=ro+rd*(begin+(float(i)+jitter)*stepLength);
  vec3 sampleFire=medium(p,t);
  float fuel=sampleFire.x*8.,soot=sampleFire.z*3.,extinction=fuel+soot;
  float alpha=1.-exp(-extinction*stepLength);
  vec3 source=(fuel*emission(sampleFire.y)+soot*vec3(.042,.022,.012))/max(extinction,.001);
  radiance+=transmittance*alpha*source;
  transmittance*=1.-alpha;
 }
 float opacity=1.-transmittance;
 if(opacity<.002)discard;
 float distanceFade=exp(-distance(furnaceCamera,fireOrigin)*.003);
 float near=smoothstep(1.5,4.5,distance(furnaceCamera,fireOrigin));
 gl_FragColor=vec4(radiance/max(opacity,.001),opacity*furnaceFire*distanceFade*near);
}`;
