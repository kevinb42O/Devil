import test from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,STEP} from '../src/simulation.ts';
import {floorHeight} from '../src/arena.ts';
import {SURVIVAL_HEADER,SURVIVAL_HEIGHTS} from '../src/survival-data.ts';
import {createSurvivalAssist} from './survival.mjs';
import {createMemoryAim} from './targeting.mjs';
import {arenaData} from './arena-data.mjs';

function fixture(){
 const world=new World(123,{schedule:false});
 world.player.pos={x:0,y:floorHeight(0,0,0)+1.7,z:0};
 const state={world,mode:'playing',focused:true,entrance:false,yaw:0,pitch:0,fire:false};
 const environment={performance:{now:()=>world.time*1000}};
 const access:any={get:()=>state,set:(yaw:number,pitch:number)=>{state.yaw=yaw;state.pitch=pitch;}};
 const survival=createSurvivalAssist(access,arenaData,environment);access.survival=survival;
 const original=(world as any).move;
 const adapter=createMemoryAim(access,environment);
 const input=idleInput();
 const control=(options={})=>adapter.control({enabled:true,auto_dodge:true,edge_guard:true,emergency_targeting:true,dodge_horizon:.75,...options});
 control();
 return {world,state,environment,access,survival,adapter,input,control,original,step(){control();world.step({...input,yaw:state.yaw,pitch:state.pitch},STEP);}};
}

test('standalone arena matches live game tiles and timed shrink',()=>{
 assert.deepEqual(arenaData.header,SURVIVAL_HEADER);assert.deepEqual(arenaData.heights,SURVIVAL_HEIGHTS);
 const f=fixture();
 for(const t of [0,60,600,1200])for(let x=-35;x<=35;x+=1.4)for(let z=-35;z<=35;z+=1.4)assert.equal(f.survival.floor(x,z,t),floorHeight(x,z,t));
 f.adapter.stop();
});

test('safe manual movement and caller input remain unchanged',()=>{
 const f=fixture(),baseline=new World(123,{schedule:false});
 baseline.player.pos={...f.world.player.pos};
 f.input.forward=1;const before={...f.input};
 for(let i=0;i<60;i++){f.step();baseline.step(f.input,STEP);}
 assert.deepEqual(f.world.player,baseline.player);assert.deepEqual(f.input,before);assert.equal(f.survival.snapshot().active,false);
 f.adapter.stop();assert.equal((f.world as any).move,f.original);
});

test('emergency collision overrides a hittable tower, FOV and target lock',()=>{
 const f=fixture();
 const tower=f.world.spawn('squid',{x:0,y:3.3,z:-15});tower.age=12;
 const skull=f.world.spawn('skull',{x:3,y:1,z:0});skull.age=12;skull.vel={x:-10,y:0,z:0};
 f.control({selection:'health',lock_ms:2000,fov:20});
 const result=f.adapter.step();
 assert.equal(result.target.enemy,skull.id);assert.equal(result.target.priority,-1);assert.equal(result.target.emergency,true);
 f.control({emergency_targeting:false,fov:360});assert.equal(f.adapter.step().target.enemy,tower.id);
 f.adapter.stop();
});

test('prediction rejects an enemy passing alongside instead of colliding',()=>{
 const f=fixture(),e=f.world.spawn('skull',{x:5,y:1,z:5});e.age=12;e.vel={x:-10,y:0,z:0};
 f.control();assert.equal(f.survival.threat(e),Infinity);f.adapter.stop();
});

test('walking into a stationary lethal enemy is avoided using real physics',()=>{
 const f=fixture();f.input.forward=1;
 const e=f.world.spawn('thorn',{x:0,y:0,z:-4});e.age=12;e.activeAt=0;
 const baseline=new World(123,{schedule:false});baseline.player.pos={...f.world.player.pos};
 const killer=baseline.spawn('thorn',{x:0,y:0,z:-4});killer.age=12;killer.activeAt=0;
 let assisted=false;
 for(let i=0;i<120&&f.world.state==='playing';i++){f.step();assisted||=f.survival.snapshot().active;}
 for(let i=0;i<120&&baseline.state==='playing';i++)baseline.step(f.input,STEP);
 assert.equal(baseline.state,'dead','same unassisted input must die in the fixture');
 assert(assisted,'must intervene before contact');assert.equal(f.world.state,'playing');
 assert(Math.hypot(f.world.player.pos.x-e.pos.x,f.world.player.pos.z-e.pos.z)>e.radius+.35);
 f.adapter.stop();
});

test('edge protection keeps outward input on the shrinking tiled arena',()=>{
 const f=fixture();f.world.time=600;f.world.radius=20;
 let edge=0;for(let x=0;x<35;x+=.1)if(floorHeight(x,0,600)>-1)edge=x;
 f.world.player.pos={x:edge-1.8,y:floorHeight(edge-1.8,0,600)+1.7,z:0};
 f.world.player.vel={x:8,y:0,z:0};f.input.strafe=1;
 let assisted=false;
 for(let i=0;i<180&&f.world.state==='playing';i++){f.step();assisted||=f.survival.snapshot().active;}
 assert(assisted);assert.equal(f.world.state,'playing');assert(f.world.player.pos.y>0);
 f.adapter.stop();
});

test('disable, lost focus, settings, stale heartbeat, entrance and death preserve movement',()=>{
 for(const condition of ['disabled','focus','settings','stale','entrance','death']){
  const f=fixture();f.input.forward=1;
  const thorn=f.world.spawn('thorn',{x:0,y:0,z:-3});thorn.age=12;
  if(condition==='disabled')f.adapter.control({enabled:false});
  if(condition==='focus')f.state.focused=false;
  if(condition==='settings')f.adapter.control({enabled:true,suspended:true});
  if(condition==='stale')f.world.time+=1;
  if(condition==='entrance')f.state.entrance=true;
  if(condition==='death')f.world.state='dead';
  const input={...f.input};(f.world as any).move(input,STEP);
  assert.equal(f.world.player.vel.x,0,condition);assert.equal(f.survival.snapshot().active,false,condition);assert.deepEqual(input,f.input,condition);
  f.adapter.stop();
 }
});

test('other crew members are never steered by the local assist',()=>{
 const f=fixture();const other={...f.world.player,pos:{...f.world.player.pos},vel:{x:0,y:0,z:0}};
 const thorn=f.world.spawn('thorn',{x:0,y:0,z:-2});thorn.age=12;
 f.world.player=other;(f.world as any).move({...idleInput(),forward:1},STEP);
 assert.equal(other.vel.x,0);assert.equal(f.survival.snapshot().active,false);f.adapter.stop();
});


test('fast crossing collisions are detected between prediction samples',()=>{
 const f=fixture();const skull=f.world.spawn('skull',{x:-3,y:1,z:0});skull.age=12;skull.vel={x:100,y:0,z:0};
 f.control();assert(f.survival.threat(skull)<.04);f.adapter.stop();
});

test('a second hazard changes the selected escape corridor',()=>{
 const f=fixture();f.input.forward=1;
 for(const pos of [{x:0,y:0,z:-4},{x:-2,y:0,z:-3}]){const e=f.world.spawn('thorn',pos);e.age=12;}
 let active=false;for(let i=0;i<120&&f.world.state==='playing';i++){f.step();active||=f.survival.snapshot().active;}
 assert(active);assert.equal(f.world.state,'playing');f.adapter.stop();
});

test('new world removes old hook, and stop restores both movement and aim hooks',()=>{
 const f=fixture();const old=f.world,next=new World(456,{schedule:false});
 const move=(next as any).move;f.state.world=next;f.control();
 assert.equal((old as any).move,f.original);assert.notEqual((next as any).move,move);
 f.adapter.stop();assert.equal((next as any).move,move);
});

test('survival forecasting stays bounded in a crowded scene',()=>{
 const f=fixture();f.input.forward=1;
 for(let i=0;i<120;i++){const e=f.world.spawn('skull',{x:Math.sin(i)*10,y:1,z:Math.cos(i)*10});e.age=12;e.vel={x:0,y:0,z:-3};}
 const before=process.cpuUsage();
 for(let i=0;i<30;i++){f.world.tick+=4;f.world.time+=4*STEP;f.control();(f.world as any).move({...f.input},STEP);}
 const usage=process.cpuUsage(before),ms=(usage.user+usage.system)/1000/30;
 console.log(`120-enemy survival planning: ${ms.toFixed(2)} ms CPU / update`);
 assert(ms<20);f.adapter.stop();
});


test('tower body extends below its crown and contributes a collision threat',()=>{
 const f=fixture(),tower=f.world.spawn('squid2',{x:3,y:6,z:0});tower.age=12;tower.vel={x:-8,y:0,z:0};
 f.control();assert(f.survival.threat(tower)<.75,'standing below the crown must still be considered lethal');f.adapter.stop();
});

test('movement faults pass through normal physics and stop intervention',()=>{
 const f=fixture();f.input.forward=1;
 const e=f.world.spawn('thorn',{x:0,y:0,z:-2});e.age=12;
 f.control();f.access.get=()=>{throw Error('lost state')};
 (f.world as any).move({...f.input},STEP);
 assert.equal(f.world.player.vel.x,0);assert.equal(f.survival.snapshot().active,false);assert.match(f.survival.snapshot().reason,/fault/);f.adapter.stop();
});


test('guest prediction movement is left to the authoritative host',()=>{
 const f=fixture();f.input.forward=1;
 const thorn=f.world.spawn('thorn',{x:0,y:0,z:-2});thorn.age=12;
 (f.world as any).prediction=true;(f.world as any).move({...f.input},STEP);
 assert.equal(f.world.player.vel.x,0);assert.equal(f.survival.snapshot().active,false);f.adapter.stop();
});
