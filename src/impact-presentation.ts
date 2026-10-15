/** A tiny local crystal compression, with exact rest pose outside the hit window. */
export function crystalImpactScale(age:number){
 if(age<0||age>=.16)return 1;
 const t=age/.16;return 1-.035*Math.sin(t*Math.PI*2)*(1-t)**2;
}
