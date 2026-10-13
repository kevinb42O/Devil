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
 assert.ok(['overpass','diving'].includes(e.centipedeMotion!.stage));for(let j=0;j<before.length;j++)assert.ok(distance(before[j],e.segments[j].pos)<.16,'committed pass keeps the body continuous');
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

function passSetup(){
 const w=new World(32,{schedule:false}),e=w.spawn('centipede',v(0,3,14));w.player.pos=v(0,1.7,0);
 e.age=10;e.status='hunting';e.statusUntil=30;e.nextMove=6;e.pos=v(0,3,14);e.vel=v(0,0,-CENTIPEDE_TUNING.speed);
 e.segments.forEach((s,i)=>s.pos=v(0,3,14+(i+1)*CENTIPEDE_TUNING.spacing));return {w,e};
}

test('centipede rises, flies over the stationary player and exposes every gem before burial',()=>{
 const {w,e}=passSetup();const passed=new Set<number>();let maxY=0,headCrossHeight=0,firstGemTime=0,lastGemTime=0;
 for(let i=0;i<120*12&&w.state==='playing';i++){
  const before=e.segments.map(s=>({...s.pos})),oldHead={...e.pos};advance(w,1);maxY=Math.max(maxY,e.pos.y);
  if(oldHead.z>0&&e.pos.z<=0)headCrossHeight=e.pos.y;
  e.segments.forEach((s,j)=>{if(before[j].z>0&&s.pos.z<=0){assert.ok(s.pos.y>5,'gem crosses above scraping position');passed.add(j);if(!firstGemTime)firstGemTime=e.age;lastGemTime=e.age;}});
  if(e.centipedeMotion?.stage==='underground')break;
 }
 assert.equal(w.state,'playing','standing beneath the overhead arch is safe');assert.ok(maxY>=7);assert.ok(headCrossHeight>6);assert.equal(passed.size,25);assert.ok(lastGemTime-firstGemTime>3,'full-body scraping window');
});

test('visible heading and movement remain continuous through emergence, crest and dive',()=>{
 for(const {w,e} of [setup(),passSetup()]){
  let largestTurn=0;
  for(let i=0;i<120*20;i++){
   const old={...e.vel},pos={...e.pos},active=w.active(e);advance(w,1);
   if(active&&w.active(e)&&Math.hypot(old.x,old.y,old.z)>.1&&Math.hypot(e.vel.x,e.vel.y,e.vel.z)>.1){
    const dot=(old.x*e.vel.x+old.y*e.vel.y+old.z*e.vel.z)/(Math.hypot(old.x,old.y,old.z)*Math.hypot(e.vel.x,e.vel.y,e.vel.z));largestTurn=Math.max(largestTurn,Math.acos(Math.max(-1,Math.min(1,dot))));
    assert.ok(distance(pos,e.pos)<=CENTIPEDE_TUNING.speed*STEP+1e-5);
   }
  }
  assert.ok(largestTurn<.08,`no sudden visible turns: ${largestTurn} radians/tick`);
 }
});

test('a stationary player can scrape all 25 gems with aimed level-two stream fire',()=>{
 const {w,e}=passSetup();w.level=2;const t=CENTIPEDE_TUNING;
for(let i=0;i<120*12&&w.state==='playing'&&e.hp>0;i++){
 const index=e.segments.findIndex(s=>s.hp>0),target=e.segments[index].pos,leader=index?e.segments[index-1].pos:e.pos;
 const travel=Math.hypot(target.x,target.y-1.7,target.z)/70,length=Math.hypot(leader.x-target.x,leader.y-target.y,leader.z-target.z)||1;
 const point=v(target.x+(leader.x-target.x)/length*t.speed*travel,target.y+(leader.y-target.y)/length*t.speed*travel,target.z+(leader.z-target.z)/length*t.speed*travel);
 w.step({...idleInput(),fire:true,yaw:Math.atan2(-point.x,-point.z),pitch:Math.atan2(point.y-1.7,Math.hypot(point.x,point.z))});
}
 assert.equal(w.state,'playing');assert.equal(e.hp,0);assert.equal(e.segments.filter(s=>s.hp===0).length,25);
});
