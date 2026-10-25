import * as THREE from 'three';
import {ascentAt,createAscentState} from './ascent-state';

/** World-up flight cues: perspective becomes radial naturally when looking up.
 * All effects remain outside the playable arena; scene depth hides them behind combat. */
export class AscentRush {
 readonly group=new THREE.Group();readonly streaks:THREE.Mesh;readonly shells:THREE.Mesh;
 readonly uniforms={rushDistance:{value:0},rushAmount:{value:0},rushLength:{value:0},rushGold:{value:0},rushShock:{value:0},rushCharge:{value:0},rushCamera:{value:new THREE.Vector3()},rushLaunch:{value:0}};
 private state=createAscentState();private reduced=false;
 constructor(scene:THREE.Scene){
  this.group.name='ascent-slipstream';this.group.visible=false;scene.add(this.group);
  const quad=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();geometry.index=quad.index;geometry.attributes=quad.attributes;
  const seeds=new Float32Array(640*4);let seed=9183;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<640;i++)seeds.set([random(),random(),random(),random()],i*4);
  geometry.setAttribute('rushSeed',new THREE.InstancedBufferAttribute(seeds,4));geometry.instanceCount=640;
  this.streaks=new THREE.Mesh(geometry,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
   vertexShader:`attribute vec4 rushSeed;uniform float rushDistance,rushLength,rushAmount;uniform vec3 rushCamera;varying vec2 rushUV;varying float rushFade,rushHeat;
    void main(){
     float a=rushSeed.x*6.2831853;
     float radius=37.+rushSeed.y*95.;
     vec3 head=vec3(cos(a)*radius,mod(rushSeed.z*300.-rushDistance*(.8+rushSeed.w*.4)+100.,300.)-100.,sin(a)*radius);
     float streakLength=rushLength*(.45+rushSeed.w*1.3);
     vec3 up=vec3(0.,1.,0.),eye=normalize(rushCamera-head),right=cross(up,eye);
     // Stable azimuth at the vertical pole, where the ribbon projects to a dot.
     right=length(right)>.001?normalize(right):vec3(-sin(a),0.,cos(a));
     float width=(.08+rushSeed.w*.28)*(1.+rushSeed.y*.5);
     vec3 p=head+up*(position.y+.5)*streakLength+right*position.x*width;
     rushUV=uv;rushHeat=rushSeed.w;
     rushFade=smoothstep(-100.,-60.,head.y)*(1.-smoothstep(135.,200.,head.y))*rushAmount;
     gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
    }`,
   fragmentShader:`uniform float rushGold;varying vec2 rushUV;varying float rushFade,rushHeat;
    void main(){float across=pow(max(0.,1.-abs(rushUV.x*2.-1.)),2.5);
     float tail=pow(1.-rushUV.y,1.7)*smoothstep(0.,.025,rushUV.y);
     float core=pow(max(0.,1.-abs(rushUV.x*2.-1.)*3.),2.);
     vec3 tint=mix(vec3(.22,.54,1.),vec3(1.,.63,.20),rushGold);
     tint=mix(tint,vec3(1.,.96,.84),rushHeat*.55);
     gl_FragColor=vec4(tint*(.9+core*1.4),(across*.65+core*.25)*tail*rushFade);
    }`}));
  this.streaks.name='world-up-velocity-streaks';this.streaks.frustumCulled=false;this.streaks.renderOrder=8;this.group.add(this.streaks);
  const shardBase=new THREE.IcosahedronGeometry(1,0),shardGeometry=new THREE.InstancedBufferGeometry();shardGeometry.index=shardBase.index;shardGeometry.attributes=shardBase.attributes;
  shardGeometry.setAttribute('rushSeed',new THREE.InstancedBufferAttribute(seeds.slice(0,96*4),4));shardGeometry.instanceCount=96;
  const shards=new THREE.Mesh(shardGeometry,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
   vertexShader:`attribute vec4 rushSeed;uniform float rushDistance,rushAmount;varying vec3 shardNormal;varying float shardAlpha;
    void main(){float a=rushSeed.x*6.2831853,r=38.+rushSeed.y*70.;
     float y=mod(rushSeed.z*300.-rushDistance*(.9+rushSeed.w*.4)+100.,300.)-100.;
     vec3 p=position*(.2+rushSeed.w*.65);p.y*=1.+rushAmount*3.;
     mat2 turn=mat2(cos(a),-sin(a),sin(a),cos(a));p.xz=turn*p.xz;
     p+=vec3(cos(a)*r,y,sin(a)*r);shardNormal=normalize(vec3(turn*normal.xz,normal.y)).xzy;
     shardAlpha=smoothstep(-100.,-60.,y)*(1.-smoothstep(135.,200.,y))*rushAmount;
     gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
    }`,
   fragmentShader:`uniform float rushGold;varying vec3 shardNormal;varying float shardAlpha;
    void main(){float light=max(0.,dot(normalize(shardNormal),normalize(vec3(-.4,.8,.2))));
     vec3 tint=mix(vec3(.10,.18,.29),vec3(.37,.24,.10),rushGold);
     gl_FragColor=vec4(tint*(.2+light*.8),shardAlpha*.8);
    }`}));
  shards.name='torn-passing-fragments';shards.frustumCulled=false;shards.renderOrder=6;this.group.add(shards);
  const ring=new THREE.RingGeometry(1,1.045,128,1),rings=new THREE.InstancedBufferGeometry();rings.index=ring.index;rings.attributes=ring.attributes;
  rings.setAttribute('shellSeed',new THREE.InstancedBufferAttribute(new Float32Array([0,.13,.28,.43,.61,.79]),1));rings.instanceCount=6;
  this.shells=new THREE.Mesh(rings,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
   vertexShader:`attribute float shellSeed;uniform float rushDistance,rushAmount;varying vec2 shellUV;varying float shellAlpha;
    void main(){float y=mod(shellSeed*340.-rushDistance+120.,340.)-120.;float r=46.+shellSeed*34.;
     vec3 p=vec3(position.x*r,y,position.y*r);shellUV=vec2(atan(position.y,position.x)/6.2831853+.5,(length(position.xy)-1.)/.045);
     shellAlpha=smoothstep(-100.,-50.,y)*(1.-smoothstep(100.,180.,y))*rushAmount;
     gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
    }`,
   fragmentShader:`uniform float rushGold;varying vec2 shellUV;varying float shellAlpha;
    void main(){float feather=pow(max(0.,1.-abs(shellUV.y*2.-1.)),2.);float broken=.2+.8*pow(.5+.5*sin(shellUV.x*62.83185),3.);
     gl_FragColor=vec4(mix(vec3(.18,.45,.85),vec3(1.,.64,.22),rushGold),feather*broken*shellAlpha*.12);
    }`}));
  this.shells.name='passing-pressure-shells';this.shells.frustumCulled=false;this.shells.renderOrder=7;this.group.add(this.shells);
  const shock=new THREE.Mesh(new THREE.RingGeometry(1,1.12,128),new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
   vertexShader:'uniform float rushLaunch;varying vec2 shockUV;void main(){shockUV=vec2(atan(position.y,position.x)/6.2831853+.5,(length(position.xy)-1.)/.12);float r=34.+rushLaunch*64.;vec3 p=vec3(position.x*r,-1.-rushLaunch*20.,position.y*r);gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}',
   fragmentShader:'uniform float rushShock;varying vec2 shockUV;void main(){float a=pow(max(0.,1.-abs(shockUV.y*2.-1.)),3.);gl_FragColor=vec4(.5,.72,1.,a*rushShock*.7);}'}));
  shock.name='launch-pressure-wave';shock.frustumCulled=false;this.group.add(shock);
 }
 configure(quality:string,reduced=false){this.reduced=reduced;(this.streaks.geometry as THREE.InstancedBufferGeometry).instanceCount=quality==='low'?240:640;(this.shells.geometry as THREE.InstancedBufferGeometry).instanceCount=quality==='low'?3:6;}
 update(camera:THREE.Camera,time:number,enabled=true){
  const s=ascentAt(time,this.state),u=this.uniforms;
  this.group.visible=enabled&&!this.reduced&&(s.amount>.0001||s.shock>.0001);
  u.rushDistance.value=s.distance;u.rushAmount.value=this.group.visible?s.amount:0;u.rushLength.value=s.length;u.rushGold.value=s.gold;u.rushShock.value=this.group.visible?s.shock:0;u.rushCharge.value=s.charge;
  u.rushCamera.value.copy(camera.position);u.rushLaunch.value=Math.max(0,Math.min(1,(s.phase-482)/1.1));
 }
 get diagnostics(){return {visible:this.group.visible,amount:this.uniforms.rushAmount.value,distance:this.state.distance,length:this.state.length,speed:this.state.speed,streaks:(this.streaks.geometry as THREE.InstancedBufferGeometry).instanceCount,reduced:this.reduced};}
}
