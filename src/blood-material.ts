import * as THREE from 'three';

/** Closed liquid surfaces with scene lighting, clearcoat and volumetric silhouettes. */
export function bloodMaterial(strands=false,fill={value:new THREE.Color(.32,.2,.18)}){
 const material=new THREE.MeshPhysicalMaterial({
  color:0xcd1824,emissive:0x380103,emissiveIntensity:.18,roughness:.18,metalness:0,clearcoat:1,clearcoatRoughness:.12,
  transparent:true,depthWrite:false,side:THREE.FrontSide,
 });
 material.onBeforeCompile=shader=>{
  shader.uniforms.bloodAirFill=fill;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   attribute vec4 liquid;
   varying vec4 bloodState;
   varying vec2 bloodUv;
   vec3 liquidSurface(vec2 coord){
    float y=coord.y*2.-1.;
    float seed=liquid.y;
    float theta=coord.x*6.28318530718;
    float envelope=sqrt(max(0.,1.-y*y));
    float radius=envelope*(.77+.23*y);
    vec2 bend=vec2(0.);
    ${strands?`
    float breakup=smoothstep(.04,.23,liquid.x);
    float wave=.5+.5*sin(y*(12.+seed*5.)+seed*37.);
    float neck=mix(.38,.035+.42*wave*wave,breakup);
    float head=.68*exp(-pow((y-.52)*3.5,2.));
    radius=envelope*max(head,neck);
    bend=vec2(sin(y*3.8+seed*17.),cos(y*4.7+seed*23.))*.14*(1.-y*y);
    radius*=1.+.12*sin(theta*3.+y*11.+seed*21.);
    `:``}
    return vec3(cos(theta)*radius*.5+bend.x,y*.5,sin(theta)*radius*.5+bend.y);
   }
  `).replace('#include <beginnormal_vertex>',`
   vec2 coord=vec2(uv.x,clamp(uv.y,.001,.999));
   vec3 du=liquidSurface(coord+vec2(.001,0.))-liquidSurface(coord-vec2(.001,0.));
   vec3 dv=liquidSurface(coord+vec2(0.,.0005))-liquidSurface(coord-vec2(0.,.0005));
   vec3 objectNormal=normalize(cross(dv,du));
  `).replace('#include <begin_vertex>',`
   bloodState=liquid;bloodUv=uv;
   vec3 transformed=liquidSurface(uv);
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform vec3 bloodAirFill;
   varying vec4 bloodState;
   varying vec2 bloodUv;
  `).replace('#include <color_fragment>',`#include <color_fragment>
   // Dense cores absorb more light; small beads and thin necks transmit more red.
   float thickness=sin(bloodUv.y*3.14159265);
   diffuseColor.rgb*=mix(.72,1.24,bloodState.y)*(1.-.22*thickness);
   diffuseColor.a*=bloodState.z;
   ${strands?`
   float wave=.5+.5*sin((bloodUv.y*2.-1.)*(12.+bloodState.y*5.)+bloodState.y*37.);
   float separation=smoothstep(.12,.24,bloodState.x);
   float head=exp(-pow(((bloodUv.y*2.-1.)-.52)*3.5,2.));
   diffuseColor.a*=1.-separation*(1.-smoothstep(.04,.22,wave))* (1.-head);
   `:``}
   if(diffuseColor.a<.02)discard;
  `).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
   // Broad fill keeps the saturated liquid body readable between sharp reflections.
   // Add diffuse illumination, so normals still shape the blood instead of glowing flat.
   vec3 bloodUp=normalize(mat3(viewMatrix)*vec3(0.,1.,0.));
   float bloodWrap=.62+.38*max(dot(normal,bloodUp),0.);
   reflectedLight.indirectDiffuse+=diffuseColor.rgb*bloodAirFill*bloodWrap;
  `);
 };
 material.customProgramCacheKey=()=>`blood-liquid-volume-v3-lit-${strands}`;
 return material;
}
