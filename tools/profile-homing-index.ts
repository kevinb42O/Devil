import {HomingBodyIndex} from '../src/homing-body-index';
import type {Enemy,Vec} from '../src/simulation';
import {writeFileSync} from 'node:fs';
const results=[];const stats=(a:number[])=>{a.sort((a,b)=>a-b);return {median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};};
for(const count of [150,600,1500])for(const queries of [8,32,128,512]){
 const targets=Array.from({length:count},(_,order)=>({order,enemy:{pos:{x:Math.sin(order*2.399)*25,y:1+order%9,z:Math.cos(order*2.399)*25},hp:1} as Enemy}));
 const from=Array.from({length:queries},(_,i)=>({x:Math.sin(i)*40,y:2+i%9,z:Math.cos(i)*40}));const times={exhaustive:[] as number[],indexed:[] as number[]};let sum=0;
 for(let round=0;round<40;round++)for(const name of round%2?['indexed','exhaustive']:['exhaustive','indexed']){
  const start=performance.now();
  if(name==='indexed'){const index=new HomingBodyIndex([...targets]);for(const p of from)sum+=index.nearest(p)!.order;}
  else for(const p of from){let best=Infinity,order=-1;for(const target of targets){const b=target.enemy.pos,d=(p.x-b.x)**2+(p.y-b.y)**2+(p.z-b.z)**2;if(d<best){best=d;order=target.order;}}sum+=order;}
  if(round>=10)times[name as keyof typeof times].push(performance.now()-start);
 }
 results.push({count,queries,exhaustive:stats(times.exhaustive),indexed:stats(times.indexed),sum});
}
writeFileSync('artifacts/fps-deep-audit/body-index-profile.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
