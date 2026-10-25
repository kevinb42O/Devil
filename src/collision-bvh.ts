/** Shared rigid-mesh acceleration. Leaves retain the original vertex positions. */
export function buildCollisionBvh(vertices:Float32Array,indices:Uint32Array){
 const nodes:number[][]=[],ordered:number[]=[];
 const triangles=Array.from({length:indices.length/3},(_,i)=>i);
 const branch=(list:number[]):number=>{
  const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  for(const triangle of list)for(let corner=0;corner<3;corner++){
   const vertex=indices[triangle*3+corner]*3;
   for(let axis=0;axis<3;axis++){const value=vertices[vertex+axis];bounds[axis]=Math.min(bounds[axis],value);bounds[axis+3]=Math.max(bounds[axis+3],value);}
  }
  const index=nodes.length;nodes.push([]);
  if(list.length<=8){const start=ordered.length;ordered.push(...list);nodes[index]=[...bounds,-1,start,list.length];}
  else{
   let axis=0;for(let i=1;i<3;i++)if(bounds[i+3]-bounds[i]>bounds[axis+3]-bounds[axis])axis=i;
   const center=(triangle:number)=>vertices[indices[triangle*3]*3+axis]+vertices[indices[triangle*3+1]*3+axis]+vertices[indices[triangle*3+2]*3+axis];
   list.sort((a,b)=>center(a)-center(b)||a-b);
   const middle=list.length>>1,left=branch(list.slice(0,middle)),right=branch(list.slice(middle));nodes[index]=[...bounds,left,right,0];
  }
  return index;
 };
 if(triangles.length)branch(triangles);
 const sorted=new Uint32Array(indices.length);
 for(let i=0;i<ordered.length;i++)for(let corner=0;corner<3;corner++)sorted[i*3+corner]=indices[ordered[i]*3+corner];
 return {nodes,indices:sorted};
}
