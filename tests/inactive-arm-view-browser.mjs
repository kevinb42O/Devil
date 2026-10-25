import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage({viewport:{width:960,height:720}});await page.route('**/inactive-arm-view',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"><canvas></canvas>'}));await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/inactive-arm-view');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},S,T]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js')]);const r=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90,movementMotion:0,screenShake:0,mist:false,skyMotion:'reduced'});await r.prepare();const w=new S.World(1,{schedule:false});w.player.pos={x:0,y:1.7,z:5};w.playerStarts.clear();
  let checks=0,vertices=0,maxPixelError=0;
  for(const level of [1,2,3,4,5,6,7])for(const pitch of [-1.5,-.8,0,1.2]){
   const yaw=level*.4,poses=[];w.level=level;r.originalWeapon.clear();
   for(const entrance of [true,false]){
    for(let i=0;i<3;i++){w.time=.75;r.visualTime=w.time-1;r.render(w,yaw,pitch,1,false,1,null,false,entrance,{...S.idleInput(),yaw,pitch});}
    const mesh=r.emoteHands.getObjectByName('Demon_1');mesh.updateMatrixWorld(true);r.camera.updateMatrixWorld(true);
    const armBones=new Set();mesh.skeleton.bones.forEach((bone,i)=>{for(let n=bone;n;n=n.parent)if(n.name==='UpperArmR'){armBones.add(i);break;}});
    const skin=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),points=[];
    for(let i=0;i<skin.count;i++){let arm=0;for(let j=0;j<4;j++)if(armBones.has(skin.getComponent(i,j)))arm+=weights.getComponent(i,j);if(arm>.99){const point=mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld).project(r.camera);points.push({x:point.x*480,y:point.y*360});}}
    poses.push(points);
   }
   if(poses[0].length!==poses[1].length||poses[0].length<400)throw Error('Missing right-arm mesh vertices');
   for(let i=0;i<poses[0].length;i++){const error=Math.hypot(poses[0][i].x-poses[1][i].x,poses[0][i].y-poses[1][i].y);maxPixelError=Math.max(maxPixelError,error);if(!Number.isFinite(error)||error>.01)throw Error('Hanging arm differs on screen '+JSON.stringify({level,pitch,vertex:i,error}));vertices++;}checks++;
  }
  r.render(w,0,-1.5,1,false,1,{x:2,y:4,z:3},false,false,S.idleInput());if(r.camera.position.distanceTo(new T.Vector3(2,4,3))>1e-8)throw Error('Look-down lean affects spectator');
  return {matchedRenderedViews:checks,projectedVertexChecks:vertices,maxPixelError,spectatorUnchanged:true};
 });console.log(JSON.stringify(result));
}finally{await browser.close();}
