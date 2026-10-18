import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BloodField,BLOOD_SPAN,BLOOD_SPLASH_CAPACITY} from '../src/blood.ts';
import {BloodFootprints} from '../src/blood-footsteps.ts';
import {World,v} from '../src/simulation.ts';
function fixture(wet=true){
 const world=new World(42,{schedule:false,invulnerable:true}),field=new BloodField(1024),feet=new BloodFootprints(field);
 world.player.pos=v(0,1.6,0);world.player.vel=v();world.player.grounded=true;
 if(wet)for(let z=-8;z<=8;z++)for(let x=-8;x<=8;x++)field.pixels[((512+z)*1024+512+x)*4]=255;
 return {world,field,feet};
}
function land(speed=8,wet=true){
 const f=fixture(wet),{world,feet}=f;feet.update(world,8);
 world.player.grounded=false;world.player.vel.y=5;feet.update(world,8.016);
 for(let i=1;i<=20;i++){world.player.vel.y=-speed;feet.update(world,8.016+i/60);}
 f.field.drops.length=0;f.field.splashes.length=0;
 world.player.grounded=true;world.player.vel.y=0;feet.update(world,8.366);
 return f;
}
test('landing in a puddle emits two foot crowns and ballistic beads exactly once',()=>{
 const {field,feet,world}=land();assert.equal(field.splashes.length,2);assert.ok(field.drops.length>30);
 assert.ok(field.drops.every(d=>d.puddleSplash&&d.velocity.y>0&&d.origin.y<.2));
 assert.ok(field.drops.some(d=>d.velocity.x<0)&&field.drops.some(d=>d.velocity.x>0));
 const count=field.drops.length;feet.update(world,8.38);assert.equal(field.drops.length,count);
 const pixels=field.pixels.slice();field.advance(8.5);assert.ok(field.drops.some(d=>d.pos.y>d.origin.y+.1));
 field.advance(11);assert.equal(field.drops.length,0);assert.equal(field.splashes.length,0);
 assert.deepEqual(field.pixels,pixels,'redistribution cannot manufacture more puddle blood');
});
test('harder impacts throw more liquid higher, dry landings and corrected positions stay quiet',()=>{
 const soft=land(3).field,hard=land(12).field;
 assert.ok(hard.drops.length>soft.drops.length);
 assert.ok(Math.max(...hard.drops.map(d=>d.velocity.y))>Math.max(...soft.drops.map(d=>d.velocity.y)));
 assert.equal(land(8,false).field.drops.length,0);
 const {world,field,feet}=fixture();world.player.grounded=false;world.player.vel.y=-10;feet.update(world,8);
 world.player.grounded=true;feet.update(world,9);assert.equal(field.splashes.length,0,'frame gap is not a landing');
 world.player.grounded=false;feet.update(world,9.02);world.player.pos.x=10;world.player.grounded=true;feet.update(world,9.04);assert.equal(field.splashes.length,0);
});
test('jump takeoff lifts a smaller splash and all splash storage is bounded and resettable',()=>{
 const {world,field,feet}=fixture();feet.update(world,8);world.player.grounded=false;world.player.vel.y=8;feet.update(world,8.016);
 assert.equal(field.splashes.length,2);assert.ok(field.splashes.every(s=>s.impact<.3));
 for(let i=0;i<1000;i++)field.splash(0,0,8,12,v(),i+1);
 assert.equal(field.splashes.length,BLOOD_SPLASH_CAPACITY);assert.ok(field.drops.length<=field.capacity);
 assert.equal(field.coverageAt(BLOOD_SPAN,0),0);field.clear();assert.equal(field.splashes.length,0);assert.equal(field.drops.length,0);
});
