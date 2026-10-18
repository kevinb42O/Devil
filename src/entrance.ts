import * as THREE from 'three';
import {SoloSanctuary} from './solo-sanctuary';
import {SoloFloor} from './solo-floor';
import {loadEntranceEnvironment} from './entrance-environment';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {ENTRANCE_SEAL} from './entrance-layout';
/** A stone threshold suspended in darkness, lit by the ritual seal. */
export class SinglePlayerEntrance {
  readonly scene=new THREE.Scene();
  readonly seal=new THREE.Group();
  readonly ready:Promise<void>;
  readonly sanctuary:SoloSanctuary;
  readonly floor:SoloFloor;
  private reduced=false;
  private halo:THREE.Mesh;
  private embers:THREE.Points;
  private light:THREE.PointLight;
  constructor(diffuse:THREE.Texture){
    this.scene.background=new THREE.Color(0x080e18);
    this.scene.fog=new THREE.FogExp2(0x080e18,.027);
    this.scene.add(new THREE.HemisphereLight(0x839ab4,0x17120e,.48));
    this.sanctuary=new SoloSanctuary(this.scene,diffuse);
    const center=new THREE.Vector3(ENTRANCE_SEAL.x,ENTRANCE_SEAL.y-.35,ENTRANCE_SEAL.z);

    this.floor=new SoloFloor(this.scene);
    this.seal.position.set(ENTRANCE_SEAL.x,ENTRANCE_SEAL.y,ENTRANCE_SEAL.z);this.scene.add(this.seal);
    // Warm seal light reaches the gateway and brightens as the player approaches.
    this.light=new THREE.PointLight(0xffb56b,30,13,2);this.light.position.copy(center);this.scene.add(this.light);
    const floorMark=new THREE.MeshBasicMaterial({color:0xd96130,transparent:true,opacity:.32,toneMapped:false,depthWrite:false});
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.95,1.98,96),floorMark);ring.rotation.x=-Math.PI/2;ring.position.set(0,.03,ENTRANCE_SEAL.z);this.scene.add(ring);
    this.halo=new THREE.Mesh(new THREE.PlaneGeometry(5,5),new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
      uniforms:{strength:{value:1}},vertexShader:'varying vec2 haloUV;void main(){haloUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 haloUV;uniform float strength;void main(){float r=length(haloUV-.5)*2.;float glow=pow(max(0.,1.-r),3.)*.22;gl_FragColor=vec4(1.,.18,.025,glow*strength);}'
    }));this.halo.position.set(0,ENTRANCE_SEAL.y,ENTRANCE_SEAL.z-.08);this.scene.add(this.halo);
    const positions=new Float32Array(48*3);for(let i=0;i<48;i++){positions[i*3]=Math.sin(i*127.1)*2.6;positions[i*3+1]=(i*.618%1)*4.5;positions[i*3+2]=ENTRANCE_SEAL.z+Math.cos(i*73.7)*1.2;}
    const sparks=new THREE.BufferGeometry();sparks.setAttribute('position',new THREE.BufferAttribute(positions,3));
    this.embers=new THREE.Points(sparks,new THREE.PointsMaterial({color:0xff8b47,size:.025,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));this.scene.add(this.embers);
    // Give every stroke physical depth, preserving the exact main-menu artwork.
    const sealReady=new SVGLoader().loadAsync('/ui/abyss-seal.svg').then(data=>{
      for(const path of data.paths){
        const style=path.userData!.style;
        const material=new THREE.MeshStandardMaterial({color:0xff8754,emissive:0xff421c,emissiveIntensity:2.0,toneMapped:false,roughness:.4,metalness:.35,transparent:true,opacity:Number(style.opacity??1)});
        for(const subpath of path.subPaths){
          const points=subpath.getPoints(96).map(p=>new THREE.Vector3((p.x-300)/180,(300-p.y)/180,0));
          if(points.length<2)continue;
          const curve=new THREE.CurvePath<THREE.Vector3>();for(let i=1;i<points.length;i++)if(points[i].distanceToSquared(points[i-1])>1e-10)curve.add(new THREE.LineCurve3(points[i-1],points[i]));
          if(curve.curves.length)this.seal.add(new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(96,points.length*2),Math.max(.012,Number(style.strokeWidth??1)/240),6,false),material));
        }
      }
    });
    this.ready=Promise.all([sealReady,this.floor.ready,loadEntranceEnvironment(this.scene)]).then(()=>{});
  }
  updateFloorSide(cameraY:number){this.floor.updateSide(cameraY);}

  configure(quality:string,reduced:boolean){this.reduced=reduced;this.sanctuary.configure(quality,reduced);}
  get diagnostics(){return {floor:this.floor.diagnostics,...this.sanctuary.diagnostics};}
  update(time:number,position:{x:number;y:number;z:number}){
    time=this.reduced?0:time;this.sanctuary.update(time,position);
    const near=1-THREE.MathUtils.clamp(Math.hypot(position.x,position.z-ENTRANCE_SEAL.z)/7,0,1);
    const pulse=1+Math.sin(time*1.8)*.05;
    this.light.intensity=(30+near*8)*pulse;
    (this.halo.material as THREE.ShaderMaterial).uniforms.strength.value=(1+near*.6)*pulse;
    const positions=this.embers.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++)positions.setY(i,((i*.618%1)*4.5+time*.16)%4.5);
    positions.needsUpdate=true;
  }
}
