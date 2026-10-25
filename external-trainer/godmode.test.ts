import test from 'node:test';
import assert from 'node:assert/strict';
import {World,idleInput,STEP} from '../src/simulation.ts';
import {floorHeight} from '../src/arena.ts';
import {createGodmode} from './godmode.mjs';
import {createSurvivalAssist} from './survival.mjs';
import {arenaData} from './arena-data.mjs';
import {createMemoryAim} from './targeting.mjs';

function fixture(){
  const world=new World(123,{schedule:false});
  world.player.pos={x:0,y:floorHeight(0,0,0)+1.7,z:0};
  const state={world,mode:'playing',focused:true,yaw:0,pitch:0};
  let time=0;
  const env={performance:{now:()=>time}};
  const access:any={get:()=>state,set:()=>{},survival:null};
  access.survival=createSurvivalAssist(access,arenaData,env);
  access.godmode=createGodmode(access,env);
  const original=world.die;
  const adapter=createMemoryAim(access,env);
  adapter.control({enabled:false,godmode:true});
  return {world,state,adapter,original,expire(){time=600;}};
}

test('lethal real enemy contact is blocked with aim off and settings open',()=>{
  const f=fixture();
  f.adapter.control({enabled:false,godmode:true,suspended:true});f.state.focused=false;
  const enemy=f.world.spawn('thorn',{...f.world.player.pos,y:0});enemy.age=12;enemy.activeAt=0;
  f.world.step(idleInput(),STEP);
  assert.equal(f.world.state,'playing');assert.equal(f.adapter.snapshot().godmode.active,true);
  f.adapter.control({enabled:false,godmode:false});
  assert.equal(f.world.die,f.original);
  f.world.step(idleInput(),STEP);assert.equal(f.world.state,'dead');
  f.adapter.stop();
});

test('real fall returns player to safe ground and clears falling velocity',()=>{
  const f=fixture();f.world.player.pos={x:100,y:-9,z:0};f.world.player.vel.y=-30;
  f.world.step(idleInput(),STEP);
  assert.equal(f.world.state,'playing');assert.equal(f.world.player.pos.x,0);
  assert.equal(f.world.player.pos.y,floorHeight(0,0,f.world.time)+1.7);
  assert.deepEqual(f.world.player.vel,{x:0,y:0,z:0});f.adapter.stop();
});

test('expired heartbeat restores lethal behavior without another adapter frame',()=>{
  const f=fixture();f.expire();f.world.die('FALLEN');assert.equal(f.world.state,'dead');f.adapter.stop();
});

test('stop and replacement world release hooks',()=>{
  const f=fixture();const next=new World(456,{schedule:false}),original=next.die;
  f.state.world=next;f.adapter.step();assert.equal(f.world.die,f.original);
  assert.notEqual(next.die,original);f.adapter.stop();assert.equal(next.die,original);
});

test('host godmode protects only the local crew member',()=>{
  const f=fixture();f.world.addCrew('host');f.world.addCrew('guest');f.world.selectCrew('host');
  f.adapter.step();
  const local=f.world.crew[0],guest=f.world.crew[1];
  f.world.player=guest.player;(f.world as any).activeCrew=guest;f.world.die('CONTACT');assert.equal(guest.alive,false);
  f.world.player=local.player;(f.world as any).activeCrew=local;f.world.die('CONTACT');assert.equal(local.alive,true);
  f.adapter.stop();
});
