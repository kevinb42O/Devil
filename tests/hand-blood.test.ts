import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HandBlood} from '../src/hand-blood.ts';
import {World,v,type Effect} from '../src/simulation.ts';
const kill=(id:number,pos=v(0,1.6,-1)):Effect=>({kind:'kill',bloodId:id,enemyId:1,pos,amount:1});
test('nearby flesh combat progressively stains hands, saturates, dries and clears',()=>{
 const world=new World(42,{schedule:false}),blood=new HandBlood();world.player.pos=v(0,1.6,0);world.time=10;
 assert.equal(blood.sample(world).amount,0);blood.effect(kill(1),world);const first=blood.sample(world);assert.ok(first.amount>0&&first.amount<.2);assert.equal(first.freshness,1);
 for(let i=2;i<30;i++)blood.effect(kill(i),world);assert.equal(blood.sample(world).amount,1);
 world.time=94;assert.equal(blood.sample(world).amount,1);assert.ok(blood.sample(world).freshness<.06);
 blood.clear();assert.deepEqual(blood.sample(world),{amount:0,bodyAmount:0,freshness:0});
});
test('bloodless, distant and repeated events do not add blood; no gameplay writes',()=>{
 const world=new World(42,{schedule:false}),blood=new HandBlood();world.player.pos=v(0,1.6,0);world.time=10;
 blood.effect({...kill(1),bloodless:true},world);blood.effect(kill(2,v(30,1.6,0)),world);assert.equal(blood.sample(world).amount,0);
 const player=structuredClone(world.player),baseline=new World(42,{schedule:false});blood.effect(kill(3),world);const amount=blood.sample(world).amount;blood.effect(kill(3),world);assert.equal(blood.sample(world).amount,amount);assert.deepEqual(world.player,player);assert.equal(world.random(),baseline.random());
});
test('coverage belongs to each life, survives tier changes, and resets on rewind',()=>{
 const world=new World(42,{schedule:false}),blood=new HandBlood();world.addCrew('local');world.addCrew('far');world.selectCrew('local');world.time=10;world.player.pos=v(0,1.6,0);world.crew[1].player.pos=v(30,1.6,0);
 blood.effect(kill(1),world);assert.ok(blood.sample(world).amount>0);assert.equal(blood.sample(world,world.crew[1].player).amount,0);
 const amount=blood.sample(world).amount;world.level=7;assert.equal(blood.sample(world).amount,amount);world.crew[0].life++;assert.equal(blood.sample(world).amount,0);
 blood.effect(kill(2),world);world.time=5;assert.equal(blood.sample(world).amount,0);
});
test('hands saturate first, then continued exposure completely coats the body',()=>{
 const world=new World(42,{schedule:false}),blood=new HandBlood();world.player.pos=v(0,1.6,0);world.time=10;
 for(let i=0;i<8;i++)blood.effect(kill(i),world);
 const handsFirst=blood.sample(world);assert.equal(handsFirst.amount,1);assert.ok(handsFirst.bodyAmount>.1&&handsFirst.bodyAmount<.6);
 for(let i=8;i<30;i++)blood.effect(kill(i),world);
 assert.equal(blood.sample(world).bodyAmount,1);
 world.time=94;const dry=blood.sample(world);assert.equal(dry.bodyAmount,1);
 blood.effect({kind:'hit',bloodId:31,pos:v(0,1.6,-1)},world);
 const fresh=blood.sample(world);assert.ok(fresh.freshness>dry.freshness&&fresh.freshness<.15,'one new splash does not re-wet the whole dried body');
});
test('delayed guest presentation retains coatings from the current combat clock',()=>{
 const world=new World(42,{schedule:false}),blood=new HandBlood();world.player.pos=v(0,1.6,0);world.time=10;blood.effect(kill(1),world);
 world.time=9.82;assert.ok(blood.sample(world).amount>0);
 world.time=10.02;blood.effect(kill(2),world);world.time=9.84;assert.ok(blood.sample(world).amount>.2);
});
