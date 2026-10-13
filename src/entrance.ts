import * as THREE from 'three';
import {GemLighting} from './gem-lighting';
import {TILE_SIZE} from './arena';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {ENTRANCE_PLATFORM,ENTRANCE_SEAL} from './entrance-layout';
/** An isolated black scene: only the menu seal supplies light. */
export class SinglePlayerEntrance {
  readonly scene=new THREE.Scene();
  readonly seal=new THREE.Group();
  readonly ready:Promise<void>;
  private platform:THREE.InstancedMesh;
  constructor(diffuse:THREE.Texture){
    this.scene.background=new THREE.Color(0);
    const stone=new THREE.MeshBasicMaterial({map:diffuse,toneMapped:false});
    const floorLight=new GemLighting(this.scene,stone);
    const center=new THREE.Vector3(ENTRANCE_SEAL.x,ENTRANCE_SEAL.y-.35,ENTRANCE_SEAL.z);
    floorLight.setPlayerLight(center);
    const columns=5,rows=7,matrix=new THREE.Matrix4();
    this.platform=new THREE.InstancedMesh(new THREE.BoxGeometry(TILE_SIZE,.1,TILE_SIZE),stone,columns*rows);
    for(let z=0;z<rows;z++)for(let x=0;x<columns;x++){
      matrix.makeTranslation((x-(columns-1)/2)*TILE_SIZE,-.05,(z-(rows-1)/2)*TILE_SIZE+ENTRANCE_PLATFORM.centerZ);
      this.platform.setMatrixAt(z*columns+x,matrix);
    }
    this.scene.add(this.platform);
    this.seal.position.set(ENTRANCE_SEAL.x,ENTRANCE_SEAL.y,ENTRANCE_SEAL.z);this.scene.add(this.seal);
    // Same color, intensity, reach and falloff as the gameplay player's light.
    const light=new THREE.PointLight(0xffb56b,24,11,2);light.position.copy(center);this.scene.add(light);
    // Give every stroke physical depth, preserving the exact main-menu artwork.
    this.ready=new SVGLoader().loadAsync('/ui/abyss-seal.svg').then(data=>{
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
  }
  setTileGeometry(geometry:THREE.BufferGeometry){
    this.platform.geometry.dispose();this.platform.geometry=geometry;
    const matrix=new THREE.Matrix4();for(let i=0;i<this.platform.count;i++){this.platform.getMatrixAt(i,matrix);matrix.elements[13]=0;this.platform.setMatrixAt(i,matrix);}this.platform.instanceMatrix.needsUpdate=true;
  }
}
