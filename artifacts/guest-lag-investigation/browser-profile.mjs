import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const results=await page.evaluate(async()=>{
  const {FriendsSession,applySnapshot}=await import('/src/multiplayer.ts'),{World,idleInput}=await import('/src/simulation.ts'),{snapshotBaseline,encodeState,decodeState,fragmentState,StateAssembler}=await import('/src/network-state.ts'),{SnapshotTimeline}=await import('/src/network-presentation.ts');
  const results=[];
  function measure(fn,n=50){for(let i=0;i<8;i++)fn();const times=[];for(let i=0;i<n;i++){const at=performance.now();fn();times.push(performance.now()-at);}times.sort((a,b)=>a-b);return {median:times[Math.floor(n*.5)],p95:times[Math.floor(n*.95)]};}
  for(const [enemies,bullets]of [[0,0],[300,1000],[1000,3000]]){
   const host=new FriendsSession('host',[]),guest=new FriendsSession('guest',[]);
   try{
    host.running=true;host.world=new World(42,{schedule:false});const h=host.world;h.addCrew('host');h.addCrew('guest');h.selectCrew('host');h.time=600;h.tick=72000;h.crew[1].level=7;h.crew[1].primary={held:1000,wasHeld:true,streaming:true,nextShot:72000,recoverUntil:0,lastBurst:0};
    for(let i=0;i<enemies;i++){const e=h.spawn(i%20===0?'squid3':'skull4',{x:Math.sin(i)*20,y:3,z:Math.cos(i)*20},false);e.age=10;}
    h.projectiles=Array.from({length:bullets},(_,i)=>({id:100000+i,pos:{x:1,y:3,z:1},previous:{x:1,y:3,z:1},vel:{x:0,y:0,z:-70},age:.1,homing:i%4===0,level:7,energy:1,shotKey:`host:1:${i}`}));
    const s=decodeState(encodeState(host.snapshot(),1,0),new Map()).snapshot,w=new World(1,{schedule:false}),timeline=new SnapshotTimeline(),base=snapshotBaseline(s),wire=encodeState(s,2,1,base),bases=new Map([[1,base]]),r={enemies,bullets,deltaWireBytes:wire.length};guest.localId='guest';guest.running=true;
    applySnapshot(w,s,'guest');r.decodeDelta=measure(()=>decodeState(wire,bases));r.baseline=measure(()=>snapshotBaseline(s));r.timelinePush=measure(()=>timeline.push(s,performance.now()));r.applySnapshot=measure(()=>applySnapshot(w,s,'guest'));r.presentation=measure(()=>timeline.view(w,'guest',performance.now(),{x:0,y:0,z:0}));
    r.reconcile={};r.receiveAndReconcile={};
    for(const pending of [0,12,60,120,240]){
     guest.history.reset();for(let i=0;i<pending;i++)guest.history.record({...idleInput(),fire:true});r.reconcile[pending]=measure(()=>guest.reconcile(w,s),30);
     const link={assembler:new StateAssembler(),baselines:new Map([[1,base]])};const frames=Array.from({length:38},(_,i)=>fragmentState(encodeState(s,i+2,i+1,base),i+2));let f=0,received=0;guest.onSnapshot=s=>{received++;guest.reconcile(w,s);};
     r.receiveAndReconcile[pending]=measure(()=>{for(const packet of frames[f++])guest.receiveState(link,packet);},30);if(received!==38)throw Error(`Only ${received}/38 snapshots reconciled`);
    }
    results.push(r);
   }finally{host.close();guest.close();}
  }return results;
 });
 const profile=await cdp.send('Profiler.stop');writeFileSync('artifacts/guest-lag-investigation/chrome.cpuprofile',JSON.stringify(profile.profile));writeFileSync('artifacts/guest-lag-investigation/chrome-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
