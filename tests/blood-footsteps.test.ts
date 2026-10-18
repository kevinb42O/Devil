import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BloodField,BLOOD_SPAN} from '../src/blood.ts';
import {BloodFootprints,FOOTPRINT_CAPACITY,FOOTPRINT_SECONDS} from '../src/blood-footsteps.ts';
import {bloodFootWetness,footstepSurface} from '../src/footstep-audio.ts';
import {World} from '../src/simulation.ts';

function fixture(){
 const world=new World(1,{schedule:false,invulnerable:true}),field=new BloodField(1024),trail=new BloodFootprints(field);
 world.time=8;world.player.pos.x=world.player.pos.z=0;world.player.grounded=true;world.player.vel.x=11;
 const px=Math.floor(field.size/2),py=px;field.pixels[(py*field.size+px)*4]=255;
 return {world,field,trail};
}
test('puddles coat feet, stamp alternating contacts and run out after leaving blood',()=>{
 const {world,trail}=fixture();trail.update(world,8);
 assert.equal(bloodFootWetness(world.player),1);
 assert.deepEqual(footstepSurface(8,false,bloodFootWetness(world.player)),{dry:0,wet:1});
 for(let frame=1;frame<=120;frame++){
  world.player.pos.x=frame*11/60;trail.update(world,8+frame/60);
 }
 assert.ok(trail.prints.length>=5);assert.equal(trail.prints[0].side,-trail.prints[1].side);
 assert.ok(trail.prints[0].strength>trail.prints.at(-1)!.strength);
 assert.ok(trail.prints.every(p=>p.y>-20));
 for(let frame=121;frame<=360;frame++){world.player.pos.x=frame*11/60;trail.update(world,8+frame/60);}
 assert.equal(bloodFootWetness(world.player),0);
 const count=trail.prints.length;world.player.pos.x+=.18;trail.update(world,14+1/60);assert.equal(trail.prints.length,count);
 trail.update(world,14+FOOTPRINT_SECONDS);assert.equal(trail.prints.length,0);
});
test('no airborne pickup, no teleport trail, and rewind/clear reset coating',()=>{
 const {world,trail}=fixture();world.player.grounded=false;trail.update(world,8);assert.equal(bloodFootWetness(world.player),0);
 world.player.grounded=true;trail.update(world,8.02);assert.equal(bloodFootWetness(world.player),1);
 world.player.pos.x=20;trail.update(world,8.04);assert.equal(bloodFootWetness(world.player),0);assert.equal(trail.prints.length,0);
 world.player.pos.x=0;trail.update(world,8.06);assert.equal(bloodFootWetness(world.player),1);
 trail.update(world,7);assert.equal(trail.prints.length,0);trail.clear();assert.equal(bloodFootWetness(world.player),0);
});
test('prints are bounded, do not paint the puddle field, and cannot recoat feet',()=>{
 const {world,trail,field}=fixture();field.pixels.fill(255);const before=field.pixels.slice();
 for(let frame=0;frame<6000;frame++){world.player.pos.x=Math.sin(frame/300)*20;world.player.vel.x=Math.cos(frame/300)*4;trail.update(world,8+frame/60);}
 assert.ok(trail.prints.length>0&&trail.prints.length<=FOOTPRINT_CAPACITY);assert.deepEqual(field.pixels,before);
 field.pixels.fill(0);trail.update(world,110);assert.equal(bloodFootWetness(world.player),0);
 assert.equal(trail.coverage(BLOOD_SPAN,0),0);
});
test('guest presentation wrappers retain the trail and share coating with audio actors',()=>{
 const {world,trail}=fixture();world.addCrew('walker');const member=world.crew[0];
 member.player.pos={...world.player.pos};member.player.vel.x=6;member.player.grounded=true;
 const audioPlayer=member.player;
 for(let frame=0;frame<100;frame++){
  const player={...audioPlayer,pos:{...audioPlayer.pos,x:frame*.1}};
  const view=Object.assign(Object.create(world),{crew:[{...member,player}],player});
  trail.update(view,8+frame/60);
 }
 assert.ok(trail.prints.length>=3,'new interpolated roster each frame preserves gait');
 assert.ok(bloodFootWetness(audioPlayer,'walker')>0,'uninterpolated audio actor shares coating');
 trail.clear();assert.equal(bloodFootWetness(audioPlayer,'walker'),0);
});
