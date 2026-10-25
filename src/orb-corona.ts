import * as THREE from 'three';
/** A thin, red atmospheric limb follows the whole sphere, preserving its dark
 * center. One surface pass; no sprite, scene light or fullscreen overlay. */
export function createOrbCorona(time:{value:number}){
 const material=new THREE.ShaderMaterial({name:'orb-corona',uniforms:{orbTime:time},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  vertexShader:`varying vec3 orbNormal,orbEye,orbDirection;void main(){vec4 p=modelViewMatrix*vec4(position,1.);orbNormal=normalize(normalMatrix*normal);orbEye=-p.xyz;orbDirection=normalize(position);gl_Position=projectionMatrix*p;}`,
  fragmentShader:`uniform float orbTime;varying vec3 orbNormal,orbEye,orbDirection;
   void main(){
    float grazing=1.-abs(dot(normalize(orbNormal),normalize(orbEye)));
    float limb=pow(grazing,5.);
    vec3 p=normalize(orbDirection);
    float eddies=.65+.35*sin(p.y*29.+p.x*17.+sin(p.z*23.-orbTime*.7)*1.4);
    float breath=.82+.18*sin(orbTime*1.1);
    gl_FragColor=vec4(vec3(.95,.012,.003),limb*eddies*breath*.17);
   }`});
 material.userData.enemySurface={kind:'orb',role:'halo',description:'Atmospheric red corona around the colossal Orb.'};
 return material;
}
