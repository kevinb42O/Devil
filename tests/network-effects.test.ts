import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeEffects,decodeEffects} from '../src/network-effects';
import {encodePacket,presentationPrecision} from '../src/network-codec';
import type {Effect} from '../src/simulation';
const hit=(i:number):Effect=>({kind:'hit',networkId:i+1,enemyId:9,enemy:'skull4',bloodId:i+1,bloodTime:10.125,pos:{x:1.234567891,y:3,z:4},direction:{x:.123456789,y:0,z:-1},shotKey:`player_01234567890123456:99:${i}:hit:9`});
test('packed impacts preserve identities and metadata while reducing reliable traffic',()=>{
 const events=Array.from({length:24},(_,i)=>hit(i)),message=encodeEffects(3,events),decoded=decodeEffects(JSON.parse(message))!;
 assert.equal(decoded.epoch,3);assert.equal(decoded.events.length,24);
 for(let i=0;i<24;i++)assert.deepEqual(JSON.parse(JSON.stringify(decoded.events[i])),{...events[i],pos:presentationPrecision(events[i].pos),direction:presentationPrecision(events[i].direction)});
 const legacy=JSON.stringify({type:'effects',epoch:3,events:events.map(({shotKey,...event})=>event)});assert.ok(message.length<legacy.length*.7,`${message.length} vs ${legacy.length}`);
});
test('large event/shot identities and leading zero shooter IDs remain exact',()=>{
 const e={...hit(0),networkId:16777217,enemyId:16777219,bloodId:16777221,shotKey:'00001234:16777217:01:hit:16777219'};
 const decoded=decodeEffects(JSON.parse(encodeEffects(0,[e])))!.events[0];assert.equal(decoded.networkId,e.networkId);assert.equal(decoded.enemyId,e.enemyId);assert.equal(decoded.bloodId,e.bloodId);assert.equal(decoded.shotKey,e.shotKey);
});
test('effects decoder rejects malformed, oversized, nonfinite and corrupt batches',()=>{
 const packed=(value:unknown)=>({type:'effects',epoch:0,packed:btoa(String.fromCharCode(...encodePacket(value)))});
 assert.throws(()=>encodeEffects(0,Array.from({length:25},(_,i)=>hit(i))));assert.equal(decodeEffects({type:'other'}),null);
 for(const message of [{type:'effects',epoch:0,packed:'!'},packed([{}]),packed([{...hit(0),shotKey:['bad:actor',1]}]),packed([{...hit(0),networkId:-1}]),packed(Array.from({length:25},(_,i)=>hit(i))),{type:'effects',epoch:0,packed:'x'.repeat(19001)}])assert.throws(()=>decodeEffects(message));
});
