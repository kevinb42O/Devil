import {CREATURE_SCALE,CREATURE_SCALE_RATIO,SPIDER_CRYSTAL_RADIUS} from '../src/enemy-presentation.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {World,STEP,v,idleInput,segmentSphere,type Vec} from '../src/simulation.ts';
import {enemyEmergenceScale,enemyYaw,localToEnemy,SPIDER_GEM,towerPartOffset} from '../src/enemy-presentation.ts';
import {sweepArmor} from '../src/projectile-collision.ts';
import baked from '../src/projectile-colliders.json';
const tick=(w:World)=>(w as any).updateProjectiles(STEP);
const shot=(w:World,a:Vec,b:Vec,homing=false)=>{const p={id:900+w.projectiles.length,pos:{...a},vel:v((b.x-a.x)/STEP,(b.y-a.y)/STEP,(b.z-a.z)/STEP),age:0,homing,level:3};w.projectiles.push(p);return p;};

test('destroyed tower crystals stop blocking immediately, including later shots in one tick',()=>{
 for(const sameTick of [false,true]){
  const w=new World(1,{schedule:false,legacyTowerArchitecture:true}),e=w.spawn('squid2',v(0,8,0));e.age=2;
  const c=w.weakPoint(e),dx=c.x-e.pos.x,dz=c.z-e.pos.z,l=Math.hypot(dx,dz);
  if(sameTick)shot(w,c,c,true);else w.damageEnemy(e,10,c,0,true);
  const a=v(c.x+dx/l*2,c.y+.55,c.z+dz/l*2),b=v(c.x-dx/l*2,c.y+.55,c.z-dz/l*2),armor=sweepArmor(e,w.player.pos,a,b)!;
  assert.ok(armor);const p=shot(w,a,b);tick(w);
  assert.equal(e.hp,10);assert.equal(w.gems.length,1);
  assert.ok(Math.abs(p.pos.x-(a.x+(b.x-a.x)*armor.t))<1e-6,'shot reaches the real armor past the vanished crystal');
 }
});

test('attached crystal centers follow the rendered emergence root and accept shots there',()=>{
 for(const kind of ['squid','squid2','squid3','spider','spider2'] as const){
  const w=new World(1,{schedule:false}),e=w.spawn(kind,v(0,8,0));e.age=.6;e.headExposure=1;e.pos=v(0,8,0);
  const local=e.weakpoints[0]?.local??v(SPIDER_GEM.x*e.size,SPIDER_GEM.y*e.size,SPIDER_GEM.z*e.size);
  const root=new THREE.Object3D();root.position.set(e.pos.x,e.pos.y,e.pos.z);root.rotation.y=enemyYaw(e,w.player.pos);root.scale.setScalar(enemyEmergenceScale(e));root.updateMatrixWorld();
  const visual=new THREE.Vector3(local.x,local.y,local.z).applyMatrix4(root.matrixWorld),center=w.weakPoint(e);
  assert.ok(visual.distanceTo(new THREE.Vector3(center.x,center.y,center.z))<1e-9,kind);
  const hp=e.hp;shot(w,center,center);tick(w);assert.equal(e.hp,hp-1,kind);
 }
});

test('emerging crystal radii shrink with the rendered root instead of hitting empty space',()=>{
 for(const kind of ['squid','squid2','squid3','spider2'] as const){
  const w=new World(1,{schedule:false}),e=w.spawn(kind,v(0,8,0));e.age=.6;e.headExposure=1;e.pos=v(0,8,0);
  const center=w.weakPoint(e),fullRadius=kind==='spider2'?SPIDER_CRYSTAL_RADIUS*e.size:.63*CREATURE_SCALE_RATIO;
  const outside=v(center.x,center.y+fullRadius*.8,center.z),hp=e.hp;
  shot(w,outside,outside);tick(w);
  assert.equal(e.hp,hp,kind);assert.equal(w.projectiles.length,1,kind);
 }
});

test('ghostpede absorbs a grazing homing sweep at contact even with both endpoints outside',()=>{
 const w=new World(1,{schedule:false}),e=w.spawn('ghostpede',v());e.age=4;e.status='hunting';e.pos=v(20,5,0);e.segments.forEach(s=>s.pos=v(20,5,10));e.segments[0].pos=v(0,5,0);
 const a=v(-.175,5,.995),p=shot(w,a,v(a.x+42*STEP,a.y,a.z),true);tick(w);
 const end=v(a.x+p.vel.x*STEP,a.y+p.vel.y*STEP,a.z+p.vel.z*STEP),t=segmentSphere(a,end,e.segments[0].pos,1)!;
 assert.ok(Math.hypot(a.x,a.z)>1&&Math.hypot(end.x,end.z)>1);assert.ok(t>0&&t<1);
 assert.equal(w.stats.homingEaten,1);assert.equal(w.projectiles.length,0);assert.equal(e.hp,500);
 assert.ok(Math.abs(p.pos.x-(a.x+(end.x-a.x)*t))<1e-9);assert.deepEqual(w.effects.find(x=>x.kind==='eat')?.pos,p.pos);
});

test('a nearer enemy wins over ghostpede absorption farther along the same homing path',()=>{
 const w=new World(1,{schedule:false}),g=w.spawn('ghostpede',v());g.age=4;g.status='hunting';g.pos=v(0,5,-4);g.segments.forEach(s=>s.pos=v(20,5,0));
 const skull=w.spawn('skull',v(0,5,-1));skull.age=2;
 shot(w,v(0,5,1),v(0,5,-6),true);tick(w);
 assert.equal(skull.hp,0);assert.equal(w.stats.homingEaten,0);assert.equal(w.stats.hits,1);
});

test('moving enemy sweeps into a bullet even when its final hitbox misses, across cells',()=>{
 const w=new World(1,{schedule:false,invulnerable:true}),e=w.spawn('skull',v(-5,5,0));e.age=2;
 // Isolate the movement trajectory while exercising the real tick/history and broad phase.
 (w as any).updateSwarm=(enemy:typeof e)=>{enemy.pos.x=5;};
 const p=shot(w,v(0,5,0),v(0,5,0));w.step(idleInput());
 assert.equal(e.hp,0);assert.equal(w.stats.hits,1);assert.equal(w.projectiles.length,0);assert.deepEqual(w.effects.find(x=>x.kind==='hit')?.pos,p.pos);
});

test('movement history is consumed once and does not affect later stationary queries',()=>{
 const w=new World(1,{schedule:false,invulnerable:true}),e=w.spawn('skull2',v(-5,5,0));e.age=2;
 (w as any).updateSwarm=(enemy:typeof e)=>{enemy.pos.x=5;};
 shot(w,v(0,5,0),v(0,5,0));w.step(idleInput());assert.equal(e.hp,4);
 shot(w,v(0,5,0),v(0,5,0));tick(w);assert.equal(e.hp,4);assert.equal(w.projectiles.length,1);
});

test('pede crystals use their own swept movement rather than only the enemy head',()=>{
 const w=new World(1,{schedule:false,invulnerable:true}),e=w.spawn('centipede',v());e.age=4;e.status='hunting';e.pos=v(20,5,0);
 e.segments.forEach((s,i)=>s.pos=v(-5,5,i*3));
 (w as any).updatePede=(enemy:typeof e)=>{for(const s of enemy.segments)s.pos.x=5;};
 shot(w,v(0,5,0),v(0,5,0));w.step(idleInput());
 assert.equal(e.segments[0].hp,2);assert.equal(e.hp,74);assert.equal(w.stats.hits,1);assert.equal(w.projectiles.length,0);
});

test('animated rigid armor contacts and normals agree with transformed render triangles',()=>{
 for(const kind of ['squid2','squid3'] as const)for(const originalCadence of [false,true]){
  const w=new World(1,{schedule:false,legacyTowerArchitecture:true}),e=w.spawn(kind,v(0,8,0));e.age=184/60;e.facingYaw=.7;
  const root=new THREE.Group();root.position.set(e.pos.x,e.pos.y,e.pos.z);root.rotation.y=enemyYaw(e,w.player.pos);root.scale.setScalar(enemyEmergenceScale(e));
  for(const p of baked.instances[kind]){
   if(p.wave)continue;
   const data=baked.meshes[p.name as keyof typeof baked.meshes],geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(data.vertices,3));geo.setIndex(data.indices);geo.scale(CREATURE_SCALE_RATIO,CREATURE_SCALE_RATIO,CREATURE_SCALE_RATIO);
   const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.rotation.set(p.flip?Math.PI:0,p.yaw,0,'YXZ');mesh.scale.set(p.sx,p.sy,p.sx);mesh.position.y=towerPartOffset(e,p.name,originalCadence)*CREATURE_SCALE;root.add(mesh);
  }
  root.updateMatrixWorld(true);let hits=0,grazingNormals=0;
  for(let x=-1.973;x<=2;x+=.5)for(let z=-1.941;z<=2;z+=.5){
   // Short sweeps around the crown avoid the deforming arms below it.
   const a=localToEnemy(e,w.player.pos,v(x,3,z)),b=localToEnemy(e,w.player.pos,v(x,-.3,z));
   const origin=new THREE.Vector3(a.x,a.y,a.z),delta=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),length=delta.length(),ray=new THREE.Raycaster(origin,delta.clone().normalize(),0,length);
   const rendered=ray.intersectObject(root,true)[0],hit=sweepArmor(e,w.player.pos,a,b,1,0,originalCadence);
   if(!rendered){assert.equal(hit,null);continue;}assert.ok(hit);hits++;
   assert.ok(Math.abs(hit.t-rendered.distance/length)<1e-6,`${kind}: animated contact`);
   const normal=rendered.face!.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(rendered.object.matrixWorld));if(normal.dot(delta)>0)normal.negate();
   assert.ok(normal.distanceTo(new THREE.Vector3(hit.nx,hit.ny,hit.nz))<1e-5,`${kind}: surface normal ${x},${z} ${JSON.stringify(normal.toArray())} ${JSON.stringify(hit)}`);
   assert.ok(Math.abs(Math.hypot(hit.nx,hit.ny,hit.nz)-1)<1e-6);
   if(Math.abs(normal.dot(delta.clone().normalize()))<.9)grazingNormals++;
  }
  assert.ok(hits>5);assert.ok(grazingNormals>0,'normal follows sloping faces rather than the incoming ray');
  root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
 }
});
