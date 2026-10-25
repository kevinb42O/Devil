import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SkullMotion,skullAngleDelta} from '../src/skull-motion';
import {World,idleInput,type Enemy} from '../src/simulation';

const player={x:0,y:2,z:30};
function fixture(kind:Enemy['kind']='skull'){
 const world=new World(71,{schedule:false,invulnerable:true});
 const enemy=world.spawn(kind,{x:0,y:2,z:0});enemy.age=10;enemy.vel={x:0,y:0,z:6};
 const motion=new SkullMotion();motion.begin(world,0);motion.sample(enemy,player);motion.end();
 return {world,enemy,motion};
}
function sample(f:ReturnType<typeof fixture>,time:number,heading:number,vy=0,reduced=false,grounded=false){
 f.enemy.age=10+time;f.enemy.vel={x:Math.sin(heading)*6,y:vy,z:Math.cos(heading)*6};
 f.motion.begin(f.world,time);const pose=f.motion.sample(f.enemy,player,reduced,grounded);f.motion.end();return {...pose};
}

test('banks toward each turn, pitches with flight, and levels after turning',()=>{
 for(const sign of [-1,1]){
  const f=fixture();let pose=sample(f,0,0);
  for(let i=1;i<=120;i++)pose=sample(f,i/120,sign*i/120);
  assert.ok(pose.roll*sign<-.05,JSON.stringify(pose));
  assert.ok(skullAngleDelta(pose.yaw-sign)*sign<0,'body follows heading with bounded lag');
  for(let i=121;i<=360;i++)pose=sample(f,i/120,sign);
  assert.ok(Math.abs(pose.roll)<.025,'straight flight settles');
 }
 for(const vy of [-6,6]){
  const f=fixture();let pose=sample(f,0,0);
  for(let i=1;i<=120;i++)pose=sample(f,i/120,0,vy);
  assert.ok(pose.pitch*vy<0);
  assert.ok(Math.abs(pose.pitch)<.4);
 }
});

test('yaw wraps along the shortest arc and stationary headings remain stable',()=>{
 const f=fixture();sample(f,.01,Math.PI-.01);
 let pose=sample(f,.02,-Math.PI+.01);
 assert.ok(Math.abs(skullAngleDelta(pose.yaw-(-Math.PI+.01)))<=.34);
 f.enemy.vel={x:0,y:0,z:0};f.motion.begin(f.world,.03);pose={...f.motion.sample(f.enemy,player,true)};
 assert.ok(Number.isFinite(pose.yaw));assert.ok(Math.abs(skullAngleDelta(pose.yaw-Math.PI))<.35);
});

test('source time freezes pause and duplicate renders; reset and seek never reuse future motion',()=>{
 const f=fixture();for(let i=1;i<=30;i++)sample(f,i/120,i/30);
 const before=sample(f,.25,1),again=sample(f,.25,1);
 assert.deepEqual(again,before);
 const seek=sample(f,.1,0);assert.ok(Math.abs(seek.yaw)<.03);assert.ok(Math.abs(seek.roll)<.03);
 const jump=sample(f,5,-1);assert.ok(Math.abs(jump.yaw+1)<.03);
 f.motion.begin({},5);const replaced=f.motion.sample(f.enemy,player);
 assert.ok(Math.abs(replaced.roll)<.03);
 f.motion.end();assert.equal(f.motion.size,1);f.motion.begin(f.world,5);f.motion.end();assert.equal(f.motion.size,0);
});

test('same-ID transmutation preserves attitude and phase, teleports and ID reuse reseed',()=>{
 const f=fixture();for(let i=1;i<=30;i++)sample(f,i/120,i/30);
 const before=sample(f,.25,1);f.enemy.kind='transmuted1';const after=sample(f,.25,1);
 assert.equal(before.phase,after.phase);assert.ok(Math.abs(before.yaw-after.yaw)<.02);
 f.enemy.pos.x=100;const teleport=sample(f,.26,-1);assert.ok(Math.abs(teleport.yaw+1)<.03);
 f.enemy.age=0;f.enemy.vel={x:0,y:0,z:6};f.motion.begin(f.world,.27);
 assert.ok(Math.abs(f.motion.sample(f.enemy,player).yaw)<.03);
});

test('hit impulses remain bounded under rapid fire; reduced motion and grounded profiles restrain rotation',()=>{
 const f=fixture('skull3');let full=0,reduced=0;
 for(let i=1;i<=180;i++){
  if(i%4===0)f.enemy.lastHit=i/120;
  const pose=sample(f,i/120,Math.sin(i/50)*2,6);assert.ok(Math.abs(pose.roll)<.53);assert.ok(Math.abs(pose.pitch)<.55);
  full=Math.max(full,Math.abs(pose.roll));
  const quiet=sample(f,i/120,Math.sin(i/50)*2,6,true);reduced=Math.max(reduced,Math.abs(quiet.roll));
 }
 assert.ok(reduced<full*.7);
 const drake=fixture('skull4');let pose=sample(drake,0,0,0,false,true);
 for(let i=1;i<=120;i++)pose=sample(drake,i/120,i/60,20,false,true);
 assert.ok(Math.abs(pose.pitch)<.001);assert.ok(Math.abs(pose.roll)<=.091);assert.equal(pose.lift,0);
});

test('presentation converges across display rates without mutating simulation or RNG',()=>{
 const poses=[30,60,120,144].map(hz=>{
  const f=fixture('skull2');let pose=sample(f,0,0);
  for(let i=1;i<=hz*2;i++)pose=sample(f,i/hz,Math.sin(i/hz)*.7,Math.sin(i/hz)*2);
  return pose;
 });
 for(const pose of poses)for(const key of ['yaw','pitch','roll'] as const)assert.ok(Math.abs(pose[key]-poses[2][key])<.025,key);
 const a=new World(18,{schedule:false,invulnerable:true}),b=new World(18,{schedule:false,invulnerable:true});
 for(const w of [a,b])for(const kind of ['skull','skull2','skull3','skull4'] as const){const e=w.spawn(kind,{x:8,y:4,z:8});e.age=10;}
 const motion=new SkullMotion();
 for(let i=0;i<240;i++){
  a.step(idleInput());b.step(idleInput());motion.begin(a,a.time);
  for(const e of a.enemies)motion.sample(e,a.player.pos);motion.end();
 }
 assert.deepEqual(a.captureCrewCheckpoint(),b.captureCrewCheckpoint(),'positions, health, contact, targets and RNG are untouched');
});
