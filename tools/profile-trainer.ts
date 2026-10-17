// Run: node --import tsx tools/profile-trainer.ts [reference Git revision]
// Profiles actual armor geometry without rendering or touching a live game.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {World,segmentSphere} from '../src/simulation.ts';
import {sweepArmor,armorBounds} from '../src/projectile-collision.ts';
import * as current from '../external-trainer/targeting.mjs';

const reference=process.argv[2]??'146f872';
const source=execFileSync('git',['show',`${reference}:external-trainer/targeting.mjs`],{encoding:'utf8'});
const before=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const results=[];
for(const [enemies,towers] of [[100,8],[600,8],[1500,20]]){
  const w=new World(913,{schedule:false,invulnerable:true});w.player.pos={x:0,y:1.7,z:0};w.time=120;
  for(let i=0;i<enemies;i++){
    const angle=i*2.399,radius=12+i%32;
    const e=w.spawn('skull',{x:Math.sin(angle)*radius,y:2+i%4,z:Math.cos(angle)*radius});e.age=12;
  }
  for(let i=0;i<towers;i++){
    const angle=i*2.399,radius=10+i%12;
    const e=w.spawn((['squid','squid2','squid3'] as const)[i%3],{x:Math.sin(angle)*radius,y:i%3===0?3.3:5.2,z:Math.cos(angle)*radius});
    e.age=12;e.phase=Math.PI;e.facingYaw=Math.PI;e.status='idle';
  }
  const state={world:w,mode:'playing',focused:true,yaw:0,pitch:0,fire:true,armorEnemies:w.enemies.filter(e=>armorBounds(e)!==null)};
  for(const [label,module] of [['before',before],['after',current]] as const){
    for(const [fov,enabled] of [[60,true],[360,true],[60,false]] as const){
      let sweeps=0;
      const helpers={segmentSphere,armorBounds,sweepArmor:(...args:Parameters<typeof sweepArmor>)=>{sweeps++;return sweepArmor(...args);}};
      const adapter=module.createMemoryAim({get:()=>state,set:()=>{},
        resolve:(enemy:any,pos:any,radius:number,state:any,homing:boolean,trajectory?:any)=>module.resolveDamagePoint(enemy,pos,radius,state,homing,helpers,trajectory)
      },{performance,requestAnimationFrame:()=>0});
      adapter.control({enabled,fov});
      for(let i=0;i<3;i++)adapter.step();sweeps=0;
      const times=[];
      for(let i=0;i<10;i++){const start=performance.now();adapter.step();times.push(performance.now()-start);}
      const selected=adapter.snapshot().target?.id??null;
      times.sort((a,b)=>a-b);
      const result={label,enemies,towers,fov,enabled,selected,medianMs:+times[5].toFixed(3),p95Ms:+times[9].toFixed(3),sweepsPerScan:sweeps/10};
      results.push(result);console.log(JSON.stringify(result));
      if(label==='after'){
        if(!enabled)assert.equal(sweeps,0);
        else assert.equal(selected,results.find(r=>r.label==='before'&&r.enemies===enemies&&r.fov===fov&&r.enabled)?.selected,'same selected target in reference fixtures');
      }
      adapter.stop();
    }
  }
}
await mkdir('artifacts/fps-investigation',{recursive:true});
await writeFile('artifacts/fps-investigation/trainer-profile.json',JSON.stringify({reference,node:process.version,results},null,2)+'\n');
