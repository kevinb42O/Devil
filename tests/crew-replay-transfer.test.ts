import {test} from 'node:test';
import assert from 'node:assert/strict';
import {World,v} from '../src/simulation';
import {CrewRunRecorder,packCrewReplay} from '../src/crew-replay';
import {CrewReplayTransfer} from '../src/crew-replay-transfer';
class Channel{
 readyState='open';bufferedAmount=0;bufferedAmountLowThreshold=0;binaryType='arraybuffer';onmessage:((e:{data:unknown})=>void)|null=null;onbufferedamountlow:(()=>void)|null=null;peer?:Channel;corrupt=false;maxQueued=0;
 send(value:string|ArrayBuffer){let data=value;if(value instanceof ArrayBuffer){this.maxQueued=Math.max(this.maxQueued,value.byteLength);if(this.corrupt){const copy=new Uint8Array(value.slice(0));copy[copy.length-1]^=1;data=copy.buffer;}}queueMicrotask(()=>this.peer?.onmessage?.({data}));}
}
function run(){const w=new World(1,{schedule:false});w.addCrew('host');w.addCrew('guest');w.crew.forEach(p=>p.player.pos=v(90,-9,90));w.selectCrew('host');const recorder=new CrewRunRecorder(1,w,[],'s',3),before=w.crew.map(p=>({...p}));w.stepCrew(new Map());recorder.record(w,new Map(),new Set(),before);return recorder.finish(w)!;}
function pair(record=run()){
 const a=new Channel(),b=new Channel();a.peer=b;b.peer=a;let epoch=3;const host=new CrewReplayTransfer(a as unknown as RTCDataChannel,true,()=>epoch,()=>record,()=>''),guest=new CrewReplayTransfer(b as unknown as RTCDataChannel,false,()=>epoch,()=>null,()=>''),timer=setInterval(()=>host.pump(),5);return {a,b,host,guest,setEpoch:(n:number)=>epoch=n,stop:()=>{clearInterval(timer);host.reset();guest.reset();}};
}
test('transfer returns the exact source recording',async()=>{const source=run(),p=pair(source);try{const received=await p.guest.request();assert.deepEqual(packCrewReplay(received),packCrewReplay(source));assert.ok(p.a.maxQueued<=16*1024+12);}finally{p.stop();}});
test('corrupt replay chunks are rejected by SHA-256 before decoding',async()=>{const p=pair();p.a.corrupt=true;try{await assert.rejects(p.guest.request(),/checksum/);}finally{p.stop();}});
test('epoch reset cancels an in-flight request and ignores late compression',async()=>{const p=pair();try{const pending=p.guest.request();p.setEpoch(4);p.guest.reset();p.host.reset();await assert.rejects(pending,/cancelled/);}finally{p.stop();}});
test('unsolicited and oversized manifests cannot allocate a replay buffer',async()=>{const p=pair();try{p.b.onmessage?.({data:JSON.stringify({type:'manifest',request:12,epoch:3,id:'x',size:1e12,chunks:1,digest:'x'})});const received=await p.guest.request();assert.equal(received.format,'abyss-crew-replay');}finally{p.stop();}});
test('three simultaneous guest transfers share the exact recording and honor backpressure',async()=>{
 const {idleInput}=await import('../src/simulation');const w=new World(19,{schedule:false,invulnerable:true});for(const id of ['host','a','b','c'])w.addCrew(id);w.selectCrew('host');const recorder=new CrewRunRecorder(19,w,[],'large',3);
 for(let n=0;n<5000;n++){w.effects=[];const input=new Map(w.crew.map((p,i)=>[p.id,{...idleInput(),yaw:n*.002+i,pitch:Math.sin(n*.13+i)*.1}])),before=w.crew.map(p=>({...p}));w.stepCrew(input);recorder.record(w,input,new Set(),before);}
 w.crew.forEach(p=>{p.alive=false;p.cause='DISCONNECTED';p.respawnAt=null;});w.effects=[];const before=w.crew.map(p=>({...p}));w.stepCrew(new Map());recorder.record(w,new Map(),new Set(),before);const source=recorder.finish(w)!,pairs=[pair(source),pair(source),pair(source)];pairs[0].a.bufferedAmount=64*1024;
 try{let completed=false;const requests=pairs.map(p=>p.guest.request());requests[0].then(()=>completed=true);await new Promise(r=>setTimeout(r,40));assert.equal(completed,false);pairs[0].a.bufferedAmount=0;const received=await Promise.all(requests);for(const recording of received){assert.equal(recording.id,source.id);assert.deepEqual(packCrewReplay(recording),packCrewReplay(source));}for(const p of pairs)assert.ok(p.a.maxQueued<=16*1024+12);}finally{for(const p of pairs)p.stop();}
});
test('an oversized manifest for the active request is rejected before allocation',async()=>{const p=pair();p.a.onmessage=null;try{const pending=p.guest.request();p.b.onmessage?.({data:JSON.stringify({type:'manifest',request:1,epoch:3,id:'large',size:32*1024*1024+1,chunks:2049,digest:'0'.repeat(64)})});await assert.rejects(pending,/manifest/);}finally{p.stop();}});
