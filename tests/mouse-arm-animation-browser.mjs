import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();await page.route('**/mouse-arm-animation',r=>r.fulfill({contentType:'text/html',body:'<canvas></canvas>'}));await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/mouse-arm-animation');
 const result=await page.evaluate(async()=>{
  const [{GameRenderer},S,T,{HAND_MUZZLES},{crewWeaponMuzzle}]=await Promise.all([import('/src/renderer.ts'),import('/src/simulation.ts'),import('/node_modules/.vite/deps/three.js'),import('/src/weapon-origin.ts'),import('/src/crew-avatar.ts')]);
  const r=new GameRenderer(document.querySelector('canvas'),{quality:'low',fov:90,movementMotion:0,screenShake:0,mist:false});await r.prepare();let checks=0;
  for(let level=1;level<=7;level++)for(const side of [0,1])for(const burst of [true,false]){
   const w=new S.World(42,{schedule:false,invulnerable:true});w.level=level;w.player.pos={x:0,y:20,z:0};r.originalWeapon.clear();
   const input={...S.idleInput(),fire:true,fireLeft:side===1,fireRight:side===0},render=i=>r.render(w,0,0,.016,false,1,null,false,false,i);
   render(S.idleInput());const bone=r.emoteHands.getObjectByName('LowerArm'+(side===1?'L':'R'));const before=bone.getWorldQuaternion(new T.Quaternion()).normalize();
   if(burst){w.step(input);w.step(S.idleInput());}else for(let tick=0;tick<37;tick++)w.step(input);
   for(const effect of w.effects)r.effect(effect,w,0,0);render(burst?S.idleInput():input);
   const feedback=r.originalWeapon.handFeedback.hands;
   if(feedback[side].firePower===0||feedback[side].recoil===0||feedback[1-side].firePower!==0||feedback[1-side].recoil!==0)throw Error('Mouse animates wrong hand '+JSON.stringify({level,side,burst,feedback}));
   if(before.angleTo(bone.getWorldQuaternion(new T.Quaternion()).normalize())<.1)throw Error('Firing arm did not raise');
   const fire=r.emoteHands.userData.avatarMaterials.find(m=>m.name==='Demon_Main').userData.combatFeedback.uniforms.combatHandFire.value;
   if((side===1?fire.x:fire.y)===0||(side===1?fire.y:fire.x)!==0)throw Error('Glow on wrong hand');
   const projectile=w.projectiles[0],viewed=r.originalWeapon.projectileView({...projectile,age:0},{...projectile.pos});
   const socket=level>=5?side:0;
   const palm=new T.Vector3();r.combatMuzzle(level,level<5&&side===0?HAND_MUZZLES[level-1].length:socket,palm);
   // Streams have a small radius around the physical muzzle; compare the visual
   // offset against that same physical position rather than its sampled pellet.
   const {weaponMuzzle}=await import('/src/weapon-origin.ts');const origin=weaponMuzzle(w.player.pos,0,0,level,socket);
   const aligned=r.originalWeapon.projectileView({...projectile,age:0,socket},{...origin});
   if(palm.distanceTo(new T.Vector3(aligned.x,aligned.y,aligned.z))>1e-7)throw Error('Projectiles use wrong palm '+JSON.stringify({level,side,burst,palm,aligned}));
   checks++;
  }
  return {independentMouseArmCases:checks};
 });console.log(JSON.stringify(result));
}finally{await browser.close();}
