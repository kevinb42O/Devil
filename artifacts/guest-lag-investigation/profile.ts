import {performance} from 'node:perf_hooks';
import {FriendsSession,applySnapshot} from '../../src/multiplayer';
import {World,idleInput,STEP} from '../../src/simulation';
import {snapshotBaseline,encodeState,decodeState} from '../../src/network-state';
import {SnapshotTimeline} from '../../src/network-presentation';
import {writeFileSync} from 'node:fs';
const reports:any[]=[];
function measure(fn:()=>void,n=40){for(let i=0;i<5;i++)fn();const times=[];for(let i=0;i<n;i++){const at=performance.now();fn();times.push(performance.now()-at);}times.sort((a,b)=>a-b);return {median:times[Math.floor(n*.5)],p95:times[Math.floor(n*.95)]};}
for(const [enemies,bullets] of [[0,0],[300,1000],[1000,3000]] as const){
 const host=new FriendsSession('host',[]),guest=new FriendsSession('guest',[]);
 try{
  host.running=true;host.world=new World(42,{schedule:false});const h=host.world;h.addCrew('host');h.addCrew('guest');h.selectCrew('host');h.time=600;h.tick=72000;
  h.crew[1].level=7;h.crew[1].primary={held:1000,wasHeld:true,streaming:true,nextShot:72000,recoverUntil:0,lastBurst:0};
  for(let i=0;i<enemies;i++){const e=h.spawn(i%20===0?'squid3':'skull4',{x:Math.sin(i)*20,y:3,z:Math.cos(i)*20},false);e.age=10;}
  h.projectiles=Array.from({length:bullets},(_,i)=>({id:100000+i,pos:{x:1,y:3,z:1},previous:{x:1,y:3,z:1},vel:{x:0,y:0,z:-70},age:.1,homing:i%4===0,level:7,energy:1,shotKey:`host:1:${i}`}));
  const source=host.snapshot()!,wire=encodeState(source,1,0),s=decodeState(wire,new Map())!.snapshot,w=new World(1,{schedule:false}),timeline=new SnapshotTimeline();guest.running=true;guest.localId='guest';applySnapshot(w,s,'guest');
  const report:any={enemies,bullets,wireBytes:wire.length};
  report.decode=measure(()=>{decodeState(wire,new Map());});report.baseline=measure(()=>{snapshotBaseline(s);});report.timelinePush=measure(()=>timeline.push(s,performance.now()));report.applySnapshot=measure(()=>applySnapshot(w,s,'guest'));
  timeline.push(s,1000);report.presentation=measure(()=>{timeline.view(w,'guest',1050,{x:0,y:0,z:0});});
  report.reconcile={};for(const pending of [0,12,60,120,240]){
   (guest as any).history.reset();for(let i=0;i<pending;i++)(guest as any).history.record({...idleInput(),fire:true});
   report.reconcile[pending]=measure(()=>guest.reconcile(w,s),20);
  }
  report.retainedPlayerObjects=(w as any).playerStarts.size;reports.push(report);console.log(JSON.stringify(report));
 }finally{host.close();guest.close();}
}
// 600 seconds of 20 Hz reconciliation and six predicted ticks per snapshot.
const host=new FriendsSession('host',[]),guest=new FriendsSession('guest',[]);
try{host.world!.addCrew('guest');const s=host.snapshot()!,w=new World(1,{schedule:false});guest.localId='guest';for(let i=0;i<12000;i++){guest.reconcile(w,s);for(let j=0;j<6;j++)w.predictCrew('guest',idleInput(),STEP);}const leak={snapshots:12000,secondsAt20Hz:600,retainedPlayerObjects:(w as any).playerStarts.size,liveCrew:w.crew.length};reports.push({leak});console.log(JSON.stringify({leak}));}finally{host.close();guest.close();}
writeFileSync('artifacts/guest-lag-investigation/results.json',JSON.stringify(reports,null,2));
