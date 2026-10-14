import {type Vec,type World} from './simulation';
import {isSpider,isEgg,isPede,isSquid,type EnemyKind} from './enemy-kinds';

function threatFamily(kind:EnemyKind){
 if(isSpider(kind)||kind==='spiderling')return 'spider';
 if(isEgg(kind))return 'egg';
 if(isPede(kind))return 'pede';
 if(isSquid(kind))return 'tower';
 if(kind==='leviathan'||kind==='orb')return 'boss';
 return 'swarm';
}

/** Horizontal bearings: front at the top, right at the right, rear at the bottom. */
export function nearbyThreats(world:World,yaw:number){
 const player=world.player.pos;
 const squaredDistance=(pos:Vec)=>(pos.x-player.x)**2+(pos.y-player.y)**2+(pos.z-player.z)**2;
 const closest:{id:number;kind:EnemyKind;position:Vec;range:number}[]=[];
 for(const enemy of world.enemies){
  if(enemy.hp<=0||!world.active(enemy))continue;
  // A pede's body remains lethal even after its weak points are destroyed.
  let position:Vec=enemy.pos,range=squaredDistance(position);
  for(const segment of enemy.segments){
   const candidate=squaredDistance(segment.pos);
   if(candidate<range){position=segment.pos;range=candidate;}
  }
  if(range>=81)continue;
  let index=0;
  while(index<closest.length&&(closest[index].range<range||(closest[index].range===range&&closest[index].id<enemy.id)))index++;
  if(index>=5)continue;
  closest.splice(index,0,{id:enemy.id,kind:enemy.kind,position,range});
  if(closest.length>5)closest.pop();
 }
 return closest.map(({id,kind,position,range})=>({id,family:threatFamily(kind),distance:Math.sqrt(range),angle:Math.atan2(position.x-player.x,-(position.z-player.z))+yaw}));
}
