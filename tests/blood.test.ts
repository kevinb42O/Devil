import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BloodField,BLOOD_CAPACITY,enemySprayScale} from '../src/blood.ts';
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

test('pressure direction is immutable cosmetic metadata and does not change floor simulation',()=>{
 const a=new BloodField(256),b=new BloodField(256),direction=v(.6,.1,-.8);
 const effect={...kill(),direction};a.emit(effect,0);b.emit(effect,0);
 assert.deepEqual(a.drops[0].sprayDirection,direction);
 direction.x=99;assert.equal(a.drops[0].sprayDirection!.x,.6);
 for(const drop of b.drops)delete drop.sprayDirection;
 a.advance(3);b.advance(3);assert.deepEqual(a.pixels,b.pixels);assert.equal(a.landings,b.landings);
});

test('floor impacts create substantial filled pools with additive liquid depth',()=>{
 const field=new BloodField(1024),ground=floorHeight(0,0,0,0);
 const drop={origin:v(0,ground+1,0),pos:v(0,ground+1,0),velocity:v(0,-120,0),born:0,age:0,size:.4,angle:0,stretch:1,seed:71};
 field.drops.push(structuredClone(drop));field.advance(1/60);
 let covered=0,core=0,depth=0;
 for(let i=0;i<field.pixels.length;i+=4){if(field.pixels[i])covered++;if(field.pixels[i]>190)core++;depth+=field.pixels[i+3];}
 assert.ok(covered*(51*TILE_SIZE/1024)**2>1,'one heavy impact leaves more than one square metre of pooled / splashed blood');
 assert.ok(core>25,'the pool has a filled core rather than just scattered flecks');assert.ok(depth>0);
 const before=field.pixels.slice();
 field.drops.push({...structuredClone(drop),born:5});field.advance(5+1/60);
 let addedDepth=false,refreshed=false;
 for(let i=0;i<field.pixels.length;i+=4){
  assert.ok(field.pixels[i]>=before[i]);assert.ok(field.pixels[i+3]>=before[i+3]);
  if(field.pixels[i+3]>before[i+3])addedDepth=true;
  if(field.pixels[i]>0&&field.pixels[i+1]+field.pixels[i+2]*256>=20)refreshed=true;
 }
 assert.ok(addedDepth,'overlapping blood deepens the pool');assert.ok(refreshed,'new impacts refresh the landing time');
});

test('large floor pools stop at raised tile boundaries',()=>{
 let edge:{x:number;z:number;low:number;high:number}|undefined;
 for(let z=1;z<49&&!edge;z++)for(let x=1;x<48;x++){
  const low=tileHeight(x,z,0),high=tileHeight(x+1,z,0);
  if(low>-20&&high>low+.08){edge={x:(x-25+.5)*TILE_SIZE,z:(z-25)*TILE_SIZE,low,high};break;}
 }
 assert.ok(edge);const field=new BloodField(1024),pos=v(edge.x-.15,edge.low+.5,edge.z);
 field.drops.push({origin:{...pos},pos:{...pos},velocity:v(0,-120,0),born:0,age:0,size:.6,angle:0,stretch:1,seed:71});field.advance(1/60);
 let stained=0;
 for(let py=0;py<field.size;py++)for(let px=0;px<field.size;px++){
  if(!field.pixels[(py*field.size+px)*4])continue;stained++;
  const x=Math.floor(((px+.5)/field.size-.5)*51+25.5),z=Math.floor(((py+.5)/field.size-.5)*51+25.5);
  assert.ok(tileHeight(x,z,0)<=edge.low+.08,'liquid must not jump onto a higher tile');
 }
 assert.ok(stained>20);
});


test('enemy radius strongly scales airborne spray without a size plateau',()=>{
 const radii=[.4,.65,.8,1.3,2,2.6,4,8],scales=radii.map(enemySprayScale);
 assert.equal(enemySprayScale(.65),1);
 for(let i=1;i<scales.length;i++)assert.ok(scales[i]>scales[i-1]);
 assert.ok(enemySprayScale(1.3)>2,'double radius produces more than double spray dimensions');
 assert.ok(enemySprayScale(4)>8,'large enemies have a substantially larger spray');
 const world=new World(42,{schedule:false}),field=new BloodField(256);
 const enemy=world.spawn('skull4',v(0,6,0));world.damageEnemy(enemy,enemy.hp);
 for(const effect of world.effects)field.emit(effect,0);
 const drops=field.drops.filter(drop=>drop.enemyBurst);assert.ok(drops.length>0);
 assert.equal(drops[0].sprayScale,enemySprayScale(enemy.radius),'actual kill radius reaches the renderer');
});

test('airborne size metadata does not affect floor blood',()=>{
 const a=new BloodField(256),b=new BloodField(256),effect={...kill(),amount:4};
 a.emit(effect,0);b.emit(effect,0);assert.ok(a.drops[0].sprayScale!>8);
 for(const drop of b.drops)delete drop.sprayScale;
 a.advance(3);b.advance(3);assert.deepEqual(a.pixels,b.pixels);assert.equal(a.landings,b.landings);
});
