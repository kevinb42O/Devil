import * as THREE from 'three';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {createDescentState,COSMIC_INTRO_DURATION} from './descent';
import {createMistState,mistAt,mistChapterName} from './mist-state';
import {MistLightField} from './mist-light-field';

/** Descent atmosphere, depth-clipped and integrated before bloom and the overlay hand. */
export class OpeningMist extends ShaderPass {
  private reduced=false;
  private baseSteps=40;
  private allowed=true;
  private strength=1;
  private state=createMistState();
  private skyState=createDescentState();
  private lightField=new MistLightField();
  private volumeTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
  private composite=new ShaderPass({
    uniforms:{tDiffuse:{value:null},volume:{value:null},sceneDepth:{value:null},volumeSize:{value:new THREE.Vector2(1,1)},nearFar:{value:new THREE.Vector2(.05,180)}},
    vertexShader:`varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`uniform sampler2D tDiffuse,volume,sceneDepth;uniform vec2 volumeSize,nearFar;varying vec2 uvScreen;
      float eyeDepth(vec2 uv){float d=texture2D(sceneDepth,uv).r;return nearFar.x*nearFar.y/(nearFar.y-d*(nearFar.y-nearFar.x));}
      void main(){
        vec4 surface=texture2D(tDiffuse,uvScreen);
        float depth=eyeDepth(uvScreen);vec2 grid=uvScreen*volumeSize-.5,base=floor(grid),f=fract(grid);
        vec4 fog=vec4(0.),weights=vec4(0.),errors=vec4(0.);float total=0.,closest=1.e20;
        // Bilateral reconstruction keeps background fog off foreground silhouettes.
        for(int y=0;y<2;y++)for(int x=0;x<2;x++){
          vec2 offset=vec2(float(x),float(y)),uv=(base+offset+.5)/volumeSize;
          vec2 bilinear=mix(vec2(1.)-f,f,offset);
          int tap=y*2+x;
          weights[tap]=bilinear.x*bilinear.y;
          errors[tap]=abs(eyeDepth(uv)-depth)*2./max(1.,depth*.035);
          if(weights[tap]>0.)closest=min(closest,errors[tap]);
        }
        // Relative depth errors preserve the same bilateral ratios without
        // underflow or a hard no-mist cutoff on steep, distant ground.
        for(int y=0;y<2;y++)for(int x=0;x<2;x++){
          int tap=y*2+x;vec2 uv=(base+vec2(float(x),float(y))+.5)/volumeSize;
          float weight=weights[tap]*exp(-max(0.,errors[tap]-closest));
          fog+=texture2D(volume,uv)*weight;total+=weight;
        }
        fog/=total;
        gl_FragColor=vec4(surface.rgb*fog.a+fog.rgb,surface.a);
      }`
  });
  constructor(){
    // A small, deterministic 3D field gives continuous density in world space.
    const size=32,data=new Uint8Array(size**3);let seed=173;
    for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed>>>24;}
    const noise=new THREE.Data3DTexture(data,size,size,size);
    noise.format=THREE.RedFormat;noise.minFilter=noise.magFilter=THREE.LinearFilter;
    noise.wrapS=noise.wrapT=noise.wrapR=THREE.RepeatWrapping;noise.unpackAlignment=1;noise.needsUpdate=true;
    super(new THREE.ShaderMaterial({
      name:'Descent volumetric atmosphere',depthTest:false,depthWrite:false,
      glslVersion:THREE.GLSL3,
      uniforms:{tDiffuse:{value:null},sceneDepth:{value:null},densityField:{value:noise},
        inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},
        mistTime:{value:0},strength:{value:1},entrance:{value:0},cosmic:{value:0},cosmicTime:{value:0},steps:{value:48},
        shape:{value:new THREE.Vector4(3.8,1.25,0,0)},style:{value:new THREE.Vector4()},ambient:{value:new THREE.Vector3(.11,.14,.17)},
        lightVolume:{value:null},litMedium:{value:0}},
      vertexShader:`out vec2 uvScreen;
        void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader:`precision highp sampler3D;
        uniform sampler2D tDiffuse,sceneDepth;
        uniform sampler3D densityField,lightVolume;
        uniform mat4 inverseProjection,cameraWorld;
        uniform float mistTime,strength,entrance,litMedium,cosmic,cosmicTime;
        uniform vec4 shape,style;
        uniform vec3 ambient;
        uniform int steps;
        in vec2 uvScreen;
        out vec4 mistColor;
        float cosmicField(vec3 p,out vec2 samples){
          // Texture coordinates account for the 32^3 noise lattice: these are
          // banks tens of metres wide, rather than sub-metre noise haze.
          vec3 gas=p-vec3(0.,cosmicTime*1.25,0.);
          float billow=texture(densityField,gas*.0018+vec3(.31,.13,.57)).r;
          float filament=texture(densityField,gas*.006+vec3(.6,.2,.1)).r;
          samples=vec2(billow,filament);
          float nebula=smoothstep(.44,.68,billow*.72+filament*.28);
          float sheet=(p.y+14.-cosmicTime*1.35)/9.;
          return nebula*(.15+1.7*exp(-sheet*sheet));
        }
        float field(vec3 p,out vec2 samples){
          samples=vec2(0.);
          if(cosmic>.99999)return cosmicField(p,samples);
          vec3 drift=vec3(mistTime*.0025,cosmicTime*.006,mistTime*.0012);
          vec3 q=p;
          // Furnace smoke rises while ground banks and veil pockets drift sideways.
          q.y-=mistTime*.25*style.x;
          q.x+=sin(p.z*.09+mistTime*.035)*shape.z*2.;
          float broad=texture(densityField,q*.012-drift).r;
          float detail=texture(densityField,p*.046+drift*.6).r;
          float wisps=smoothstep(.38,.67,broad*.76+detail*.24);
          if(shape.z>.001){
            float lane=.5+.5*sin(p.x*.12+p.z*.055-mistTime*.07+broad*4.);
            float banks=mix(.25,1.85,smoothstep(.32,.8,lane))*style.z;
            wisps*=mix(1.,banks,shape.z);
          }
          if(cosmic>.001)wisps=mix(wisps,cosmicField(p,samples),cosmic);
          return wisps;
        }
        void main(){
          float z=texture(sceneDepth,uvScreen).r;
          vec4 view=inverseProjection*vec4(uvScreen*2.-1.,z*2.-1.,1.);
          view/=view.w;
          vec3 origin=cameraWorld[3].xyz;
          vec3 direction=normalize(mat3(cameraWorld)*view.xyz);
          float end=min(length(view.xyz),65.);
          // Clip to a shallow slab before marching, including views from above/below.
          float dy=abs(direction.y)<.0001?(direction.y<0.?-.0001:.0001):direction.y;
          float a=(mix(-.35,-34.,cosmic)-origin.y)/dy,b=(shape.x-origin.y)/dy;
          float start=max(.12,min(a,b));end=min(end,max(a,b));
          if(end<=start){mistColor=vec4(0.,0.,0.,1.);return;}
          float stride=(end-start)/float(steps),transmission=1.;vec3 scatter=vec3(0.);
          float jitter=mix(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))),.5,cosmic);
          float forward=pow(max(dot(direction,normalize(vec3(-.4,.8,-.3))),0.),5.);
          vec3 skyScatter=ambient*(1.+forward*.95);
          // Static spatial stratification breaks up march bands without frame flicker.
          for(int i=0;i<48;i++){
            if(i>=steps)break;
            vec3 p=origin+direction*(start+(float(i)+jitter)*stride);
            float boundary=1.-smoothstep(mix(31.,42.,cosmic),mix(42.,64.,cosmic),length(p.xz));
            if(entrance>.5)boundary=(1.-smoothstep(5.,7.,abs(p.x)))*(1.-smoothstep(7.,10.,abs(p.z+3.)));
            float altitude=max(p.y,0.);
            float height=exp(-altitude*shape.y)*(1.-smoothstep(shape.x*.65,shape.x,p.y));
            // Narrow rising columns collect around the perimeter in the Furnace.
            float smoke=0.;
            if(style.x>.001){
              float perimeter=smoothstep(14.,30.,length(p.xz));
              float plume=texture(densityField,vec3(p.x*.028,p.y*.008-mistTime*.002,p.z*.028)).r;
              smoke=smoothstep(.48,.70,plume)*perimeter;
              height=mix(height,height*.55+smoke*exp(-altitude*.13),style.x);
            }
            float distance=start+(float(i)+jitter)*stride;
            float nearClear=mix(1.,mix(.12,1.,smoothstep(3.,11.,distance)),shape.w);
            height=mix(height,1.-smoothstep(20.,34.,abs(p.y)),cosmic);
            nearClear=mix(nearClear,smoothstep(4.,15.,distance),cosmic);
            vec2 nebulaSamples;
            float density=field(p,nebulaSamples)*height*boundary*strength*.16*nearClear;
            float opacity=1.-exp(-density*stride);
            // Soft directional sky scatter and localized light from the entrance seal.
            vec3 light=skyScatter;
            if(cosmic>.001){
              float tint=nebulaSamples.x*.75+nebulaSamples.y*.25;
              vec3 nebulaLight=mix(vec3(.028,.065,.085),vec3(.095,.038,.085),smoothstep(.25,.72,tint));
              // Lit gas edges and dark cavities; broad variation, no flashing.
              float edge=nebulaSamples.x;
              nebulaLight*=.5+1.25*smoothstep(.45,.7,edge);
              light=mix(light,nebulaLight,cosmic);
            }
            light+=vec3(.13,.027,.004)*style.x*smoke*exp(-altitude*.2);
            // Fixed shafts occupy the openings between the seven cathedral ribs.
            // Matching the sky azimuth keeps architecture and atmosphere coherent.
            if(style.y>.001){
            vec2 shaftXZ=p.xz+vec2(-.22,.12)*altitude;
            float az=atan(shaftXZ.y,shaftXZ.x);
            float aperture=pow(abs(sin(az*7.+.32)),14.);
            float shaft=aperture*smoothstep(9.,17.,length(shaftXZ))*(1.-smoothstep(34.,44.,length(shaftXZ)));
            light+=vec3(.13,.105,.19)*shaft*style.y*smoothstep(.5,5.,altitude);
            }
            if(litMedium>.5){
              vec3 lightUV=vec3(p.x/128.+.5,p.y/24.,p.z/128.+.5);
              vec3 incident=texture(lightVolume,clamp(lightUV,vec3(0.),vec3(1.))).rgb;
              light+=incident*1.2;
            }
            if(entrance>.5){vec3 delta=p-vec3(0.,1.35,-7.);light=vec3(.045,.042,.039)+vec3(1.8,.52,.14)/(1.+dot(delta,delta)*.32);}
            scatter+=transmission*opacity*light;
            transmission*=1.-opacity;
          }
          mistColor=vec4(scatter,transmission);
        }`
    }));
    this.uniforms.lightVolume.value=this.lightField.texture;
  }
  configure(quality:string,reduced:boolean,enabled=true){this.allowed=enabled;this.enabled=enabled&&this.strength>.001;if(!enabled)this.uniforms.litMedium.value=0;this.reduced=reduced;this.baseSteps=quality==='high'?40:20;this.uniforms.steps.value=this.baseSteps;}
  update(camera:THREE.PerspectiveCamera,time:number,entrance=false){
    const s=mistAt(entrance?COSMIC_INTRO_DURATION:time,this.reduced,this.state,this.skyState);
    this.strength=entrance?1:s.density/.16;
    this.enabled=this.allowed&&this.strength>.001;
    this.uniforms.strength.value=this.strength;
    this.uniforms.entrance.value=entrance?1:0;
    this.uniforms.mistTime.value=this.reduced?0:entrance?Math.max(0,time):s.environmentTime;
    const cosmic=entrance?0:s.cosmic;
    this.uniforms.steps.value=this.baseSteps;
    this.uniforms.cosmic.value=cosmic;
    this.uniforms.cosmicTime.value=this.reduced||entrance?0:Math.min(30,s.time);
    this.uniforms.shape.value.set(s.height,s.falloff,s.bank,s.clear);
    this.uniforms.style.value.set(s.smoke,s.shafts,s.pulse,0);
    this.uniforms.ambient.value.fromArray(s.color);
    this.uniforms.litMedium.value=0;
    this.composite.uniforms.nearFar.value.set(camera.near,camera.far);
    this.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    camera.updateWorldMatrix(true,false);this.uniforms.cameraWorld.value.copy(camera.matrixWorld);
  }
  updateLights(camera:THREE.Camera,enemies:THREE.InstancedMesh,shots:THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>){
    if(!this.enabled){this.uniforms.litMedium.value=0;return;}
    this.lightField.update(camera,enemies,shots);this.uniforms.litMedium.value=this.lightField.count?1:0;
  }
  get diagnostics(){return {enabled:this.enabled,strength:this.strength,steps:this.uniforms.steps.value,time:this.uniforms.mistTime.value,entrance:!!this.uniforms.entrance.value,
    cosmic:this.state.cosmic,environmentTime:this.state.environmentTime,volumeSize:[this.volumeTarget.width,this.volumeTarget.height],chapter:mistChapterName(this.state),blend:this.state.blend,density:this.state.density,height:this.state.height,bank:this.state.bank,smoke:this.state.smoke,shafts:this.state.shafts,
    color:[...this.state.color],pulse:this.state.pulse,lights:this.uniforms.litMedium.value?this.lightField.count:0};}
  override setSize(width:number,height:number){
    const w=Math.max(1,Math.ceil(width/4)),h=Math.max(1,Math.ceil(height/4));
    this.volumeTarget.setSize(w,h);this.composite.uniforms.volumeSize.value.set(w,h);
  }
  override render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget,dt:number,mask:boolean){
    this.uniforms.sceneDepth.value=read.depthTexture;
    const screen=this.renderToScreen;this.renderToScreen=false;
    super.render(renderer,this.volumeTarget,read,dt,mask);this.renderToScreen=screen;
    this.composite.uniforms.volume.value=this.volumeTarget.texture;
    this.composite.uniforms.sceneDepth.value=read.depthTexture;
    this.composite.renderToScreen=screen;this.composite.render(renderer,write,read,dt,mask);
  }
  override dispose(){this.volumeTarget.dispose();this.composite.dispose();this.lightField.dispose();this.uniforms.densityField.value.dispose();super.dispose();}
}
