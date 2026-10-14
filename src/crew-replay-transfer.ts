import {encodeCrewReplay,decodeCrewReplay,MAX_CREW_REPLAY_BYTES,type RecordedCrewRun} from './crew-replay';
const CHUNK=16*1024,RATE=256*1024,QUEUE=64*1024;
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('');
const encodedRuns=new WeakMap<RecordedCrewRun,Promise<{bytes:Uint8Array;digest:string}>>();
type Incoming={request:number;epoch:number;id:string;size:number;chunks:number;digest:string;bytes:Uint8Array;next:number;at:number};
type Outgoing={request:number;epoch:number;bytes:Uint8Array;next:number;at:number;tokens:number};
/** Bulk recordings use their own ordered channel and bounded queues, never live state. */
export class CrewReplayTransfer{
 private serial=0;private outgoing?:Outgoing;private incoming?:Incoming;private pending?:{request:number;epoch:number;resolve:(run:RecordedCrewRun)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>};private cache?:{run:RecordedCrewRun;encoded:Promise<{bytes:Uint8Array;digest:string}>};
 onProgress=(_progress:number)=>{};
 constructor(readonly channel:RTCDataChannel,private host:boolean,private epoch:()=>number,private run:()=>RecordedCrewRun|null,private error:()=>string){channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=CHUNK;channel.onbufferedamountlow=()=>this.pump();channel.onmessage=e=>{const pending=this.pending;void this.receive(e.data).catch(e=>{if(this.pending===pending)this.fail(e instanceof Error?e.message:'Team replay transfer failed.');});};}
 request():Promise<RecordedCrewRun>{
  if(this.host){const run=this.run();return run?Promise.resolve(run):Promise.reject(Error(this.error()||'Team replay is not ready.'));}
  if(this.pending)return Promise.reject(Error('A team replay download is already running.'));if(this.channel.readyState!=='open')return Promise.reject(Error('The host connection is unavailable.'));
  const request=++this.serial,epoch=this.epoch();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.fail('Team replay download timed out. Try again.'),45000);this.pending={request,epoch,resolve,reject,timer};this.onProgress(0);try{this.send({type:'request',request,epoch});}catch{this.fail('The host connection is unavailable.');}});
 }
 private send(message:unknown){this.channel.send(JSON.stringify(message));}
 private async receive(data:unknown){
  if(data instanceof ArrayBuffer){const p=this.pending,s=this.incoming;if(!p||!s)return;if(data.byteLength<12||data.byteLength>CHUNK+12)throw Error('Invalid team replay chunk.');const view=new DataView(data),request=view.getUint32(0,true),epoch=view.getUint32(4,true),index=view.getUint32(8,true);if(request!==p.request||epoch!==p.epoch||epoch!==this.epoch())return;const expected=Math.min(CHUNK,s.size-s.next*CHUNK);if(index!==s.next||data.byteLength!==expected+12)throw Error('Invalid team replay chunk order.');s.bytes.set(new Uint8Array(data,12),s.next*CHUNK);s.next++;s.at=performance.now();clearTimeout(p.timer);p.timer=setTimeout(()=>this.fail('Team replay download stalled. Try again.'),45000);this.onProgress(s.next/s.chunks);
   if(s.next===s.chunks){if(await hash(s.bytes)!==s.digest)throw Error('Team replay checksum failed. Try again.');const run=await decodeCrewReplay(new Blob([s.bytes as BlobPart]));if(this.pending!==p||this.epoch()!==p.epoch)return;if(run.epoch!==s.epoch||run.id!==s.id)throw Error('Team replay belongs to another run.');clearTimeout(p.timer);this.pending=undefined;this.incoming=undefined;p.resolve(run);}return;}
  if(typeof data!=='string'||data.length>4096)return;const m=JSON.parse(data);if(!m||typeof m!=='object'||!Number.isSafeInteger(m.request)||m.request<1||m.request>0xffffffff)return;
  if(this.host){
   if(m.type==='cancel'){this.serial++;if(this.outgoing?.request===m.request)this.outgoing=undefined;return;}
   if(m.type!=='request'||m.epoch!==this.epoch())return;const run=this.run();if(!run){this.send({type:'error',request:m.request,epoch:m.epoch,message:this.error()||'The team replay is unavailable.'});return;}
   // A new request replaces this peer's previous transfer, including pending compression.
   const generation=++this.serial;if(this.cache?.run!==run){let encoded=encodedRuns.get(run);if(!encoded){encoded=encodeCrewReplay(run).then(b=>b.arrayBuffer()).then(async b=>{const bytes=new Uint8Array(b);return {bytes,digest:await hash(bytes)};});encodedRuns.set(run,encoded);}this.cache={run,encoded};}
   try{const {bytes,digest}=await this.cache.encoded;if(generation!==this.serial||run!==this.run()||m.epoch!==this.epoch()||this.channel.readyState!=='open')return;this.send({type:'manifest',request:m.request,epoch:m.epoch,id:run.id,size:bytes.length,chunks:Math.ceil(bytes.length/CHUNK),digest});this.outgoing={request:m.request,epoch:m.epoch,bytes,next:0,at:performance.now(),tokens:CHUNK};this.pump();}catch(e){encodedRuns.delete(run);this.cache=undefined;if(generation===this.serial&&this.channel.readyState==='open')this.send({type:'error',request:m.request,epoch:m.epoch,message:e instanceof Error?e.message:'Could not prepare team replay.'});}return;
  }
  const p=this.pending;if(!p||m.request!==p.request||m.epoch!==p.epoch||m.epoch!==this.epoch())return;
  if(m.type==='error'){this.fail(typeof m.message==='string'?m.message.slice(0,200):'Team replay unavailable.');return;}
  if(m.type==='manifest'){if(this.incoming||typeof m.id!=='string'||!/^[\w-]{1,80}$/.test(m.id)||!Number.isInteger(m.size)||m.size<1||m.size>MAX_CREW_REPLAY_BYTES||m.chunks!==Math.ceil(m.size/CHUNK)||typeof m.digest!=='string'||!/^[a-f0-9]{64}$/.test(m.digest))throw Error('Invalid team replay manifest.');this.incoming={request:p.request,epoch:p.epoch,id:m.id,size:m.size,chunks:m.chunks,digest:m.digest,bytes:new Uint8Array(m.size),next:0,at:performance.now()};}
 }
 pump(){const s=this.outgoing;if(!s)return;if(s.epoch!==this.epoch()||this.channel.readyState!=='open'){this.outgoing=undefined;return;}const now=performance.now();s.tokens=Math.min(QUEUE,s.tokens+(now-s.at)*RATE/1000);s.at=now;
  for(let n=0;n<4&&s.next*CHUNK<s.bytes.length;n++){const bytes=s.bytes.subarray(s.next*CHUNK,(s.next+1)*CHUNK);if(this.channel.bufferedAmount+bytes.length+12>QUEUE||s.tokens<bytes.length)break;const packet=new Uint8Array(bytes.length+12),view=new DataView(packet.buffer);view.setUint32(0,s.request,true);view.setUint32(4,s.epoch,true);view.setUint32(8,s.next,true);packet.set(bytes,12);try{this.channel.send(packet.buffer);}catch{this.outgoing=undefined;return;}s.tokens-=bytes.length;s.next++;}if(s.next*CHUNK>=s.bytes.length)this.outgoing=undefined;
 }
 private fail(message:string){const p=this.pending;if(p){clearTimeout(p.timer);this.pending=undefined;this.incoming=undefined;p.reject(Error(message));}}
 reset(){this.serial++;const p=this.pending;if(p&&this.channel.readyState==='open')try{this.send({type:'cancel',request:p.request,epoch:p.epoch});}catch{}this.fail('Team replay cancelled because the crew session changed.');this.outgoing=undefined;this.cache=undefined;}
}
