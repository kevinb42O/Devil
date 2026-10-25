import type {Enemy,Vec} from './simulation';
type Target={enemy:Enemy;order:number};
/** Exact nearest living body query over horizontal cells. Build once per combat
 * tick; live health lets earlier projectiles remove targets without rebuilding. */
export class HomingBodyIndex{
 private columns=new Map<number,Map<number,Target[]>>();
 private minX=Infinity;private maxX=-Infinity;private minZ=Infinity;private maxZ=-Infinity;
 private readonly cellSize=6;
 constructor(private targets:Target[]){
  for(const target of targets){
   const x=Math.floor(target.enemy.pos.x/this.cellSize),z=Math.floor(target.enemy.pos.z/this.cellSize);
   let column=this.columns.get(x);if(!column){column=new Map();this.columns.set(x,column);}
   const cell=column.get(z);if(cell)cell.push(target);else column.set(z,[target]);
   this.minX=Math.min(this.minX,x);this.maxX=Math.max(this.maxX,x);this.minZ=Math.min(this.minZ,z);this.maxZ=Math.max(this.maxZ,z);
  }
 }
 nearest(from:Vec):{point:Vec;distanceSquared:number;order:number}|undefined{
  if(!this.columns.size)return undefined;
  const centerX=Math.max(this.minX,Math.min(this.maxX,Math.floor(from.x/this.cellSize))),centerZ=Math.max(this.minZ,Math.min(this.maxZ,Math.floor(from.z/this.cellSize)));
  let point:Vec|undefined,distanceSquared=Infinity,order=Infinity;
  const scan=(x:number,z:number)=>{
   for(const target of this.columns.get(x)?.get(z)??[]){
    if(target.enemy.hp<=0)continue;const pos=target.enemy.pos,distance=(from.x-pos.x)**2+(from.y-pos.y)**2+(from.z-pos.z)**2;
    if(distance<distanceSquared||distance===distanceSquared&&target.order<order){point=pos;distanceSquared=distance;order=target.order;}
   }
  };
  const limit=Math.max(centerX-this.minX,this.maxX-centerX,centerZ-this.minZ,this.maxZ-centerZ);
  if(limit>64){
   for(const target of this.targets){if(target.enemy.hp<=0)continue;const pos=target.enemy.pos,distance=(from.x-pos.x)**2+(from.y-pos.y)**2+(from.z-pos.z)**2;if(distance<distanceSquared||distance===distanceSquared&&target.order<order){point=pos;distanceSquared=distance;order=target.order;}}
   return point?{point,distanceSquared,order}:undefined;
  }
  for(let ring=0;ring<=limit;ring++){
   const left=centerX-ring,right=centerX+ring,bottom=centerZ-ring,top=centerZ+ring;
   if(!ring)scan(centerX,centerZ);
   else{
    for(let x=Math.max(this.minX,left);x<=Math.min(this.maxX,right);x++){if(bottom>=this.minZ)scan(x,bottom);if(top<=this.maxZ)scan(x,top);}
    for(let z=Math.max(this.minZ,bottom+1);z<=Math.min(this.maxZ,top-1);z++){if(left>=this.minX)scan(left,z);if(right<=this.maxX)scan(right,z);}
   }
   // Lower bound to any unvisited column. Horizontal distance alone is
   // conservative for the true 3D distance, including elevated enemies.
   let remaining=Infinity;
   if(left>this.minX)remaining=Math.min(remaining,Math.max(0,from.x-left*this.cellSize));
   if(right<this.maxX)remaining=Math.min(remaining,Math.max(0,(right+1)*this.cellSize-from.x));
   if(bottom>this.minZ)remaining=Math.min(remaining,Math.max(0,from.z-bottom*this.cellSize));
   if(top<this.maxZ)remaining=Math.min(remaining,Math.max(0,(top+1)*this.cellSize-from.z));
   if(remaining*remaining>distanceSquared)break;
  }
  return point?{point,distanceSquared,order}:undefined;
 }
}
