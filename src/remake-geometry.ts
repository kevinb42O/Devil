import * as THREE from 'three';

let fragmentMap:THREE.DataTexture|undefined;
export function fragmentTexture(){
 if(fragmentMap)return fragmentMap;
 const pixels=new Uint8Array(16*16*4);
 for(let y=0;y<16;y++)for(let x=0;x<16;x++){
  const at=(y*16+x)*4,value=Math.round(160+50*Math.sin(x*2.31+y*3.79));
  pixels[at]=pixels[at+1]=pixels[at+2]=value;pixels[at+3]=255;
 }
 fragmentMap=new THREE.DataTexture(pixels,16,16);fragmentMap.needsUpdate=true;return fragmentMap;
}

/** Project-authored fragment shapes, shared by enemy and player gore passes. */
export function goreGeometry(index:number){
 const geometry=index%3===0?new THREE.OctahedronGeometry(1,0):new THREE.IcosahedronGeometry(1,index%3===1?0:1);
 const positions=geometry.getAttribute('position');
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),warp=.78+.18*Math.sin(x*5+y*7+z*11+index*2.31);
  positions.setXYZ(i,x*warp*(.7+index*.035),y*warp,z*warp*(1.25-index*.025));
 }
 geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
