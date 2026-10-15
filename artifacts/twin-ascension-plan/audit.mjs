import {readFile,writeFile} from 'node:fs/promises';
import * as T from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
const root='assets/original/devil-daggers/meshes/';
const load=async name=>new OBJLoader().parse(await readFile(root+name+'.obj','utf8'));
const gather=model=>{const a=[];model.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position,n=o.geometry.attributes.normal,uv=o.geometry.attributes.uv;for(let i=0;i<p.count;i++)a.push({p:[p.getX(i),p.getY(i),p.getZ(i)],n:[n.getX(i),n.getY(i),n.getZ(i)],uv:[uv.getX(i),uv.getY(i)]});}});return a;};
const results=[];
for(const name of ['hand','hand2','hand3','hand4']){
 const right=await load(name),left=await load(name+'left'),a=gather(right),b=gather(left);
 const key=p=>p.map(n=>n.toFixed(7)).join(',');const map=new Map();for(const v of b){const k=key(v.p),old=map.get(k)||[];old.push(v);map.set(k,old);}
 let maxDistance=0,maxNormal=0,maxUv=0,missing=0;
 for(const v of a){const mirrored=[-v.p[0],v.p[1],v.p[2]],candidates=map.get(key(mirrored));if(!candidates){missing++;continue;}let closest=null,score=Infinity;for(const c of candidates){const uv=Math.hypot(c.uv[0]-v.uv[0],c.uv[1]-v.uv[1]);const normal=Math.hypot(c.n[0]+v.n[0],c.n[1]-v.n[1],c.n[2]-v.n[2]);if(uv+normal<score){score=uv+normal;closest=c;}}maxDistance=Math.max(maxDistance,Math.hypot(...closest.p.map((x,i)=>x-mirrored[i])));maxNormal=Math.max(maxNormal,Math.hypot(closest.n[0]+v.n[0],closest.n[1]-v.n[1],closest.n[2]-v.n[2]));maxUv=Math.max(maxUv,Math.hypot(closest.uv[0]-v.uv[0],closest.uv[1]-v.uv[1]));}
 const rb=new T.Box3().setFromObject(right),lb=new T.Box3().setFromObject(left);
 results.push({name,triangles:a.length/3,leftTriangles:b.length/3,missingMirroredVertices:missing,maxMirroredDistance:maxDistance,maxMirroredNormalError:maxNormal,maxUvError:maxUv,rightBounds:{min:rb.min.toArray(),max:rb.max.toArray()},leftBounds:{min:lb.min.toArray(),max:lb.max.toArray()}});
}
const raw=await readFile('public/assets/models/crew-demon.glb');const jsonLength=raw.readUInt32LE(12),gltf=JSON.parse(raw.subarray(20,20+jsonLength).toString());
const bones=gltf.nodes.map(n=>n.name).filter(n=>/UpperArm|LowerArm|Middle3|Hand/.test(n||''));
const result={results,crewArmNodes:bones};await writeFile('artifacts/twin-ascension-plan/asset-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
