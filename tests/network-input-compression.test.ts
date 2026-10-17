import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodePacket,decodePacket} from '../src/network-codec';

test('input compression preserves exact aim, sequence gaps, holds and edges independently per datagram',()=>{
 for(let packet=0;packet<40;packet++){
  const runs=Array.from({length:120},(_,i)=>[packet*120+i+1,i%9===0?3:1,i%20<10?1:0,0,Math.sin(i/60),Math.cos(i/60)/3,i%7<3?2:4]);
  const value={epoch:3,life:2,runs},bytes=encodePacket(value);
  assert.deepEqual(decodePacket(bytes),value);
  assert.ok(bytes.length<encodePacket(value,false).length*.8);
  assert.throws(()=>decodePacket(bytes.slice(0,-1)));
 }
});

test('input compression rejects invalid masks, counts and values',()=>{
 const bytes=encodePacket({epoch:1,life:0,runs:[[1,1,0,0,0,0,0]]});
 const mask=bytes.slice();mask[mask.length-1]=128;assert.throws(()=>decodePacket(mask));
 assert.throws(()=>decodePacket(new Uint8Array([12,3,2,3,0,241,1])));
});
