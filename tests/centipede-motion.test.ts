import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,v,idleInput,distance} from '../src/simulation.ts';
import {CENTIPEDE_TUNING} from '../src/centipede-motion.ts';
const advance=(w:World,n:number)=>{for(let i=0;i<n;i++){w.effects=[];w.step(idleInput());}};
const setup=()=>{const w=new World(32,{schedule:false,invulnerable:true});w.player.pos=v(-15,1.7,-15);const e=w.spawn('centipede',v(15,3,0));return {w,e};};

test('first centipede emerges head first after the three-second underground warning',()=>{
 const {w,e}=setup();advance(w,359);assert.equal(w.active(e),false);assert.ok(e.pos.y<0);
 advance(w,2);assert.ok(e.pos.y>=0);assert.ok(w.effects.some(f=>f.kind==='emerge')||e.centipedeMotion?.cue);
 assert.ok(e.segments.every(s=>s.pos.y<0),'the body is still coming up through the exit');
 advance(w,120);assert.ok(e.pos.y>0);assert.ok(e.segments.some(s=>s.pos.y>0));assert.ok(e.segments.some(s=>s.pos.y<0));
});

test('dive is continuous, head first, followed by the tail and an underground wait',()=>{
 const {w,e}=setup();advance(w,120*9);e.statusUntil=e.age;const before=e.segments.map(s=>({...s.pos}));advance(w,1);
 assert.equal(e.status,'burrowing');assert.deepEqual(e.segments.map(s=>s.pos),before,'beginning a dive does not translate the entire body');
 let mixed=false,undergroundAt=0;
 for(let i=0;i<120*15;i++){
  const old={...e.pos},body=e.segments.map(s=>({...s.pos}));advance(w,1);
  assert.ok(distance(old,e.pos)<=CENTIPEDE_TUNING.speed*STEP+1e-6,'visible head never teleports');
  for(let j=0;j<body.length;j++)assert.ok(distance(body[j],e.segments[j].pos)<.16,'tail follows continuously');
  if(e.pos.y<-1&&e.segments.some(s=>s.pos.y>0))mixed=true;
  if(e.centipedeMotion?.stage==='underground'){undergroundAt=e.age;break;}
 }
 assert.ok(mixed,'head disappears while tail is still above the arena');assert.ok(undergroundAt);assert.equal(w.active(e),false);
 const oldExit={...e.pos},hp=e.segments.map(s=>s.hp);e.segments[0].hp=0;e.hp-=hp[0];
 advance(w,120*6);assert.equal(e.centipedeMotion?.stage,'underground');assert.deepEqual(e.pos,oldExit);
 advance(w,120*3);assert.equal(w.active(e),false);
 advance(w,121);assert.equal(e.centipedeMotion?.stage,'rising');assert.ok(Math.hypot(e.pos.x-oldExit.x,e.pos.z-oldExit.z)>5);
 assert.equal(e.segments[0].hp,0);assert.deepEqual(e.segments.slice(1).map(s=>s.hp),hp.slice(1));
});

test('timed burrowing and new emergence cycles repeat without stopping or invalid transforms',()=>{
 const {w,e}=setup();let dives=0,emerges=0,lastDive=-100;
 for(let i=0;i<120*180;i++){
  advance(w,1);
  for(const f of w.effects){if(f.kind==='burrow'){dives++;assert.ok(e.age-lastDive>10);lastDive=e.age;}if(f.kind==='emerge')emerges++;}
  assert.ok([e.pos,...e.segments.map(s=>s.pos),e.vel].every(p=>[p.x,p.y,p.z].every(Number.isFinite)));
  assert.ok((e.centipedeMotion?.path.length??0)<1000,'trail storage stays bounded');
 }
 assert.ok(dives>=4);assert.ok(emerges>=4);assert.equal(e.hp,75);
});

test('surfaced centipede turns with forward motion and can dive below the floor',()=>{
 const {w,e}=setup();advance(w,120*7);
 let minY=Infinity,maxY=-Infinity;
 for(let i=0;i<120*20;i++){advance(w,1);minY=Math.min(minY,e.pos.y);maxY=Math.max(maxY,e.pos.y);}
 assert.ok(maxY>5);assert.ok(minY<-5,'motion is not constrained to a sine wave above the floor');
});
