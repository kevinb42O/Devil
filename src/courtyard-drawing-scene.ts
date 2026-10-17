import {createCourtyardSign} from './courtyard-sign';
import * as THREE from 'three';
import {DRAWING_BOARD,MAX_INK,INK_SCALE,INK_COLORS,CLEAR_BUTTON,pencilDock,drawingTarget,type DrawingState} from './courtyard-drawing';
import {crewPencilGrip} from './crew-avatar';
import type {World} from './simulation';
const colors=[0xe87a42,0x44c6bc];
/** A code-built drawing surface and two physical hexagonal pencils. */
export class CourtyardDrawingScene{
 readonly root=new THREE.Group();
 private pencils:THREE.Group[]=[];
 private ink:THREE.InstancedMesh;
 private board:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshStandardMaterial>;
 private gridMap:THREE.Texture;private plainMap:THREE.Texture;
 private cursor=new THREE.Mesh(new THREE.RingGeometry(.42,.5,48),new THREE.MeshBasicMaterial({color:0xffffff,depthWrite:false}));
 private aspects=new THREE.InstancedBufferAttribute(new Float32Array(MAX_INK),1);
 private renderedRows:number[][]=[];
 private sequence=-1;private inkCount=-1;
 private transform=new THREE.Object3D();
 private grip=new THREE.Vector3();private axis=new THREE.Vector3();private up=new THREE.Vector3(0,1,0);
 private inkColors=INK_COLORS.map(color=>new THREE.Color(color));
 constructor(){
  this.root.name='tic-tac-toe-court';
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#e1d4b6';ctx.fillRect(0,0,1024,1024);
  for(let row=0;row<8;row++)for(let col=0;col<8;col++){ctx.fillStyle=(row+col)%2?'#ded0b2':'#eadfc7';ctx.fillRect(col*128,row*128,128,128);}
  ctx.strokeStyle='#403d36';ctx.lineWidth=4;
  for(let i=0;i<=8;i++){ctx.beginPath();ctx.moveTo(i*128,0);ctx.lineTo(i*128,1024);ctx.moveTo(0,i*128);ctx.lineTo(1024,i*128);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  this.gridMap=texture;
  const paper=document.createElement('canvas');paper.width=paper.height=16;const paperCtx=paper.getContext('2d')!;paperCtx.fillStyle='#eadfc7';paperCtx.fillRect(0,0,16,16);this.plainMap=new THREE.CanvasTexture(paper);this.plainMap.colorSpace=THREE.SRGBColorSpace;
  const board=this.board=new THREE.Mesh(new THREE.PlaneGeometry(24,24),new THREE.MeshStandardMaterial({map:texture,roughness:.95}));
  board.name='drawing-board-8x8';board.rotation.x=-Math.PI/2;board.position.set(DRAWING_BOARD.x,.025,DRAWING_BOARD.z);this.root.add(board);
  // Analytic round caps and derivative antialiasing keep fine strokes smooth at any length.
  const inkGeometry=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);inkGeometry.setAttribute('strokeAspect',this.aspects);
  const inkMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false});
  inkMaterial.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float strokeAspect; varying float vStrokeAspect; varying vec2 vStrokeUV;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vStrokeAspect=strokeAspect; vStrokeUV=uv;');
   shader.fragmentShader='varying float vStrokeAspect; varying vec2 vStrokeUV;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 strokePoint=vec2((vStrokeUV.x-.5)*vStrokeAspect,vStrokeUV.y-.5);
    float edge=length(vec2(max(abs(strokePoint.x)-(vStrokeAspect-1.)*.5,0.),strokePoint.y))-.5;
    float aa=max(fwidth(edge),.001);
    diffuseColor.a*=1.-smoothstep(-aa,aa,edge);
    if(diffuseColor.a<.01)discard;`);
  };
  this.ink=new THREE.InstancedMesh(inkGeometry,inkMaterial,MAX_INK);
  this.cursor.name='drawing-brush-cursor';this.cursor.rotation.x=-Math.PI/2;this.cursor.visible=false;this.root.add(this.cursor);
  this.ink.count=0;this.ink.frustumCulled=false;this.ink.name='shared-pencil-marks';this.root.add(this.ink);
  const wood=new THREE.MeshStandardMaterial({color:0xc99c63,roughness:.8}),graphite=new THREE.MeshStandardMaterial({color:0x252326,roughness:.9}),rubber=new THREE.MeshStandardMaterial({color:0xe7aba0,roughness:.8}),metal=new THREE.MeshStandardMaterial({color:0xaaa9a0,metalness:.6,roughness:.3});
  for(let i=0;i<2;i++){
   const pencil=new THREE.Group();pencil.name='giant-pencil-'+i;
   const part=(geometry:THREE.BufferGeometry,material:THREE.Material,y:number)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.y=y;pencil.add(mesh);return mesh;};
   part(new THREE.ConeGeometry(.04,.2,8),graphite,.1).rotation.z=Math.PI;
   part(new THREE.ConeGeometry(.1,.5,6),wood,.4).rotation.z=Math.PI;
   part(new THREE.CylinderGeometry(.1,.1,2.5,6),new THREE.MeshStandardMaterial({color:colors[i],roughness:.6}),1.9);
   part(new THREE.CylinderGeometry(.11,.11,.22,12),metal,3.26);
   part(new THREE.CylinderGeometry(.1,.1,.3,12),rubber,3.52);
   const dock=pencilDock(i);pencil.position.set(dock.x,dock.y,dock.z);
   this.pencils.push(pencil);this.root.add(pencil);
  }
  const eraser=new THREE.Group();eraser.name='giant-eraser';
  const rubberBlock=new THREE.Mesh(new THREE.BoxGeometry(.7,2.6,.5),rubber);rubberBlock.position.y=1.3;
  const sleeve=new THREE.Mesh(new THREE.BoxGeometry(.73,.9,.53),new THREE.MeshStandardMaterial({color:0x325b81,roughness:.85}));sleeve.position.y=1.65;
  eraser.add(rubberBlock,sleeve);const eraserDock=pencilDock(2);eraser.position.set(eraserDock.x,eraserDock.y,eraserDock.z);this.pencils.push(eraser);this.root.add(eraser);
  const wallButton=new THREE.Group();wallButton.name='drawing-wall-clear-button';wallButton.position.set(CLEAR_BUTTON.x,CLEAR_BUTTON.y,CLEAR_BUTTON.z);
  const mount=new THREE.Mesh(new THREE.BoxGeometry(.18,2,2),metal);
  const push=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,.35,24),new THREE.MeshStandardMaterial({color:0xe54735,emissive:0x631008,roughness:.55}));
  push.rotation.z=Math.PI/2;push.position.x=-.23;wallButton.add(mount,push);this.root.add(wallButton);
  const buttonCanvas=document.createElement('canvas');buttonCanvas.width=512;buttonCanvas.height=128;
  const label=buttonCanvas.getContext('2d')!;label.fillStyle='#211918';label.fillRect(0,0,512,128);label.fillStyle='#ffe5b3';label.font='bold 37px sans-serif';label.textAlign='center';label.fillText('CLEAR ALL LINES',256,53);label.font='24px sans-serif';label.fillText('E / G / CLICK • X / SQUARE',256,98);
  const buttonMap=new THREE.CanvasTexture(buttonCanvas);buttonMap.colorSpace=THREE.SRGBColorSpace;
  const buttonSign=new THREE.Mesh(new THREE.PlaneGeometry(3, .75),new THREE.MeshBasicMaterial({map:buttonMap,side:THREE.DoubleSide}));buttonSign.rotation.y=-Math.PI/2;buttonSign.position.set(CLEAR_BUTTON.x-.12,3.25,CLEAR_BUTTON.z);this.root.add(buttonSign);
  const signCanvas=document.createElement('canvas');signCanvas.width=1024;signCanvas.height=256;
  const text=signCanvas.getContext('2d')!;text.fillStyle='#182827';text.fillRect(0,0,1024,256);text.textAlign='center';text.fillStyle='#f0dfb3';text.font='bold 68px sans-serif';text.fillText('THE SCRIBBLE COURT',512,86);text.font='30px sans-serif';text.fillText('FREE DRAW • 8 COLORS • OPTIONAL 8 × 8 GRID',512,146);text.fillText('PENCILS & ERASER • AIM AT THE FIELD • HOLD TO DRAW',512,205);
  const signMap=new THREE.CanvasTexture(signCanvas);signMap.colorSpace=THREE.SRGBColorSpace;
  const sign=createCourtyardSign('drawing-court-wall-sign',13,3.25,signMap);sign.position.set(81,4.3,19.94);sign.rotation.y=Math.PI;this.root.add(sign);
  const lamp=new THREE.DirectionalLight(0xffefd0,2);lamp.position.set(81,18,8);lamp.target.position.set(81,0,2);this.root.add(lamp,lamp.target);
 }
 update(d:DrawingState|undefined,_world:World){
  if(!d)return;
  const transform=this.transform;
  const map=d.grid?this.gridMap:this.plainMap;if(this.board.material.map!==map){this.board.material.map=map;this.board.material.needsUpdate=true;}
  for(const [i,p]of d.pencils.entries()){
   const model=this.pencils[i];model.visible=!p.owner;
   if(!p.owner){model.position.set(p.pos.x,p.pos.y,p.pos.z);model.quaternion.identity();}
  }
  if(this.sequence===d.sequence&&this.inkCount===d.ink.length)return;
  this.sequence=d.sequence;this.inkCount=d.ink.length;
  let firstChanged=d.ink.length,lastChanged=-1;
  this.aspects.clearUpdateRanges();this.ink.instanceMatrix.clearUpdateRanges();this.ink.instanceColor?.clearUpdateRanges();
  for(const [i,row] of d.ink.entries()){
   const old=this.renderedRows[i];if(old&&(row===old||row.every((v,j)=>v===old[j])))continue;
   firstChanged=Math.min(firstChanged,i);lastChanged=i;
   const [pencil,x1,z1,x2,z2]=row,width=(row[5]??12)/INK_SCALE;
   const dx=(x2-x1)/INK_SCALE,dz=(z2-z1)/INK_SCALE;
   transform.position.set(DRAWING_BOARD.x-12+(x1+x2)/(INK_SCALE*2),.055,DRAWING_BOARD.z-12+(z1+z2)/(INK_SCALE*2));
   transform.rotation.set(0,-Math.atan2(dz,dx),0);const length=Math.hypot(dx,dz)+width;this.aspects.setX(i,length/width);
   transform.scale.set(length,1,width);transform.updateMatrix();
   this.ink.setMatrixAt(i,transform.matrix);this.ink.setColorAt(i,this.inkColors[pencil]);
  }
  this.renderedRows=d.ink.slice();this.ink.count=d.ink.length;
  if(lastChanged>=firstChanged){
   this.aspects.addUpdateRange(firstChanged,lastChanged-firstChanged+1);this.aspects.needsUpdate=true;
   this.ink.instanceMatrix.addUpdateRange(firstChanged*16,(lastChanged-firstChanged+1)*16);this.ink.instanceMatrix.needsUpdate=true;
   if(this.ink.instanceColor){this.ink.instanceColor.addUpdateRange(firstChanged*3,(lastChanged-firstChanged+1)*3);this.ink.instanceColor.needsUpdate=true;}
  }
 }
 /** Resolve AFTER the avatar bones animate, including the local connected body. */
 updateGrips(world:World,models:Map<string,THREE.Group>,local?:{id:string;model:THREE.Group}){
  const d=world.courtyard?.drawing;this.cursor.visible=false;if(!d)return;
  for(const [i,p]of d.pencils.entries()){
   if(!p.owner)continue;
   const model=this.pencils[i],avatar=p.owner===local?.id?local.model:models.get(p.owner);
   const player=world.crew.find(player=>player.id===p.owner);
   // Hide until the real rig exists rather than showing a floating substitute.
   model.visible=!!avatar&&!!player&&crewPencilGrip(avatar,this.grip);
   if(!model.visible||!player)continue;
   const target=drawingTarget(player.player.pos,player.input);
   if(target){
    model.position.set(target.x,target.y,target.z);
    this.axis.copy(this.grip).sub(model.position);
    if(this.axis.length()>(i===2?2.3:3.05))model.position.copy(this.grip).addScaledVector(this.axis.clone().normalize(),-1.1);
    this.axis.normalize();
    if(p.owner===local?.id){this.cursor.visible=true;this.cursor.position.set(target.x,.08,target.z);this.cursor.scale.setScalar(i===2?1.3:Math.max(.12,(p.width??8)/INK_SCALE));this.cursor.material.color.setHex(i===2?0xffffff:INK_COLORS[p.color??i]);}
   }else{
    this.axis.set(Math.sin(player.input.yaw)*.35,.94,Math.cos(player.input.yaw)*.35).normalize();
    model.position.copy(this.grip).addScaledVector(this.axis,-1.1);
   }
   model.quaternion.setFromUnitVectors(this.up,this.axis);
   model.userData.grip=this.grip.toArray(model.userData.grip??=[]);
  }
 }
}
