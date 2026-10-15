import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const lateIce=process.env.LATE_ICE==='1';
const brokers=new Map(),dropped=new Set(),errors=[];
function packet(type,body){let n=body.length;const length=[];do{const b=n%128;n=Math.floor(n/128);length.push(b|(n?128:0));}while(n);return Buffer.from([type,...length,...body]);}
try{
 const pages=[];
 for(const role of ['host','guest']){
  const context=await browser.newContext(role==='guest'?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
  await context.routeWebSocket(/wss:\/\/broker\./,socket=>{
   // The host cannot reach the primary. The guest can reach both. Public
   // brokers have separate subscription maps and never relay to each other.
   if(role==='host'&&socket.url().includes('emqx')){socket.close();return;}
   const name=new URL(socket.url()).hostname;
   if(!brokers.has(name))brokers.set(name,new Map());
   const peers=brokers.get(name),subscriptions=new Set();peers.set(socket,subscriptions);
   socket.onClose(()=>peers.delete(socket));
   socket.onMessage(message=>{
    const bytes=Buffer.from(message);let offset=1,b;do{b=bytes[offset++];}while(b&128);
    const type=bytes[0]>>4;
    if(type===1){socket.send(Buffer.from([0x20,2,0,0]));return;}
    if(type===8){const id=bytes.subarray(offset,offset+2);offset+=2;const len=bytes.readUInt16BE(offset);offset+=2;subscriptions.add(bytes.subarray(offset,offset+len).toString());socket.send(packet(0x90,[...id,0]));return;}
    if(type===12){socket.send(Buffer.from([0xd0,0]));return;}
    if(type!==3)return;
    const len=bytes.readUInt16BE(offset);offset+=2;const topic=bytes.subarray(offset,offset+len).toString();
    let data;try{data=JSON.parse(bytes.subarray(offset+len).toString());}catch{return;}
    if(name.includes('hivemq')&&['offer','answer'].includes(data.type)&&!dropped.has(data.type)){dropped.add(data.type);return;}
    if(lateIce&&data.type==='ice'){
     const key=`ice-${data.to==='host'?'answer':'offer'}`;
     if(!dropped.has(key)){dropped.add(key);return;}
     // Arrive after the old seven-second SDP gathering cutoff, including
     // duplicate/retried messages from independent brokers.
     setTimeout(()=>{for(const [peer,topics]of peers)if(topics.has(topic))peer.send(bytes);},9000);return;
    }
    for(const [peer,topics]of peers)if(topics.has(topic))peer.send(bytes);
   });
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/join-regression',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/join-regression');
  await page.evaluate(async role=>{const {FriendsSession}=await import('/src/multiplayer.ts');window.skinRank=2;window.session=new FriendsSession(role,undefined,async token=>token==='11111111-1111-4111-8111-111111111111'?window.skinRank:null);window.session.setName(role);window.session.setColor(role==='host'?'jade':'violet');window.session.onError=e=>window.sessionError=e;},role);
  if(lateIce)await page.evaluate(()=>{
   // Simulate candidates absent from initial SDP. A valid connection must
   // receive them later through signaling, rather than relying on that SDP.
   const original=window.session.description;
   window.session.description=async function(...args){const description=await original.apply(this,args);description.sdp=description.sdp.replace(/^a=(candidate:.*|end-of-candidates)\r?\n/gm,'');return description;};
  });
  pages.push(page);
 }
 const [host,guest]=pages;
 await host.evaluate(()=>window.session.hostPublic('Broker mismatch regression'));
 await guest.evaluate(async()=>{const {LobbyBrowser}=await import('/src/lobbies.ts');window.lobbies=new LobbyBrowser();await window.lobbies.start();});
 await guest.waitForFunction(()=>window.lobbies.list.length===1);
 const lobby=await guest.evaluate(()=>window.lobbies.list[0]);
 await guest.evaluate(lobby=>window.session.joinPublic(lobby),lobby);
 try{for(const page of pages)await page.waitForFunction(()=>window.session.members.length===2&&window.session.connected===1,null,{timeout:35000});}catch(error){for(const page of pages)console.log(await page.evaluate(()=>({role:window.session.role,error:window.sessionError,members:window.session.members,links:[...window.session.links.values()].map(l=>({state:l.pc.connectionState,signaling:l.pc.signalingState,signal:!!l.signal,channel:l.state?.readyState}))})));throw error;}
 assert.deepEqual([...dropped].sort(),lateIce?['answer','ice-answer','ice-offer','offer']:['answer','offer']);
 await host.waitForFunction(()=>window.session.members.some(m=>m.color==='violet'));
 await guest.evaluate(()=>window.session.setColor('frost'));
 await host.waitForFunction(()=>window.session.members.some(m=>m.color==='frost'));
 await guest.waitForFunction(()=>window.session.members.some(m=>m.color==='jade'));
 const roster=await host.evaluate(()=>window.session.members);
 assert.deepEqual(await guest.evaluate(()=>window.session.members),roster);
 await guest.evaluate(()=>window.session.setSkin('11111111-1111-4111-8111-111111111111'));
 await host.waitForFunction(()=>window.session.members.some(m=>!m.host&&m.skin==='ascendant'&&m.skinRank===2));
 await guest.waitForFunction(()=>window.session.members.some(m=>!m.host&&m.skin==='ascendant'));
 await guest.evaluate(()=>window.session.control({type:'skin',token:'forged'}));
 await host.waitForFunction(()=>window.session.members.every(m=>!m.skin));
 await guest.waitForFunction(()=>window.session.members.every(m=>!m.skin));
 await guest.evaluate(()=>window.session.setSkin('11111111-1111-4111-8111-111111111111'));
 await host.waitForFunction(()=>window.session.members.some(m=>m.skin==='ascendant'));
 await host.evaluate(async()=>{window.skinRank=null;await window.session.refreshSkins();});
 await guest.waitForFunction(()=>window.session.members.every(m=>!m.skin));
 await host.evaluate(()=>window.skinRank=2);
 await guest.evaluate(()=>window.session.setSkin('11111111-1111-4111-8111-111111111111'));
 await host.waitForFunction(()=>window.session.members.some(m=>m.skin==='ascendant'));
 for(const page of pages)await page.evaluate(()=>window.session.setReady(true));
 await host.waitForFunction(()=>window.session.allReady);
 await host.evaluate(()=>window.session.enterPrelobby());
 await guest.waitForFunction(()=>window.session.prelobby);
 assert.equal(await guest.evaluate(()=>window.session.setColor('rose')),true);
 assert.equal((await guest.evaluate(()=>window.session.members)).find(m=>!m.host).color,'rose');
 assert.deepEqual(errors,[]);
 await guest.evaluate(()=>window.lobbies.close());
 for(const page of pages)await page.evaluate(()=>window.session.close());
 console.log(`Exclusive podium skin transport passed with a mobile guest, isolated brokers, host primary outage, dropped first offer/answer, ${lateIce?'delayed and dropped ICE candidates, ':''}matching rosters, readiness and shared courtyard.`);
}finally{await browser.close();}
