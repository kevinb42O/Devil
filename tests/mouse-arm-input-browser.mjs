import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 for(const level of [1,4,5]){
  const page=await browser.newPage({viewport:{width:960,height:640}});page.setDefaultTimeout(30000);await page.route('https://**/*',r=>r.abort());
  await page.addInitScript(()=>{localStorage.setItem('abyss-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,controlScheme:'qwerty'}));localStorage.setItem('abyss-player-profile',JSON.stringify({name:'Arm input test',automatic:false,configured:true}));});
  await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/?hand-preview='+level);await page.waitForFunction(()=>window.abyss?.originalAssets&&window.abyss?.originalEnemies);await page.click('#start');await page.waitForFunction(()=>!!document.pointerLockElement&&window.abyss.mode==='playing'&&!window.abyss.entrance);
  for(const [button,side]of [['left',1],['right',0]]){
   await page.waitForFunction(()=>window.abyss.handFeedback.hands.every(h=>h.firePower===0&&h.recoil===0));
   await page.mouse.click(480,320,{button});
   await page.waitForFunction(side=>{const h=window.abyss.handFeedback.hands;return h[side].firePower>0&&h[side].recoil>0&&h[1-side].firePower===0&&h[1-side].recoil===0;},side);
  }
  console.log('Actual LMB/RMB input activates matching arms at level '+level);await page.close();
 }
}finally{await browser.close();}
