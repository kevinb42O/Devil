import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,v,STEP} from '../src/simulation.ts';
import {sweepFloor,tileHeight,TILE_SIZE} from '../src/arena.ts';
import {Sound} from '../src/audio.ts';
import {createRun} from '../src/replay.ts';
import {updateCentipede} from '../src/centipede-motion.ts';

test('final survivor killed before a centipede update completes the crew wipe without crashing',()=>{
 for(const count of [1,4]){
  const w=new World(1,{schedule:false});for(let i=0;i<count;i++)w.addCrew(String(i));
  for(const p of w.crew.slice(1))p.alive=false;w.selectCrew('0');
  const killer=w.spawn('skull',{...w.player.pos});killer.age=2;
  const c=w.spawn('centipede',v(20,6,0));
  Object.assign(c,{age:10,activeAt:3,status:'hunting',pos:v(20,6,0),vel:v(-8,0,0),nextMove:6,statusUntil:30});
  assert.doesNotThrow(()=>w.stepCrew(new Map([['0',idleInput()]])));
  assert.equal(w.state,'dead');assert.equal(w.cause,'CREW LOST');assert.ok(w.crew.every(p=>!p.alive));
  assert.equal(w.effects.filter(e=>e.kind==='death').length,1);
  const time=w.time;w.stepCrew(new Map());assert.equal(w.time,time);
  assert.doesNotThrow(()=>updateCentipede(c,STEP,{radius:w.radius,players:[],floor:()=>0,random:()=>.5,emit:()=>{}}));
 }
});

const pair=(()=>{for(let x=20;x<30;x++)for(let z=20;z<30;z++){
 const high=tileHeight(x,z,0),low=tileHeight(x+1,z,0);if(high-low>.01)return {x,z,high,low};
}throw Error('No unequal floor tiles found');})();
test('floor sweep finds contacts before a lower tile and at entry into a higher tile',()=>{
 const {x,z,high,low}=pair,boundary=(x-25+.5)*TILE_SIZE,zz=(z-25)*TILE_SIZE;
 const a=v(boundary-.55,high+.0801,zz),b=v(a.x+70*STEP,a.y-.1*STEP,zz);
 const hit=sweepFloor(a,b,0);assert.ok(hit);assert.ok(Math.abs(hit.t-.001/STEP)<1e-8);assert.equal(hit.y,high+.08);
 const back=v(boundary+.55,low+.081,zz),end=v(back.x-70*STEP,back.y-.1*STEP,zz),raised=sweepFloor(back,end,0);
 assert.ok(raised);assert.ok(Math.abs(raised.t-.55/(70*STEP))<1e-8);assert.equal(raised.y,high+.08);
 assert.equal(sweepFloor(a,v(a.x+.1,a.y+.1,zz),0),null);
 assert.equal(sweepFloor(v(1000,0,1000),v(1001,-1,1000),0),null);
});
test('real projectile ricochets at an earlier tile contact; older replay revisions retain endpoint rules',()=>{
 const {x,z,high}=pair,boundary=(x-25+.5)*TILE_SIZE,zz=(z-25)*TILE_SIZE;
 for(const legacy of [false,true]){
  const w=legacy?createRun(1,undefined,6,true,9):new World(1,{schedule:false});
  w.projectiles=[{id:999,pos:v(boundary-.55,high+.0801,zz),vel:v(70,-.1,0),age:0,homing:false,level:1}];
  w.step(idleInput());assert.equal(w.projectiles[0].floorBounces??0,legacy?0:1);
  const ricochet=w.effects.find(e=>e.kind==='ricochet');assert.equal(!!ricochet,!legacy);
  if(ricochet){assert.ok(ricochet.pos.x<boundary);assert.equal(ricochet.pos.y,high+.08);}
 }
});
test('enemy contact before a floor contact still receives the projectile first',()=>{
 const {x,z,high}=pair,start=(x-25+.5)*TILE_SIZE-.55,zz=(z-25)*TILE_SIZE;
 const w=new World(1,{schedule:false}),target=w.spawn('skull3',v(start+.03,high+.08007,zz));target.age=2;target.radius=.005;
 w.projectiles=[{id:999,pos:v(start,high+.0801,zz),vel:v(70,-.1,0),age:0,homing:false,level:1}];
 (w as any).updateProjectiles(STEP);assert.equal(target.hp,9);assert.equal(w.stats.hits,1);assert.ok(!w.effects.some(e=>e.kind==='ricochet'));
});
test('remote deaths preserve local audio and use victim cause and position; local death and crew wipe clear audio',()=>{
 const w=new World(1,{schedule:false});w.addCrew('host');w.addCrew('guest');w.selectCrew('host');
 const sound=new Sound(),calls:{name:string;pos:unknown}[]=[];let clears=0;
 sound.clear=()=>clears++;(sound as any).oneShot=(name:string,pos:unknown)=>calls.push({name,pos});
 w.crew[1].alive=false;w.crew[1].cause='FALLEN';const pos=v(20,1.7,0);
 sound.play({kind:'death',shooterId:'guest',pos},w);assert.equal(clears,0);assert.deepEqual(calls.pop(),{name:'fall',pos});
 w.crew[1].cause='';sound.play({kind:'death',shooterId:'guest',deathCause:'FALLEN',pos},w);
 assert.equal(clears,0);assert.deepEqual(calls.pop(),{name:'fall',pos});
 w.crew[0].cause='SWARMED';sound.play({kind:'death',shooterId:'host',pos},w);
 assert.equal(clears,1);assert.deepEqual(calls.pop(),{name:'death',pos:undefined});
 w.state='dead';sound.play({kind:'death',shooterId:'guest',pos},w);assert.equal(clears,2);
});
test('crew death effects retain their cause before a snapshot reaches listeners',()=>{
 const w=new World(1,{schedule:false});w.addCrew('host');w.selectCrew('host');
 w.player.pos=v(1000,-9,1000);w.stepCrew(new Map());
 const death=w.effects.find(e=>e.kind==='death');assert.equal(death?.deathCause,'FALLEN');assert.equal(death?.shooterId,'host');
});
