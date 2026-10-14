import type {Vec} from './simulation';

/** Signed varints support unsorted identities while avoiding a value tag for
 * every active projectile/enemy ID. Bound both the count and every identity. */
export function packIds(ids:number[]){
 const bytes:number[]=[];let previous=0;
 for(const id of ids){if(!Number.isSafeInteger(id)||id<0||id>0x7fffffff)throw Error('Invalid identity');const d=id-previous;previous=id;let n=d>=0?d*2:-d*2-1;do{const low=n%128;n=Math.floor(n/128);bytes.push(low|(n?128:0));}while(n);}
 return Uint8Array.from(bytes);
}
export function unpackIds(bytes:Uint8Array){
 if(!(bytes instanceof Uint8Array)||bytes.length>100000)throw Error('Invalid identities');
 const ids:number[]=[],seen=new Set<number>();let previous=0,offset=0;
 while(offset<bytes.length){let n=0,mul=1,done=false;for(let i=0;i<5&&offset<bytes.length;i++){const b=bytes[offset++];n+=(b&127)*mul;if(!(b&128)){done=true;break;}mul*=128;}if(!done)throw Error('Invalid identity varint');
  previous+=n%2?-(n+1)/2:n/2;if(!Number.isSafeInteger(previous)||previous<0||previous>0x7fffffff||seen.has(previous)||ids.length>=20000)throw Error('Invalid identity');seen.add(previous);ids.push(previous);
 }
 return ids;
}
/** Quantize before float32 conversion. Both peers retain this exact wire pose
 * in their baseline, including values on float32/grid rounding boundaries. */
export function canonicalPosition(pos:Vec):Vec{
 const coordinate=(value:number)=>{if(!Number.isFinite(value))throw Error('Invalid position');const result=Math.fround(Math.round(value*512)/512);if(!Number.isFinite(result))throw Error('Position out of range');return result;};
 return {x:coordinate(pos.x),y:coordinate(pos.y),z:coordinate(pos.z)};
}
/** Absolute presentation coordinates at 1/512 unit resolution. Far-away
 * coordinates escape to float32; controller/collision state is never rounded. */
export function packPositions(positions:Vec[]){
 const bytes=new Uint8Array(positions.length*18),view=new DataView(bytes.buffer);let offset=0;
 for(const original of positions)for(const value of Object.values(canonicalPosition(original))){
  if(!Number.isFinite(value))throw Error('Invalid position');const n=Math.round(value*512);
  if(n>-32768&&n<=32767){view.setInt16(offset,n,true);offset+=2;}
  else{view.setInt16(offset,-32768,true);view.setFloat32(offset+2,value,true);offset+=6;}
 }
 return bytes.slice(0,offset);
}
export function unpackPositions(bytes:Uint8Array,count:number){
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(count)||count<0||count>20000)throw Error('Invalid positions');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),positions:Vec[]=[];let offset=0;
 const next=()=>{if(offset+2>bytes.length)throw Error('Truncated positions');const n=view.getInt16(offset,true);offset+=2;if(n!==-32768)return n/512;if(offset+4>bytes.length)throw Error('Truncated position escape');const value=view.getFloat32(offset,true);offset+=4;if(!Number.isFinite(value))throw Error('Invalid position');return value;};
 for(let i=0;i<count;i++)positions.push({x:next(),y:next(),z:next()});if(offset!==bytes.length)throw Error('Trailing positions');return positions;
}

/** Grid-to-grid residuals against the acknowledged pose. Quantize both ends
 * before subtraction so sender/receiver float32 differences never accumulate. */
export function packPositionDeltas(positions:Vec[],previous:(Vec|undefined)[]){
 const bytes:number[]=[];
 for(let i=0;i<positions.length;i++){const pos=canonicalPosition(positions[i]);for(const axis of ['x','y','z'] as const){
  const delta=Math.round(pos[axis]*512)-Math.round((previous[i]?.[axis]??0)*512);
  if(!Number.isSafeInteger(delta)||Math.abs(delta)>0x7fffffff) return null;
  let n=delta>=0?delta*2:-delta*2-1;do{const low=n%128;n=Math.floor(n/128);bytes.push(low|(n?128:0));}while(n);
 }
 }
 return Uint8Array.from(bytes);
}
export function unpackPositionDeltas(bytes:Uint8Array,previous:(Vec|undefined)[]){
 if(!(bytes instanceof Uint8Array)||previous.length>20000)throw Error('Invalid pose deltas');let offset=0;
 const next=()=>{let n=0,mul=1;for(let i=0;i<5&&offset<bytes.length;i++){const b=bytes[offset++];n+=(b&127)*mul;if(!(b&128)){const delta=n%2?-(n+1)/2:n/2;if(Math.abs(delta)>0x7fffffff)throw Error('Invalid pose delta');return delta;}mul*=128;}throw Error('Truncated pose delta');};
 const positions=previous.map(old=>({x:(Math.round((old?.x??0)*512)+next())/512,y:(Math.round((old?.y??0)*512)+next())/512,z:(Math.round((old?.z??0)*512)+next())/512}));
 if(offset!==bytes.length)throw Error('Trailing pose deltas');return positions;
}
