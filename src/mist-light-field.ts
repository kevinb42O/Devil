import * as THREE from 'three';

const XZ=32,Y=12,SPAN=128,HEIGHT=24,LIMIT=16;
type Light={x:number;y:number;z:number;r:number;g:number;b:number;score:number;radius:number};
/** Bounded, world-space incident light: real emissive anchors, no per-light shader loops. */
export class MistLightField {
  private pixels=new Uint8Array(XZ*Y*XZ*4);
  readonly texture=new THREE.Data3DTexture(this.pixels,XZ,Y,XZ);
  private lights:Light[]=Array.from({length:LIMIT},()=>({x:0,y:0,z:0,r:0,g:0,b:0,score:0,radius:0}));
  count=0;
  constructor(){
    this.texture.format=THREE.RGBAFormat;this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;
    this.texture.unpackAlignment=1;this.texture.needsUpdate=true;
  }
  update(camera:THREE.Camera,enemies:THREE.InstancedMesh,shots:THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>){
    this.count=0;
    // Reserve half the budget for enemies, so volleys cannot evict their illumination.
    const consider=(x:number,y:number,z:number,r:number,g:number,b:number,radius:number,start:number,limit:number)=>{
      if(y<0||y>HEIGHT||Math.abs(x)>SPAN/2-4||Math.abs(z)>SPAN/2-4)return;
      const distance=(x-camera.position.x)**2+(y-camera.position.y)**2+(z-camera.position.z)**2;
      if(distance>36**2)return;
      const score=Math.max(r,g,b)/(1+distance*.06);let index=this.count;
      if(this.count>=limit){index=start;for(let i=start+1;i<limit;i++)if(this.lights[i].score<this.lights[index].score)index=i;if(score<=this.lights[index].score)return;}
      else this.count++;
      Object.assign(this.lights[index],{x,y,z,r,g,b,radius,score});
    };
    const matrices=enemies.instanceMatrix.array,colors=enemies.instanceColor?.array;
    if(colors)for(let i=0;i<enemies.count;i++)consider(matrices[i*16+12],matrices[i*16+13],matrices[i*16+14],colors[i*3],colors[i*3+1],colors[i*3+2],5,0,8);
    const start=this.count,positions=shots.geometry.getAttribute('shotCenter'),tints=shots.geometry.getAttribute('shotColor');
    if(shots.visible&&positions&&tints)for(let i=0;i<shots.geometry.instanceCount;i++)consider(positions.getX(i),positions.getY(i),positions.getZ(i),tints.getX(i)*.35,tints.getY(i)*.35,tints.getZ(i)*.35,3.8,start,Math.min(LIMIT,start+8));
    this.pixels.fill(0);
    for(let i=0;i<this.count;i++){
      const l=this.lights[i];
      const cx=(l.x/SPAN+.5)*XZ-.5,cy=l.y/HEIGHT*Y-.5,cz=(l.z/SPAN+.5)*XZ-.5;
      const rx=l.radius/SPAN*XZ,ry=l.radius/HEIGHT*Y;
      for(let z=Math.max(0,Math.ceil(cz-rx));z<=Math.min(XZ-1,Math.floor(cz+rx));z++)
      for(let y=Math.max(0,Math.ceil(cy-ry));y<=Math.min(Y-1,Math.floor(cy+ry));y++)
      for(let x=Math.max(0,Math.ceil(cx-rx));x<=Math.min(XZ-1,Math.floor(cx+rx));x++){
        const d=((x-cx)/rx)**2+((y-cy)/ry)**2+((z-cz)/rx)**2;if(d>=1)continue;
        const gain=(1-d)**2*255,offset=((z*Y+y)*XZ+x)*4;
        // Max blending keeps a crowd from turning a fog bank white.
        this.pixels[offset]=Math.max(this.pixels[offset],Math.min(255,l.r*gain));
        this.pixels[offset+1]=Math.max(this.pixels[offset+1],Math.min(255,l.g*gain));
        this.pixels[offset+2]=Math.max(this.pixels[offset+2],Math.min(255,l.b*gain));
      }
    }
    this.texture.needsUpdate=true;
  }
  dispose(){this.texture.dispose();}
}
