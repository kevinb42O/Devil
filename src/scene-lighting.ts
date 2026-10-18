import * as THREE from 'three';
import {type DescentState} from './descent';
import {cathedralAt} from './cathedral-state';

// Incident light follows the visible chapters. Colours are converted to linear
// space once; interpolation and replay seeks never depend on the previous frame.
function profile(sky:number,ground:number,key:number,rim:number,ambient:number,direct:number,edge:number,x:number,y:number,z:number){
 return {sky:new THREE.Color(sky),ground:new THREE.Color(ground),key:new THREE.Color(key),rim:new THREE.Color(rim),ambient,direct,edge,position:new THREE.Vector3(x,y,z)};
}
const chapters=[
 profile(0x9aacc6,0x111724, 0xffffff,0x7a94be,.85,1.65,.45,-12,30,8),
 profile(0x7b91b0,0x141724,0xabc7ea,0x647db3,.65,.9,.3,-12,26,-8),
 profile(0x79668f,0x21152f,0xc6b1df,0x9271ba,.55,1.25,.35,-18,32,-14),
 profile(0x4b3440,0xee6024,0x977e94,0xff8b35,.95,.22,2.4,47,-8,-18),
 profile(0x666174,0x191322,0xcac1de,0x8980a8,.42,.65,.25,-12,32,8),
 profile(0x30263f,0x080610,0x61516f,0x45325d,.16,.12,.08,-12,30,8),
];
const cosmic=profile(0x7184b4,0x151c36,0xadc4ff,0x937eaf,.65,1.65,.65,-12,30,8);
const menuProfile=profile(0xcad5bc,0x18100c,0xe2e8cd,0x729786,1.15,2.1,1.8,-12,30,8);

/** Reuses the existing four scene lights; no lights per tower or per flame. */
export class SceneLighting {
 private current=profile(0,0,0,0,0,0,0,0,0,0);
 update(state:DescentState,menu:boolean,sky:THREE.HemisphereLight,key:THREE.DirectionalLight,rim:THREE.DirectionalLight,fire:THREE.PointLight){
  const a=menu?menuProfile:chapters[state.chapter],b=menu?a:chapters[Math.min(state.chapter+1,chapters.length-1)];
  const blend=menu?0:state.blend,c=menu?0:state.cosmic,p=this.current;
  for(const name of ['sky','ground','key','rim'] as const)p[name].copy(a[name]).lerp(b[name],blend).lerp(cosmic[name],c);
  for(const name of ['ambient','direct','edge'] as const)p[name]=THREE.MathUtils.lerp(THREE.MathUtils.lerp(a[name],b[name],blend),cosmic[name],c);
  p.position.copy(a.position).lerp(b.position,blend).lerp(cosmic.position,c);
  sky.color.copy(p.sky);sky.groundColor.copy(p.ground);sky.intensity=p.ambient;
  key.color.copy(p.key);key.intensity=p.direct;key.position.copy(p.position);
  // The furnace edge light comes from the actual fire ring below the platform.
  rim.color.copy(p.rim);rim.intensity=p.edge;rim.position.set(-p.position.x,p.position.y,-p.position.z);
  if(menu)rim.position.set(20,10,-20);
  // Cathedral shafts supply the spatial detail in the tower shader; fade the
  // broad key with their closure rather than leaving a permanent studio light.
  if(!menu&&state.chapter>=4)key.intensity*=.3+.7*cathedralAt(state.time).light;
  fire.intensity=menu?90:0;
 }
}
