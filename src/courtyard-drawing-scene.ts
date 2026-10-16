import * as THREE from 'three';
import {DRAWING_BOARD,MAX_INK,pencilDock,type DrawingState} from './courtyard-drawing';
import type {World} from './simulation';
const colors=[0xe87a42,0x44c6bc];
/** A code-built drawing surface and two physical hexagonal pencils. */
export class CourtyardDrawingScene{
 readonly root=new THREE.Group();
 private pencils:THREE.Group[]=[];
 private ink:THREE.InstancedMesh;
 private sequence=-1;private inkCount=-1;
 constructor(){
  this.root.name='tic-tac-toe-court';
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#e1d4b6';ctx.fillRect(0,0,1024,1024);
  for(let row=0;row<8;row++)for(let col=0;col<8;col++){ctx.fillStyle=(row+col)%2?'#ded0b2':'#eadfc7';ctx.fillRect(col*128,row*128,128,128);}
  ctx.strokeStyle='#403d36';ctx.lineWidth=4;
  for(let i=0;i<=8;i++){ctx.beginPath();ctx.moveTo(i*128,0);ctx.lineTo(i*128,1024);ctx.moveTo(0,i*128);ctx.lineTo(1024,i*128);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const board=new THREE.Mesh(new THREE.PlaneGeometry(24,24),new THREE.MeshStandardMaterial({map:texture,roughness:.95}));
  board.name='drawing-board-8x8';board.rotation.x=-Math.PI/2;board.position.set(DRAWING_BOARD.x,.025,DRAWING_BOARD.z);this.root.add(board);
  this.ink=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.025,1),new THREE.MeshBasicMaterial({color:0xffffff}),MAX_INK);
  this.ink.count=0;this.ink.frustumCulled=false;this.ink.name='shared-pencil-marks';this.root.add(this.ink);
  const wood=new THREE.MeshStandardMaterial({color:0xc99c63,roughness:.8}),graphite=new THREE.MeshStandardMaterial({color:0x252326,roughness:.9}),rubber=new THREE.MeshStandardMaterial({color:0xe7aba0,roughness:.8}),metal=new THREE.MeshStandardMaterial({color:0xaaa9a0,metalness:.6,roughness:.3});
  for(let i=0;i<2;i++){
   const pencil=new THREE.Group();pencil.name='giant-pencil-'+i;
   const part=(geometry:THREE.BufferGeometry,material:THREE.Material,y:number)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.y=y;pencil.add(mesh);return mesh;};
   part(new THREE.ConeGeometry(.065,.2,8),graphite,.1).rotation.z=Math.PI;
   part(new THREE.ConeGeometry(.18,.5,6),wood,.4).rotation.z=Math.PI;
   part(new THREE.CylinderGeometry(.18,.18,2.5,6),new THREE.MeshStandardMaterial({color:colors[i],roughness:.6}),1.9);
   part(new THREE.CylinderGeometry(.19,.19,.22,12),metal,3.26);
   part(new THREE.CylinderGeometry(.18,.18,.3,12),rubber,3.52);
   const dock=pencilDock(i);pencil.position.set(dock.x,dock.y,dock.z);
   this.pencils.push(pencil);this.root.add(pencil);
  }
  const signCanvas=document.createElement('canvas');signCanvas.width=1024;signCanvas.height=256;
  const text=signCanvas.getContext('2d')!;text.fillStyle='#182827';text.fillRect(0,0,1024,256);text.textAlign='center';text.fillStyle='#f0dfb3';text.font='bold 68px sans-serif';text.fillText('THE SCRIBBLE COURT',512,86);text.font='30px sans-serif';text.fillText('8 × 8 • DRAW Xs & Os • MAKE YOUR OWN RULES',512,146);text.fillText('PICK UP A PENCIL • LOOK DOWN • HOLD TO DRAW',512,205);
  const signMap=new THREE.CanvasTexture(signCanvas);signMap.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:signMap}));sign.position.set(81,4.3,19);sign.scale.set(13,3.25,1);this.root.add(sign);
  const lamp=new THREE.DirectionalLight(0xffefd0,2);lamp.position.set(81,18,8);lamp.target.position.set(81,0,2);this.root.add(lamp,lamp.target);
 }
 update(d:DrawingState|undefined,world:World){
  if(!d)return;
  const transform=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
  for(const [i,p] of d.pencils.entries()){
   const model=this.pencils[i];model.position.set(p.pos.x,p.pos.y,p.pos.z);model.quaternion.identity();
   if(p.owner){const player=world.crew.find(player=>player.id===p.owner);
    if(p.tip){model.position.set(DRAWING_BOARD.x-12+p.tip.x/32,.07,DRAWING_BOARD.z-12+p.tip.z/32);model.quaternion.setFromUnitVectors(up,new THREE.Vector3(p.pos.x,p.pos.y,p.pos.z).sub(model.position).normalize());}
    else {model.position.y-=.7;model.rotation.set(.35,player?.input.yaw??0,-.15);}
   }
  }
  if(this.sequence===d.sequence&&this.inkCount===d.ink.length)return;
  this.sequence=d.sequence;this.inkCount=d.ink.length;
  for(const [i,[pencil,x1,z1,x2,z2]] of d.ink.entries()){
   const dx=(x2-x1)/32,dz=(z2-z1)/32;
   transform.position.set(DRAWING_BOARD.x-12+(x1+x2)/64,.055,DRAWING_BOARD.z-12+(z1+z2)/64);
   transform.rotation.set(0,-Math.atan2(dz,dx),0);transform.scale.set(Math.max(.12,Math.hypot(dx,dz)),1,.12);transform.updateMatrix();
   this.ink.setMatrixAt(i,transform.matrix);this.ink.setColorAt(i,new THREE.Color(colors[pencil]).multiplyScalar(.45));
  }
  this.ink.count=d.ink.length;this.ink.instanceMatrix.needsUpdate=true;if(this.ink.instanceColor)this.ink.instanceColor.needsUpdate=true;
 }
}
