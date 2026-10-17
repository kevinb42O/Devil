import * as THREE from 'three';

export const UPGRADE_SCREEN_DURATION=1.2;
export const UPGRADE_SCREEN_STYLES=[
 {name:'Kindled',duration:.88,primary:[1,.25,.025],accent:[1,.74,.13]},
 {name:'Ascendant',duration:.96,primary:[.035,.55,1],accent:[.48,1,.94]},
 {name:'Unbound',duration:1.02,primary:[1,.018,.22],accent:[1,.22,.67]},
 {name:'Twinflame',duration:1.08,primary:[1,.27,.025],accent:[.55,.12,1]},
 {name:'Dominion',duration:1.14,primary:[.85,.018,.06],accent:[1,.72,.19]},
 {name:'Eclipse',duration:1.2,primary:[.32,.035,.72],accent:[1,.89,.67]},
] as const;

const fragment=`
uniform sampler2D sceneColor;
uniform vec2 resolution;
uniform vec3 primary,accent;
uniform float style,phase,power;
varying vec2 screenUV;
float hash(vec2 p){vec3 h=fract(vec3(p.xyx)*.1031);h+=dot(h,h.yzx+33.33);return fract((h.x+h.y)*h.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float smoke(vec2 p){return noise(p)*.57+noise(p*2.07+13.)*.29+noise(p*4.1-7.)*.14;}
float ridge(float x,float width){return exp(-abs(x)/width);}
vec2 crystalFracture(vec2 p){
 vec2 g=floor(p),f=fract(p),nearestCell=g;float first=10.,second=10.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 offset=vec2(float(x),float(y)),cell=g+offset;
  vec2 delta=offset+vec2(hash(cell),hash(cell+vec2(19.,7.)))-f;
  float d=dot(delta,delta);
  if(d<first){second=first;first=d;nearestCell=cell;}else{second=min(second,d);}
 }
 return vec2(sqrt(second)-sqrt(first),hash(nearestCell));
}
void main(){
 vec2 uv=screenUV,p=(uv-.5)*vec2(resolution.x/resolution.y,1.);
 float radius=length(p),angle=atan(p.y,p.x),t=phase;
 float envelope=power/.38;
 float edge=smoothstep(.1,.7,length((uv-.5)*vec2(1.,1.1)));
 float periphery=smoothstep(.1,.42,radius);
 float turbulence=smoke(p*7.+vec2(t*.8,-t*1.4));
 float impact=exp(-t*19.);
 // Refraction stays peripheral, leaving the aiming point stable.
 float displacement=(turbulence-.5)*.0045*envelope*periphery;
 vec2 direction=p/max(.05,radius);
 vec2 sampleUV=clamp(uv+direction*displacement,vec2(.002),vec2(.998));
 float separation=.0018*envelope*periphery;
 vec3 scene=vec3(texture2D(sceneColor,clamp(sampleUV+direction*separation,.001,.999)).r,
                 texture2D(sceneColor,sampleUV).g,
                 texture2D(sceneColor,clamp(sampleUV-direction*separation,.001,.999)).b);
 vec3 light=vec3(0.),tint=primary;
 float veil=.12,shadow=0.;
 float traveling=radius-t*.95;
 float wave=ridge(traveling,.022+.02*t);
 if(style<.5){
  // Molten seams climb inward from the frame and cool into ash.
  float fire=smoke(vec2(p.x*9.,p.y*5.-t*3.));
  float flames=pow(max(0.,fire+edge*.8-.5),2.);
  float veins=pow(max(0.,1.-abs(sin((p.x+fire*.18)*44.+p.y*8.))),14.);
  light=primary*flames*.85+accent*(veins*edge*.22+wave*.24);
  tint=mix(primary,accent,fire*.4);veil=.16+edge*.13;
 }else if(style<1.5){
  // A cyan fracture front opens through angular refracting planes.
  vec2 fracture=crystalFracture(p*7.);
  float seam=exp(-fracture.x*45.);
  float facet=fracture.y,arrival=1.-smoothstep(.06,.18,abs(traveling));
  light=accent*(seam*arrival*.7+wave*.35)+primary*facet*edge*.14;
  tint=mix(primary,accent,facet*.4+t*.25);veil=.15+edge*.09;
 }else if(style<2.5){
  // Six jagged tears break the red veil into magenta lightning.
  float jag=smoke(vec2(angle*3.,radius*13.-t*2.));
  float tears=pow(1.-abs(sin(angle*3.+jag*1.6+radius*1.8)),24.);
  float front=ridge(radius-t*1.05,.12);
  light=mix(primary,accent,jag)*(tears*front*1.4+wave*.38+edge*turbulence*.2);
  tint=mix(primary,accent,smoothstep(.08,.8,t)*.65);veil=.18+edge*.14;
 }else if(style<3.5){
  // Opposing flames collide in a twisting orange/violet seam.
  float bend=p.x+sin(p.y*8.-t*7.)*.07;
  float left=1.-smoothstep(-.07,.12,bend),flow=smoke(vec2(p.x*6.,p.y*7.-t*3.));
  tint=mix(accent,primary,left);
  float seam=ridge(bend,.012+.025*t)*(1.-smoothstep(.12,.8,t));
  float curls=pow(max(0.,sin(angle*5.-t*9.+flow*3.)),5.)*edge;
  light=tint*(curls*.55+wave*.35)+mix(accent,primary,.5)*seam*.55*periphery;
  veil=.18+flow*edge*.16;
 }else if(style<4.5){
  // A broken crown closes at the frame, then sheds golden rays.
  float segment=sin(angle*9.+.3),crownRadius=.37+.065*pow(max(0.,segment),3.);
  float crown=ridge(radius-crownRadius*(.72+t*.85),.009);
  crown*=.18+.82*smoothstep(-.55,-.25,cos(angle*9.+.3));
  float rays=pow(max(0.,cos(angle*18.+radius*2.)),18.)*smoothstep(.2,.6,radius);
  float reveal=exp(-pow((t-.26)*4.,2.));
  light=accent*(crown*reveal*.9+rays*edge*.35+wave*.24)+primary*edge*turbulence*.22;
  tint=mix(primary,accent,turbulence*.28);veil=.19+edge*.15;shadow=edge*.1;
 }else{
  // A violet eclipse reveals one ivory corona, unraveling into filaments.
  vec2 eclipse=p-vec2(0.,.06);
  float er=length(eclipse),ea=atan(eclipse.y,eclipse.x),eclipseRadius=.23+t*.38;
  float corona=ridge(er-eclipseRadius,.012+.018*t);
  float threads=pow(max(0.,sin(ea*23.+smoke(eclipse*9.)*5.)),7.);
  float wings=ridge(er-eclipseRadius-.035,.055)*threads;
  float reveal=exp(-pow((t-.19)*4.2,2.));
  light=accent*(corona*.9+wings*.55)*reveal+primary*(edge*turbulence*.45+wave*.3);
  shadow=(1.-smoothstep(eclipseRadius-.08,eclipseRadius+.02,er))*.22*reveal;
  tint=mix(primary,accent,smoothstep(.22,.85,t)*.5);veil=.16+edge*.2;
 }
 // Fullscreen grading retains enemy detail; pattern is concentrated at the rim.
 float grain=.93+.07*hash(floor(uv*resolution*.5));
 vec3 graded=scene*(1.-envelope*(veil*.35+shadow));
 graded+=tint*envelope*veil*(.55+.45*edge);
 graded+=light*envelope*grain*(.28+.72*periphery);
 graded+=mix(primary,vec3(1.),.62)*impact*(.1+style*.009);
 gl_FragColor=vec4(clamp(graded,0.,1.),1.);
}`;

/** One captured frame and one fullscreen draw, only during an upgrade. */
export class UpgradeScreenFlash {
 private scene=new THREE.Scene();
 private camera=new THREE.Camera();
 private age:number=UPGRADE_SCREEN_DURATION;
 private duration:number=UPGRADE_SCREEN_DURATION;
 private style=0;
 private fresh=false;
 private capture:THREE.FramebufferTexture|null=null;
 private size=new THREE.Vector2();
 private material=new THREE.ShaderMaterial({
  uniforms:{sceneColor:{value:null},resolution:{value:new THREE.Vector2(1,1)},
   primary:{value:new THREE.Vector3()},accent:{value:new THREE.Vector3()},
   style:{value:0},phase:{value:1},power:{value:0}},
  vertexShader:'varying vec2 screenUV;void main(){screenUV=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false,
 });
 constructor(){const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);quad.frustumCulled=false;this.scene.add(quad);}
 begin(level:number,age=0){
  this.style=Math.max(0,Math.min(5,Math.floor(level)-2));const style=UPGRADE_SCREEN_STYLES[this.style];
  this.duration=style.duration;this.age=Math.max(0,age);this.fresh=true;
  this.material.uniforms.primary.value.set(...style.primary);this.material.uniforms.accent.value.set(...style.accent);
  this.material.uniforms.style.value=this.style;
 }
 clear(){this.age=this.duration;this.fresh=false;this.material.uniforms.power.value=0;}
 get diagnostics(){return {age:this.age,power:this.material.uniforms.power.value,style:UPGRADE_SCREEN_STYLES[this.style].name,duration:this.duration};}
 render(renderer:THREE.WebGLRenderer,dt:number,suppressed=false){
  if(suppressed){this.clear();return;}
  if(!this.fresh&&Number.isFinite(dt))this.age+=Math.max(0,dt);this.fresh=false;
  const t=Math.min(1,this.age/this.duration);
  const power=.38*(1-t)**2;this.material.uniforms.power.value=power;
  this.material.uniforms.phase.value=t;if(power<=0)return;
  renderer.getDrawingBufferSize(this.size);
  if(!this.capture||this.capture.image.width!==this.size.x||this.capture.image.height!==this.size.y){
   this.capture?.dispose();this.capture=new THREE.FramebufferTexture(this.size.x,this.size.y);
   this.capture.minFilter=this.capture.magFilter=THREE.LinearFilter;this.material.uniforms.sceneColor.value=this.capture;
  }
  this.material.uniforms.resolution.value.copy(this.size);renderer.copyFramebufferToTexture(this.capture);
  const autoClear=renderer.autoClear;renderer.autoClear=false;
  try{renderer.render(this.scene,this.camera);}finally{renderer.autoClear=autoClear;}
 }
}
