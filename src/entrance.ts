import * as THREE from 'three';
import {GemLighting} from './gem-lighting';
import {TILE_SIZE} from './arena';
import {loadEntranceEnvironment} from './entrance-environment';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {ENTRANCE_PLATFORM,ENTRANCE_SEAL} from './entrance-layout';
/** A stone threshold suspended in darkness, lit by the ritual seal. */
export class SinglePlayerEntrance {
  readonly scene=new THREE.Scene();
  readonly seal=new THREE.Group();
  readonly ready:Promise<void>;
  private platform:THREE.InstancedMesh;
  private halo:THREE.Mesh;
  private embers:THREE.Points;
  private light:THREE.PointLight;
  constructor(diffuse:THREE.Texture){
    this.scene.background=new THREE.Color(0x07090c);
    this.scene.fog=new THREE.FogExp2(0x07090c,.035);
    this.scene.add(new THREE.HemisphereLight(0x72665a,0x130907,.55));
    const stone=new THREE.MeshBasicMaterial({map:diffuse,toneMapped:false});
    const floorLight=new GemLighting(this.scene,stone);
    const center=new THREE.Vector3(ENTRANCE_SEAL.x,ENTRANCE_SEAL.y-.35,ENTRANCE_SEAL.z);
    floorLight.setPlayerLight(center);
    const {columns,rows}=ENTRANCE_PLATFORM,matrix=new THREE.Matrix4();
    this.platform=new THREE.InstancedMesh(new THREE.BoxGeometry(TILE_SIZE,.1,TILE_SIZE),stone,columns*rows);
    for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){
      matrix.makeTranslation((x-(columns-1)/2)*TILE_SIZE,-.05,(z-(rows-1)/2)*TILE_SIZE+ENTRANCE_PLATFORM.centerZ);
      this.platform.setMatrixAt(z*columns+x,matrix);
    }
    this.scene.add(this.platform);
    this.seal.position.set(ENTRANCE_SEAL.x,ENTRANCE_SEAL.y,ENTRANCE_SEAL.z);this.scene.add(this.seal);
    // Warm seal light reaches the gateway and brightens as the player approaches.
    this.light=new THREE.PointLight(0xffb56b,30,13,2);this.light.position.copy(center);this.scene.add(this.light);
    const floorMark=new THREE.MeshBasicMaterial({color:0xd96130,transparent:true,opacity:.55,toneMapped:false,depthWrite:false});
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
        const material=new THREE.MeshStandardMaterial({color:0xff8754,emissive:0xff421c,emissiveIntensity:3.5,toneMapped:false,roughness:.4,metalness:.35,transparent:true,opacity:Number(style.opacity??1)});
        for(const subpath of path.subPaths){
          const points=subpath.getPoints(96).map(p=>new THREE.Vector3((p.x-300)/180,(300-p.y)/180,0));
          if(points.length<2)continue;
          const curve=new THREE.CurvePath<THREE.Vector3>();for(let i=1;i<points.length;i++)if(points[i].distanceToSquared(points[i-1])>1e-10)curve.add(new THREE.LineCurve3(points[i-1],points[i]));
          if(curve.curves.length)this.seal.add(new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(96,points.length*2),Math.max(.012,Number(style.strokeWidth??1)/240),6,false),material));
        }
      }
    });
    this.ready=Promise.all([sealReady,loadEntranceEnvironment(this.scene)]).then(()=>{});
  }
  updateFloorSide(cameraY:number){
    const material=this.platform.material as THREE.MeshBasicMaterial;
    const side=cameraY<=0?THREE.DoubleSide:THREE.FrontSide;
    if(material.side!==side){material.side=side;material.needsUpdate=true;}
  }
  update(time:number,position:{x:number;y:number;z:number}){
    const near=1-THREE.MathUtils.clamp(Math.hypot(position.x,position.z-ENTRANCE_SEAL.z)/7,0,1);
    const pulse=1+Math.sin(time*1.8)*.05;
    this.light.intensity=(30+near*8)*pulse;
    (this.halo.material as THREE.ShaderMaterial).uniforms.strength.value=(1+near*.6)*pulse;
    const positions=this.embers.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++)positions.setY(i,((i*.618%1)*4.5+time*.16)%4.5);
    positions.needsUpdate=true;
  }
  setTileGeometry(geometry:THREE.BufferGeometry){
    this.platform.geometry.dispose();this.platform.geometry=geometry;
    const matrix=new THREE.Matrix4();for(let i=0;i<this.platform.count;i++){this.platform.getMatrixAt(i,matrix);matrix.elements[13]=0;this.platform.setMatrixAt(i,matrix);}this.platform.instanceMatrix.needsUpdate=true;
  }
}
