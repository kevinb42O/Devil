import test from 'node:test';
import assert from 'node:assert/strict';
import {FriendsSession} from '../src/multiplayer';

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
