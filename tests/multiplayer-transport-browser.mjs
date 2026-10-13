import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const host=await browser.newPage(),guest=await browser.newPage();const url=process.env.GAME_URL||'http://127.0.0.1:5173';
 for(const [p,role] of [[host,'host'],[guest,'guest']]){await p.goto(url+'/favicon.svg');await p.evaluate(async role=>{const {FriendsSession}=await import('/src/multiplayer.ts');window.session=new FriendsSession(role,[]);window.session.onSnapshot=s=>window.snapshot=s;window.session.onError=e=>console.error(e);},role);}
 const offer=await host.evaluate(()=>window.session.offer());const answer=await guest.evaluate(offer=>window.session.answer(offer),offer);await host.evaluate(answer=>window.session.accept(answer),answer);await host.waitForFunction(()=>window.session.connected===1);await guest.waitForFunction(()=>window.session.connected===1);
 await guest.evaluate(()=>window.session.sendInput({forward:1,strafe:0,yaw:0,pitch:0,jump:false,fire:true,homing:false}));await host.waitForFunction(()=>[...window.session.inputs.values()].some(p=>p.fire&&p.forward===1));
 await host.evaluate(()=>{const s=window.session;s.start();s.world.projectiles=Array.from({length:2000},(_,i)=>({id:i+1,pos:{x:i/100,y:2,z:0},vel:{x:0,y:0,z:-70},age:0,homing:false,level:1,energy:1,hitIds:[]}));s.broadcast();});await guest.waitForFunction(()=>window.snapshot?.projectiles.length===2000);assert.equal(await guest.evaluate(()=>window.snapshot.crew.length),2);
 await host.evaluate(()=>{window.session.start();window.session.broadcast();});await guest.waitForFunction(()=>window.snapshot?.epoch===2&&window.snapshot.projectiles.length===0);
 // A full tap arrives before the host simulates either edge.
 await host.evaluate(()=>{window.session.start();window.session.startAt=0;});
 await guest.evaluate(()=>{const s=window.session;const input={forward:0,strafe:0,yaw:.25,pitch:0,jump:false,fire:false,homing:false};s.sendInput(input);s.sendInput({...input,fire:true});s.sendInput(input);});
 await host.waitForFunction(()=>[...window.session.inputs.values()].some(p=>p.yaw===.25&&!p.fire));
 const tap=await host.evaluate(()=>{const s=window.session;const idle={forward:0,strafe:0,yaw:0,pitch:0,jump:false,fire:false,homing:false};s.step(idle);s.step(idle);return {shots:s.world.stats.shots,shooters:s.world.effects.filter(e=>e.kind==='burst').map(e=>e.shooterId)};});
 assert.equal(tap.shots,10);assert.deepEqual(tap.shooters,[await guest.evaluate(()=>window.session.localId)]);
 const secure=await host.evaluate(()=>isSecureContext);console.log(`WebRTC transport passed on ${url} (secureContext=${secure}): input, 2,000-projectile fragmented snapshot, crew, restart epoch and a rapid guest tap.`);
 await host.evaluate(()=>window.session.close());await guest.waitForFunction(()=>window.session.connected===0);
}finally{await browser.close();}
