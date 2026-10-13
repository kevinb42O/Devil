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
