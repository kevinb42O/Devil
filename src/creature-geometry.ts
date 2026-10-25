import * as THREE from 'three';
export type AnatomyPoint=[number,number,number];

/** Polygonal tapered anatomy, with capped ends and outward-facing winding. */
export function sweepAnatomy(points:AnatomyPoint[],radii:number[],sides=7,steps=0){
 if(steps){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),source=radii;
  points=curve.getPoints(steps).map(p=>p.toArray() as AnatomyPoint);
  radii=points.map((_,i)=>{const t=i/steps*(source.length-1),j=Math.min(source.length-2,Math.floor(t));return THREE.MathUtils.lerp(source[j],source[j+1],t-j);});
 }
 const vertices:number[]=[],indices:number[]=[];
 for(let i=0;i<points.length;i++){
  const center=new THREE.Vector3(...points[i]),tangent=new THREE.Vector3(...points[Math.min(i+1,points.length-1)]).sub(new THREE.Vector3(...points[Math.max(0,i-1)])).normalize();
  const across=new THREE.Vector3(0,0,1).cross(tangent).normalize();if(across.lengthSq()<.01)across.set(1,0,0);
  const up=tangent.clone().cross(across).normalize();
  for(let j=0;j<sides;j++){const a=j*Math.PI*2/sides,p=center.clone().addScaledVector(across,Math.cos(a)*radii[i]).addScaledVector(up,Math.sin(a)*radii[i]);vertices.push(...p.toArray());}
 }
 for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c);}
 for(let j=1;j<sides-1;j++)indices.push(0,j+1,j,(points.length-1)*sides,(points.length-1)*sides+j,(points.length-1)*sides+j+1);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

