import {type RecordedRun} from './replay';
import {ENEMY_KINDS} from './enemy-kinds';

export const MAX_REPLAY_BYTES=2*1024*1024;
export const MAX_DECODED_BYTES=32*1024*1024;
export const MAX_REPLAY_TICKS=30*60*120;
const magic=new Uint8Array([65,66,89,82,1]);
const fields=['forward','strafe','yaw','pitch'] as const;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
function invalid():never{throw Error('Invalid or unsupported replay file.');}
/** Validate untrusted files before allocating a world or iterating simulation ticks. */
export function validateReplay(value:unknown):RecordedRun{
 if(!object(value))invalid();const r=value;
 if(r.format!=='abyss-replay'||![4,5,6,7].includes(Number(r.version))||!integer(r.version,4,7)||!integer(r.seed,0,0xffffffff)||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(r.id)||!finite(r.created,0,1e15)||!integer(r.ticks,1,MAX_REPLAY_TICKS)||!finite(r.time,0,3000)||typeof r.cause!=='string'||r.cause.length>80||typeof r.practice!=='boolean')invalid();
 if(r.combatRevision!==undefined&&!integer(r.combatRevision,0,20))invalid();
 if(r.version===7&&r.combatRevision!==20||r.version!==7&&Number(r.combatRevision)>19)invalid();
 if(r.balanceFixes!==undefined&&(typeof r.balanceFixes!=='boolean'||r.balanceFixes&&r.version!==7))invalid();
 if(r.towerSeparation!==undefined&&typeof r.towerSeparation!=='boolean')invalid();
 if(r.towerArchitecture!==undefined&&typeof r.towerArchitecture!=='boolean')invalid();
 if(r.independentPracticeReserve!==undefined&&typeof r.independentPracticeReserve!=='boolean')invalid();
 if(r.analogMovement!==undefined&&typeof r.analogMovement!=='boolean')invalid();
 if(!object(r.setup)||!finite(r.setup.time,0,1200)||!integer(r.setup.level,1,r.version===7?7:4)||!finite(r.setup.reserve,0,1000))invalid();
 if(Math.abs((r.time as number)-(r.setup.time as number)-(r.ticks as number)/120)>.02)invalid();
 if(!object(r.stats)||!Array.isArray(r.stats.upgradeTimes)||r.stats.upgradeTimes.length!==(r.version===7?7:4)||!r.stats.upgradeTimes.every(v=>finite(v,0,3000))||!object(r.stats.killed))invalid();
 const statKeys=['kills','shots','hits','collected','expired','eaten','released','homingFired','homingEaten','transmuted','maxReserve','maxEnemies','leviathanDown','orbDown'];
 for(const [key,v] of Object.entries(r.stats)){if(key==='upgradeTimes'||key==='killed')continue;if(!statKeys.includes(key)||!finite(v,0,10000000))invalid();}
 for(const key of statKeys)if(!finite(r.stats[key],0,10000000))invalid();
 for(const [key,v] of Object.entries(r.stats.killed))if(!ENEMY_KINDS.includes(key as typeof ENEMY_KINDS[number])||!integer(v,0,10000000))invalid();
 if(!Array.isArray(r.frames)||r.frames.length>(r.ticks as number))invalid();let ticks=0;
 for(const frame of r.frames){if(!object(frame)||!integer(frame.ticks,1,MAX_REPLAY_TICKS)||!object(frame.input))invalid();const i=frame.input;
  if(!finite(i.forward,-1,1)||!finite(i.strafe,-1,1)||!finite(i.yaw,-1e6,1e6)||!finite(i.pitch,-Math.PI,Math.PI)||['jump','fire','homing'].some(k=>typeof i[k]!=='boolean')||['leftArm','rightArm'].some(k=>i[k]!==undefined&&typeof i[k]!=='boolean'))invalid();ticks+=frame.ticks as number;if(ticks>(r.ticks as number))invalid();
 }
 if(ticks!==r.ticks)invalid();
 return structuredClone(r) as RecordedRun;
}
export function packReplay(run:RecordedRun):Uint8Array{
 validateReplay(run);const {frames,...metadata}=run;const header=new TextEncoder().encode(JSON.stringify(metadata));
 const bytes=new Uint8Array(9+header.length+frames.length*37);bytes.set(magic);const view=new DataView(bytes.buffer);view.setUint32(5,header.length,true);bytes.set(header,9);let at=9+header.length;
 for(const f of frames){view.setUint32(at,f.ticks,true);at+=4;for(const key of fields){view.setFloat64(at,f.input[key],true);at+=8;}bytes[at++]=(f.input.jump?1:0)|(f.input.fire?2:0)|(f.input.homing?4:0)|(f.input.leftArm?8:0)|(f.input.rightArm?16:0);}
 return bytes;
}
export function unpackReplay(bytes:Uint8Array):RecordedRun{
 if(bytes.length>MAX_DECODED_BYTES)throw Error('Replay expands beyond the size limit.');
 if(bytes[0]!==magic[0]||bytes[1]!==magic[1])return validateReplay(JSON.parse(new TextDecoder().decode(bytes)));
 if(bytes.length<9||magic.some((b,i)=>bytes[i]!==b))invalid();const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),length=view.getUint32(5,true);let at=9+length;
 if(length>65536||at>bytes.length||(bytes.length-at)%37!==0||(bytes.length-at)/37>MAX_REPLAY_TICKS)invalid();
 const metadata=JSON.parse(new TextDecoder().decode(bytes.subarray(9,at)));if(!object(metadata))invalid();const frames:RecordedRun['frames']=[];
 while(at<bytes.length){const ticks=view.getUint32(at,true);at+=4;const input={forward:0,strafe:0,yaw:0,pitch:0,jump:false,fire:false,homing:false};for(const key of fields){input[key]=view.getFloat64(at,true);at+=8;}const flags=bytes[at++];if(flags>31)invalid();input.jump=!!(flags&1);input.fire=!!(flags&2);input.homing=!!(flags&4);if(flags&8)Object.assign(input,{leftArm:true});if(flags&16)Object.assign(input,{rightArm:true});frames.push({ticks,input});}
 return validateReplay({...metadata,frames});
}
export async function readBounded(stream:ReadableStream<Uint8Array>,limit:number):Promise<Uint8Array>{
 const reader=stream.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw Error('Replay exceeds the size limit.');}chunks.push(value);}}finally{reader.releaseLock();}
 const out=new Uint8Array(length);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;
}
export async function encodeReplay(run:RecordedRun,maxBytes=MAX_REPLAY_BYTES):Promise<Blob>{
 const packed=packReplay(run);const compressed=await readBounded(new Blob([packed as BlobPart]).stream().pipeThrough(new CompressionStream('gzip')),maxBytes);
 return new Blob([compressed as BlobPart],{type:'application/gzip'});
}
export async function decodeReplay(file:Blob):Promise<RecordedRun>{
 if(file.size>MAX_DECODED_BYTES)throw Error('Replay exceeds the size limit.');const prefix=new Uint8Array(await file.slice(0,2).arrayBuffer());
 const stream=prefix[0]===31&&prefix[1]===139?file.stream().pipeThrough(new DecompressionStream('gzip')):file.stream();
 return unpackReplay(await readBounded(stream,MAX_DECODED_BYTES));
}
