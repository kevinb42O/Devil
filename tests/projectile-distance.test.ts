import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,v,idleInput,STEP,segmentSphere,TUNING,type Vec} from '../src/simulation.ts';
import {daggerLaunch,shotLaunches,type ShotLaunch} from '../src/projectile-launch.ts';
import {packShotLaunch,unpackShotLaunch} from '../src/network-shots.ts';
import {HAND_MUZZLES,weaponMuzzle} from '../src/weapon-origin.ts';
import {STREAM_RADIUS,WEAPON_PRESENTATION} from '../src/weapon-tuning.ts';
import {sweepArmor} from '../src/projectile-collision.ts';
import {floorHeight,sweepFloor} from '../src/arena.ts';
const tick=(w:World)=>(w as any).updateProjectiles(STEP);
const dot=(a:Vec,b:Vec)=>a.x*b.x+a.y*b.y+a.z*b.z;

function planeHit(s:ShotLaunch,p:ReturnType<typeof daggerLaunch>,range:number){
 const sy=Math.sin(s.yaw),cy=Math.cos(s.yaw),sp=Math.sin(s.pitch),cp=Math.cos(s.pitch),forward=v(-sy*cp,sp,-cy*cp),right=v(cy,0,-sy),up=v(sy*sp,cp,cy*sp);
 const start=v(p.pos.x-s.pos.x,p.pos.y-s.pos.y,p.pos.z-s.pos.z),t=(range-dot(start,forward))/dot(p.vel,forward),at=v(start.x+p.vel.x*t,start.y+p.vel.y*t,start.z+p.vel.z*t);
 return v(dot(at,right),dot(at,up),range);
}

test('beam radii and outer spread stay unchanged while spread rotates with the aim',()=>{
 assert.deepEqual(STREAM_RADIUS.slice(0,4),[.008,.01,.012,.015]);
 assert.deepEqual(WEAPON_PRESENTATION.slice(0,4).map(p=>p.streamSpread),[.045,.07,.11,.155]);
 for(const burst of [false,true])for(const focused of [false,true]){
  for(let i=0;i<250;i++){
   const points=[];
   for(const pitch of [0,Math.PI/3,Math.PI/2,-Math.PI/2]){
    const pos=v(2,100,3),yaw=.8,s:ShotLaunch={pos,muzzles:HAND_MUZZLES[3].map((_,j)=>weaponMuzzle(pos,yaw,pitch,4,j)),yaw,pitch,spread:burst?.32:.155,aimDistance:196,radius:burst?null:.015,camera:false,cone:true,focused,seed:1};
    const p=daggerLaunch(s,3,i/250,((i*79)%250)/250,70);points.push(planeHit(s,p,40));
   }
   for(const point of points)assert.ok(Math.hypot(point.x-points[0].x,point.y-points[0].y)<1e-10,'same footprint at any pitch');
  }
 }
});

test('upgrades improve distant small-target throughput without narrowing the outer beam',()=>{
 for(const range of [20,40,80]){
  let previousDps=0;
  for(let level=1;level<=4;level++){
   const w=new World(71,{schedule:false});w.level=level;w.player.pos=v(0,10,0);const e=w.spawn('skull4',v(0,10,-range));e.age=2;e.radius=.63;
   let hits=0,total=0,maxOuterRadius=0;
   for(let salvo=0;salvo<2000;salvo++){
    w.projectiles=[];w.shoot(idleInput(),false,false);
    for(let i=0;i<w.projectiles.length;i++){
     const p=w.projectiles[i],end=v(p.pos.x+p.vel.x*2.8,p.pos.y+p.vel.y*2.8,p.pos.z+p.vel.z*2.8);hits+=segmentSphere(p.pos,end,e.pos,e.radius)!==null?1:0;total++;
     if(level===1||i>=(level===4?2:1)){
      const t=(-range-p.pos.z)/p.vel.z;maxOuterRadius=Math.max(maxOuterRadius,Math.hypot(p.pos.x+p.vel.x*t,p.pos.y+p.vel.y*t-10));
     }
    }
   }
   const dps=hits/total*[20,40,80,120*8/9][level-1];assert.ok(dps>previousDps,`${range}: hand ${level} improves throughput ${dps} > ${previousDps}`);previousDps=dps;
   assert.ok(maxOuterRadius>range*Math.tan(WEAPON_PRESENTATION[level-1].streamSpread)*.95,'outer beam retains its envelope');
  }
 }
});

test('launch direction changes continuously at a crystal-sized target silhouette',()=>{
 for(const boundary of [.63,.98]){
  const shots=[];
  for(const offset of [boundary-.001,boundary+.001]){
   const w=new World(1,{schedule:false});w.player.pos=v(0,10,0);const e=w.spawn('skull4',v(offset,10,-5));e.age=2;e.radius=.63;w.shoot(idleInput(),false,false);shots.push(w.projectiles[0]);
  }
  assert.ok(Math.hypot(shots[0].vel.x-shots[1].vel.x,shots[0].vel.y-shots[1].vel.y,shots[0].vel.z-shots[1].vel.z)<.1,'no snap at the target or transition boundary');
 }
});

test('aim convergence respects armor and floor obstructions',()=>{
 const w=new World(1,{schedule:false});w.player.pos=v(0,6.6,10);const e=w.spawn('squid3',v(0,8,0));e.age=2;
 const end=v(0,6.6,-186),armor=sweepArmor(e,w.player.pos,w.player.pos,end,1,w.time)!;assert.ok(armor);
 // Capturing the immutable launch description avoids mixing spread into the aim check.
 w.addCrew('host');(w as any).useCrew(w.crew[0]);w.player.pos=v(0,6.6,10);w.shoot(idleInput(),false,false);
 const launch=w.projectiles[0].launch!;assert.ok(launch);assert.ok(launch.aimDistance<=armor.t*196+1e-9);
 const floorWorld=new World(1,{schedule:false});floorWorld.addCrew('host');(floorWorld as any).useCrew(floorWorld.crew[0]);floorWorld.player.pos=v(0,5,0);
 const pitch=-.8,forward=v(0,Math.sin(pitch),-Math.cos(pitch)),floorEnd=v(0,5+forward.y*196,forward.z*196),floor=sweepFloor(floorWorld.player.pos,floorEnd,0)!;assert.ok(floor);
 floorWorld.shoot({...idleInput(),pitch},false,false);assert.ok(Math.abs(floorWorld.projectiles[0].launch!.aimDistance-floor.t*196)<1e-9);
});

test('lifetime clips the swept path before damage and still permits earlier contacts',()=>{
 for(const center of [.09,.5]){
  const w=new World(1,{schedule:false}),e=w.spawn('skull',v(0,10,-center));e.age=2;e.radius=.03;
  const p={id:900,pos:v(0,10,0),vel:v(0,0,-70),age:2.799,homing:false};w.projectiles.push(p);tick(w);
  assert.equal(w.stats.hits,center===.09?1:0);assert.equal(e.hp,center===.09?0:1);assert.equal(w.projectiles.length,0);
  if(center===.5)assert.ok(Math.abs(p.pos.z+.07)<1e-10,'stops at expiry position');
 }
});

test('expired homing shots cannot trigger absorption, hits or explosions',()=>{
 const w=new World(1,{schedule:false}),e=w.spawn('ghostpede',v());e.age=4;e.status='hunting';e.pos=v(0,10,0);e.segments.forEach(s=>s.pos=v(0,10,0));
 w.projectiles.push({id:901,pos:v(0,10,0),vel:v(0,0,-42),age:8,homing:true,level:4});tick(w);w.tick+=2;tick(w);
 assert.equal(w.stats.homingEaten,0);assert.equal(w.stats.hits,0);assert.ok(!w.effects.some(e=>e.kind==='explosion'||e.kind==='eat'));
});

test('flight range is independent of the shooter position and passes the old world boundary',()=>{
 for(const x of [0,40,85]){
  const w=new World(1,{schedule:false}),p={id:902,pos:v(x,10,0),vel:v(70,0,0),age:0,homing:false};w.projectiles.push(p);
  for(let i=0;i<400&&w.projectiles.length;i++)tick(w);
  assert.equal(w.projectiles.length,0);assert.ok(Math.abs(p.pos.x-x-196)<1e-8,`${x}: lifetime gives the same range`);
 }
});

test('floor bounce cannot continue collision after consuming the remaining lifetime',()=>{
 const w=new World(1,{schedule:false}),floor=floorHeight(0,0,0,0)+.08;
 const p={id:903,pos:v(0,floor+.02,0),vel:v(0,-70,0),age:2.75,homing:false};w.projectiles.push(p);tick(w);
 assert.equal(w.projectiles.length,0);assert.equal(w.effects.filter(e=>e.kind==='ricochet').length,1);assert.ok(Math.abs(p.pos.y-floor)<1e-9);
});

test('compact network launch reproduces circular spread and focused lanes exactly',()=>{
 for(const level of [1,2,3,4])for(const focused of [false,true]){
  const pos=v(10,6,-8),yaw=1.2,pitch=1.4,s:ShotLaunch={pos,muzzles:HAND_MUZZLES[level-1].map((_,i)=>weaponMuzzle(pos,yaw,pitch,level,i)),yaw,pitch,spread:WEAPON_PRESENTATION[level-1].streamSpread,aimDistance:40,radius:STREAM_RADIUS[level-1],camera:false,cone:true,focused,seed:123};
  const packed=packShotLaunch(s,level)!;assert.ok(packed);const decoded=unpackShotLaunch(packed,level);
  assert.deepEqual(shotLaunches(decoded,8,TUNING.projectileSpeed),shotLaunches(s,8,TUNING.projectileSpeed));
 }
});
