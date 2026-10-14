import test from 'node:test';
import assert from 'node:assert/strict';
import {FriendsSession} from '../src/multiplayer';
import {NETWORK_PROTOCOL_VERSION} from '../src/network-codec';

test('late ICE candidates wait for remote SDP and duplicate broker deliveries apply only once',async()=>{
 const host=new FriendsSession('host'),guest=new FriendsSession('guest');
 const topic='abyss-daggers/v1/rooms/ABCDEF';
 const candidate={candidate:'candidate:1 1 UDP 123 192.0.2.1 5000 typ host',sdpMid:'0',sdpMLineIndex:0};
 const applied:RTCIceCandidateInit[]=[];
 const pc:any={remoteDescription:null,close(){},async addIceCandidate(value:RTCIceCandidateInit){applied.push(value);}};
 try{
  host.room=guest.room='ABCDEF';
  const message=JSON.stringify({type:'ice',room:host.room,version:NETWORK_PROTOCOL_VERSION,id:guest.id,to:'host',candidate});
  const link:any={pc,timer:0};host.links.set(guest.id,link);
  await (host as any).signalMessage(message,topic);await (host as any).signalMessage(message,topic);
  assert.equal(applied.length,0,'ICE cannot apply before remote description');
  pc.remoteDescription={type:'answer'};await (host as any).applyIce(link);
  await (host as any).signalMessage(message,topic);assert.deepEqual(applied,[candidate]);
  await (host as any).signalMessage(JSON.stringify({...JSON.parse(message),room:'OTHER1',candidate:{...candidate,candidate:'different'}}),topic);
  assert.equal(applied.length,1,'other rooms cannot inject candidates');
  const early=JSON.stringify({...JSON.parse(message),to:guest.id});
  await (guest as any).signalMessage(early,topic);await (guest as any).signalMessage(early,topic);
  assert.equal((guest as any).earlyIce.size,1,'guest retains candidates delivered before the offer');
 }finally{host.close();guest.close();}
});

test('join retries replay ICE candidates missing from the initial SDP',async()=>{
 const host=new FriendsSession('host'),guest=new FriendsSession('guest');
 const topic='abyss-daggers/v1/rooms/ABCDEF',messages:any[]=[];
 try{
  (host as any).signalingTopic=topic;host.room='ABCDEF';
  (host as any).mqtt.publish=(_topic:string,payload:string)=>messages.push(JSON.parse(payload));
  host.links.set(guest.id,{pc:{close(){}},timer:0,signal:'offer',localIce:[{candidate:'late route',sdpMid:'0',sdpMLineIndex:0}]} as any);
  await (host as any).signalMessage(JSON.stringify({type:'join',id:guest.id}),topic);
  assert.deepEqual(messages.map(m=>m.type),['offer','ice']);
  assert.equal(messages[1].to,guest.id);assert.equal(messages[1].room,host.room);
 }finally{host.close();guest.close();}
});

test('repeated join requests resend a lost offer and repeated offers resend a lost answer',async()=>{
 const host=new FriendsSession('host'),guest=new FriendsSession('guest');
 const topic='abyss-daggers/v1/rooms/ABCDEF';
 const messages:{type:string;signal?:string}[]=[];
 try{
  for(const session of [host,guest])(session as any).mqtt.publish=(_topic:string,payload:string)=>messages.push(JSON.parse(payload));
  let offers=0,answers=0;
  (host as any).offer=async(id:string)=>{offers++;host.links.set(id,{pc:{close(){}},timer:0} as any);return 'same-offer';};
  (guest as any).answer=async()=>{answers++;guest.links.set(guest.id,{pc:{close(){}},timer:0} as any);return 'same-answer';};
  const join=JSON.stringify({type:'join',id:guest.id,name:'Friend'});
  await (host as any).signalMessage(join,topic);
  await (host as any).signalMessage(join,topic);
  assert.equal(offers,1);assert.equal(host.members.length,2);
  assert.deepEqual(messages.map(m=>m.signal),['same-offer','same-offer']);
  const offer=JSON.stringify({type:'offer',to:guest.id,signal:'same-offer'});
  await (guest as any).signalMessage(offer,topic);
  await (guest as any).signalMessage(offer,topic);
  assert.equal(answers,1);
  assert.deepEqual(messages.slice(2).map(m=>m.signal),['same-answer','same-answer']);
 }finally{host.close();guest.close();}
});
