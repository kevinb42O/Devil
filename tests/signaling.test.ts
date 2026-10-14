import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MqttWsSignalingClient} from '../src/signaling';

function publishPacket(topic:string,payload:string){
 const t=new TextEncoder().encode(topic),p=new TextEncoder().encode(payload);
 let remaining=2+t.length+p.length;const length:number[]=[];
 do{const byte=remaining%128;remaining=Math.floor(remaining/128);length.push(byte|(remaining?128:0));}while(remaining);
 return new Uint8Array([0x30,...length,t.length>>8,t.length&255,...t,...p]);
}

test('signaling delivers every lobby message when MQTT packets share or cross WebSocket messages',async()=>{
 class MockSocket{
  static current:MockSocket;readyState=1;onopen?:()=>void;onmessage?:(e:{data:ArrayBuffer})=>void;onclose?:()=>void;
  constructor(){MockSocket.current=this;}
  send(){}close(){this.readyState=3;this.onclose?.();}
  receive(bytes:Uint8Array){this.onmessage?.({data:bytes.slice().buffer});}
 }
 const previous=globalThis.WebSocket;
 globalThis.WebSocket=MockSocket as unknown as typeof WebSocket;
 const client=new MqttWsSignalingClient(['wss://test.invalid']);
 try{
  const received:string[]=[];client.subscribe('room',message=>received.push(message));
  const connected=client.connect();const ws=MockSocket.current;
  const first=publishPacket('room',JSON.stringify({type:'join',id:'third'}));
  const second=publishPacket('room',JSON.stringify({type:'join',id:'fourth',name:'x'.repeat(150)}));
  ws.receive(new Uint8Array([0x20,2,0,0,...first,...second]));
  assert.equal(await connected,true);
  assert.deepEqual(received,[JSON.stringify({type:'join',id:'third'}),JSON.stringify({type:'join',id:'fourth',name:'x'.repeat(150)})]);
  received.length=0;
  // Split the remaining-length varint, then a payload, across messages.
  ws.receive(second.subarray(0,2));ws.receive(second.subarray(2,20));
  assert.deepEqual(received,[]);
  ws.receive(new Uint8Array([...second.subarray(20),...first]));
  assert.deepEqual(received,[JSON.stringify({type:'join',id:'fourth',name:'x'.repeat(150)}),JSON.stringify({type:'join',id:'third'})]);
 }finally{client.close();globalThis.WebSocket=previous;}
});

test('discovery and joining share brokers even when different connections lose different brokers',async()=>{
 class MockSocket{
  static sockets:MockSocket[]=[];readyState=1;sent:Uint8Array[]=[];
  onopen?:()=>void;onmessage?:(e:{data:ArrayBuffer})=>void;onclose?:()=>void;
  constructor(readonly url:string){MockSocket.sockets.push(this);}
  send(bytes:Uint8Array){this.sent.push(bytes);}
  close(){this.readyState=3;this.onclose?.();}
  receive(bytes:Uint8Array){this.onmessage?.({data:bytes.slice().buffer});}
 }
 const previous=globalThis.WebSocket;globalThis.WebSocket=MockSocket as unknown as typeof WebSocket;
 const urls=['wss://primary.invalid','wss://backup.invalid'];
 const discovery=new MqttWsSignalingClient(urls),session=new MqttWsSignalingClient(urls);
 try{
  const received:string[]=[],otherHandler:string[]=[];
  discovery.subscribe('lobbies',message=>received.push(message));
  discovery.subscribe('lobbies',message=>otherHandler.push(message));
  const discovering=discovery.connect(),joining=session.connect();
  const [primary,backup,sessionPrimary,sessionBackup]=MockSocket.sockets;
  // Browser discovers on primary while the room connection reaches backup first.
  primary.receive(new Uint8Array([0x20,2,0,0]));sessionBackup.receive(new Uint8Array([0x20,2,0,0]));
  assert.equal(await discovering,true);assert.equal(await joining,true);
  primary.receive(publishPacket('lobbies','friend'));assert.deepEqual(received,['friend']);
  // Both connections continue connecting to the other broker as well.
  backup.receive(new Uint8Array([0x20,2,0,0]));sessionPrimary.receive(new Uint8Array([0x20,2,0,0]));
  backup.receive(publishPacket('lobbies','friend'));assert.deepEqual(received,['friend']);
  assert.deepEqual(otherHandler,['friend'],'deduplication preserves each subscriber');
  session.publish('room','join');
  for(const socket of [sessionPrimary,sessionBackup])assert.ok(socket.sent.some(packet=>packet[0]===0x30),'join reaches each broker');
  sessionPrimary.close();session.publish('room','retry');
  assert.equal(session.isConnected(),true);
  assert.equal(sessionBackup.sent.filter(packet=>packet[0]===0x30).length,2);
  // Closing a client prevents a stale connection callback from reconnecting it.
  session.close();sessionPrimary.close();assert.equal(session.isConnected(),false);
 }finally{discovery.close();session.close();globalThis.WebSocket=previous;}
});
