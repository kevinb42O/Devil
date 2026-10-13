import { test } from 'node:test';import assert from 'node:assert/strict';import {inflateSync} from 'node:zlib';
import {readToc,decodeMesh,decodeTexture,decodeShader,decodeParticles} from '../tools/dd-archive.mjs';
test('resource decoder validates headers and resolves selected asset bytes',()=>{
 const name=Buffer.from('hand\0'),toc=Buffer.alloc(2+name.length+12+2),payload=Buffer.from('fixture');toc.writeUInt16LE(1);name.copy(toc,2);const offset=12+toc.length;toc.writeInt32LE(offset,2+name.length);toc.writeInt32LE(payload.length,6+name.length);const header=Buffer.alloc(12);header.writeBigUInt64LE(0x013a67723a78683an);header.writeUInt32LE(toc.length,8);
 const data=Buffer.concat([header,toc,payload]);const entries=readToc(data);assert.equal(entries[0].name,'hand');assert.deepEqual(entries[0].data,payload);assert.throws(()=>readToc(data.subarray(0,15)));assert.throws(()=>readToc(Buffer.alloc(15)));
});
test('original mesh decoding preserves vertex UV indices and triangle order',()=>{
 const mesh=Buffer.alloc(10+3*32+12);mesh.writeUInt32LE(3);mesh.writeUInt32LE(3,4);mesh.writeUInt16LE(32,8);
 for(let i=0;i<3;i++){mesh.writeFloatLE(i,10+i*32);mesh.writeFloatLE(1,10+i*32+20);mesh.writeFloatLE(i/2,10+i*32+24);mesh.writeUInt32LE(i,106+i*4);}
 const text=decodeMesh(mesh);assert.match(text,/v 2 0 0/);assert.match(text,/vt 1 0/);assert.match(text,/f 1\/1\/1 2\/2\/2 3\/3\/3/);mesh.writeUInt32LE(99,106);assert.throws(()=>decodeMesh(mesh),/out of bounds/);
});
test('texture decoder flips source rows without modifying original RGBA pixels',()=>{
 const texture=Buffer.alloc(19);texture.writeUInt16LE(16401);texture.writeInt32LE(1,2);texture.writeInt32LE(2,6);texture[10]=1;Buffer.from([255,0,0,255,0,0,255,255]).copy(texture,11);
 const png=decodeTexture(texture);assert.equal(png.toString('ascii',1,4),'PNG');const length=png.readUInt32BE(33);const rows=inflateSync(png.subarray(41,41+length));assert.deepEqual([...rows],[0,0,0,255,255,0,255,0,0,255]);assert.throws(()=>decodeTexture(texture.subarray(0,15)));
});
test('shader extraction preserves both source programs',()=>{const b=Buffer.alloc(15);b.writeUInt32LE(1);b.writeUInt32LE(1,4);b.writeUInt32LE(1,8);Buffer.from('xvf').copy(b,12);const s=decodeShader(b);assert.equal(s.vertex.toString(),'v');assert.equal(s.fragment.toString(),'f');});
test('version-four emitter records decode names and exact source color values',()=>{
 const name=Buffer.from('rapid1\0'),header=Buffer.alloc(8),record=Buffer.alloc(187);header.writeUInt32LE(4);header.writeUInt32LE(1,4);record.writeFloatLE(1,16);record.writeFloatLE(.5,20);record.writeFloatLE(.21,8);record.writeFloatLE(.61,12);
 const data=Buffer.concat([header,name,record]);const e=decodeParticles(data).rapid1;assert.deepEqual(e.start,[1,.5,0]);assert.ok(Math.abs(e.lifetimeCandidate[0]-.21)<1e-6);assert.equal(e.raw.length,374);assert.throws(()=>decodeParticles(data.subarray(0,-1)));assert.throws(()=>decodeParticles(Buffer.concat([data,Buffer.alloc(1)])));
});
