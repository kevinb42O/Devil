import {environmentClock} from './descent';
import {cathedralAt,CATHEDRAL_LIGHT_GLSL} from './cathedral-state';
import * as THREE from 'three';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {createDescentState,COSMIC_INTRO_DURATION} from './descent';
import {createMistState,mistAt,mistChapterName} from './mist-state';
import {cosmicNebulaField} from './cosmic-nebula-field';
import {descentDistance} from './descent-motion';
import {ARENA_DIMENSION,ARENA_TILES,TILE_SIZE,tileHeight} from './arena';
import {MistLightField} from './mist-light-field';

/** Descent atmosphere, depth-clipped and integrated before bloom and the overlay hand. */
export class OpeningMist extends ShaderPass {
  private reduced=false;
  private baseSteps=40;
  private allowed=true;
  private strength=1;
  private highQuality=true;
  private groundHeights=new Float32Array(ARENA_DIMENSION*ARENA_DIMENSION);
  private groundTexture=new THREE.DataTexture(this.groundHeights,ARENA_DIMENSION,ARENA_DIMENSION,THREE.RedFormat,THREE.FloatType);
  private groundTime=-1;
  private state=createMistState();
  private skyState=createDescentState();
  private lightField=new MistLightField();
  private volumeTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
  private composite=new ShaderPass({
    uniforms:{tDiffuse:{value:null},volume:{value:null},sceneDepth:{value:null},volumeSize:{value:new THREE.Vector2(1,1)},nearFar:{value:new THREE.Vector2(.05,180)},heatAmount:{value:0},heatClock:{value:0},heatRadius:{value:31},heatInverseProjection:{value:new THREE.Matrix4()},heatCameraWorld:{value:new THREE.Matrix4()}},
    vertexShader:`varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`uniform sampler2D tDiffuse,volume,sceneDepth;uniform vec2 volumeSize,nearFar;uniform float heatAmount,heatClock,heatRadius;uniform mat4 heatInverseProjection,heatCameraWorld;varying vec2 uvScreen;
      float eyeDepth(vec2 uv){float d=texture2D(sceneDepth,uv).r;return nearFar.x*nearFar.y/(nearFar.y-d*(nearFar.y-nearFar.x));}
      void main(){
        vec2 sceneUV=uvScreen;
        if(heatAmount>.001){
          float z=texture2D(sceneDepth,uvScreen).r;
          vec4 view=heatInverseProjection*vec4(uvScreen*2.-1.,z*2.-1.,1.);view/=view.w;
          vec3 world=(heatCameraWorld*view).xyz,camera=heatCameraWorld[3].xyz;
          float farMask=smoothstep(3.,22.,distance(world,camera));
          float rimMask=.45+.55*smoothstep(heatRadius-8.,heatRadius+8.,length(world.xz));
          float lowAir=1.-smoothstep(1.,12.,world.y);
          vec2 shimmer=vec2(sin(world.x*.65+world.z*.31-heatClock*2.7),sin(world.z*.53-world.x*.21-heatClock*3.1));
          vec2 offset=shimmer*.00165*heatAmount*farMask*rimMask*lowAir;
          // Depth rejection protects nearby enemies and the clear traversal surface.
          float sameSurface=1.-smoothstep(.001,.008,abs(texture2D(sceneDepth,uvScreen+offset).r-z));
          sceneUV+=offset*sameSurface;
        }
        vec4 surface=texture2D(tDiffuse,sceneUV);
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
      uniforms:{tDiffuse:{value:null},sceneDepth:{value:null},densityField:{value:noise},nebulaField:{value:cosmicNebulaField(data)},nebulaGround:{value:null},cosmicGroundAmount:{value:1},
        inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},
        mistTime:{value:0},strength:{value:1},sanctuary:{value:0},entrance:{value:0},cosmic:{value:0},cosmicTime:{value:0},cosmicFall:{value:0},cathedralClosure:{value:0},cathedralLight:{value:0},steps:{value:48},
        shape:{value:new THREE.Vector4(3.8,1.25,0,0)},style:{value:new THREE.Vector4()},ambient:{value:new THREE.Vector3(.11,.14,.17)},
        lightVolume:{value:null},litMedium:{value:0}},
      vertexShader:`out vec2 uvScreen;
        void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader:`precision highp sampler3D;
        uniform sampler2D tDiffuse,sceneDepth,nebulaGround;
        uniform sampler3D densityField,nebulaField,lightVolume;
        uniform mat4 inverseProjection,cameraWorld;
        uniform float mistTime,strength,sanctuary,entrance,litMedium,cosmic,cosmicTime,cosmicFall,cosmicGroundAmount,cathedralClosure,cathedralLight;
        ${CATHEDRAL_LIGHT_GLSL}
        uniform vec4 shape,style;
        uniform vec3 ambient;
        uniform int steps;
        in vec2 uvScreen;
        out vec4 mistColor;
        vec3 cosmicFloorCloud(vec3 p){
          vec2 tile=floor(p.xz/${TILE_SIZE.toFixed(8)}+25.5);
          if(any(lessThan(tile,vec2(0.)))||any(greaterThanEqual(tile,vec2(${ARENA_DIMENSION.toFixed(1)}))))return vec3(0.);
          float ground=texture(nebulaGround,(tile+.5)/${ARENA_DIMENSION.toFixed(1)}).r;
          float h=p.y-ground;
          if(ground<-20.||h<0.||h>10.)return vec3(0.);
          // Ground mist lives in tile-local height coordinates. Only the distant
          // nebula uses cosmicFall; applying it here lifts billows off the field.
          vec3 flow=vec3(p.x,h,p.z);
          flow.x+=sin(p.z*.17+cosmicTime*.12)*1.4;
          flow.z+=sin(p.x*.14+cosmicTime*.10)*1.1;
          float broad=texture(densityField,flow*vec3(.023,.045,.023)+vec3(.13,.41,.67)).r;
          float fine=texture(densityField,flow*vec3(.057,.10,.057)+vec3(.64,.12,.31)).r;
          float bank=pow(smoothstep(.34,.70,broad*.76+fine*.24),1.4);
          float crest=smoothstep(.53,.82,broad);
          // Broad overlapping banks surround the player and crest overhead.
          // A shared low layer keeps thinner pockets connected to the field.
          float center=3.+bank*1.6+crest*.8,thickness=2.8+bank*1.2;
          float layer=exp(-pow((h-center)/thickness,2.));
          layer*=smoothstep(0.,.18,h)*(1.-smoothstep(7.,10.,h));
          float palette=smoothstep(.25,.75,.5+.5*sin(p.x*.14+p.z*.10+broad*1.2));
          return vec3(layer*(.18+bank*.82),palette,fine);
        }
        vec3 cosmicGas(vec3 p){
          vec3 gas=p-vec3(0.,cosmicFall,0.);
          // World-space shear curls the banks without sliding noise across the screen.
          gas+=sin(gas.yzx*.045+vec3(.2,2.1,4.3))*4.;
          return gas;
        }
        float cosmicField(vec3 p,out vec3 samples){
          vec3 gas=cosmicGas(p);
          vec4 bank=texture(nebulaField,gas/256.+.5);
          float billow=bank.r,filament=bank.g,fine=steps>28?bank.a:bank.g;
          float structure=bank.r;
          float body=pow(smoothstep(.46,.70,structure),2.3)*2.1;
          // Eroded edges, dense knots, and narrow strands share the same 3D field.
          body=max(0.,body-(1.-fine)*.12);
          float threads=pow(max(0.,1.-abs(filament-.52)*7.),3.)*smoothstep(.42,.63,structure);
          float rising=(p.y+12.-cosmicFall)/18.;
          float arch=(p.y-17.-cosmicFall+p.x*.14+p.z*.06)/20.;
          float envelope=1.6*exp(-rising*rising)+.60*exp(-arch*arch);
          float radius=length(p.xz);
          float perimeter=exp(-pow((radius-52.)/24.,2.))*smoothstep(8.,30.,radius);
          float ribbonHeight=6.+cosmicFall+sin(p.x*.065+p.z*.035)*7.+(billow-.5)*12.;
          float ribbon=exp(-pow((p.y-ribbonHeight)/2.6,2.)-pow((radius-46.)/14.,2.));
          ribbon*=smoothstep(.40,.70,filament)*(.25+.75*fine)*.75;
          samples=vec3(structure,fine,bank.b);
          return (body+threads*.14)*envelope*perimeter+ribbon;
        }
        float field(vec3 p,out vec3 samples){
          samples=vec3(0.);
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
          float end=min(length(view.xyz),mix(65.,115.,cosmic));
          // Clip to a shallow slab before marching, including views from above/below.
          float dy=abs(direction.y)<.0001?(direction.y<0.?-.0001:.0001):direction.y;
          float a=(mix(-.35,-34.,cosmic)-origin.y)/dy,b=(mix(shape.x,58.,cosmic)-origin.y)/dy;
          float start=max(.12,min(a,b));end=min(end,max(a,b));
          if(end<=start){mistColor=vec4(0.,0.,0.,1.);return;}
          float stride=(end-start)/float(steps),transmission=1.;vec3 scatter=vec3(0.);
          float jitter=mix(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))),.5,cosmic);
          float forward=pow(max(dot(direction,normalize(vec3(-.4,.8,-.3))),0.),5.);
          vec3 skyScatter=ambient*(1.+forward*.95);
          // Static spatial stratification breaks up march bands without frame flicker.
          for(int i=0;i<48;i++){
            if(i>=steps)break;
            float distance=start+(float(i)+jitter)*stride;
            vec3 p=origin+direction*distance;
            float boundary=1.-smoothstep(mix(31.,76.,cosmic),mix(42.,112.,cosmic),length(p.xz));
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
            float nearClear=mix(1.,mix(.12,1.,smoothstep(3.,11.,distance)),shape.w);
            height=mix(height,1.-smoothstep(40.,58.,abs(p.y)),cosmic);
            // Fog remains present at the eye when walking into a bank.
            nearClear=mix(nearClear,1.,cosmic);
            vec3 nebulaSamples;
            float density=field(p,nebulaSamples)*height*boundary*strength*.16*nearClear;
            if(cosmic>.99999&&density<.00003)continue;
            if(entrance>.5&&sanctuary>.5){
             float room=(1.-smoothstep(6.2,8.5,abs(p.x)))*smoothstep(-13.,-9.,p.z)*(1.-smoothstep(10.,14.,p.z));
             float low=exp(-max(0.,p.y)*1.4);
             density*=room*(.65+low*2.0)*mix(.18,1.,smoothstep(1.,5.,distance));
            }
            float opacity=1.-exp(-density*stride);
            // Soft directional sky scatter and localized light from the entrance seal.
            vec3 light=skyScatter;
            if(cosmic>.001){
              float shadow=nebulaSamples.z;
              float palette=smoothstep(-35.,30.,p.x+sin(p.z*.04)*8.);
              vec3 gasTint=mix(vec3(.018,.32,.48),vec3(.37,.035,.28),palette);
              float silver=pow(1.-smoothstep(.42,.72,nebulaSamples.x),1.5);
              float forwardGlow=pow(max(0.,dot(direction,normalize(vec3(-.55,.30,-.78)))),5.);
              vec3 nebulaLight=vec3(.003,.005,.012)+gasTint*(.045+shadow*(.90+silver*3.));
              nebulaLight+=vec3(.045,.15,.19)*shadow*silver*forwardGlow;
              // A buried warm source catches the inner filaments, leaving cold cavities.
              vec3 coreDelta=(p-vec3(-27.,17.+cosmicTime*.25,-43.))*vec3(.045,.065,.045);
              float core=exp(-dot(coreDelta,coreDelta));
              nebulaLight+=vec3(.90,.28,.045)*core*(.16+.84*shadow);
              light=mix(light,nebulaLight,cosmic);
            }
            light+=vec3(.13,.027,.004)*style.x*smoke*exp(-altitude*.2);
            // Fixed shafts occupy the openings between the seven cathedral ribs.
            // Matching the sky azimuth keeps architecture and atmosphere coherent.
            if(style.y>.001){
            float shaft=cathedralShaft(p,cathedralClosure);
            light+=vec3(.24,.22,.34)*shaft*cathedralLight*smoothstep(.15,3.,altitude);
            }
            if(litMedium>.5){
              vec3 lightUV=vec3(p.x/128.+.5,p.y/24.,p.z/128.+.5);
              vec3 incident=texture(lightVolume,clamp(lightUV,vec3(0.),vec3(1.))).rgb;
              light+=incident*1.2;
            }
            if(entrance>.5){vec3 delta=p-vec3(0.,1.35,-7.);light=mix(vec3(.045,.042,.039),vec3(.025,.038,.060),sanctuary)+vec3(1.8,.52,.14)/(1.+dot(delta,delta)*.32);
              if(sanctuary>.5){float moonBeam=exp(-pow((p.x+p.y*.52+3.)/2.4,2.))*smoothstep(-4.,6.,p.z);light+=vec3(.035,.060,.10)*moonBeam;}}
            scatter+=transmission*opacity*light;
            transmission*=1.-opacity;
          }
          if(cosmic>.001&&cosmicGroundAmount>.001){
            // Integrate fixed world-space cells, including partial cells at the
            // eye and surface. Walking changes the optical path, never the density.
            vec3 ad=abs(direction);float originAxis=origin.z,rayAxis=direction.z;
            if(ad.x>ad.z&&ad.x>=ad.y){originAxis=origin.x;rayAxis=direction.x;}
            else if(ad.y>ad.z&&ad.y>ad.x){originAxis=origin.y;rayAxis=direction.y;}
            float cell=steps>28?.65:1.;
            float plane=rayAxis>0.?floor(originAxis/cell)+1.:ceil(originAxis/cell)-1.;
            float first=(plane*cell-originAxis)/rayAxis,spacing=cell/abs(rayAxis);
            float floorEnd=min(length(view.xyz),40.),floorTransmission=1.;vec3 floorScatter=vec3(0.);
            float segmentStart=0.;
            for(int j=0;j<64;j++){
              float segmentEnd=min(first+float(j)*spacing,floorEnd);
              float segmentLength=segmentEnd-segmentStart;
              if(segmentLength<=0.)break;
              float d=(segmentStart+segmentEnd)*.5;
              vec3 p=origin+direction*d;
              vec3 cloud=cosmicFloorCloud(p);
              float density=cloud.x*.11*cosmic*cosmicGroundAmount*(1.-smoothstep(28.,40.,d));
              float opacity=1.-exp(-density*segmentLength);
              segmentStart=segmentEnd;
              vec3 color=mix(vec3(.012,.25,.38),vec3(.23,.040,.33),cloud.y)*(.6+cloud.z*.35);
              floorScatter+=floorTransmission*opacity*color;
              floorTransmission*=1.-opacity;
            }
            scatter=floorScatter+scatter*floorTransmission;
            transmission*=floorTransmission;
          }
          mistColor=vec4(scatter,transmission);
        }`
    }));
    this.uniforms.lightVolume.value=this.lightField.texture;
    this.groundTexture.minFilter=this.groundTexture.magFilter=THREE.NearestFilter;this.groundTexture.generateMipmaps=false;
    this.uniforms.nebulaGround.value=this.groundTexture;
  }
  configure(quality:string,reduced:boolean,enabled=true){this.allowed=enabled;this.enabled=enabled&&this.strength>.001;if(!enabled)this.uniforms.litMedium.value=0;this.reduced=reduced;this.highQuality=quality==='high';this.baseSteps=this.highQuality?40:20;this.uniforms.steps.value=this.baseSteps;}
  setSanctuary(enabled:boolean){this.uniforms.sanctuary.value=enabled?1:0;}
  update(camera:THREE.PerspectiveCamera,time:number,entrance=false){
    this.uniforms.sanctuary.value=0;
    const s=mistAt(entrance?COSMIC_INTRO_DURATION:time,this.reduced,this.state,this.skyState);
    this.strength=entrance?1:s.density/.16;
    this.enabled=this.allowed&&this.strength>.001;
    this.uniforms.strength.value=this.strength;
    this.uniforms.entrance.value=entrance?1:0;
    this.uniforms.mistTime.value=this.reduced?0:entrance?Math.max(0,time):s.environmentTime;
    const cosmic=entrance?0:s.cosmic;
    this.uniforms.steps.value=cosmic>.001?(this.highQuality?48:28):this.baseSteps;
    this.uniforms.cosmic.value=cosmic;
    if(cosmic>.001&&this.groundTime!==s.time){
      this.groundHeights.fill(-1000);
      for(const tile of ARENA_TILES)this.groundHeights[tile.z*ARENA_DIMENSION+tile.x]=tileHeight(tile.x,tile.z,s.time);
      this.groundTexture.needsUpdate=true;this.groundTime=s.time;
    }
    this.uniforms.cosmicFall.value=this.reduced||entrance?0:descentDistance(Math.min(30,environmentClock(s.time)));
    this.uniforms.cosmicTime.value=this.reduced||entrance?0:Math.min(30,environmentClock(s.time));
    this.uniforms.shape.value.set(s.height,s.falloff,s.bank,s.clear);
    const cathedral=cathedralAt(entrance?0:time);
    this.uniforms.cathedralClosure.value=cathedral.closure;this.uniforms.cathedralLight.value=cathedral.light;
    this.uniforms.style.value.set(s.smoke,s.shafts,s.pulse,0);
    this.uniforms.ambient.value.fromArray(s.color);
    this.uniforms.litMedium.value=0;
    this.composite.uniforms.nearFar.value.set(camera.near,camera.far);
    this.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    camera.updateWorldMatrix(true,false);this.uniforms.cameraWorld.value.copy(camera.matrixWorld);
  }
  setHeat(amount:number,time:number,radius:number){
    this.composite.uniforms.heatAmount.value=this.reduced?0:amount;
    this.composite.uniforms.heatClock.value=Math.max(0,environmentClock(time)-236);
    this.composite.uniforms.heatRadius.value=radius;
    this.composite.uniforms.heatInverseProjection.value.copy(this.uniforms.inverseProjection.value);
    this.composite.uniforms.heatCameraWorld.value.copy(this.uniforms.cameraWorld.value);
  }
  updateLights(camera:THREE.Camera,enemies:THREE.InstancedMesh,shots:THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>){
    if(!this.enabled){this.uniforms.litMedium.value=0;return;}
    this.lightField.update(camera,enemies,shots);this.uniforms.litMedium.value=this.lightField.count?1:0;
  }
  get diagnostics(){return {enabled:this.enabled,strength:this.strength,steps:this.uniforms.steps.value,time:this.uniforms.mistTime.value,entrance:!!this.uniforms.entrance.value,
    heat:this.composite.uniforms.heatAmount.value,cosmic:this.state.cosmic,environmentTime:this.state.environmentTime,volumeSize:[this.volumeTarget.width,this.volumeTarget.height],chapter:mistChapterName(this.state),blend:this.state.blend,density:this.state.density,height:this.state.height,bank:this.state.bank,smoke:this.state.smoke,shafts:this.state.shafts,
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
  override dispose(){this.volumeTarget.dispose();this.composite.dispose();this.lightField.dispose();this.groundTexture.dispose();this.uniforms.densityField.value.dispose();this.uniforms.nebulaField.value.dispose();super.dispose();}
}
