// Bake rigid tower armor into shared local-space BVHs. No render meshes or
// Three.js objects are needed in the fixed-step simulation.
import {readFile,writeFile} from 'node:fs/promises';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {Matrix4,Vector3} from 'three';
const loader=new OBJLoader(),cache=new Map(),scale=.62;
const meshes={};
async function part(out,name,yaw=0,flip=false,sx=1,sy=1,wave=false){
 if(!meshes[name]){const triangles=[];await geometry(triangles,name);meshes[name]=bake(triangles);}
 out.push({name,yaw,flip,sx,sy,wave});
}
async function geometry(out,name){
 let vertices=cache.get(name);
 if(!vertices){const obj=loader.parse(await readFile(`assets/original/devil-daggers/meshes/${name}.obj`,'utf8'));obj.traverse(o=>{if(o.isMesh){const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry;vertices=Array.from(g.attributes.position.array);}});cache.set(name,vertices);}
 const matrix=new Matrix4().makeScale(scale,scale,scale),p=new Vector3();
 for(let i=0;i<vertices.length;i+=9){const tri=[];for(let j=0;j<9;j+=3){p.set(...vertices.slice(i+j,i+j+3)).applyMatrix4(matrix);tri.push(...p.toArray().map(n=>+n.toFixed(5)));}out.push(tri);}
}
function bake(tris){const nodes=[],ordered=[];
 function branch(list){const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(const t of list)for(let j=0;j<9;j++) {const axis=j%3;bounds[axis]=Math.min(bounds[axis],t[j]);bounds[axis+3]=Math.max(bounds[axis+3],t[j]);}
 const index=nodes.length;nodes.push(null);if(list.length<=8){const start=ordered.length;ordered.push(...list);nodes[index]=[...bounds,-1,start,list.length];}
 else{let axis=0;for(let i=1;i<3;i++)if(bounds[i+3]-bounds[i]>bounds[axis+3]-bounds[axis])axis=i;list.sort((a,b)=>(a[axis]+a[axis+3]+a[axis+6])-(b[axis]+b[axis+3]+b[axis+6]));const mid=list.length>>1,left=branch(list.slice(0,mid)),right=branch(list.slice(mid));nodes[index]=[...bounds,left,right,0];}return index;}
 branch(tris);const vertices=[],indices=[],unique=new Map();for(const tri of ordered)for(let i=0;i<9;i+=3){const xyz=tri.slice(i,i+3),key=xyz.join(',');let index=unique.get(key);if(index===undefined){index=vertices.length/3;unique.set(key,index);vertices.push(...xyz);}indices.push(index);}return {nodes,vertices,indices};}
const result={};
for(const kind of ['squid','squid2','squid3','leviathan','thorn']){
 const t=[];
 if(kind==='squid'){for(const n of ['minisquidcrest','minisquidcrestskull','minisquidhorns','minisquidjaw','minisquidjawskull'])await part(t,n);for(let i=0;i<3;i++)await part(t,'squidarm',i*Math.PI*2/3,false,.6,.65,true);}
 if(kind==='squid2'){for(const n of ['squidcrest','squidcrestskull','squidhorns'])await part(t,n);await part(t,'squidjaws',0,true);for(let i=0;i<2;i++)await part(t,'squidjawskull',i*Math.PI);for(let i=0;i<6;i++){await part(t,'squidteeth',i*Math.PI/3);await part(t,'squidarm',i*Math.PI/3,false,1,1,true);}}
 if(kind==='squid3'){for(const n of ['ultrasquidcrest','ultrasquidcrestskull','ultrasquidhorns'])await part(t,n);for(let i=0;i<3;i++)for(const n of ['ultrasquidjaw','ultrasquidjawskull','ultrasquidteeth','ultrasquidtent'])await part(t,n,i*Math.PI*2/3);}
 if(kind==='leviathan'){for(const n of ['leviorb','leviskull','leviskulljaw'])await part(t,n);for(let i=0;i<3;i++)for(const n of ['levicrown','levicrownjaw','levicrown2','levicrown2jaw','levitent','levitent2','levidividerskull'])await part(t,n,i*Math.PI*2/3);}
 if(kind==='thorn')await part(t,'thorn');
 result[kind]=t;console.log(kind,t.length,'instances');
}
await writeFile('src/projectile-colliders.json',JSON.stringify({meshes,instances:result}));
