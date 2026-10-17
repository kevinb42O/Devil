import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,v,idleInput,segmentSphere,STEP,type Projectile} from '../src/simulation';
import {sweepArmor} from '../src/projectile-collision';
import {weaponMuzzle} from '../src/weapon-origin';
import {SHOTGUN_TUNING,WEAPON_PRESENTATION} from '../src/weapon-tuning';
import {BURST_COUNTS} from '../src/weapon-levels';
import {daggerLaunch,shotLaunches,type ShotLaunch} from '../src/projectile-launch';
import {packShotLaunch,unpackShotLaunch} from '../src/network-shots';
import {FriendsSession} from '../src/multiplayer';
import {encodeState,decodeState,snapshotBaseline} from '../src/network-state';
import {createRun,RunRecorder,ReplayPlayer} from '../src/replay';
import {CrewRunRecorder,CrewReplayPlayer,crewCheckpointDigest,packCrewReplay,unpackCrewReplay} from '../src/crew-replay';
import {projectileVisualIndex,PROJECTILE_COLORS} from '../src/projectile-presentation';

const tick=(w:World)=>(w as any).updateProjectiles(STEP);
function contacts(w:World,range:number,radius=.65){
 const center=v(0,10,-range);
 return w.projectiles.filter(p=>segmentSphere(p.pos,v(p.pos.x+p.vel.x*2.8,p.pos.y+p.vel.y*2.8,p.pos.z+p.vel.z*2.8),center,radius)!==null).length;
}

test('shotgun launch stays compact and perpendicular to aim, including partial homing reserves',()=>{
 for(let level=1;level<=4;level++)for(const pitch of [0,1.5,-Math.PI/2])for(const homing of [false,true]){
  if(homing&&level===1)continue;
  const w=new World(71,{schedule:false});w.level=level;w.reserve=3;w.player.pos=v(10,20,30);
  const input={...idleInput(),yaw:1.3,pitch};w.shoot(input,true,homing);
  const center=weaponMuzzle(w.player.pos,input.yaw,pitch,level,0),forward=v(-Math.sin(input.yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(input.yaw)*Math.cos(pitch));
  assert.equal(w.projectiles.length,homing?3:BURST_COUNTS[level-1]);
  assert.equal(w.effects[0].projectileKind,'shotgun');assert.deepEqual(w.effects[0].muzzles,[center]);
  for(const p of w.projectiles){
   assert.equal(p.kind,'shotgun');const dx=p.pos.x-center.x,dy=p.pos.y-center.y,dz=p.pos.z-center.z;
   assert.ok(Math.hypot(dx,dy,dz)<=SHOTGUN_TUNING.radius+1e-10);
   assert.ok(Math.abs(dx*forward.x+dy*forward.y+dz*forward.z)<1e-10);
   assert.ok(Math.abs(Math.hypot(p.vel.x,p.vel.y,p.vel.z)-(homing?42:70))<1e-10);
  }
 }
});

test('shotgun concentration improves each hand, with broad scatter and useful distant beam advantage',()=>{
 const report=[];
 for(const range of [3,5,25]){
  let lastDamage=0;
  for(let level=1;level<=4;level++){
   let hits=0,oldHits=0,beamHits=0,outer=0;
   for(const seed of [1,71,98765]){
    const w=new World(seed,{schedule:false}),old=new World(seed,{schedule:false,legacyShotgun:true});
    for(const world of [w,old]){world.level=level;world.player.pos=v(0,10,0);const target=world.spawn('skull4',v(0,10,-range));target.age=2;target.radius=.65;}
    for(let i=0;i<120;i++){
     for(const world of [w,old]){world.projectiles=[];world.effects=[];world.shoot(idleInput(),true,false);}
     hits+=contacts(w,range);oldHits+=contacts(old,range);
     for(const p of w.projectiles){const t=(-range-p.pos.z)/p.vel.z;outer=Math.max(outer,Math.hypot(p.pos.x+p.vel.x*t,p.pos.y+p.vel.y*t-10));}
     w.projectiles=[];w.shoot(idleInput(),false,false);beamHits+=contacts(w,range);
    }
   }
   const shots=360,count=BURST_COUNTS[level-1],fraction=hits/shots/count,damage=hits/shots*2;
   report.push({range,level,hitPercent:+(fraction*100).toFixed(1),meanDamage:+damage.toFixed(2),oldDamage:+(oldHits/shots).toFixed(2)});
   if(range<=5){assert.ok(fraction>=(range===3?.85:.45),JSON.stringify(report.at(-1)));assert.ok(damage>lastDamage);assert.ok(damage>oldHits/shots*1.5);}
   else{const beamDps=beamHits/shots*(level===4?120/9:20),shotgunDps=damage*2;assert.ok(beamDps>shotgunDps,JSON.stringify({level,beamDps,shotgunDps}));assert.ok(outer>range*Math.tan(WEAPON_PRESENTATION[level-1].burstSpread)*.85);}
   lastDamage=damage;
  }
 }
 console.log('Shotgun concentration:',JSON.stringify(report));
});

test('shotgun circular footprint rotates with aim and grows naturally with distance',()=>{
 const pos=v(2,100,3),yaw=.8;
 for(let i=0;i<60;i++){
  const radii=[];
  for(const pitch of [0,Math.PI/3,Math.PI/2,-Math.PI/2]){
   const center=weaponMuzzle(pos,yaw,pitch,4,0),s:ShotLaunch={pos,muzzles:[center],yaw,pitch,spread:.32,aimDistance:196,radius:.01,camera:false,cone:true,seed:91,shotgunCount:60};
   const p=daggerLaunch(s,i,.37,.64,70),forward=v(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
   const distanceAt=(range:number)=>{const start=v(p.pos.x-pos.x,p.pos.y-pos.y,p.pos.z-pos.z),dot=(a:typeof pos,b:typeof pos)=>a.x*b.x+a.y*b.y+a.z*b.z;const t=(range-dot(start,forward))/dot(p.vel,forward),at=v(start.x+p.vel.x*t-forward.x*range,start.y+p.vel.y*t-forward.y*range,start.z+p.vel.z*t-forward.z*range);return Math.hypot(at.x,at.y,at.z);};
   radii.push(distanceAt(25));
  }
  for(const r of radii)assert.ok(Math.abs(r-radii[0])<1e-9);
 }
});

test('shotgun damage is two, beam remains one, and homing retains its damage',()=>{
 for(const [kind,homing,expected]of [[undefined,false,1],['shotgun',false,2],['shotgun',true,10]] as const){
  const w=new World(1,{schedule:false}),e=w.spawn('skull4',v(0,10,-1));e.age=2;e.hp=1000;
  const p:Projectile={id:999,pos:v(0,10,0),vel:v(0,0,-70),age:0,homing,level:2,energy:homing?10:1,...(kind?{kind}:{})};w.projectiles=[p];
  for(let i=0;i<5;i++)tick(w);assert.equal(1000-e.hp,expected);
 }
 assert.deepEqual(PROJECTILE_COLORS[0],[1,.12,.025]);assert.equal(projectileVisualIndex({level:4,homing:false,kind:'shotgun'}),18);assert.equal(projectileVisualIndex({level:2,homing:true,kind:'shotgun'}),15);
});

test('real close blasts kill small threats, damage exposed crystals and respect armor',()=>{
 for(let seed=1;seed<=20;seed++){
  const w=new World(seed,{schedule:false}),e=w.spawn('skull3',v(0,10,-5));e.age=2;w.player.pos=v(0,10,0);w.shoot(idleInput(),true,false);
  for(let i=0;i<16;i++)tick(w);assert.equal(e.hp,0,`hand I close blast kills skull III, seed ${seed}`);
 }
 for(const kind of ['squid','squid2','squid3'] as const){
  const w=new World(1,{schedule:false}),e=w.spawn(kind,v(0,6,0));e.age=1;const point=w.weakPoint(e),dx=point.x-e.pos.x,dz=point.z-e.pos.z,len=Math.hypot(dx,dz);
  w.projectiles=[{id:901,pos:v(point.x+dx/len,point.y,point.z+dz/len),vel:v(-dx/len*240,0,-dz/len*240),age:0,homing:false,kind:'shotgun'}];const hp=e.hp;tick(w);assert.equal(e.hp,hp-2);
 }
 const w=new World(1,{schedule:false,legacyTowerArchitecture:true}),e=w.spawn('squid2',v(0,8,0));e.age=2;
 const c=w.weakPoint(e),dx=c.x-e.pos.x,dz=c.z-e.pos.z,len=Math.hypot(dx,dz);
 w.damageEnemy(e,10,c,0,true);w.effects=[];
 const a=v(c.x+dx/len*2,c.y+.55,c.z+dz/len*2),b=v(c.x-dx/len*2,c.y+.55,c.z-dz/len*2);assert.ok(sweepArmor(e,w.player.pos,a,b));
 w.projectiles=[{id:902,pos:a,vel:v((b.x-a.x)/STEP,(b.y-a.y)/STEP,(b.z-a.z)/STEP),age:0,homing:false,kind:'shotgun'}];tick(w);
 assert.equal(e.hp,10);assert.equal(w.projectiles.length,0);assert.ok(w.effects.some(e=>e.kind==='impact'&&e.projectileKind==='shotgun'));
});

test('beam launches and RNG remain identical with shotgun revision enabled or disabled',()=>{
 for(let level=1;level<=4;level++)for(const homing of [false,true]){
  if(level===1&&homing)continue;
  const a=new World(12,{schedule:false}),b=new World(12,{schedule:false,legacyShotgun:true});
  for(const w of [a,b]){w.level=level;w.reserve=100;for(let i=0;i<5;i++)w.shoot({...idleInput(),yaw:.7,pitch:.3},false,homing);}
  assert.deepEqual(a.projectiles,b.projectiles);assert.equal(a.captureCrewCheckpoint().rng,b.captureCrewCheckpoint().rng);
 }
});

test('network preserves shotgun identity, partial salvos, homing and rebound corrections',()=>{
 const session=new FriendsSession('host');try{
  session.running=true;session.world=new World(42,{schedule:false});const w=session.world;w.addCrew('host');w.addCrew('guest');w.crew[0].level=4;w.selectCrew('host');
  // useCrew sets the active shooter, just as the host/predictor weapon step does.
  (w as any).useCrew(w.crew[0]);w.shoot(idleInput(),true,false);
  const full=structuredClone(w.projectiles),spec=full[0].launch!,packed=packShotLaunch(spec,4)!;
  assert.ok(packed);assert.deepEqual(shotLaunches(unpackShotLaunch(packed,4),BURST_COUNTS[3],70),shotLaunches(spec,BURST_COUNTS[3],70));
  w.projectiles=w.projectiles.filter((_,i)=>i<4||i===BURST_COUNTS[3]-1); // Preserve the full pattern with a sparse high index.
  const first=decodeState(encodeState(session.snapshot()!,1,0),new Map())!;
  for(const p of first.snapshot.projectiles){const original=full.find(x=>x.id===p.id)!;assert.equal(p.kind,'shotgun');assert.ok(Math.hypot(p.pos.x-original.pos.x,p.pos.y-original.pos.y,p.pos.z-original.pos.z)<1e-9);assert.ok(Math.hypot(p.vel.x-original.vel.x,p.vel.y-original.vel.y,p.vel.z-original.vel.z)<1e-9);}
  const sender=snapshotBaseline(session.snapshot()!),receiver=snapshotBaseline(first.snapshot);w.time+=.05;
  for(const p of w.projectiles){p.age+=.05;p.pos=v(p.pos.x+p.vel.x*.05,p.pos.y+p.vel.y*.05,p.pos.z+p.vel.z*.05);}
  const second=decodeState(encodeState(session.snapshot()!,2,1,sender),new Map([[1,receiver]]))!;assert.ok(second.snapshot.projectiles.every(p=>p.kind==='shotgun'));
  w.projectiles=[{...full[0],floorBounces:1,vel:v(1,10,2)},{...full[1],homing:true,vel:v(0,0,-42),energy:10}];
  const corrected=decodeState(encodeState(session.snapshot()!,3,0),new Map())!;assert.ok(corrected.snapshot.projectiles.every(p=>p.kind==='shotgun'));assert.equal(corrected.snapshot.projectiles[0].floorBounces,1);assert.equal(corrected.snapshot.projectiles[1].homing,true);
  assert.throws(()=>unpackShotLaunch([...packed.slice(0,10),BURST_COUNTS[3]+1],4));
 }finally{session.close();}
});

test('solo shotgun revision records, replays and seeks; revision 18 retains old bursts',()=>{
 for(const revision of [18,19]){
  const w=createRun(41,{time:0,level:4,reserve:0},6,true,revision),recorder=new RunRecorder(41,{time:0,level:4,reserve:0});
  for(let i=0;i<180;i++){const input={...idleInput(),fire:i%80===0};recorder.record(input);w.step(input);}
  const run={...recorder.finish(w),version:6,combatRevision:revision},player=new ReplayPlayer(run);
  while(!player.done)player.step();assert.deepEqual(player.world.stats,w.stats);assert.deepEqual(player.world.projectiles,w.projectiles);
  player.seek(1);player.seek(180);assert.deepEqual(player.world.projectiles,w.projectiles);
 }
 const old=createRun(1,undefined,6,true,18);old.shoot(idleInput(),true,false);assert.ok(old.projectiles.every(p=>!p.kind));
});

test('old and new crew checkpoints preserve exact digests through playback and seeks',()=>{
 for(const revision of [18,19] as const){
  const base=new World(42,{schedule:false,legacyHands:true});base.addCrew('host');base.selectCrew('host');const w=World.restoreCrewCheckpoint(base.captureCrewCheckpoint(),revision===18,true),recorder=new CrewRunRecorder(42,w,[],'shotgun-test',1);
  for(let i=0;i<125;i++){
   if(i===124){w.crew[0].alive=false;w.crew[0].cause='DISCONNECTED';w.crew[0].respawnAt=null;}
   const before=w.crew.map(p=>({...p})),inputs=new Map([['host',{...idleInput(),fire:i===0||i===80}]]);w.effects=[];w.stepCrew(inputs);recorder.record(w,inputs,new Set(),before);
  }
  const run=unpackCrewReplay(packCrewReplay({...recorder.finish(w)!,combatRevision:revision})),player=new CrewReplayPlayer(run);
  while(!player.done)player.step();assert.equal(crewCheckpointDigest(player.world.captureCrewCheckpoint()),run.checkpoints.at(-1)!.digest);
  player.seek(2);assert.equal(player.world.projectiles[0].kind,revision===19?'shotgun':undefined);player.seek(90);player.seek(125);assert.equal(crewCheckpointDigest(player.world.captureCrewCheckpoint()),run.checkpoints.at(-1)!.digest);
 }
});
