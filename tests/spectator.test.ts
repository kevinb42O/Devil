import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SpectatorCamera,SPECTATOR_BUBBLE} from '../src/spectator';
import {World,idleInput} from '../src/simulation';
import {FriendsSession,applySnapshot} from '../src/multiplayer';

test('free flight follows camera aim, supports vertical flight and normalizes diagonal speed',()=>{
 const camera=new SpectatorCamera();camera.start({x:0,y:8,z:0});
 camera.move(.05,0,0,1,0,0);assert.ok(Math.abs(camera.position!.z+.6)<1e-8);
 camera.reset();camera.start({x:0,y:8,z:0});camera.move(.05,Math.PI/2,0,1,0,0);assert.ok(Math.abs(camera.position!.x+.6)<1e-8);
 camera.reset();camera.start({x:0,y:8,z:0});camera.move(.05,0,Math.PI/2,1,0,0);assert.ok(Math.abs(camera.position!.y-8.6)<1e-8);
 camera.reset();camera.start({x:0,y:8,z:0});camera.move(.05,0,0,1,1,1);
 assert.ok(Math.abs(Math.hypot(camera.position!.x,camera.position!.y-8,camera.position!.z)-.6)<1e-8);
 camera.reset();camera.start({x:0,y:8,z:0});camera.move(.05,0,0,0,0,1,true);assert.ok(Math.abs(camera.position!.y-9.2)<1e-8);
});

test('spectator stays inside the fixed arena bubble including when death occurs outside it',()=>{
 const camera=new SpectatorCamera();camera.start({x:60,y:-10,z:60});
 for(let i=0;i<1000;i++){
  camera.move(.05,0,.7,1,1,i<500?1:-1,true);
  const p=camera.position!,{center,radius,minY}=SPECTATOR_BUBBLE;
  assert.ok(Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z)<=radius+1e-8);assert.ok(p.y>=minY);
 }
 camera.reset();assert.equal(camera.position,null);
});

test('spectator survives snapshots without moving bodies or reviving, and crew wipe still ends the run',()=>{
 const host=new FriendsSession('host');const w=new World(1,{schedule:false});host.world=w;
 w.addCrew('host');w.addCrew('guest');w.crew[1].alive=false;
 const guest=new World(1),camera=new SpectatorCamera();
 applySnapshot(guest,structuredClone(host.snapshot()!),'guest');camera.start(guest.player.pos);
 camera.move(.05,0,0,1,1,1);const view={...camera.position!},body={...guest.player.pos};
 for(let i=0;i<10;i++){
  w.stepCrew(new Map([['host',{...idleInput(),forward:1}],['guest',{...idleInput(),forward:1,fire:true}]]));
  applySnapshot(guest,structuredClone(host.snapshot()!),'guest');camera.start(guest.player.pos);
 }
 assert.deepEqual(camera.position,view);assert.deepEqual(guest.player.pos,body);assert.equal(guest.crew[1].alive,false);assert.equal(w.stats.shots,0);
 w.crew[0].alive=false;w.stepCrew(new Map());assert.equal(w.state,'dead');host.close();
});
