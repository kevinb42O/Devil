import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bloodRainDose,bloodWashRetention} from '../src/blood-weather.ts';
import {rainAt} from '../src/rain-state.ts';
import {BloodField,BLOOD_SPAN} from '../src/blood.ts';
import {HandBlood} from '../src/hand-blood.ts';
import {World,v} from '../src/simulation.ts';
test('wash exposure exactly follows visible rainfall and stays washed after the storm',()=>{
 assert.equal(bloodRainDose(50),0);assert.equal(bloodRainDose(144),75);assert.equal(bloodRainDose(400),75);
 for(let t=51.5;t<144;t+=.5){const derivative=(bloodRainDose(t+.001)-bloodRainDose(t-.001))/.002;assert.ok(Math.abs(derivative-rainAt(t).rain)<1e-6);}
 assert.equal(bloodWashRetention(10,50),1);assert.ok(bloodWashRetention(10,80)<1);assert.equal(bloodWashRetention(10,150),bloodWashRetention(10,350));
 assert.equal(bloodWashRetention(200,350),1,'new blood after rain stays intact');
});
test('rain thins actual puddle contacts without scanning or uploading the texture',()=>{
 const field=new BloodField(128),index=(64*128+64)*4;field.pixels[index]=255;field.pixels[index+3]=200;field.pixels[index+1]=10*4;
 const x=.5/128*BLOOD_SPAN,z=x,raw=field.pixels.slice();field.advance(50);assert.equal(field.coverageAt(x,z),1);
 field.advance(90);assert.ok(field.coverageAt(x,z)<1);field.advance(144);assert.equal(field.coverageAt(x,z),0);
 field.advance(300);assert.equal(field.coverageAt(x,z),0);assert.deepEqual(field.pixels,raw);assert.equal(field.revision,0);
});
test('rain washes the body and new splashes add to the surviving stain',()=>{
 const world=new World(42,{schedule:false}),blood=new HandBlood();world.time=50;world.player.pos=v(0,1.6,0);
 for(let i=0;i<30;i++)blood.effect({kind:'kill',bloodId:i,pos:v(0,1.6,-1)},world);
 assert.equal(blood.sample(world).bodyAmount,1);world.time=90;const washed=blood.sample(world);assert.ok(washed.amount<1&&washed.bodyAmount<.2);assert.ok(washed.freshness>=.8,'rain wets the remaining film');
 world.time=160;assert.equal(blood.sample(world).amount,0);world.time=300;assert.equal(blood.sample(world).amount,0);
 blood.effect({kind:'hit',bloodId:31,pos:v(0,1.6,-1)},world);assert.ok(blood.sample(world).amount>0&&blood.sample(world).amount<.04,'old mass does not return with a fresh hit');
});
test('fresh deposition cannot bring washed-away floor blood back',()=>{
 const old=new BloodField(256),clean=new BloodField(256);
 for(let i=0;i<old.pixels.length;i+=4){old.pixels[i]=255;old.pixels[i+1]=40;old.pixels[i+3]=200;}
 const effect={kind:'kill' as const,bloodId:987,enemyId:1,pos:v(0,1,0),amount:2};
 for(const field of [old,clean]){field.emit(effect,200);field.advance(203);}
 let compared=0;
 for(let i=0;i<clean.pixels.length;i+=4)if(clean.pixels[i]){assert.equal(old.pixels[i],clean.pixels[i]);assert.equal(old.pixels[i+3],clean.pixels[i+3]);compared++;}
 assert.ok(compared>20);
});
