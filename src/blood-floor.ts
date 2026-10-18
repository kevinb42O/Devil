import * as THREE from 'three';
import {BLOOD_WEATHER_GLSL} from './blood-weather';
import {BLOOD_SPAN} from './blood';

/** Wet blood is composed after the arena effects and before output conversion / fog. */
export function attachBloodFloor(floor:THREE.MeshBasicMaterial,texture:THREE.Texture,size:number,time:{value:number}){
 const uniforms={
  bloodField:{value:texture},bloodTime:time,bloodRain:{value:0},bloodHeatTransmission:{value:1},
  bloodKeyDirection:{value:new THREE.Vector3(-.35,.85,.3)},bloodKeyColor:{value:new THREE.Color(.5,.5,.5)},
  bloodSky:{value:new THREE.Texture()},bloodStorm:{value:new THREE.Texture()},
  bloodReflectionReady:{value:0},bloodCosmic:{value:0},
 };
 const previous=floor.onBeforeCompile,key=floor.customProgramCacheKey();
 floor.onBeforeCompile=(shader,renderer)=>{
  previous.call(floor,shader,renderer);Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float bloodTop;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nbloodTop=normal.y;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform sampler2D bloodField,bloodSky,bloodStorm;
   uniform float bloodTime,bloodReflectionReady,bloodCosmic,bloodRain,bloodHeatTransmission;
   uniform vec3 bloodKeyDirection,bloodKeyColor;
   varying float bloodTop;
   ${BLOOD_WEATHER_GLSL}
   float bloodLanding(vec4 sampleValue){return (sampleValue.g*255.+sampleValue.b*65280.)*.25;}
   vec4 bloodWetSample(vec2 uv){
    vec4 value=texture2D(bloodField,uv);if(value.r<.001)return value;
    float retention=bloodWash(bloodLanding(value),bloodTime,.065);
    value.r*=retention;value.a*=pow(retention,1.5);return value;
   }
  `).replace('#include <tonemapping_fragment>',`
   if(bloodTop>.65){
    // Decode packed timestamps before filtering; packed byte carries cannot be interpolated.
    vec2 grid=(gemFloorPosition.xz/${BLOOD_SPAN.toFixed(6)}+.5)*${size.toFixed(1)}-.5;
    vec2 cell=floor(grid),f=fract(grid),stepUV=vec2(${(1/size).toFixed(10)});
    vec2 uv=(cell+.5)*stepUV;
    vec4 a=bloodWetSample(uv),b=bloodWetSample(uv+vec2(stepUV.x,0.));
    vec4 c=bloodWetSample(uv+vec2(0.,stepUV.y)),d=bloodWetSample(uv+stepUV);
    vec4 sampleBlood=mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
    float coverage=smoothstep(.09,.67,sampleBlood.r);
    if(coverage>.001){
     float weight=mix(mix(a.r,b.r,f.x),mix(c.r,d.r,f.x),f.y);
     float landed=mix(mix(bloodLanding(a)*a.r,bloodLanding(b)*b.r,f.x),mix(bloodLanding(c)*c.r,bloodLanding(d)*d.r,f.x),f.y)/max(weight,.00001);
     float age=max(0.,bloodTime-landed),fresh=max(exp(-age*.012),bloodRain*.85);
     float depth=sampleBlood.a;
     // A shallow raised meniscus supplies curved edge normals; pools have calm interiors.
     // Interpolate central differences, not cell slopes: highlight normals stay
     // continuous across texels instead of breaking into a visible square grid.
     float leftA=bloodWetSample(uv-vec2(stepUV.x,0.)).a;
     float leftC=bloodWetSample(uv+vec2(-stepUV.x,stepUV.y)).a;
     float rightB=bloodWetSample(uv+vec2(stepUV.x*2.,0.)).a;
     float rightD=bloodWetSample(uv+vec2(stepUV.x*2.,stepUV.y)).a;
     float belowA=bloodWetSample(uv-vec2(0.,stepUV.y)).a;
     float belowB=bloodWetSample(uv+vec2(stepUV.x,-stepUV.y)).a;
     float aboveC=bloodWetSample(uv+vec2(0.,stepUV.y*2.)).a;
     float aboveD=bloodWetSample(uv+vec2(stepUV.x,stepUV.y*2.)).a;
     vec2 slope=vec2(
      mix(mix(b.a-leftA,rightB-a.a,f.x),mix(d.a-leftC,rightD-c.a,f.x),f.y),
      mix(mix(c.a-belowA,d.a-belowB,f.x),mix(aboveC-a.a,aboveD-b.a,f.x),f.y))*.5;
     float ripple=exp(-age*5.)*.008;
     vec2 capillary=vec2(sin(gemFloorPosition.x*33.+gemFloorPosition.z*17.-age*22.),cos(gemFloorPosition.z*29.-age*19.))*ripple;
     vec3 n=normalize(vec3(-slope.x*.85+capillary.x,1.,-slope.y*.85+capillary.y));
     vec3 eye=normalize(cameraPosition-gemFloorPosition),ref=reflect(-eye,n);
     float ndv=max(.001,dot(n,eye)),fresnel=.022+.978*pow(1.-ndv,5.);
     float roughness=mix(.65,.15,fresh)*mix(1.25,.82,depth);
     vec3 h=normalize(bloodKeyDirection+eye);
     float gloss=pow(max(dot(n,h),0.),mix(12.,240.,1.-roughness));
     vec3 reflection=mix(vec3(.025,.032,.045),vec3(.09,.12,.18),smoothstep(0.,.8,ref.y));
     if(bloodReflectionReady>.5){
      vec2 skyUV=vec2(fract(atan(ref.z,ref.x)*.159154943+.5),asin(clamp(ref.y,-1.,1.))*.318309886+.5);
      reflection=mix(texture2D(bloodStorm,skyUV,2.5).rgb,texture2D(bloodSky,skyUV,2.5).rgb,bloodCosmic);
     }
     vec3 thin=mix(vec3(.022,.0007,.0012),vec3(.13,.0025,.004),fresh);
     vec3 thick=mix(vec3(.008,.0004,.0006),vec3(.038,.0007,.0015),fresh);
     vec3 body=mix(thin,thick,smoothstep(.06,.7,depth));
     // Retain local lighting without letting bright mineral patterns show through deep blood.
     float illumination=.8+clamp(dot(bloodKeyColor,vec3(.2126,.7152,.0722)),0.,2.)*.25;
     body*=illumination;
     vec3 wet=reflection*(.14+fresnel*.85)*fresh*1.5;
     wet+=bloodKeyColor*(gloss*.3+pow(max(dot(n,h),0.),24.)*.018)*fresh;
     vec3 transmitted=vec3(0.);
     #ifdef BLOOD_FURNACE_TRANSMISSION
      // Preserve the exact molten fissures beneath the liquid. Dense blood filters
      // their light toward red; thin edges transmit the brighter orange cores.
      transmitted=bloodHeatTransmission*furnaceBloodRadiance*exp(-vec3(.55,.9,1.7)*depth);
     #endif
     gl_FragColor.rgb=mix(gl_FragColor.rgb,body+wet+transmitted,coverage);
    }
   }
   #include <tonemapping_fragment>`);
 };
 floor.customProgramCacheKey=()=>key+'-blood-liquid-floor-v3-weather';
 return uniforms;
}
