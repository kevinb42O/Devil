import {createDescentState,descentAt,type DescentState} from './descent';
/** Uses the chapter crossfades exactly, including arbitrary practice/replay seeks. */
export function veilAt(time:number,state:DescentState=createDescentState()){
 const s=descentAt(time,state);return s.chapter===1?s.blend:s.chapter===2?1-s.blend:0;
}
/** Shared sky radiance makes water reflect the same tear and cloud formations. */
export const VEIL_RADIANCE=`
uniform sampler2D veilClouds;
uniform float veilClock;
float veilHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float veilNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(veilHash(i),veilHash(i+vec2(1,0)),f.x),mix(veilHash(i+vec2(0,1)),veilHash(i+vec2(1)),f.x),f.y);}
vec3 veilRadiance(vec3 d,float blur){
 vec3 ray=normalize(vec3(d.x,d.y-.09-veilClock*.0004,d.z));
 vec2 uv=vec2(fract(atan(ray.z,ray.x)*.159154943+.5),asin(clamp(ray.y,-1.,1.))*.318309886+.5);
 vec2 dx=dFdx(uv),dy=dFdy(uv);dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);
 dx*=exp2(blur);dy*=exp2(blur);
 vec3 photo=texture2DGradEXT(veilClouds,uv,dx,dy).rgb;
 float edge=min(uv.x,1.-uv.x);
 if(edge<.035)photo=mix((photo+texture2DGradEXT(veilClouds,vec2(1.-uv.x,uv.y),vec2(-dx.x,dx.y),vec2(-dy.x,dy.y)).rgb)*.5,photo,smoothstep(0.,.035,edge));
 // The source carries the torn opening itself, preserving its natural cloud lip.
 vec3 radiance=photo*vec3(.45,.43,.51);
 float polar=smoothstep(.975,1.,abs(ray.y));
 radiance=mix(radiance,vec3(.006,.004,.011),polar);
 return mix(vec3(.004,.003,.009),radiance,smoothstep(-.75,-.15,d.y));
}
`;
