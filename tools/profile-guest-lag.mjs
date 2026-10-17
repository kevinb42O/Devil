import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out='artifacts/guest-lag-current',label=process.env.PROFILE_LABEL||'before';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='win32'?{channel:'chrome'}:process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
try{
 const page=await browser.newPage();await page.route('**/guest-profile',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/guest-profile');const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const report=await page.evaluate(async()=>{
  const {FriendsSession}=await import('/src/multiplayer.ts'),{World,idleInput}=await import('/src/simulation.ts'),{encodeState,decodeState,snapshotBaseline,fragmentState,StateAssembler}=await import('/src/network-state.ts');
  const results=[];const measure=(fn,n=40)=>{const times=[];for(let i=0;i<n;i++){const at=performance.now();fn();if(i>=5)times.push(performance.now()-at);}times.sort((a,b)=>a-b);return {median:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)]};};
  for(const [enemies,bullets]of [[300,1000],[1000,3000]]){
   const host=new FriendsSession('host',[]),guest=new FriendsSession('guest',[]);try{
    host.running=true;host.world=new World(42,{schedule:false});const h=host.world;h.addCrew('host');h.addCrew('guest');h.selectCrew('host');h.contactOwners=['guest'];h.time=600;h.tick=72000;h.crew[1].level=7;h.crew[1].reserve=200;h.crew[1].primary={held:1000,wasHeld:true,streaming:true,nextShot:72000,recoverUntil:0,lastBurst:0};
    for(let i=0;i<enemies;i++){const e=h.spawn(i%25===0?'squid3':'skull4',{x:Math.sin(i)*20,y:3,z:Math.cos(i)*20},false);e.age=10;e.hp=10000;}
    h.projectiles=Array.from({length:bullets},(_,i)=>({id:100000+i,pos:{x:Math.sin(i)*15,y:4,z:Math.cos(i)*15},vel:{x:0,y:0,z:-70},age:.1,homing:false,level:7,energy:1,shotKey:`${i%10===0?'guest':'host'}:1:${i}`}));
    const source=host.snapshot(),base=snapshotBaseline(source),s=decodeState(encodeState(source,1,0),new Map()).snapshot,w=new World(1,{schedule:false});guest.running=true;guest.localId='guest';const r={enemies,bullets,clientHits:s.clientHits,receive:{}};
    for(const pending of [12,120,240]){
     guest.history.reset();for(let i=0;i<pending;i++)guest.history.record({...idleInput(),fire:true});let frame=1,received=0;const link={assembler:new StateAssembler(),baselines:new Map([[1,snapshotBaseline(s)]])};guest.onSnapshot=s=>{received++;guest.reconcile(w,s);};
     const frames=Array.from({length:40},(_,i)=>fragmentState(encodeState(source,i+2,i+1,base),i+2));r.receive[pending]=measure(()=>{for(const p of frames[frame++-1])guest.receiveState(link,p);});if(received!==40)throw Error('Incomplete receive');
    }
    guest.history.reset();guest.reconcile(w,s);guest.lastState=performance.now();let now=performance.now();guest.presentation(w,now);
    r.predictAndPresent=measure(()=>{guest.lastState=performance.now();for(let i=0;i<2;i++){if(guest.history.commands.length>30)guest.history.acknowledge(guest.history.lastSequence-12);guest.predict(w,{...idleInput(),fire:true});w.effects=[];}now+=1000/60;guest.presentation(w,now);});
    results.push(r);
   }finally{host.close();guest.close();}
  }return results;
 });
 const profile=await cdp.send('Profiler.stop');await writeFile(out+`/${label}.cpuprofile`,JSON.stringify(profile.profile));await writeFile(out+`/${label}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
