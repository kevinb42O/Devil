import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js'),A=await import('/src/crew-avatar.ts'),S=await import('/src/simulation.ts');
  await A.loadCrewAvatar();
  const body=A.createCrewAvatar(0,false,true),third=A.createCrewAvatar(0);
  const main=model=>{let mesh;model.traverse(n=>{if(n.isSkinnedMesh&&n.material.name==='Demon_Main')mesh=n;});return mesh;};
  const mesh=main(body),original=main(third),g=mesh.geometry,p=g.attributes.position,count=original.geometry.attributes.position.count;
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  check(p.count>count,'Missing shoulder geometry');check(g!==original.geometry,'First-person geometry changed the shared source');
  const key=(i)=>['position','skinIndex','skinWeight'].flatMap(name=>{const a=g.attributes[name];return Array.from({length:a.itemSize},(_,j)=>a.getComponent(i,j));}).join(',');
  const originals=new Map(Array.from({length:count},(_,i)=>[key(i),i]));
  const seams=[];
  for(let i=count;i<p.count;i++){const source=originals.get(key(i));check(source!==undefined,'Shoulder endpoint lost source skin weights');seams.push([i,source]);}
  // Weld only identical coordinates AND weights: coincident vertices attached to
  // different bones must not count as an enduring connection.
  const parents=Array.from({length:p.count},(_,i)=>i),find=i=>parents[i]===i?i:(parents[i]=find(parents[i])),join=(a,b)=>{parents[find(a)]=find(b);};
  for(const [a,b]of seams)join(a,b);
  const duplicates=new Map();for(let i=0;i<count;i++){const k=key(i);if(duplicates.has(k))join(i,duplicates.get(k));else duplicates.set(k,i);}
  const index=g.index;for(let i=0;i<index.count;i+=3){join(index.getX(i),index.getX(i+1));join(index.getX(i),index.getX(i+2));}
  const bonesByComponent=new Map();
  for(const i of new Set(index.array)){
   const root=find(i);if(!bonesByComponent.has(root))bonesByComponent.set(root,new Set());
   for(let j=0;j<4;j++)if(g.attributes.skinWeight.getComponent(i,j)>.5)bonesByComponent.get(root).add(mesh.skeleton.bones[g.attributes.skinIndex.getComponent(i,j)].name);
  }
  for(const side of ['L','R'])check([...bonesByComponent.values()].some(bones=>bones.has('Torso')&&bones.has('UpperArm'+side)),'Arm '+side+' is disconnected from chest');
  let poses=0,maxGap=0;
  for(const courtyard of [true,false])for(const level of [1,5])for(const pitch of [-1.55,-.9,0,1.3])for(const raised of [false,true])for(const grounded of [true,false]){
   const input={...S.idleInput(),pitch,leftArm:raised,rightArm:raised};
   A.updateCrewAvatar(body,input,{x:grounded?6:0,y:grounded?0:8,z:0},grounded,poses/30,false,courtyard,level);body.updateMatrixWorld(true);
   for(const [a,b]of seams){const gap=mesh.getVertexPosition(a,new T.Vector3()).distanceTo(mesh.getVertexPosition(b,new T.Vector3()));maxGap=Math.max(maxGap,gap);check(gap<1e-10,'Animated shoulder seam opened');}
   poses++;
  }
  check(original.geometry.attributes.position.count===count,'Third-person geometry was mutated');
  return {poses,shoulderVertices:seams.length,maxGap};
 });
 assert.deepEqual(errors,[]);console.log('First-person shoulder connections passed:',result);
}finally{await browser.close();}
