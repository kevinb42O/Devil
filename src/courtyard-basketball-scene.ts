import {finishBasketballHoop} from './basketball-hoop';
import {createCourtyardSign} from './courtyard-sign';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {BASKETBALL,basketballCharge,basketballPose,basketballHeldPoint,basketballDunkPoint,predictBasketball,type BasketballState} from './courtyard-basketball';
import type {World} from './simulation';

export class CourtyardBasketballScene{
 readonly root=new THREE.Group();private balls:THREE.Group[]=[];private board:ReturnType<typeof createCourtyardSign>;private scoreKey='';
 private preview=new Line2(new LineGeometry(),new LineMaterial({color:0xf5cf8c,transparent:true,opacity:.6,depthWrite:false}));
 private endpoint=new THREE.Mesh(new THREE.RingGeometry(.12,.17,48),new THREE.MeshBasicMaterial({color:0xf5cf8c,transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide}));
 private impactDot=new THREE.Mesh(new THREE.SphereGeometry(.035,12,8),new THREE.MeshBasicMaterial({color:0xf5cf8c,toneMapped:false}));

 private net?:THREE.Object3D;private netTick=-1000;
 constructor(){
  this.root.name='basketball-court';
  const c=document.createElement('canvas');c.width=768;c.height=1536;const ctx=c.getContext('2d')!,b=BASKETBALL;
  ctx.fillStyle='#244f59';ctx.fillRect(0,0,c.width,c.height);
  const px=(x:number)=>(x-b.minX)/(b.maxX-b.minX)*c.width,py=(z:number)=>(z-b.minZ)/(b.maxZ-b.minZ)*c.height;
  // Painted asphalt, a warm key, and one shared hoop at the far end.
  ctx.fillStyle='#a76540';ctx.fillRect(px(b.x-1.25),py(22.8),px(b.x+1.25)-px(b.x-1.25),py(17)-py(22.8));
  ctx.strokeStyle='#eee0bd';ctx.lineWidth=5;
  const path=(points:number[][])=>{ctx.beginPath();points.forEach(([x,z],i)=>i?ctx.lineTo(px(x),py(z)):ctx.moveTo(px(x),py(z)));ctx.stroke();};
  path([[6.65,6.15],[13.05,6.15],[13.05,23.65],[6.65,23.65],[6.65,6.15]]);
  path([[b.x-1.25,22.8],[b.x-1.25,17],[b.x+1.25,17],[b.x+1.25,22.8]]);
  const arc=(radius:number,z:number,from:number,to:number)=>path(Array.from({length:121},(_,i)=>{const a=from+(to-from)*i/120;return [b.x+Math.cos(a)*radius,z+Math.sin(a)*radius];}).filter(([x])=>x>6.65&&x<13.05));
  arc(1.25,17,0,Math.PI*2);arc(b.threeDistance,b.hoopZ,Math.PI,Math.PI*2);arc(.5,b.hoopZ,0,Math.PI*2);
  ctx.textAlign='center';ctx.fillStyle='#fff0d2';ctx.font='bold 46px sans-serif';ctx.save();ctx.translate(384,py(8.4));ctx.rotate(Math.PI);ctx.fillText('ONE HOOP · EVERYONE PLAYS',0,0);ctx.restore();ctx.font='30px sans-serif';ctx.save();ctx.translate(384,py(7.5));ctx.rotate(Math.PI);ctx.fillText('PICK UP  /  CHARGE  /  SHOOT  /  RETRIEVE',0,0);ctx.restore();
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(b.maxX-b.minX,b.maxZ-b.minZ),new THREE.MeshStandardMaterial({map:texture,roughness:.94}));floor.rotation.x=-Math.PI/2;floor.position.set(b.x,.014,(b.minZ+b.maxZ)/2);this.root.add(floor);
  for(let i=0;i<6;i++){const ball=new THREE.Group();ball.name='basketball-'+i;this.root.add(ball);this.balls.push(ball);}
  this.board=createCourtyardSign('basketball-scoreboard',5.8,2.9);this.board.position.set(b.maxX-.045,3.35,(b.minZ+b.maxZ)/2);this.board.rotation.y=-Math.PI/2;
  this.preview.name='basketball-shot-guide';this.preview.material.linewidth=1.75;this.preview.visible=false;this.preview.frustumCulled=false;this.endpoint.name='basketball-shot-target';this.endpoint.visible=this.impactDot.visible=false;
  this.root.add(this.board,this.preview,this.endpoint,this.impactDot);

 }
 async load(){
  const loader=new GLTFLoader(),[hoopAsset,ballAsset]=await Promise.all([loader.loadAsync('/models/basketball/hoop.glb'),loader.loadAsync('/models/basketball/ball.glb')]);
  const ballModel=ballAsset.scene,bounds=new THREE.Box3().setFromObject(ballModel),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  ballModel.position.sub(center);const fitted=new THREE.Group();fitted.add(ballModel);fitted.scale.setScalar(BASKETBALL.ballRadius*2/Math.max(size.x,size.y,size.z));for(const ball of this.balls)ball.add(fitted.clone(true));
  const model=hoopAsset.scene,{net}=finishBasketballHoop(model);

  model.rotation.y=Math.PI;model.position.set(BASKETBALL.x,0,BASKETBALL.boardZ);this.root.add(model);this.net=net;
 }
 update(b:BasketballState|undefined,world:World,members:{id:string;name?:string}[]){
  if(!b)return;
  for(let i=0;i<this.balls.length;i++){const state=b.balls[i],model=this.balls[i];const owner=state.owner&&world.crew.find(p=>p.id===state.owner);if(owner){const pose=basketballPose(b,owner.id,world.tick,owner),dunk=b.hands[owner.id]?.dunk,point=dunk&&world.tick-dunk.started<36?basketballDunkPoint(dunk,world.tick):basketballHeldPoint(owner,pose?.gather??0);model.position.set(point.x,point.y,point.z);}else model.position.set(state.pos.x,state.pos.y,state.pos.z);model.rotation.set(state.rotation.x,state.rotation.y,state.rotation.z);}
  const rows=members.map(m=>({name:m.name??'Wanderer',score:b.scores[m.id]??{points:0,made:0,attempts:0}})).sort((a,c)=>c.score.points-a.score.points),key=JSON.stringify(rows);
  if(key!==this.scoreKey){this.scoreKey=key;this.drawScores(rows);}
  const goal=world.courtyard?.events.slice().reverse().find(e=>e.kind==='goal'&&e.players.length&&e.pos.x<14);if(goal)this.netTick=goal.tick;
  if(this.net){const age=(world.tick-this.netTick)/120;this.net.rotation.x=age>=0&&age<1?Math.sin(age*24)*Math.exp(-age*4)*.09:0;}
  const local=world.crew.find(p=>p.player===world.player),owned=local&&b.balls.find(ball=>ball.owner===local.id),charge=local?basketballCharge(b,local.id,world.tick):0;
  this.preview.visible=!!owned&&!!local&&b.hands[local.id]?.charge>=0&&!(b.hands[local.id]?.dunk&&world.tick-b.hands[local.id].dunk!.started<36);
  this.endpoint.visible=this.impactDot.visible=false;
  if(this.preview.visible&&local){
   const prediction=predictBasketball(local,charge),points=prediction.points.flatMap(p=>[p.x,p.y,p.z]);
   this.preview.geometry.setPositions(points);this.preview.material.resolution.set(window.innerWidth,window.innerHeight);
   const color=prediction.impact==='basket'?0x8cdbb2:prediction.impact==='rim'||prediction.impact==='backboard'?0xebb578:0xcbd6db;
   this.preview.material.color.setHex(color);this.endpoint.material.color.setHex(color);this.impactDot.material.color.setHex(color);
   const end=prediction.end;this.endpoint.visible=prediction.impact==='floor'||prediction.impact==='basket';this.impactDot.visible=!!prediction.impact&&!this.endpoint.visible;
   this.endpoint.rotation.x=-Math.PI/2;this.endpoint.position.set(end.x,prediction.impact==='floor'?.025:end.y+.015,end.z);this.impactDot.position.set(end.x,end.y,end.z);
   this.preview.userData.prediction={impact:prediction.impact,end:{...end},start:prediction.points[0],samples:prediction.points.length};
  }

 }
 private drawScores(rows:{name:string;score:{points:number;made:number;attempts:number}}[]){
  const c=document.createElement('canvas');c.width=1024;c.height=512;const ctx=c.getContext('2d')!;ctx.fillStyle='#101d24f5';ctx.fillRect(0,0,1024,512);ctx.strokeStyle='#c98b54';ctx.lineWidth=6;ctx.strokeRect(3,3,1018,506);
  ctx.fillStyle='#ffdc9e';ctx.font='bold 48px sans-serif';ctx.textAlign='center';ctx.fillText('COURTYARD HOOPS',512,62);ctx.fillStyle='#a6bec7';ctx.font='22px sans-serif';ctx.fillText('ONE BASKET  ·  2 POINTS  ·  3 BEYOND THE ARC',512,102);
  rows.forEach((row,i)=>{const y=158+i*49;ctx.textAlign='left';ctx.fillStyle='#f4e6cd';ctx.font='28px sans-serif';ctx.fillText(row.name.slice(0,22),42,y,560);ctx.textAlign='right';ctx.fillStyle='#f4b76b';ctx.font='bold 34px sans-serif';ctx.fillText(String(row.score.points),764,y);ctx.font='22px sans-serif';ctx.fillStyle='#a6bec7';ctx.fillText(row.score.made+'/'+row.score.attempts,980,y);});
  ctx.textAlign='left';ctx.font='18px sans-serif';ctx.fillStyle='#a6bec7';ctx.fillText('PLAYER',42,122);ctx.textAlign='right';ctx.fillText('PTS',764,122);ctx.fillText('MADE / SHOTS',980,122);
  const material=this.board.material;material.map?.dispose();material.map=new THREE.CanvasTexture(c);material.map.colorSpace=THREE.SRGBColorSpace;material.needsUpdate=true;
 }
}
