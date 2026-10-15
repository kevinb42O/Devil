import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryAim} from './targeting.mjs';

function fixture(enemies=[],extraAccess={}){
  let now=1000, raf;
  const handlers=new Map();
  const world={time:1,tick:120,state:'playing',player:{pos:{x:0,y:1.7,z:0}},enemies,gems:[],active:e=>e.active!==false,
    weakPoint:e=>e.weakpoints?.length?{x:e.pos.x+e.weakpoints[0].local.x,y:e.pos.y+e.weakpoints[0].local.y,z:e.pos.z+e.weakpoints[0].local.z}:e.pos};
  const state={world,mode:'playing',focused:true,yaw:0,pitch:0,fire:false,homing:false};
  const calls=[];
  const env={performance:{now:()=>now},requestAnimationFrame:fn=>{raf=fn;return 1;},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};
  const adapter=createMemoryAim({...extraAccess,get:()=>state,set:(yaw,pitch)=>{calls.push({yaw,pitch});state.yaw=yaw;state.pitch=pitch;}},env);
  adapter.control({enabled:true,prediction:false});
  return {world,state,calls,adapter,handlers,env,flush(){raf?.(now);},advance(ms){now+=ms;world.time+=ms/1000;world.tick++;},enemy};
}
function enemy(id,kind='skull',x=0,z=-12){return {id,kind,pos:{x,y:1.7,z},vel:{x:0,y:0,z:0},hp:5,segments:[],weakpoints:[],radius:.6,size:1,headExposure:1};}
function tower(id=2){const e=enemy(id,'squid2',8,-16);e.weakpoints=[{hp:4,local:{x:-1,y:0,z:0}},{hp:4,local:{x:1,y:0,z:0}}];return e;}

test('attached tower crystals outrank a centered nearby enemy',()=>{
  const f=fixture([enemy(1),tower()]);
  const s=f.adapter.step();
  assert.equal(s.target.enemy,2);assert.equal(s.target.priority,0);assert.match(s.target.id,/crystal/);
});
test('destroyed/detached crystals and loose gems are immediately excluded',()=>{
  const t=tower(),f=fixture([enemy(1),t]);
  const chosen=f.adapter.step().target;
  t.weakpoints[Number(chosen.index.replace('crystal',''))].hp=0;
  f.world.gems.push({id:100,pos:chosen.pos});
  assert.notEqual(f.adapter.step().target.id,chosen.id);
  t.weakpoints.forEach(p=>p.hp=0);
  assert.equal(f.adapter.step().target.enemy,1);
  assert(f.adapter.step().candidates.every(p=>p.enemy!==100));
});
test('aim while firing either weapon, no modifier, and stop when disabled',()=>{
  const f=fixture([enemy(1,'skull',10)]);
  assert.equal(f.adapter.step().active,false);
  f.state.fire=true;assert.equal(f.adapter.step().active,true);
  assert(Math.abs(f.calls.at(-1).yaw+Math.atan2(10,12))<1e-12);
  f.state.fire=false;f.state.homing=true;assert.equal(f.adapter.step().active,true);
  f.adapter.control({enabled:false});assert.equal(f.adapter.step().active,false);
});
test('idle mouse movement does not activate aiming; clicks activate immediately',()=>{
  const f=fixture([enemy(1)]);
  assert.equal(f.calls.length,0);
  f.handlers.get('mousedown')({button:0});assert(f.calls.length>0);
  f.handlers.get('mouseup')({button:0});
  assert.equal(f.adapter.step().active,false);
});
test('right mouse / homing activates without a held modifier',()=>{
  const f=fixture([enemy(1)]);
  f.handlers.get('mousedown')({button:2});assert.equal(f.adapter.step().active,true);
  f.handlers.get('mouseup')({button:2});assert.equal(f.adapter.step().active,false);
});
test('focus, menus, death, suspension and stale heartbeat suppress aim',()=>{
  for(const mutate of [f=>f.state.focused=false,f=>f.state.mode='paused',f=>f.world.state='dead',f=>f.adapter.control({enabled:true,suspended:true}),f=>f.advance(501)]){
    const f=fixture([enemy(1)]);f.state.fire=true;mutate(f);assert.equal(f.adapter.step().active,false);
  }
});
test('all 22 enemy kinds enumerate their live damage targets',()=>{
  const kinds=['squid','squid2','squid3','spider','spider2','skull','skull2','skull3','skull4','transmuted1','transmuted2','transmuted3','transmuted4','egg','egg2','spiderling','centipede','gigapede','ghostpede','leviathan','orb','thorn'];
  const entities=kinds.map((kind,i)=>enemy(i+1,kind));
  const f=fixture(entities);
  assert.deepEqual(new Set(f.adapter.step().candidates.map(p=>p.kind)),new Set(kinds));
});
test('dead and inactive enemies and destroyed segments are skipped',()=>{
  const dead=enemy(1);dead.hp=0;
  const dormant=enemy(2);dormant.active=false;
  const segmented=enemy(3,'centipede');segmented.segments=[{hp:0,pos:{x:0,y:1,z:-5}},{hp:3,pos:{x:0,y:1,z:-7}}];
  const f=fixture([dead,dormant,segmented]);assert.equal(f.adapter.step().targets,1);assert.equal(f.adapter.step().candidates.length,2);assert.match(f.adapter.step().target.id,/segment1/);
});
test('moving targets are led at the actual primary projectile speed',()=>{
  const e=enemy(1);e.vel.x=10;
  const f=fixture([e]);f.adapter.control({enabled:true,prediction:true});f.state.fire=true;
  const s=f.adapter.step();assert(s.target.predicted.x>s.target.pos.x);assert(s.target.aim.yaw<0);
});
test('aim is applied before the game animation callback, and uninstall restores RAF',()=>{
  const f=fixture([enemy(1,'skull',10)]),wrapped=f.env.requestAnimationFrame;
  f.state.fire=true;let observed;
  f.env.requestAnimationFrame(()=>observed=f.state.yaw);
  f.flush();assert(Math.abs(observed+Math.atan2(10,12))<1e-12);
  f.adapter.stop();assert.notEqual(f.env.requestAnimationFrame,wrapped);assert.equal(f.handlers.size,0);
});

test('large scene targeting stays within a small CPU budget',()=>{
  const f=fixture(Array.from({length:1500},(_,i)=>enemy(i+1,'skull',Math.sin(i)*30,-5-Math.abs(Math.cos(i)*40))));
  const start=process.cpuUsage();for(let i=0;i<40;i++){f.advance(8);f.adapter.step();}
  const cpu=process.cpuUsage(start),milliseconds=(cpu.user+cpu.system)/1000/40;
  assert(milliseconds<30,`1500 targets took ${milliseconds.toFixed(2)} ms per step`);
  console.log(`1500-target selection: ${milliseconds.toFixed(2)} ms CPU / step`);
});

test('new runs discard velocity history even when enemy IDs are reused',()=>{
  const e=enemy(1);e.vel.x=20;const f=fixture([e]);
  f.adapter.control({enabled:true,prediction:true});f.advance(16);e.pos.x+=.32;f.adapter.step();
  const fresh=enemy(1);f.state.world={...f.world,time:0,tick:0,enemies:[fresh]};
  const s=f.adapter.step();assert.deepEqual(s.target.predicted,fresh.pos);
});
test('losing capture or focus clears physical fire without a mouseup event',()=>{
  for(const event of ['blur','pointerlockchange','visibilitychange']){
    const f=fixture([enemy(1)]);f.handlers.get('mousedown')({button:0});assert(f.adapter.step().active);
    f.handlers.get(event)();assert.equal(f.adapter.step().active,false,event);
  }
});
test('an unsolicited mouseup does not snap aim',()=>{
  const f=fixture([enemy(1)]);f.handlers.get('mouseup')({button:0});assert.equal(f.calls.length,0);
});
test('trainer exceptions never suppress the original game frame callback',()=>{
  const f=fixture([enemy(1)]);const original=f.state.world;
  Object.defineProperty(f.state,'world',{configurable:true,get(){throw Error('test memory read failure');}});
  let frames=0;f.env.requestAnimationFrame(()=>frames++);f.flush();
  assert.equal(frames,1);assert.match(f.adapter.snapshot().message,/test memory read failure/);
  Object.defineProperty(f.state,'world',{configurable:true,value:original});
  f.state.fire=true;f.adapter.control({enabled:true});assert.equal(f.adapter.step().active,false,'fault remains latched');
  f.adapter.control({enabled:false});f.adapter.control({enabled:true});assert(f.adapter.step().active);
});
test('projection happens only for telemetry, not inside the aiming frame',()=>{
  let projections=0;const f=fixture([enemy(1)],{project(){projections++;return {x:10,y:10,box:[0,0,20,20]};}});
  projections=0;f.env.requestAnimationFrame(()=>{});f.flush();assert.equal(projections,0);
  f.adapter.snapshot();assert(projections>0);
});
test('projection errors do not disable aimbot',()=>{
  const f=fixture([enemy(1)],{project(){throw Error('bad camera');}});f.state.fire=true;
  const s=f.adapter.step();assert(s.active);assert.equal(s.target.box,null);
});
test('aim limits and excluded types do not hide ESP entries',()=>{
  const f=fixture([enemy(1,'skull',12,0)]);
  f.adapter.control({enabled:true,fov:60});let s=f.adapter.step();assert.equal(s.target,null);assert.equal(s.candidates.length,1);
  f.adapter.control({enabled:true,fov:360,max_distance:5});assert.equal(f.adapter.step().target,null);
  f.adapter.control({enabled:true,max_distance:196,excluded_kinds:'skull'});s=f.adapter.step();assert.equal(s.target,null);assert.equal(s.candidates.length,1);
});
test('ESP can show closed spider crystals without aiming at invulnerable heads',()=>{
  const e=enemy(1,'spider');e.headExposure=0;const f=fixture([e]);const s=f.adapter.step();
  assert.equal(s.target,null);assert.equal(s.candidates.length,1);assert.equal(s.candidates[0].aimable,false);
});
test('minimum lock duration never delays switching to a live tower crystal',()=>{
  const f=fixture([enemy(1,'skull',3)]);f.adapter.control({enabled:true,selection:'crosshair',lock_ms:1000,switch_bias:0});
  f.world.enemies.push(enemy(2));assert.equal(f.adapter.step().target.enemy,1);
  f.world.enemies.push(tower(3));assert.equal(f.adapter.step().target.enemy,3);
  f.world.enemies[2].weakpoints.forEach(p=>p.hp=0);assert.notEqual(f.adapter.step().target.enemy,3);
});
test('smooth tracking uses shortest rotation and a rate limit independent of polling',()=>{
  const f=fixture([enemy(1,'skull',10)]);f.adapter.control({enabled:true,aim_mode:'smooth',smooth_speed:180});
  f.state.fire=true;f.adapter.step();const first=f.state.yaw;
  assert(first<0&&Math.abs(first)<=Math.PI/120+.00001);
  f.adapter.step();assert.equal(f.state.yaw,first,'a telemetry poll must not add another smooth turn');
  f.advance(16);f.adapter.step();assert(Math.abs(f.state.yaw-first)<=Math.PI*.016+.00001);
});
test('priority customization and weak-health selection work together',()=>{
  const a=enemy(1),b=tower(2);a.hp=1;const f=fixture([a,b]);
  f.adapter.control({enabled:true,tower_priority:false,selection:'health',lock_ms:0,switch_bias:0});
  const s=f.adapter.step();assert.equal(s.target.enemy,1);assert.equal(s.candidates.find(p=>p.enemy===2).category,'tower');
});
test('loose gem storage is never even read',()=>{
  const f=fixture([enemy(1)]);Object.defineProperty(f.world,'gems',{get(){throw Error('Loose pickup storage must not be scanned');}});
  assert.equal(f.adapter.step().targets,1);
});

test('unavailable homing fire does not hijack aim or override primary prediction',()=>{
  const f=fixture([enemy(1)]);f.state.canHoming=false;f.handlers.get('mousedown')({button:2});
  assert.equal(f.adapter.step().active,false);f.handlers.get('mouseup')({button:2});assert.equal(f.calls.length,0);
  f.state.fire=true;assert(f.adapter.step().active);
});

test('blocked tower crystals yield immediately and regain priority as soon as hittable',()=>{
  let visible=true;
  const f=fixture([enemy(1,'skull',3,-6),tower(2)],{resolve:(e,p)=>e.kind.startsWith('squid')&&!visible?null:p});
  f.adapter.control({enabled:true,lock_ms:2000,switch_bias:45});
  assert.equal(f.adapter.step().target.enemy,2);
  visible=false;const s=f.adapter.step();assert.equal(s.target.enemy,1);
  assert(s.candidates.filter(p=>p.enemy===2).every(p=>!p.aimable));
  visible=true;assert.equal(f.adapter.step().target.enemy,2,'must switch before lock duration elapses');
});
test('nearest enemy beats crosshair alignment, lock hold and lock preference',()=>{
  const far=enemy(1),near=enemy(2,'skull',4,-6),f=fixture([far]);
  f.adapter.control({enabled:true,lock_ms:2000,switch_bias:45});
  assert.equal(f.adapter.step().target.enemy,1);
  f.world.enemies.push(near);assert.equal(f.adapter.step().target.enemy,2);
  far.pos.z=-2;assert.equal(f.adapter.step().target.enemy,1,'distance changes switch on the same update');
});
test('ordinary nearby enemy beats a farther segment or exposed spider weak point',()=>{
  for(const kind of ['spider','centipede']){
    const far=enemy(1,kind),near=enemy(2,'skull',3,-4);
    if(kind==='centipede')far.segments=[{hp:5,pos:far.pos}];
    assert.equal(fixture([far,near]).adapter.step().target.enemy,2,kind);
  }
});
test('nearest hittable crystal wins within the crystal priority tier',()=>{
  const far=tower(1),near=tower(2);near.pos={x:0,y:1.7,z:-6};
  assert.equal(fixture([far,near]).adapter.step().target.enemy,2);
});
test('armor-blocked predicted lead falls back to the verified crystal damage point',()=>{
  const t=tower();t.vel.x=10;
  const f=fixture([t],{resolve:(e,p,r,s,h,trajectory)=>trajectory?null:p});
  f.adapter.control({enabled:true,prediction:true});
  const s=f.adapter.step();assert.deepEqual(s.target.predicted,s.target.pos);
});
