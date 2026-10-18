import * as THREE from 'three';
import {DAGGER_PRESENTATION,PROJECTILE_HAND_CLEARANCE,PROJECTILE_TRAIL_OFFSET} from './weapon-tuning';

/** Short camera-facing ribbons projected from world-space endpoints, so
 * strafing changes perspective without changing their actual flight axis. */
export function projectileTrail(quad:THREE.InstancedBufferGeometry){
 const geometry=new THREE.InstancedBufferGeometry();
 geometry.index=quad.index;geometry.setAttribute('position',quad.attributes.position);geometry.setAttribute('uv',quad.attributes.uv);
 geometry.instanceCount=0;
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  uniforms:{viewportHeight:{value:720}},
  vertexShader:`attribute vec3 shotCenter,shotColor,shotTravel;attribute float shotPellet;
   uniform float viewportHeight;varying vec2 trailUV;varying vec3 trailColor;varying float trailFade;
   void main(){
    trailUV=uv;trailColor=shotColor;
    vec4 center=modelViewMatrix*vec4(shotCenter,1.);
    vec3 travel=mat3(modelViewMatrix)*shotTravel;
    float distance=length(center.xyz),travelLength=length(travel);
    vec3 direction=travel/max(travelLength,.0001);
    float offset=${PROJECTILE_TRAIL_OFFSET.toFixed(4)}*mix(1.,${DAGGER_PRESENTATION.shotgunScale.toFixed(4)},shotPellet);
    vec4 head=projectionMatrix*vec4(center.xyz-direction*offset,1.);
    vec4 tail=projectionMatrix*vec4(center.xyz-direction*(travelLength+offset),1.);
    float aspect=projectionMatrix[1][1]/projectionMatrix[0][0];
    vec2 viewport=vec2(viewportHeight*aspect,viewportHeight);
    vec2 axis=(head.xy/max(head.w,.01)-tail.xy/max(tail.w,.01))*viewport;
    float projectedLength=length(axis);
    vec2 side=vec2(-axis.y,axis.x)/max(projectedLength,.001);
    float width=clamp(mix(.095,.11,shotPellet)*projectionMatrix[1][1]*viewportHeight/(2.*max(-center.z,.1)),1.4,12.);
    vec4 clip=mix(head,tail,uv.x);
    clip.xy+=side*(uv.y-.5)*width*sqrt(max(.015,1.-uv.x))*2./viewport*clip.w;
    trailFade=smoothstep(${PROJECTILE_HAND_CLEARANCE.toFixed(2)},${(PROJECTILE_HAND_CLEARANCE+.55).toFixed(2)},distance)
      *smoothstep(.001,.05,travelLength)*smoothstep(.5,4.,projectedLength);
    if(center.z>-.1||head.w<=0.||tail.w<=0.)trailFade=0.;
    gl_Position=clip;
   }`,
  fragmentShader:`varying vec2 trailUV;varying vec3 trailColor;varying float trailFade;
   void main(){
    float across=abs(trailUV.y-.5)*2.;
    float soft=exp(-across*across*5.)*(1.-smoothstep(.75,1.,across));
    float thread=exp(-across*across*55.);
    float life=pow(1.-trailUV.x,1.7)*smoothstep(0.,.08,trailUV.x);
    vec3 hot=mix(trailColor,vec3(1.,.94,.82),.35);
    gl_FragColor=vec4((trailColor*soft*.38+hot*thread*.42)*life*trailFade,1.);
   }`,
 });
 const mesh=new THREE.Mesh(geometry,material);mesh.name='projectile-trail-batch';mesh.frustumCulled=false;
 return mesh;
}
