/** Ground-level, frozen-pose projectile probes supplement audit-combat-balance.ts. */
import {World,STEP,TUNING,idleInput,v,segmentSphere} from '../src/simulation';
import {crystalToEnemy,towerCrystalRadius} from '../src/enemy-presentation';
import {sweepArmor} from '../src/projectile-collision';
const shots=[];
for(const legacy of [true,false])for(const kind of ['squid','squid2','squid3'] as const){
 for(const homing of [false,true]){
  const w=new World(71,{schedule:false,invulnerable:true,legacyTowerArchitecture:legacy}),e=w.spawnAt(kind,0);e.nextSpawn=Infinity;
  for(let i=0;i<1200;i++){w.step(idleInput());w.effects=[];}
  // Place the player opposite the first living crystal. This exercises homing's
  // fixed-index target choice and whether another crystal is actually accessible.
  const point=crystalToEnemy(e,w.player.pos,e.weakpoints[0].local),dx=point.x-e.pos.x,dz=point.z-e.pos.z,len=Math.hypot(dx,dz);
  w.player.pos=v(e.pos.x-dx/len*20,1.7,e.pos.z-dz/len*20);w.level=3;w.reserve=20;
  const access=e.weakpoints.map(p=>{
   const c=crystalToEnemy(e,w.player.pos,p.local),r=legacy?TUNING.towerCrystalRadius:towerCrystalRadius(kind);
   return !sweepArmor(e,w.player.pos,w.player.pos,c,segmentSphere(w.player.pos,c,c,r)!,w.time);
  });
  const to=w.weakPoint(e),x=to.x-w.player.pos.x,y=to.y-w.player.pos.y,z=to.z-w.player.pos.z;
  const input={...idleInput(),yaw:Math.atan2(-x,-z),pitch:Math.atan2(y,Math.hypot(x,z))};
  const before=e.hp;w.shoot(input,true,homing);
  const launched=w.projectiles.length;
  for(let i=0;i<8/STEP;i++){(w as any).updateProjectiles(STEP);}
  shots.push({legacy,kind,homing,accessibleCrystals:access,launched,damage:before-e.hp,armorImpacts:w.effects.filter(e=>e.kind==='impact').length});
 }
}
console.log(JSON.stringify({note:'Frozen tower pose after 10s, player 20 horizontal units opposite first crystal, hand III shotgun. Demonstrates a targeting weakness, not a new homing regression by itself.',shots},null,2));
