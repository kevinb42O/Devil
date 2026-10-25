import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCollisionBvh} from '../src/collision-bvh';
import {sweepArmor} from '../src/projectile-collision';
import {sweepArmor as exhaustive} from '../artifacts/fps-deep-audit/projectile-collision-before';
import {World,v} from '../src/simulation';

test('accelerated tower sweeps match the original triangles across poses, scales, pitch, and cadence',()=>{
 let seed=71;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 let hits=0;
 for(const kind of ['squid','squid2','squid3'] as const){
  const w=new World(71,{schedule:false}),e=w.spawn(kind,v(2,5,-3));
  for(const age of [.15,.7,2,6])for(const cadence of [false,true]){
   e.age=age;
   for(let i=0;i<100;i++){
    const from=v(2+(random()-.5)*24,(random()-.2)*25,-3+(random()-.5)*24),to=v(2+(random()-.5)*8,random()*15,-3+(random()-.5)*8),limit=.1+random()*.9;
    const before=exhaustive(e,w.player.pos,from,to,limit,120,cadence),after=sweepArmor(e,w.player.pos,from,to,limit,120,cadence);
    assert.equal(!!after,!!before,`${kind} age ${age} ray ${i}`);
    if(before&&after){hits++;for(const key of ['t','nx','ny','nz'] as const)assert.ok(Math.abs(before[key]-after[key])<1e-9,`${kind} ${key}`);}
   }
  }
 }
 assert.ok(hits>100);
});

test('BVH keeps every triangle once and bounds each leaf',()=>{
 const vertices=Float32Array.from({length:270},(_,i)=>Math.sin(i*17)*10),indices=Uint32Array.from({length:90},(_,i)=>i),bvh=buildCollisionBvh(vertices,indices);
 assert.deepEqual([...bvh.indices].sort((a,b)=>a-b),[...indices]);
 for(const node of bvh.nodes)if(node[6]<0){assert.ok(node[8]<=8);for(let t=node[7]*3;t<(node[7]+node[8])*3;t++)for(let axis=0;axis<3;axis++){const value=vertices[bvh.indices[t]*3+axis];assert.ok(value>=node[axis]&&value<=node[axis+3]);}}
});
