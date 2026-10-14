import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BloodField,BLOOD_CAPACITY} from '../src/blood.ts';
import {floorHeight,TILE_SIZE,tileHeight} from '../src/arena.ts';
import {World,v,idleInput} from '../src/simulation.ts';
import {ReplayPlayer,RunRecorder} from '../src/replay.ts';

const kill=(id=1,pos=v(0,6,0))=>({kind:'kill' as const,pos,bloodId:id,bloodTime:0,enemyId:1,amount:2});
test('airborne blood paints only after landing; stains persist and reset',()=>{
 const field=new BloodField(256);field.emit(kill(),0);assert.equal(field.landings,0);assert.equal(field.revision,0);
 field.advance(.1);assert.equal(field.landings,0);field.advance(3);
 assert.ok(field.landings>0);assert.equal(field.drops.length,0);assert.ok(field.pixels.some((n,i)=>i%4===0&&n>0));
 const pixels=field.pixels.slice(),revision=field.revision;field.advance(30);assert.deepEqual(field.pixels,pixels);assert.equal(field.revision,revision);
 field.clear();assert.equal(field.drops.length,0);assert.ok(field.pixels.every(n=>n===0));
});
test('sprays and landings are independent of render cadence and duplicate delivery',()=>{
 const a=new BloodField(256),b=new BloodField(256);a.emit(kill(),0);b.emit(kill(),0);b.emit(kill(),0);
 assert.equal(a.drops.length,b.drops.length);
 for(let i=1;i<=180;i++)a.advance(i/60);b.advance(3);assert.deepEqual(a.pixels,b.pixels);assert.equal(a.landings,b.landings);
});
test('blood falls into the void without painting an imaginary floor',()=>{
 const field=new BloodField(256);field.emit(kill(1,v(85,5,85)),0);field.advance(6);assert.equal(field.landings,0);assert.equal(field.drops.length,0);assert.ok(field.pixels.every(n=>n===0));
});
test('pool and texture storage stay fixed under thousands of kills',()=>{
 const field=new BloodField(256),pixels=field.pixels;for(let i=1;i<10000;i++)field.emit(kill(i),0);
 assert.equal(field.drops.length,BLOOD_CAPACITY);assert.equal(field.pixels,pixels);assert.equal(field.pixels.byteLength,256*256*4);assert.ok(field.discarded>0);field.advance(5);assert.equal(field.drops.length,0);
});
test('swept droplets land on raised tiles and reject underground sources',()=>{
 const field=new BloodField(256),ground=floorHeight(0,0,0,0);field.emit(kill(1,v(0,ground-1,0)),0);assert.equal(field.drops.length,0);
 const drop={origin:v(0,ground+1,0),pos:v(0,ground+1,0),velocity:v(0,-300,0),born:0,age:0,size:.2,angle:0,stretch:1,seed:1};field.drops.push(drop);field.advance(1/60);assert.equal(field.landings,1);
 let edge: {x:number;z:number;low:number;high:number}|undefined;
 for(let z=1;z<49&&!edge;z++)for(let x=1;x<48;x++)if(tileHeight(x,z,0)>-20&&tileHeight(x+1,z,0)>tileHeight(x,z,0)+.01){edge={x:(x-25+.5)*TILE_SIZE,z:(z-25)*TILE_SIZE,low:tileHeight(x,z,0),high:tileHeight(x+1,z,0)};break;}
 assert.ok(edge);field.clear();const y=(edge.low+edge.high)/2;
 field.drops.push({...drop,age:0,origin:v(edge.x-.05,y,edge.z),pos:v(edge.x-.05,y,edge.z),velocity:v(12,0,0)});field.advance(1/60);assert.equal(field.landings,1,'raised tile catches horizontal spray');
});
test('damage carries immutable segment sources and leaves gameplay RNG untouched',()=>{
 const a=new World(17,{schedule:false}),b=new World(17,{schedule:false});const e=a.spawn('centipede',v(0,6,0));const other=b.spawn('centipede',v(0,6,0));
 const point={...e.segments[0].pos};a.damageEnemy(e,e.segments[0].hp,point,0);assert.equal(a.effects.at(-1)?.bloodSegment,true);b.damageEnemy(other,other.segments[0].hp,point,0);const field=new BloodField(256);for(const effect of a.effects)field.emit(effect,0);field.advance(3);assert.equal(a.random(),b.random());
 a.damageEnemy(e,100000);const death=a.effects.find(e=>e.kind==='kill')!;assert.ok(death.bloodSources!.length<=8);const sources=structuredClone(death.bloodSources);e.segments[0].pos.x+=10;assert.deepEqual(death.bloodSources,sources);
});
test('replay seeks expose cosmetic events and reset before backward rebuild',()=>{
 const world=new World(7),recorder=new RunRecorder(7);for(let i=0;i<20;i++){recorder.record(idleInput());world.step(idleInput());}
 const player=new ReplayPlayer(recorder.finish(world));let steps=0,resets=0;
 player.seek(15,()=>steps++,()=>resets++);assert.equal(steps,15);assert.equal(resets,0);
 steps=0;player.seek(10,()=>steps++,()=>resets++);assert.equal(steps,10);assert.equal(resets,1);
});
test('crystal hits and destruction emit no blood; flesh kills still bleed',()=>{
 const world=new World(17,{schedule:false}),field=new BloodField(256);
 const tower=world.spawn('squid',v(0,6,0));
 world.damageEnemy(tower,tower.weakpoints[0].hp,v(0,6,0),0,true);
 const pede=world.spawn('centipede',v(0,6,0));
 world.damageEnemy(pede,pede.segments[0].hp,pede.segments[0].pos,0);
 const spider=world.spawn('spider',v(0,6,0));
 world.damageEnemy(spider,spider.hp,v(0,6,0));
 for(const effect of world.effects)field.emit(effect,world.time);
 assert.equal(field.drops.length,0,'crystal damage must not create droplets');
 field.advance(3);assert.equal(field.landings,0);assert.ok(field.pixels.every(n=>n===0));
 world.effects=[];
 const skull=world.spawn('skull',v(0,6,0));world.damageEnemy(skull,skull.hp);
 for(const effect of world.effects)field.emit(effect,world.time);
 assert.ok(field.drops.some(drop=>drop.enemyBurst),'flesh death retains its gore burst');
});
