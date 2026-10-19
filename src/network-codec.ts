/** Bounded binary value codec. Object keys/strings are interned per packet;
 * integers use varints, presentation floats use float32, controller floats
 * retain float64 precision. No JSON escaping or compression dependency. */
export const NETWORK_PROTOCOL_VERSION=22;
const MAX_BYTES=1024*1024,MAX_ITEMS=100000;
export function encodePacket(value:unknown,compactInputs=true):Uint8Array{
 let bytes=new Uint8Array(4096),offset=0;const strings=new Map<string,number>(),utf8=new TextEncoder();
 const reserve=(n:number)=>{if(offset+n>MAX_BYTES)throw Error('Network packet too large');if(offset+n>bytes.length){const next=new Uint8Array(Math.min(MAX_BYTES,Math.max(bytes.length*2,offset+n)));next.set(bytes);bytes=next;}};
 const byte=(n:number)=>{reserve(1);bytes[offset++]=n;};
 const uint=(n:number)=>{do{const low=n%128;n=Math.floor(n/128);byte(low|(n?128:0));}while(n);};
 const write=(v:unknown,depth=0):void=>{
  if(depth>32)throw Error('Network nesting too deep');
  if(v==null){byte(0);return;}if(v===false){byte(1);return;}if(v===true){byte(2);return;}
  if(typeof v==='number'){
   if(!Number.isFinite(v)){byte(0);return;}
   if(Number.isSafeInteger(v)&&Math.abs(v)<0x40000000){byte(3);uint(v>=0?v*2:-v*2-1);return;}
   const small=Math.fround(v)===v;byte(small?4:5);reserve(small?4:8);const view=new DataView(bytes.buffer);if(small)view.setFloat32(offset,v,true);else view.setFloat64(offset,v,true);offset+=small?4:8;return;
  }
  if(typeof v==='string'){const known=strings.get(v);if(known!==undefined){byte(7);uint(known);return;}const data=utf8.encode(v);byte(6);uint(data.length);reserve(data.length);bytes.set(data,offset);offset+=data.length;strings.set(v,strings.size);return;}
  if(v instanceof Uint8Array){byte(11);uint(v.length);reserve(v.length);bytes.set(v,offset);offset+=v.length;return;}
  if(v instanceof Float32Array){byte(10);uint(v.length);reserve(v.length*4);const view=new DataView(bytes.buffer);for(const n of v){view.setFloat32(offset,n,true);offset+=4;}return;}
  if(Array.isArray(v)){byte(8);uint(v.length);for(const item of v)write(item,depth+1);return;}
  if(typeof v==='object'){
   const entries=Object.entries(v).filter(([,item])=>item!==undefined),p=v as {epoch?:unknown;life?:unknown;runs?:unknown};
   if(compactInputs&&entries.length===3&&Number.isSafeInteger(p.epoch)&&Number.isSafeInteger(p.life)&&Array.isArray(p.runs)&&p.runs.length<=240&&p.runs.every(r=>Array.isArray(r)&&r.length===7&&r.every(n=>typeof n==='number'&&Number.isFinite(n)))){
    // Every datagram is self-contained: omitted fields refer only to the
    // preceding row in this packet, so loss/reordering needs no baseline.
    byte(12);write(p.epoch,depth+1);write(p.life,depth+1);uint(p.runs.length);let previous:number[]|undefined;
    for(const row of p.runs){const defaults=previous?[previous[0]+previous[1],1,...previous.slice(2)]:[1,1,0,0,0,0,0];let mask=0;for(let i=0;i<7;i++)if(!Object.is(row[i],defaults[i]))mask|=1<<i;byte(mask);for(let i=0;i<7;i++)if(mask&(1<<i))write(row[i],depth+1);previous=row;}
    return;
   }
   byte(9);uint(entries.length);for(const [key,item]of entries){write(key,depth+1);write(item,depth+1);}return;
  }
  throw Error('Unsupported network value');
 };write(value);return bytes.slice(0,offset);
}
export function decodePacket(bytes:Uint8Array):unknown{
 if(bytes.byteLength>MAX_BYTES)throw Error('Network packet too large');
 let offset=0,items=0;const strings:string[]=[],utf8=new TextDecoder('utf-8',{fatal:true}),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const need=(n:number)=>{if(offset+n>bytes.length)throw Error('Truncated packet');};
 const byte=()=>{need(1);return bytes[offset++];};
 const uint=()=>{let n=0,mul=1;for(let i=0;i<5;i++){const b=byte();n+=(b&127)*mul;if(!(b&128))return n;mul*=128;}throw Error('Invalid varint');};
 const read=(depth=0):any=>{
  if(depth>32||++items>MAX_ITEMS)throw Error('Invalid packet complexity');
  switch(byte()){
   case 0:return null;case 1:return false;case 2:return true;
   case 12:{const epoch=read(depth+1),life=read(depth+1),n=uint();if(!Number.isSafeInteger(epoch)||!Number.isSafeInteger(life)||n>240)throw Error('Invalid input packet');const runs:number[][]=[];for(let j=0;j<n;j++){const previous=runs.at(-1),row=previous?[previous[0]+previous[1],1,...previous.slice(2)]:[1,1,0,0,0,0,0],mask=byte();if(mask>127)throw Error('Invalid input mask');for(let i=0;i<7;i++)if(mask&(1<<i)){const value=read(depth+1);if(typeof value!=='number'||!Number.isFinite(value))throw Error('Invalid input value');row[i]=value;}runs.push(row);}return {epoch,life,runs};}
   case 3:{const n=uint();return n%2?-(n+1)/2:n/2;}
   case 4:need(4);{const n=view.getFloat32(offset,true);offset+=4;if(!Number.isFinite(n))throw Error('Invalid float');return n;}
   case 5:need(8);{const n=view.getFloat64(offset,true);offset+=8;if(!Number.isFinite(n))throw Error('Invalid float');return n;}
   case 6:{const n=uint();need(n);const s=utf8.decode(bytes.subarray(offset,offset+n));offset+=n;strings.push(s);return s;}
   case 7:{const n=uint();if(n>=strings.length)throw Error('Invalid string reference');return strings[n];}
   case 8:{const n=uint();if(n>MAX_ITEMS-items)throw Error('Invalid array');return Array.from({length:n},()=>read(depth+1));}
   case 11:{const n=uint();need(n);const result=bytes.slice(offset,offset+n);offset+=n;return result;}
   case 10:{const n=uint();if(n>MAX_ITEMS-items)throw Error('Invalid float array');need(n*4);const result=new Float32Array(n);for(let i=0;i<n;i++){result[i]=view.getFloat32(offset,true);offset+=4;if(!Number.isFinite(result[i]))throw Error('Invalid float');}return result;}
   case 9:{const n=uint();if(n>MAX_ITEMS-items)throw Error('Invalid object');const result=Object.create(null);for(let i=0;i<n;i++){const key=read(depth+1);if(typeof key!=='string'||key==='__proto__'||key==='constructor'||key==='prototype')throw Error('Invalid key');result[key]=read(depth+1);}return result;}
   default:throw Error('Invalid packet tag');
  }
 };const result=read();if(offset!==bytes.length)throw Error('Trailing network bytes');return result;
}
/** Quantize presentation data only; controller state is never rounded. */
export function presentationPrecision<T>(value:T):T{
 if(typeof value==='number')return (Number.isFinite(value)?Math.fround(value):null) as T;
 if(Array.isArray(value))return value.map(presentationPrecision) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,presentationPrecision(v)])) as T;
 return value;
}
