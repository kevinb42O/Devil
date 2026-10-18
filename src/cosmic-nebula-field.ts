import * as THREE from 'three';

const SIZE=64,SPAN=256;
let cached:Uint8Array|undefined;
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
/** Bake the expensive cloud octaves and light probes once, then interpolate them in 3D. */
export function cosmicNebulaField(noise:Uint8Array){
 if(!cached){
  const data=new Uint8Array(SIZE**3*4);
  // Every voxel samples a regular grid. Precompute the coordinates for each axis
  // instead of allocating closures and wrapping eight corners for every sample.
  const bakeNoise=(frequency:number,ox:number,oy:number,oz:number)=>{
   const axis=(offset:number)=>{
    const lo=new Int32Array(SIZE),hi=new Int32Array(SIZE),blend=new Float32Array(SIZE);
    for(let i=0;i<SIZE;i++){const p=((((i+.5)/SIZE-.5)*SPAN)*frequency+offset)*32-.5,index=Math.floor(p);lo[i]=index&31;hi[i]=(index+1)&31;blend[i]=p-index;}
    return {lo,hi,blend};
   };
   const x=axis(ox),y=axis(oy),z=axis(oz),values=new Float32Array(SIZE**3);
   let index=0;
   for(let iz=0;iz<SIZE;iz++)for(let iy=0;iy<SIZE;iy++){
    const a=z.lo[iz]*1024+y.lo[iy]*32,b=z.lo[iz]*1024+y.hi[iy]*32;
    const c=z.hi[iz]*1024+y.lo[iy]*32,d=z.hi[iz]*1024+y.hi[iy]*32;
    const fy=y.blend[iy],fz=z.blend[iz],wa=(1-fy)*(1-fz),wb=fy*(1-fz),wc=(1-fy)*fz,wd=fy*fz;
    for(let ix=0;ix<SIZE;ix++){
     const lo=x.lo[ix],hi=x.hi[ix],f=x.blend[ix],g=1-f;
     values[index++]=((noise[a+lo]*g+noise[a+hi]*f)*wa+(noise[b+lo]*g+noise[b+hi]*f)*wb+(noise[c+lo]*g+noise[c+hi]*f)*wc+(noise[d+lo]*g+noise[d+hi]*f)*wd)/255;
    }
   }
   return values;
  };
  const sun=new THREE.Vector3(-.65,.55,-.5).normalize();
  const continent=bakeNoise(.00085,.12,.46,.31),billow=bakeNoise(.0023,.31,.13,.57),filament=bakeNoise(.0073,.6,.2,.1),fine=bakeNoise(.019,.17,.62,.44);
  const a=bakeNoise(.0023,.31+sun.x*7*.0023,.13+sun.y*7*.0023,.57+sun.z*7*.0023);
  const b=bakeNoise(.0023,.31+sun.x*19*.0023,.13+sun.y*19*.0023,.57+sun.z*19*.0023);
  const c=bakeNoise(.00085,.12+sun.x*36*.00085,.46+sun.y*36*.00085,.31+sun.z*36*.00085);
  for(let voxel=0;voxel<SIZE**3;voxel++){
   const shadow=Math.exp(-(smooth(.36,.70,a[voxel])*1.4+smooth(.36,.70,b[voxel])*1.1+smooth(.38,.70,c[voxel])*.8)*1.4),i=voxel*4;
   data[i]=Math.round((continent[voxel]*.27+billow[voxel]*.53+filament[voxel]*.20)*255);data[i+1]=Math.round(filament[voxel]*255);data[i+2]=Math.round(shadow*255);data[i+3]=Math.round(fine[voxel]*255);
  }
  cached=data;
 }
 const texture=new THREE.Data3DTexture(cached,SIZE,SIZE,SIZE);
 texture.format=THREE.RGBAFormat;texture.minFilter=texture.magFilter=THREE.LinearFilter;
 texture.wrapS=texture.wrapT=texture.wrapR=THREE.ClampToEdgeWrapping;texture.unpackAlignment=1;texture.needsUpdate=true;
 return texture;
}
