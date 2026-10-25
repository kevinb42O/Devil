import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,STEP,idleInput,v,type Enemy} from '../src/simulation';
import {enemyFloorHeight} from '../src/enemy-floor';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
import {packReplay,unpackReplay} from '../src/replay-file';

const advance=(w:World,n:number)=>{for(let i=0;i<n;i++){w.step(idleInput());w.effects=[];}};

test('tower-emitted Drake lands and stays on the floor while chasing',()=>{
 for(const seed of [1,17,81]){
  const w=new World(seed,{schedule:false,invulnerable:true}),tower=w.spawn('squid3',v(22,0,0));
  tower.age=12;tower.nextSpawn=Infinity;
  (w as unknown as {ejectSkull(e:Enemy,index:number,delay:number,legacy:boolean):void}).ejectSkull(tower,15,0,false);
  const drake=w.enemies.at(-1)!;assert.equal(drake.kind,'skull4');
  const start=drake.pos.y;advance(w,60);assert.ok(drake.pos.y>start,'clears the crown before descending');
  advance(w,540);
  assert.ok(Math.abs(drake.pos.y-enemyFloorHeight(drake,w.time)-drake.radius-.02)<1e-8,'lands on the floor');
  for(let tick=0;tick<240;tick++){
   w.player.pos=v(0,12,0);w.player.vel=v();w.player.grounded=false;
   advance(w,1);
   assert.ok(drake.pos.y-enemyFloorHeight(drake,w.time)-drake.radius-.02<.2,'jumping targets cannot lift the Drake; small drops follow tile edges');
  }
 }
});

test('ground pursuit speed and direction do not depend on target altitude',()=>{
 const worlds=[1.7,14].map(y=>{const w=new World(71,{schedule:false,invulnerable:true});w.player.pos=v(0,y,0);const e=w.spawn('skull4',v(25,1.32,0));e.age=12;return w;});
 for(let i=0;i<120;i++)for(const [index,w] of worlds.entries()){
  w.player.pos=v(0,index?14:1.7,0);w.player.vel=v();w.player.grounded=false;advance(w,1);
 }
 assert.equal(worlds[0].enemies[0].pos.x,worlds[1].enemies[0].pos.x);
 assert.equal(worlds[0].enemies[0].pos.z,worlds[1].enemies[0].pos.z);
 assert.ok(worlds[0].enemies[0].vel.x < -8.9,'retains pursuit speed after landing');
});

test('ground movement also applies to transmuted Drakes',()=>{
 const w=new World(71,{schedule:false,invulnerable:true}),e=w.spawn('transmuted4',v(20,8,0));e.age=12;
 advance(w,240);assert.ok(Math.abs(e.pos.y-enemyFloorHeight(e,w.time)-e.radius-.02)<1e-8);
});

test('new solo recordings save ground behavior while earlier recordings keep hovering',()=>{
 const w=createRun(71,{time:244,level:3,reserve:0}),recorder=new RunRecorder(71,{time:244,level:3,reserve:0});
 const input=idleInput();recorder.record(input);w.step(input);
 const run=unpackReplay(packReplay(recorder.finish(w))),p=new ReplayPlayer(run);
 assert.equal(p.world.groundSkullsEnabled,true);p.seek(1);p.seek(0);assert.equal(p.world.groundSkullsEnabled,true);
 delete run.groundSkulls;assert.equal(new ReplayPlayer(run).world.groundSkullsEnabled,false);
});

test('crew checkpoint round trips keep new movement and missing flags restore old movement',()=>{
 const w=new World(71,{schedule:false,invulnerable:true});w.addCrew('host');
 const checkpoint=w.captureCrewCheckpoint();assert.equal(World.restoreCrewCheckpoint(checkpoint).groundSkullsEnabled,true);
 delete checkpoint.options.legacyGroundSkulls;
 assert.equal(World.restoreCrewCheckpoint(checkpoint).groundSkullsEnabled,false);
});
