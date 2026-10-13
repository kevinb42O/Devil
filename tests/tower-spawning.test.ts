import test from 'node:test';
import assert from 'node:assert/strict';
import {World,v,STEP,idleInput} from '../src/simulation';
import {towerOutletHeight,towerSpitPulse,swarmEmergenceScale} from '../src/enemy-presentation';
import {packEnemy,unpackEnemy} from '../src/network-enemies';
const advance=(w:World,n:number)=>{for(let i=0;i<n;i++)w.step(idleInput(),STEP);};
test('every tower tier ejects its batch through the crown before skulls hunt',()=>{
 for(const kind of ['squid','squid2','squid3'] as const){
  const w=new World(3,{schedule:false,invulnerable:true}),tower=w.spawn(kind,v(10,kind==='squid'?3.3:kind==='squid2'?5.2:7,0));
  advance(w,360);
  const children=w.enemies.filter(e=>e!==tower),first=children[0],last=children.at(-1)!;
  assert.equal(children.length,kind==='squid3'?16:11);
  assert.equal(last.kind,kind==='squid'?'skull2':kind==='squid2'?'skull3':'skull4');
  for(const e of children){assert.ok(Math.hypot(e.pos.x-tower.pos.x,e.pos.z-tower.pos.z)<.25);assert.equal(e.pos.y,tower.pos.y+towerOutletHeight(kind));assert.equal(w.active(e),false);}
  assert.ok(last.age<0);assert.equal(swarmEmergenceScale(last),0);
  const start=first.pos.y,pending={...last.pos};advance(w,24);
  assert.ok(first.pos.y>start+.5&&first.pos.y<start+1.2);assert.equal(swarmEmergenceScale(first),1);assert.deepEqual(last.pos,pending);
  const restored=unpackEnemy(packEnemy(first));assert.ok(Math.abs(restored.statusUntil-first.statusUntil)<1e-6);assert.equal(swarmEmergenceScale(restored),1);
  advance(w,180);assert.ok(children.every(e=>w.active(e)&&e.status==='hunting'));
  advance(w,240);assert.ok(children.every(e=>e.pos.y<5&&e.pos.y>.5),'offspring descend into a varied low swarm without touching the floor');
  const heights=children.map(e=>e.pos.y);assert.ok(Math.max(...heights)-Math.min(...heights)>.7,'offspring must not collapse onto one altitude');
  advance(w,2200);assert.equal(w.enemies.filter(e=>e!==tower).length,children.length*2);
 }
});
test('tower anticipation opens before ejection and closes after the stream',()=>{
 assert.equal(towerSpitPulse(2),0);assert.ok(towerSpitPulse(2.8)>.4);assert.equal(towerSpitPulse(3),1);assert.equal(towerSpitPulse(3.65),1);assert.equal(towerSpitPulse(4.2),0);assert.equal(towerSpitPulse(23),1);
});

test('seeded flight keeps varied arcs and heights without diving into the floor',()=>{
 for(const seed of [1,3,17,81,300])for(const kind of ['squid','squid2','squid3'] as const){
  const w=new World(seed,{schedule:false,invulnerable:true});w.spawn(kind,v(20,kind==='squid'?3.3:kind==='squid2'?5.2:7,0));advance(w,360);
  const children=w.enemies.slice(1),apex=new Map<number,number>();
  for(let tick=0;tick<420;tick++){
   const previous=children.map(e=>e.vel.y);advance(w,1);
   children.forEach((e,i)=>{if(e.age<0)return;assert.ok(e.pos.y>.65,'flight must brake above the floor');if(previous[i]>0&&e.vel.y<=0&&!apex.has(e.id))apex.set(e.id,e.age);});
  }
  assert.equal(apex.size,children.length);
  const peaks=[...apex.values()];assert.ok(Math.max(...peaks)-Math.min(...peaks)>.08,'the skulls should crest at different times');
  const heights=children.map(e=>e.pos.y);assert.ok(Math.max(...heights)-Math.min(...heights)>.7,'the approaching swarm should retain vertical depth');
  assert.ok(Math.max(...heights)<5,'even the tall tower stream should descend promptly');
 }
});
