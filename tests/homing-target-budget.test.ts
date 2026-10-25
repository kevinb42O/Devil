import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,v} from '../src/simulation';

// The reference deliberately ignores the distance cutoff and armor shortlist,
// retaining the previous exhaustive reachable-crystal search.
function fixture(seed:number,reference=false){
 const w=new World(seed,{schedule:false,invulnerable:true});w.time=120;w.player.pos=v(0,2,25);
 for(let i=0;i<24;i++){const e=w.spawn(i%2?'skull2':'skull',v(Math.sin(i*2.399+seed)*18,2+i%5,Math.cos(i*2.399+seed)*18));e.age=20;}
 for(let i=0;i<6;i++){const e=w.spawn((['squid','squid2','squid3'] as const)[i%3],v((i%3-1)*14,5,-8-Math.floor(i/3)*15));e.age=20;if(i%2)e.weakpoints[0].hp=0;}
 for(let i=0;i<12;i++)w.projectiles.push({id:20000+i,pos:v(Math.sin(i+seed)*24,2+i%7,Math.cos(i+seed)*24),vel:v(0,0,-35),age:0,homing:true,level:3});
 if(reference){const query=(w as any).accessibleHomingPoint;(w as any).accessibleHomingPoint=function(e:unknown,from:unknown){return query.call(this,e,from);};}
 return w;
}

test('bounded homing search matches exhaustive steering, damage, and effects across varied tower approaches',()=>{
 for(let seed=1;seed<=12;seed++){
  const optimized=fixture(seed),reference=fixture(seed,true);
  for(let tick=0;tick<8;tick++){
   (optimized as any).updateProjectiles(STEP);(reference as any).updateProjectiles(STEP);
   assert.deepEqual(optimized.projectiles,reference.projectiles,`seed ${seed} tick ${tick}`);
   assert.deepEqual(optimized.effects,reference.effects);
   assert.deepEqual(optimized.enemies,reference.enemies);
  }
 }
});

test('a nearer body prevents distant crystal visibility queries from tracing armor',()=>{
 const w=fixture(1);let bounded=0;
 const query=(w as any).accessibleHomingPoint;
 (w as any).accessibleHomingPoint=function(e:any,from:any,limit:number,armor:any[]){
  assert.ok(armor.length===6&&armor.every(e=>e.kind.startsWith('squid')));
  if(Number.isFinite(limit))bounded++;
  return query.call(this,e,from,limit,armor);
 };
 (w as any).updateProjectiles(STEP);assert.ok(bounded>0);
});

test('tower-stream movement matches the exhaustive clearance scan as towers move and enemies spawn',()=>{
 const optimized=fixture(21),reference=fixture(21);
 for(const w of [optimized,reference])for(const e of w.enemies){
  if(e.kind.startsWith('skull'))e.towerFlight={gravity:18,height:2,descentSpeed:6,agility:2.5,curl:.5};
  else e.nextSpawn=e.age+STEP;
 }
 const update=(reference as any).updateSwarm;
 (reference as any).updateSwarm=function(e:any,dt:number,cells:any){return update.call(this,e,dt,cells);};
 for(let tick=0;tick<30;tick++){
  optimized.step({forward:0,strafe:0,yaw:0,pitch:0,jump:false,fire:false,homing:false});
  reference.step({forward:0,strafe:0,yaw:0,pitch:0,jump:false,fire:false,homing:false});
  assert.deepEqual(optimized.enemies,reference.enemies,`tick ${tick}`);
  assert.deepEqual(optimized.projectiles,reference.projectiles);
  assert.deepEqual(optimized.effects,reference.effects);
 }
});
