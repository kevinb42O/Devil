import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HomingBodyIndex} from '../src/homing-body-index';
import {hasMeshArmor,isWholeBodyTarget,ENEMY_KINDS} from '../src/enemy-kinds';
import {armorBounds,sweepArmor} from '../src/projectile-collision';
import {World,v,STEP} from '../src/simulation';

test('skulls, transmuted skulls, eggs and mini spiders are whole-body targets without mesh armor',()=>{
 const w=new World(71,{schedule:false});
 for(const kind of ENEMY_KINDS.filter(k=>isWholeBodyTarget(k))){
  const e=w.spawn(kind,v(0,5,0));e.age=20;
  assert.equal(hasMeshArmor(kind),false);assert.equal(armorBounds(e),null);assert.equal(sweepArmor(e,w.player.pos,v(0,5,2),v(0,5,-2)),null);
  const hp=e.hp;w.projectiles=[{id:50000,pos:v(.05,5,1),vel:v(0,0,-2/STEP),age:0,homing:false}];
  (w as any).updateProjectiles(STEP);assert.equal(e.hp,hp-1,kind);w.enemies=[];
 }
});

test('exact body index matches exhaustive nearest targets after deaths and preserves ties',()=>{
 const w=new World(71,{schedule:false});let seed=71;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const targets=Array.from({length:600},(_,order)=>({order,enemy:w.spawn('skull',v((random()-.5)*80,random()*20,(random()-.5)*80))}));
 const index=new HomingBodyIndex([...targets]);
 for(let query=0;query<1000;query++){
  if(query%3===0)targets[Math.floor(random()*targets.length)].enemy.hp=0;
  const from=v((random()-.5)*200,random()*30,(random()-.5)*200);let best:typeof targets[number]|undefined,distance=Infinity;
  for(const target of targets){if(target.enemy.hp<=0)continue;const p=target.enemy.pos,d=(from.x-p.x)**2+(from.y-p.y)**2+(from.z-p.z)**2;if(d<distance){best=target;distance=d;}}
  const actual=index.nearest(from);assert.equal(actual?.order,best?.order);assert.equal(actual?.distanceSquared,distance);
 }
 const tied=[{enemy:w.spawn('skull',v(-1,0,0)),order:2},{enemy:w.spawn('skull',v(1,0,0)),order:1}];assert.equal(new HomingBodyIndex(tied).nearest(v())?.order,1);
 for(const t of targets)t.enemy.hp=0;assert.equal(index.nearest(v()),undefined);
});

test('indexed homing steering matches exhaustive whole-body and crystal search in a mixed swarm',()=>{
 const w=new World(71,{schedule:false});w.player.pos=v(0,2,25);w.time=120;
 for(let i=0;i<300;i++){const e=w.spawn(i%2?'skull2':'spiderling',v(Math.sin(i*2.399)*25,2+i%8,Math.cos(i*2.399)*25));e.age=20;}
 for(let i=0;i<6;i++){const e=w.spawn((['squid','squid2','squid3'] as const)[i%3],v((i%3-1)*14,5,-8-Math.floor(i/3)*15));e.age=20;}
 for(let i=0;i<16;i++)w.projectiles.push({id:50000+i,pos:v(Math.sin(i)*60,25+i,Math.cos(i)*60),vel:v(0,0,-35),age:0,homing:true,level:3});
 const expected=w.projectiles.map(p=>{
  let point:ReturnType<typeof v>|undefined,nearest=Infinity;
  for(const e of w.enemies){const candidate=(w as any).accessibleHomingPoint(e,p.pos);if(!candidate)continue;const distance=(p.pos.x-candidate.x)**2+(p.pos.y-candidate.y)**2+(p.pos.z-candidate.z)**2;if(distance<nearest){nearest=distance;point=candidate;}}
  assert.ok(point);const distance=Math.max(.001,Math.hypot(point.x-p.pos.x,point.y-p.pos.y,point.z-p.pos.z)),blend=STEP*7;
  return v(p.vel.x+((point.x-p.pos.x)/distance*42-p.vel.x)*blend,p.vel.y+((point.y-p.pos.y)/distance*42-p.vel.y)*blend,p.vel.z+((point.z-p.pos.z)/distance*42-p.vel.z)*blend);
 });
 (w as any).updateProjectiles(STEP);assert.deepEqual(w.projectiles.map(p=>p.vel),expected);
});
