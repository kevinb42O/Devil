import { deflateSync } from 'node:zlib';
/** Decoder for the documented, unencrypted res/dd asset container.
 * Format reference: NoahStolk/ddinfo-core at 1d64444d9f31632a3c932657ad13d5b4693df729.
 * No executable code from an archive is loaded or executed.
 */
const MAGIC=0x013a67723a78683an;
export function readToc(data) {
  if(data.length<12||data.readBigUInt64LE(0)!==MAGIC)throw Error('Not a Devil Daggers resource archive');
  const end=12+data.readUInt32LE(8);if(end>data.length)throw Error('Truncated table of contents');
  const result=[];let p=12;
  while(p+2<=end) {
    const type=data.readUInt16LE(p);p+=2;if(type===0)break;
    const zero=data.indexOf(0,p);if(zero<0||zero+13>end)throw Error('Truncated asset entry');
    const name=data.toString('utf8',p,zero);p=zero+1;
    const offset=data.readInt32LE(p),size=data.readInt32LE(p+4);p+=12;
    if(size<=0||offset<end)continue;
    if(offset+size>data.length)throw Error(`Truncated asset ${name}`);
    if(!/^[a-zA-Z0-9_-]+$/.test(name))throw Error('Invalid asset name');
    result.push({name,type,offset,size,data:data.subarray(offset,offset+size)});
  }
  return result;
}
export function decodeMesh(data) {
  if(data.length<10)throw Error('Truncated mesh');
  const indices=data.readUInt32LE(0),vertices=data.readUInt32LE(4);
  if(indices%3||vertices>1_000_000||indices>3_000_000||data.length<10+vertices*32+indices*4)throw Error('Invalid mesh dimensions');
  let p=10;const positions=[],normals=[],uvs=[];
  for(let i=0;i<vertices;i++) {
    const values=Array.from({length:8},(_,j)=>data.readFloatLE(p+j*4));p+=32;
    if(!values.every(Number.isFinite))throw Error('Non-finite vertex');
    positions.push(`v ${values.slice(0,3).join(' ')}`);normals.push(`vn ${values.slice(3,6).join(' ')}`);uvs.push(`vt ${values.slice(6).join(' ')}`);
  }
  const faces=[];for(let i=0;i<indices;i+=3) {
    const refs=[];for(let j=0;j<3;j++) {const index=data.readUInt32LE(p);p+=4;if(index>=vertices)throw Error('Mesh index out of bounds');refs.push(`${index+1}/${index+1}/${index+1}`);}
    faces.push(`f ${refs.join(' ')}`);
  }
  return `# Original DD mesh: ${vertices} vertices, ${indices/3} triangles\n${[...positions,...uvs,...normals,...faces].join('\n')}\n`;
}
function crc32(data) {let crc=0xffffffff;for(const byte of data){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data) {const t=Buffer.from(type);const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length);t.copy(b,4);data.copy(b,8);b.writeUInt32BE(crc32(Buffer.concat([t,data])),8+data.length);return b;}
export function decodeTexture(data) {
  if(data.length<11||data.readUInt16LE(0)!==16401)throw Error('Invalid texture header');
  const width=data.readInt32LE(2),height=data.readInt32LE(6);
  if(width<1||height<1||width>8192||height>8192||data.length<11+width*height*4)throw Error('Invalid texture dimensions');
  // Archive pixels are bottom-up. PNG rows are top-down. Preserve original RGBA.
  const rows=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)data.copy(rows,y*(width*4+1)+1,11+(height-1-y)*width*4,11+(height-y)*width*4);
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
export function decodeShader(data) {
  if(data.length<12)throw Error('Truncated shader');const n=data.readUInt32LE(0),v=data.readUInt32LE(4),f=data.readUInt32LE(8);
  if(12+n+v+f>data.length)throw Error('Truncated shader payload');return {vertex:data.subarray(12+n,12+n+v),fragment:data.subarray(12+n+v,12+n+v+f)};
}
export const selectedName=name=> /^(hand(?:\d+|left|\d+left)?|dagger(?:\d+)?|ember(?:\d+|flame)?|flame\d+|blood\d*|gib(?:\d+[abcd]?)?|smokeblob\d*|particle(?:\d+|_batch|_decal|_decal_batch)?|hand_batch|boid.*|squid.*|minisquid.*|ultrasquid.*|spider.*|giga.*|pede.*|ultrapede.*|levi.*|immortal.*|thorn.*|tile2?|bottom|crystal)$/.test(name);
/** Version 4 has 111 named, fixed-size 187-byte records in the inspected archive.
 * Field semantics beyond colors are inferred and kept alongside raw bytes.
 */
export function decodeParticles(data) {
  if(data.length<8||data.readUInt32LE(0)!==4)throw Error('Unsupported particle definition version');
  const count=data.readUInt32LE(4);if(count>10000)throw Error('Invalid emitter count');const result={};let p=8;
  for(let i=0;i<count;i++) {
    const zero=data.indexOf(0,p);if(zero<0||zero+1+187>data.length)throw Error('Truncated emitter');const name=data.toString('utf8',p,zero);if(!/^[a-zA-Z0-9_-]+$/.test(name))throw Error('Invalid emitter name');p=zero+1;
    const f=offset=>data.readFloatLE(p+offset),rgb=offset=>[f(offset),f(offset+4),f(offset+8)];
    result[name]={mode:data.readUInt32LE(p),rateCandidate:f(4),lifetimeCandidate:[f(8),f(12)],start:rgb(16),end:rgb(28),alpha:f(40),rim:rgb(44),rimStrength:f(56),clip:f(60),speedCandidate:[f(78),f(82)],sizeCandidate:f(95),raw:data.subarray(p,p+187).toString('hex')};p+=187;
  }
  if(p!==data.length)throw Error('Particle definition record size mismatch');return result;
}
