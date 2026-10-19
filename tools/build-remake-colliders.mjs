// Bake the licensed remake meshes, including exact wing-motion amplitudes.
// Run against a local Vite server. Historical BVHs remain unchanged.
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();
 await page.route('**/bake-remake-armor',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
 await page.goto((process.env.GAME_URL??'http://127.0.0.1:5173')+'/bake-remake-armor');
 const source=await page.evaluate(async()=>{
  const [THREE,{OriginalEnemies}]=await Promise.all([import('/node_modules/.vite/deps/three.js'),import('/src/original-enemies.ts')]);
  const assets=new OriginalEnemies();await assets.loaded;if(!assets.ready)throw Error(assets.error);
  const result={};
  for(const kind of ['leviathan','thorn']){
   const model=assets.clone(kind);model.updateMatrixWorld(true);
   let vertices=[],motion=[];const triangles=[];
   model.traverse(mesh=>{
    if(!mesh.isMesh||mesh.name.startsWith('weak-point-'))return;
    const pos=mesh.geometry.getAttribute('position'),weights=mesh.geometry.getAttribute('motionWeight'),index=mesh.geometry.index,offset=vertices.length/3;
    for(let i=0;i<pos.count;i++){
     const p=new THREE.Vector3().fromBufferAttribute(pos,i),amplitude=mesh.material.userData.enemySurface?.role==='body'?(weights?.getX(i)??0)*Math.abs(p.x)*.32*mesh.scale.y:0;
     p.applyMatrix4(mesh.matrixWorld);vertices.push(p.x,p.y,p.z);motion.push(amplitude);
    }
    const count=index?.count??pos.count;
    for(let i=0;i<count;i+=3)triangles.push([0,1,2].map(j=>offset+(index?index.getX(i+j):i+j)));
   });
   // Share coincident vertices without changing their motion. Seven decimal
   // places preserve sub-micron world-space contact precision in this arena.
   const unique=new Map(),compact=[],amplitudes=[],remap=[];
   for(let i=0;i<motion.length;i++){
    const values=[...vertices.slice(i*3,i*3+3),motion[i]].map(n=>Number(n.toFixed(7))),key=values.join(',');
    let id=unique.get(key);if(id===undefined){id=amplitudes.length;unique.set(key,id);compact.push(...values.slice(0,3));amplitudes.push(values[3]);}remap.push(id);
   }
   vertices=compact;motion=amplitudes;for(const tri of triangles)for(let j=0;j<3;j++)tri[j]=remap[tri[j]];
   const nodes=[],indices=[];
   function branch(list){
    const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    for(const tri of list)for(const i of tri)for(let axis=0;axis<3;axis++){const padding=axis===1?motion[i]:0;bounds[axis]=Math.min(bounds[axis],vertices[i*3+axis]-padding);bounds[axis+3]=Math.max(bounds[axis+3],vertices[i*3+axis]+padding);}
    const at=nodes.length;nodes.push(null);
    if(list.length<=8){const start=indices.length/3;for(const tri of list)indices.push(...tri);nodes[at]=[...bounds,-1,start,list.length];}
    else{let axis=0;for(let i=1;i<3;i++)if(bounds[i+3]-bounds[i]>bounds[axis+3]-bounds[axis])axis=i;const centroid=tri=>tri.reduce((sum,i)=>sum+vertices[i*3+axis],0);list.sort((a,b)=>centroid(a)-centroid(b));const mid=list.length>>1,left=branch(list.slice(0,mid)),right=branch(list.slice(mid));nodes[at]=[...bounds,left,right,0];}
    return at;
   }
   branch(triangles);result[kind]={vertices,indices,nodes,...(motion.some(n=>n!==0)?{motion}:{})};
  }
  return result;
 });
 await writeFile('src/remake-projectile-colliders.json',JSON.stringify(source)+'\n');
 console.log(Object.fromEntries(Object.entries(source).map(([kind,m])=>[kind,{triangles:m.indices.length/3,nodes:m.nodes.length,animated:!!m.motion}])));
}finally{await browser.close();}
