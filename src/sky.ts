import * as THREE from 'three';
import {createDescentState,descentAt,DESCENT_CHAPTERS,type SkyMotion} from './descent';

/** Distant atmosphere follows camera translation, while its landmarks stay fixed in the world. */
export class AbyssSky {
  readonly mesh:THREE.Mesh;
  private time={value:0};
  private state=createDescentState();
  private uniforms={
    time:this.time,menu:{value:1},octaves:{value:3},detail:{value:1},zenith:{value:new THREE.Vector3()},haze:{value:new THREE.Vector3()},cloudTint:{value:new THREE.Vector3()},
    coverage:{value:0},daylight:{value:0},opening:{value:0},furnace:{value:0},cathedral:{value:0},crown:{value:0},travel:{value:0},furnaceHeight:{value:0},cathedralRise:{value:0},
  };
  private motion:SkyMotion='full';
  get diagnostics(){return {time:this.state.time,chapter:DESCENT_CHAPTERS[this.state.chapter].name,blend:this.state.blend,menu:this.uniforms.menu.value===1,motion:this.motion,octaves:this.uniforms.octaves.value,travel:this.uniforms.travel.value};}
  configure(quality:string,motion:SkyMotion='full'){this.uniforms.octaves.value=quality==='low'?2:3;this.motion=motion;}
  constructor(){
    const material=new THREE.ShaderMaterial({
      uniforms:this.uniforms,side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false,
      vertexShader:`varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}`,
      fragmentShader:`
        uniform float time,menu,octaves,detail,coverage,daylight,opening,furnace,cathedral,crown,travel,furnaceHeight,cathedralRise;
        uniform vec3 zenith,haze,cloudTint;varying vec3 skyDirection;
        float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
        float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        float cloud(vec3 p){float n=0.;float a=.5;for(int i=0;i<3;i++){if(float(i)>=octaves)break;if(i==2){if(detail<.001)break;a*=detail;}n+=a*noise(p);p=p*2.03+vec3(7.1,3.2,1.7);a*=.5;}return n/(octaves<2.5?.75:.75+.125*detail);}
        // Distant cloud shelves need a surface field, not a volume. Four hash
        // samples per octave instead of eight; continuous direction coordinates
        // avoid the seam an unwrapped longitude texture would introduce.
        float sheetNoise(vec2 p){
          vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(vec3(i,0.)),hash(vec3(i+vec2(1.,0.),0.)),f.x),mix(hash(vec3(i+vec2(0.,1.),0.)),hash(vec3(i+vec2(1.,1.),0.)),f.x),f.y);
        }
        float cloudSheet(vec2 p){
          float n=0.,a=.5;
          for(int i=0;i<3;i++){if(float(i)>=octaves)break;if(i==2){if(detail<.001)break;a*=detail;}n+=a*sheetNoise(p);p=p*2.03+vec2(7.1,3.2);a*=.5;}
          return n/(octaves<2.5?.75:.75+.125*detail);
        }
        vec3 abyss(vec3 d){
          vec3 color=mix(vec3(.001,.002,.004),vec3(.018,.015,.038),max(d.y,0.));
          vec3 p=d*4.8+vec3(time*.0015,0.,time*.001);
          float n=cloud(p)* (octaves<2.5?.75:.875);
          float band=exp(-pow((d.y-.4-d.x*.24)/.3,2.));
          float wisps=smoothstep(.4,.7,n)*band;
          color+=mix(vec3(.035,.017,.065),vec3(.09,.025,.023),smoothstep(-.5,.6,d.x))*wisps;
          color*=1.-smoothstep(.55,.78,n)* .65;
          // Sparse world-anchored stars, softened to avoid sparkling aliasing.
          vec3 cell=d*180.;vec3 cellId=floor(cell),cellUV=fract(cell)-.5;
          float star=pow(max(0.,1.-length(cellUV)*2.8),6.)*step(.994,hash(cellId));
          color+=vec3(.38,.36,.45)*star*(.8+.2*sin(time*.15+hash(cellId)*30.));
          // A dark moon with a warm corona; high above the combat horizon.
          vec3 moonDir=normalize(vec3(-.65,.62,-.9));float angle=length(d-moonDir),radius=.093;
          float disk=1.-smoothstep(radius-.001,radius+.001,angle);
          float halo=exp(-abs(angle-radius)*100.)*.12+exp(-angle*14.)*.014;
          color+=vec3(.8,.24,.13)*halo;
          color=mix(color,vec3(.005,.004,.009),disk);
          float limb=exp(-abs(angle-radius)*450.)*(.35+.65*smoothstep(-.04,.06,d.x-moonDir.x));
          color+=vec3(.21,.08,.065)*limb;
          return color;
        }
        void main(){
          vec3 d=normalize(skyDirection);
          if(menu>.5){gl_FragColor=vec4(abyss(d),1.);return;}
          // Every direction belongs to the environment, including below the
          // arena. The ash ceiling closes into the darker descent chapters.
          vec3 color=mix(haze,zenith,smoothstep(-.4,.92,d.y));
          vec2 p=vec2(d.x*3.8+d.z*2.1+d.x*d.z*1.4,d.y*5.-travel);
          float cloudVisibility=1.-crown;
          float n=.5;if(cloudVisibility>.001)n=cloudSheet(p);
          float body=smoothstep(coverage,coverage+.24,n)*cloudVisibility;
          float shelves=.5+.5*sin(d.y*15.-travel*2.1+n*2.);
          color=mix(color,cloudTint,body*(.32+.36*shelves));
          color*=1.-smoothstep(.67,.91,n)*mix(.45,.16,daylight)*cloudVisibility;
          // Diffuse rust behind the upper ash ceiling; no sun or bright halo
          // across the combat horizon. Fade with the opening's ambient fill.
          if(daylight>.001){
            float backlight=smoothstep(.3,.85,d.y)*(.35+.65*body);
            color+=vec3(.08,.019,.009)*backlight*daylight;
          }
          // A shrinking opening in the cloud ceiling, directly above the arena.
          float az=0.;if(opening+furnace+cathedral+crown>.001)az=atan(d.z,d.x);
          if(opening>.001){
            float aperture=mix(.62,.12,clamp(travel/4.12,0.,1.));
            float openingAngle=length(d.xz);
            float cloudEdge=aperture*(.76+.38*n+.09*sin(az*3.+.7));
            float hole=1.-smoothstep(cloudEdge*.5,cloudEdge,openingAngle);
            float lip=exp(-abs(openingAngle-cloudEdge*.8)*18.);
            color=mix(color,vec3(.065,.10,.15)*(1.-body*.18),hole*opening*.75);
            color+=vec3(.021,.018,.029)*lip*opening;
          }
          // Angular arcs: no extra meshes, particles or overdraw layers.
          float broken=0.;if(furnace+crown>.001)broken=smoothstep(-.4,.25,sin(az*3.+.5))*(.7+.3*sin(az*7.+1.));
          if(furnace>.001){
            float arcHeight=furnaceHeight+.025*sin(az*5.)+.012*sin(az*11.);
            float arcs=exp(-abs(d.y-arcHeight)*39.)+.28*exp(-abs(d.y-arcHeight-.065)*57.);
            color+=vec3(.17,.043,.012)*arcs*broken*furnace;
          }
          // Cathedral ribs at a fixed azimuth. Haze supplies their backlight.
          if(cathedral>.001){
            float ribPhase=az*7.+.32*pow(smoothstep(.12,.8,d.y),2.);float cell=abs(sin(ribPhase));
            float ribTop=.47+cathedralRise+.035*cos(az*2.);
            float width=.055+.035*smoothstep(.2,.7,d.y);
            float column=(1.-smoothstep(width,width+.065,cell))*smoothstep(.12,.25,d.y)*(1.-smoothstep(ribTop,ribTop+.025,d.y));
            float arch=exp(-abs(d.y-(ribTop+.14*sqrt(cell)))*60.)*smoothstep(.3,.4,d.y);
            color+=vec3(.016,.008,.024)*cathedral*smoothstep(.13,.45,d.y);
            color*=1.-clamp(column+arch*.8,0.,1.)*cathedral*.65;
          }
          if(crown>.001){float crownBand=exp(-abs(d.y-.76-.024*sin(az*5.))*65.);color+=vec3(.029,.009,.013)*crownBand*broken*crown;}
          // Keep the atmosphere below the bloom threshold.
          gl_FragColor=vec4(clamp(color,vec3(0.),vec3(.95)),1.);
        }`
    });
    this.mesh=new THREE.Mesh(new THREE.SphereGeometry(120,32,20),material);
    // Keep the same sky at far-plane depth, after opaque geometry. Early depth
    // rejection avoids running its procedural shader behind the arena/enemies.
    this.mesh.frustumCulled=false;this.mesh.renderOrder=100000;
  }
  update(camera:THREE.Camera,time:number,menu=false){
    this.mesh.position.copy(camera.position);descentAt(time,this.state);
    const u=this.uniforms,s=this.state;u.menu.value=menu?1:0;this.time.value=this.motion==='reduced'?0:time;
    // Trade small cloud detail for the cathedral silhouettes, with a continuous
    // fade into two octaves instead of stacking their shader costs.
    u.detail.value=menu?1:1-s.cathedral;
    u.zenith.value.fromArray(s.zenith);u.haze.value.fromArray(s.haze);u.cloudTint.value.fromArray(s.cloud);
    u.coverage.value=s.coverage;u.daylight.value=s.daylight;u.opening.value=s.opening;u.furnace.value=s.furnace;u.cathedral.value=s.cathedral;u.crown.value=s.crown;
    u.travel.value=this.motion==='reduced'?0:s.travel;u.furnaceHeight.value=this.motion==='reduced'?.27:s.furnaceHeight;u.cathedralRise.value=this.motion==='reduced'?0:s.cathedralRise;
  }
}
