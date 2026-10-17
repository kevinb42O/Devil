import test from 'node:test';
import assert from 'node:assert/strict';
import {World, idleInput, STEP,segmentSphere} from '../src/simulation.ts';
import {sweepArmor,armorBounds} from '../src/projectile-collision.ts';
import {createMemoryAim,resolveDamagePoint} from './targeting.mjs';

for(const kind of ['squid','squid2','squid3'] as const){
  for(const secondary of [false,true]){
    test(`actual simulation: ${kind} attached crystal hit and released with ${secondary?'homing':'primary'}`,()=>{
      const world=new World(913,{schedule:false,invulnerable:true});
      world.level=4;world.reserve=10000;world.stats.collected=200;
      world.player.pos={x:0,y:1.7,z:0};
      const e=world.spawn(kind,{x:4,y:kind==='squid'?3.3:5.2,z:-12});
      e.age=12;e.phase=Math.PI;e.facingYaw=Math.PI;e.status='idle';
      const initialHealth=e.hp;
      const input={...idleInput(),fire:!secondary,homing:secondary};
      const state={world,mode:'playing',focused:true,yaw:0,pitch:0,fire:!secondary,homing:secondary};
      // Damage fixtures start on a shootable side. Hidden crystals are tested
      // separately below for both weapons; homing no longer bypasses armor.
      for(let i=0;i<72&&!resolveDamagePoint(e,world.weakPoint(e),.63,state,secondary,{sweepArmor,armorBounds,segmentSphere});i++){
        world.player.pos={x:e.pos.x+Math.sin(i*Math.PI/36)*14,y:1.7,z:e.pos.z+Math.cos(i*Math.PI/36)*14};
      }
      const environment={performance:{now:()=>world.time*1000}};
      const adapter=createMemoryAim({
        get:()=>state,
        set:(yaw:number,pitch:number)=>{input.yaw=state.yaw=yaw;input.pitch=state.pitch=pitch;},
        resolve:(enemy:any,pos:any,radius:number,state:any,homing:boolean,trajectory?:any)=>resolveDamagePoint(enemy,pos,radius,state,homing,{sweepArmor,armorBounds,segmentSphere},trajectory)
      },environment);
      let sawAttached=false;
      for(let tick=0;tick<1440&&world.stats.released===0;tick++){
        const result=adapter.control({enabled:true,prediction:true});
        sawAttached ||= result.target?.priority===0;
        world.step(input,STEP);
        const after=adapter.step();
        for(const point of after.candidates){
          if(point.enemy!==e.id)continue;
          const index=Number(point.index.replace('crystal',''));
          assert(e.weakpoints[index].hp>0,'must never select a destroyed/released crystal');
        }
      }
      assert(sawAttached,'must acquire a real attached crystal');
      assert(e.hp<initialHealth,'actual projectile or homing splash damage must reduce health');
      if(!secondary)assert(world.stats.hits>0,'primary projectiles must hit');
      else assert(world.stats.homingFired>0,'homing projectiles must actually be fired');
      assert(world.stats.released>0,'must release a crystal through actual damage');
      console.log(JSON.stringify({kind,weapon:secondary?'homing':'primary',hits:world.stats.hits,released:world.stats.released,seconds:world.time}));
      adapter.stop();
    });
  }
}

for(const kind of ['squid','squid2','squid3'] as const){
  for(const homing of [false,true]){
    test(`actual armor: ${kind} blocked crystal yields and visible crystal retakes priority (${homing?'homing':'primary'})`,()=>{
      const world=new World(913,{schedule:false,invulnerable:true});
      const tower=world.spawn(kind,{x:0,y:kind==='squid'?3.3:5.2,z:0});
      tower.age=12;tower.phase=Math.PI;tower.facingYaw=Math.PI;tower.status='idle';
      tower.weakpoints.forEach((p,i)=>{if(i)p.hp=0;});
      const state={world,mode:'playing',focused:true,yaw:0,pitch:0,fire:!homing,homing};
      const helpers={sweepArmor,armorBounds,segmentSphere};
      const resolve=(enemy:any,pos:any,radius:number,state:any,homing:boolean,trajectory?:any)=>resolveDamagePoint(enemy,pos,radius,state,homing,helpers,trajectory);
      let hidden:any=null,visible:any=null;
      // Inspect real mesh collision from positions all around the tower.
      for(let i=0;i<72;i++){
        world.player.pos={x:Math.sin(i*Math.PI/36)*14,y:1.7,z:Math.cos(i*Math.PI/36)*14};
        const center=world.weakPoint(tower);
        if(resolve(tower,center,.63,state,homing))visible={...world.player.pos};
        else hidden={...world.player.pos};
      }
      assert(hidden,'fixture must contain a genuinely occluded crystal');
      assert(visible,'fixture must contain a hittable crystal');
      world.player.pos=hidden;
      const near=world.spawn('skull',{x:hidden.x+2,y:1.7,z:hidden.z});near.age=12;near.status='hunting';
      const far=world.spawn('skull',{x:hidden.x+4,y:1.7,z:hidden.z});far.age=12;far.status='hunting';
      const adapter=createMemoryAim({get:()=>state,set:()=>{},resolve},{performance:{now:()=>1000}});
      adapter.control({enabled:true,prediction:true,lock_ms:2000,switch_bias:45});
      assert.equal(adapter.step().target.enemy,near.id,'must select nearest enemy instead of blocked crystal');
      near.pos.x=hidden.x+6;
      assert.equal(adapter.step().target.enemy,far.id,'nearer enemy immediately overrides held lock');
      world.player.pos=visible;
      assert.equal(adapter.step().target.enemy,tower.id,'hittable crystal immediately regains priority');
      world.player.pos=hidden;
      assert.notEqual(adapter.step().target.enemy,tower.id,'crystal loses priority again when occluded');
      adapter.stop();
    });
  }
}

for(const kind of ['squid','squid2','squid3'] as const){
  test(`actual armor: intervening ${kind} still blocks aim after all its crystals are destroyed`,()=>{
    const world=new World(913,{schedule:false,invulnerable:true});
    const tower=world.spawn(kind,{x:0,y:kind==='squid'?3.3:5.2,z:0});
    tower.age=12;tower.status='idle';tower.weakpoints.forEach(p=>p.hp=0);
    const target=world.spawn('skull',{x:0,y:1.7,z:-14});target.age=12;target.status='hunting';
    const state={world};let blocked=0;
    for(const height of [1.7,3.3,5.2,8.7,11.7])for(let i=-8;i<=8;i++){
      world.player.pos={x:i*.4,y:1.7,z:14};target.pos.x=-i*.4;target.pos.y=height;
      const hit=segmentSphere(world.player.pos,target.pos,target.pos,target.radius);
      if(hit===null||!sweepArmor(tower,world.player.pos,world.player.pos,target.pos,hit,world.time,world.spawnFixesEnabled))continue;
      blocked++;
      for(const homing of [false,true])assert.equal(resolveDamagePoint(target,target.pos,target.radius,state,homing,{sweepArmor,armorBounds,segmentSphere}),null);
    }
    assert(blocked>0,'must test a real intervening armor intersection');
  });
}

test('armor broad phase matches full mesh queries across tower motion, emergence and ray directions',()=>{
  const world=new World(913,{schedule:false,invulnerable:true});
  const target=world.spawn('skull',{x:0,y:1.7,z:-15});target.age=12;
  const towers=(['squid','squid2','squid3'] as const).map((kind,i)=>world.spawn(kind,{x:(i-1)*9,y:i===0?3.3:5.2,z:0}));
  let queries=0,fullSweeps=0,culledSweeps=0,blocked=0;
  const full={segmentSphere,sweepArmor:(...args:Parameters<typeof sweepArmor>)=>{fullSweeps++;return sweepArmor(...args);}};
  const culled={segmentSphere,armorBounds,sweepArmor:(...args:Parameters<typeof sweepArmor>)=>{culledSweeps++;return sweepArmor(...args);}};
  for(const age of [.15,.6,1.2,12])for(const time of [0,9,21])for(let i=0;i<48;i++){
    world.time=time;
    for(const tower of towers){tower.age=age;tower.phase=i*.23;tower.facingYaw=i*.17;}
    const angle=i*Math.PI/24;
    world.player.pos={x:Math.sin(angle)*24,y:1.7+i%5,z:Math.cos(angle)*24};
    target.pos={x:-Math.sin(angle)*24,y:1.7+i%11,z:-Math.cos(angle)*24};
    const expected=resolveDamagePoint(target,target.pos,target.radius,{world},false,full);
    const actual=resolveDamagePoint(target,target.pos,target.radius,{world},false,culled);
    assert.deepEqual(actual,expected,`age=${age}, time=${time}, ray=${i}`);
    queries++;if(expected===null)blocked++;
  }
  assert(blocked>0);assert(culledSweeps<fullSweeps*.6,'unrelated armor must be culled before mesh traversal');
  console.log(JSON.stringify({armorQueries:queries,blocked,fullSweeps,culledSweeps}));
});
