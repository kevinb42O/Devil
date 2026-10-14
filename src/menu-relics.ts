import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCrewAvatar,loadCrewAvatar,updateCrewAvatar} from './crew-avatar';
import {idleInput} from './simulation';
import {MenuMist} from './menu-mist';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

/** A menu-only chamber. Shares the game context; never adds a second render loop. */
export class MenuRelics {
 readonly scene=new THREE.Scene();
 private camera=new THREE.PerspectiveCamera(36,1,.1,60);
 private crown=new THREE.Group();
 private player=createCrewAvatar(0);
 private idle=idleInput();
 private still={x:0,y:0,z:0};
 private mist=new MenuMist();
 private ember:THREE.Points;
 private fire=new THREE.PointLight(0xee5b28,9,5,2);
 private clock=0;
 private loaded=0;
 private failures:string[]=[];
 private bounds:DOMRect|null=null;
 private needsLayout=true;
 private observer:ResizeObserver;
 private environment:THREE.WebGLRenderTarget|null=null;
 private quality='high';
 private reduced=false;
 private stage=document.getElementById('champion-stage');
 private relic=document.querySelector<HTMLElement>('.shrine-relic');
 get diagnostics(){return {loaded:this.loaded,failures:[...this.failures],time:this.clock,player:this.player.userData.avatarSource??'loading',mist:this.mist.diagnostics,particles:this.quality==='high'&&!this.reduced?this.ember.geometry.attributes.position.count:0};}
 constructor(){
  document.documentElement.dataset.relics='loading';
  this.scene.background=new THREE.Color(0x080a0d);
  this.scene.environmentIntensity=.4;
  this.scene.fog=new THREE.FogExp2(0x080a0d,.035);
  this.scene.add(new THREE.HemisphereLight(0x9baec5,0x18100c,.24));
  const key=new THREE.SpotLight(0xffe0ac,75,24,.58,.8,1.5);key.position.set(-3,5,5);key.target.position.set(0,.6,0);this.scene.add(key,key.target);
  const rim=new THREE.DirectionalLight(0x93b7d5,1.7);rim.position.set(3,2,-3);this.scene.add(rim);
  const soft=new THREE.DirectionalLight(0xeacb98,.65);soft.position.set(-2,1,4);this.scene.add(soft);
  this.fire.position.set(0,-1.1,1);this.scene.add(this.fire);
  this.crown.position.y=1.65;this.player.scale.setScalar(1.35);this.player.position.y=.755;this.player.rotation.y=Math.PI-.22;this.scene.add(this.crown,this.player);
  const stone=new THREE.MeshStandardMaterial({color:0x25262a,roughness:.94,metalness:.18});
  for(const [radius,height,y] of [[1.15,.2,-2.02],[1,.3,-1.78],[.9,.08,-1.59]]){
   const tier=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius+.06,height,64),stone);tier.position.y=y;this.scene.add(tier);
  }
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x07080b,roughness:1,metalness:0}));floor.rotation.x=-Math.PI/2;floor.position.y=-2.15;this.scene.add(floor);
  // A few broken basalt columns give the darkness a physical scale.
  const basalt=new THREE.MeshStandardMaterial({color:0x12151b,roughness:.96,metalness:.12});
  for(const [x,height,z] of [[-3.6,7,-3],[3.6,6.2,-3],[-5.3,8,-5],[5.4,8,-5]]){
   const column=new THREE.Mesh(new THREE.CylinderGeometry(.22,.3,height,8),basalt);column.position.set(x,height/2-2.15,z);this.scene.add(column);
   const foot=new THREE.Mesh(new THREE.CylinderGeometry(.48,.54,.22,8),basalt);foot.position.set(x,-2.04,z);this.scene.add(foot);
  }
  // Fine copper inlays sit in the altar, rather than floating over the interface.
  for(const radius of [.7,.82,1.04]){
   const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.007,4,96),new THREE.MeshStandardMaterial({color:0x936042,metalness:.8,roughness:.5,emissive:0x5b1708,emissiveIntensity:.45}));ring.rotation.x=Math.PI/2;ring.position.y=-1.54;this.scene.add(ring);
  }
  const seal=new THREE.TextureLoader().load('/ui/abyss-seal.svg');seal.colorSpace=THREE.SRGBColorSpace;
  const engraving=new THREE.Mesh(new THREE.PlaneGeometry(6.1,6.1),new THREE.MeshBasicMaterial({map:seal,transparent:true,opacity:.105,depthWrite:false,blending:THREE.AdditiveBlending}));engraving.position.set(0,.1,-1.8);this.scene.add(engraving);
  const count=54,positions=new Float32Array(count*3);
  for(let i=0;i<count;i++){const a=i*2.39996,r=.5+(i%13)/9;positions[i*3]=Math.cos(a)*r;positions[i*3+1]=-1.5+(i/count)*5;positions[i*3+2]=Math.sin(a)*r;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  this.ember=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xe8a76c,size:.014,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending}));this.scene.add(this.ember);
  this.observer=new ResizeObserver(()=>this.needsLayout=true);if(this.stage)this.observer.observe(this.stage);if(this.relic)this.observer.observe(this.relic);
  window.addEventListener('resize',()=>this.needsLayout=true);
  document.querySelector('.menu-content')?.addEventListener('scroll',()=>this.needsLayout=true,{passive:true});
  document.querySelector('.menu-content')?.addEventListener('animationend',()=>this.needsLayout=true);
  const settle=()=>document.documentElement.dataset.relics=this.failures.length?'unavailable':this.loaded===2?'ready':'loading';
  void new GLTFLoader().loadAsync('/models/relics/crown.glb').then(gltf=>{
   const model=gltf.scene,box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=1.25/size.x;
   model.scale.multiplyScalar(scale);model.position.copy(center).multiplyScalar(-scale);
   model.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
    const sources=Array.isArray(object.material)?object.material:[object.material];
    const materials=sources.map(source=>{
     const gem=source.name==='Red';
     const material=new THREE.MeshStandardMaterial({name:source.name,color:gem?0x651e19:0xb28a43,metalness:gem?.35:.9,roughness:gem?.22:.38,envMapIntensity:.55});
     if(!gem)this.ageMetal(material);source.dispose();return material;
    });
    object.material=materials.length===1?materials[0]:materials;
   });
   const silhouette=new THREE.Group();silhouette.scale.y=.72;silhouette.add(model);this.crown.add(silhouette);this.loaded++;settle();
  }).catch(()=>{this.failures.push('crown');settle();});
  void loadCrewAvatar().then(()=>{
   if(this.player.userData.avatarSource!=='quaternius-demon'){this.failures.push('player');settle();return;}
   this.player.traverse(object=>{if(object instanceof THREE.Mesh){const material=object.material as THREE.MeshStandardMaterial;material.emissiveIntensity=.025;material.roughness=.78;}});
   this.loaded++;settle();
  });
 }
 configure(quality:string,reduced:boolean,mist=true){this.quality=quality;this.reduced=reduced;this.ember.visible=quality==='high'&&!reduced;this.mist.configure(quality,mist);}
 private ageMetal(material:THREE.MeshStandardMaterial){
  material.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec3 vRelicPosition;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRelicPosition=(modelMatrix*vec4(position,1.0)).xyz;');
   shader.fragmentShader=`varying vec3 vRelicPosition;
float relicHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float relicNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(relicHash(i),relicHash(i+vec3(1,0,0)),f.x),mix(relicHash(i+vec3(0,1,0)),relicHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(relicHash(i+vec3(0,0,1)),relicHash(i+vec3(1,0,1)),f.x),mix(relicHash(i+vec3(0,1,1)),relicHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
float patina=relicNoise(vRelicPosition*22.0);
float grain=relicNoise(vRelicPosition*185.0);
roughnessFactor=clamp(roughnessFactor+patina*0.24+grain*0.08,0.15,0.85);
diffuseColor.rgb*=mix(vec3(0.68,0.70,0.62),vec3(1.0),smoothstep(0.12,0.7,patina))*mix(0.78,1.0,grain);
`);
  };
  material.customProgramCacheKey=()=>'relic-gold-v2';
 }
 render(renderer:THREE.WebGLRenderer,dt:number){
  if(!this.environment){const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;room.dispose();pmrem.dispose();}
  if(!this.reduced)this.clock+=Math.min(dt,.05);
  const t=this.clock;
  this.crown.rotation.y=.24+Math.sin(t*.19)*.14;this.crown.position.y=1.65+Math.sin(t*.62)*.035;
  this.player.rotation.y=Math.PI-.22+Math.sin(t*.15)*.07;
  updateCrewAvatar(this.player,this.idle,this.still,true,t);
  this.fire.intensity=8+Math.sin(t*1.3)*.4+Math.sin(t*3.7)*.2;
  this.ember.rotation.y=t*.025;
  const positions=this.ember.geometry.attributes.position;
  if(!this.reduced&&this.quality==='high'){for(let i=0;i<positions.count;i++)positions.setY(i,-1.5+((i/positions.count*5+t*(.09+(i%4)*.015))%5));positions.needsUpdate=true;}
  const w=Math.max(1,renderer.domElement.clientWidth),h=Math.max(1,renderer.domElement.clientHeight);
  if(this.needsLayout){const box=this.relic?.getBoundingClientRect();this.bounds=box?.width&&box.height?box:this.stage?.getBoundingClientRect()??new DOMRect(w*.5,h*.1,w*.45,h*.65);this.needsLayout=false;}
  const bounds=this.bounds!;
  const visible=bounds.bottom>0&&bounds.top<h;
  this.crown.visible=visible;this.player.visible=visible&&this.player.userData.avatarSource==='quaternius-demon';
  this.ember.visible=visible&&this.quality==='high'&&!this.reduced;
  const targetHeight=Math.max(100,bounds.height),focal=targetHeight/4.65,distance=8;
  this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(h/(2*focal*distance)));this.camera.aspect=w/h;
  this.camera.setViewOffset(w,h,w/2-(bounds.left+bounds.width/2),h/2-(bounds.top+bounds.height/2),w,h);
  this.camera.position.set(0,.65,distance);this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();
  this.mist.render(renderer,this.scene,this.camera,t);
 }
}
