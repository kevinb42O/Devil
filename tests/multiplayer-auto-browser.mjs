import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const host=await browser.newPage(),guest=await browser.newPage(),url=process.env.GAME_URL||'http://127.0.0.1:5173';
 for(const [page,role]of [[host,'host'],[guest,'guest']]){await page.goto(url+'/favicon.svg');await page.evaluate(async role=>{const {FriendsSession}=await import('/src/multiplayer.ts');window.session=new FriendsSession(role,[]);window.session.setName(role==='host'?'Host':'Guest');window.session.onSnapshot=s=>window.snapshot=s;},role);}
 const name='Public lobby '+Date.now();await host.evaluate(name=>window.session.hostPublic(name),name);
 await guest.evaluate(async()=>{const {LobbyBrowser}=await import('/src/lobbies.ts');window.browser=new LobbyBrowser();await window.browser.start();});await guest.waitForFunction(name=>window.browser.list.some(room=>room.name===name),name);await guest.evaluate(name=>window.session.joinPublic(window.browser.list.find(room=>room.name===name)),name);await host.waitForFunction(()=>window.session.connected===1);await guest.waitForFunction(()=>window.session.members.length===2);
 assert.equal(await host.evaluate(()=>window.session.allReady),false);assert.equal(await host.evaluate(()=>{try{window.session.start();return false;}catch{return true;}}),true,'server rejects start without ready');
 await host.evaluate(()=>window.session.setReady(true));await guest.evaluate(()=>window.session.setReady(true));await host.waitForFunction(()=>window.session.allReady);await host.evaluate(()=>{window.session.start();window.session.world.collect();window.session.broadcast();});await guest.waitForFunction(()=>window.snapshot?.running&&window.snapshot.stats.collected===1);assert.equal(await host.evaluate(()=>window.session.world.stats.collected),1);
 await host.evaluate(()=>window.session.returnToLobby());await guest.waitForFunction(()=>window.snapshot?.running===false&&window.session.members.every(p=>!p.ready));await host.evaluate(()=>window.session.close());await guest.waitForFunction(()=>window.session.connected===0);await guest.evaluate(()=>window.browser.close());
 console.log('Public internet broker passed: lobby discovery, automatic WebRTC join, ready gate, shared gem snapshot, return to lobby and disconnect.');
}finally{await browser.close();}
