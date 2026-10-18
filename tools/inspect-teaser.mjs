import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/artifacts/teaser/');
 const reports=[];
 for(const file of ['abyss-daggers-teaser-master.mp4','abyss-daggers-teaser-share.mp4']){
  const report=await page.evaluate(async file=>{
   const video=document.querySelector('video');video.src='./'+file;video.load();
   await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Movie did not decode: '+file));});
   const meta={file,width:video.videoWidth,height:video.videoHeight,duration:video.duration,seeks:[]};
   const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const paint=canvas.getContext('2d');
   for(const time of [0.3,8,20,34,42,49,56,60,65,68,72.5,74]){
    video.currentTime=time;await new Promise(resolve=>video.onseeked=resolve);paint.drawImage(video,0,0,160,90);
    const pixels=paint.getImageData(0,0,160,90).data;let light=0;for(let i=0;i<pixels.length;i+=4)light+=pixels[i]+pixels[i+1]+pixels[i+2];
    meta.seeks.push({time,ready:video.readyState,meanRGB:light/(160*90*3)});
   }
   video.currentTime=71;await video.play();await new Promise(resolve=>video.onended=resolve);
   meta.playedToEnd=video.ended;return meta;
  },file);
  assert.equal(report.width,1920);assert.equal(report.height,1080);assert(Math.abs(report.duration-75)<.1);assert(report.playedToEnd);
  assert(report.seeks.every(s=>s.ready>=2&&s.meanRGB>1));reports.push(report);
 }
 await page.evaluate(()=>{document.querySelector('video').currentTime=49.5;});await page.waitForTimeout(500);
 await page.screenshot({path:'artifacts/teaser/player-review.png',fullPage:true});
 assert.deepEqual(errors,[]);await writeFile('artifacts/teaser/browser-review.json',JSON.stringify({reports,errors},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();}
