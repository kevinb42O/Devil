import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='artifacts/teaser-environments';
const manifest=JSON.parse(await readFile(directory+'/shot-manifest.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:5173')+'/artifacts/teaser-environments/');
 const reports=[];
 for(const file of ['abyss-daggers-environment-film-master.mp4','abyss-daggers-environment-film-share.mp4']){
  const report=await page.evaluate(async({file,times})=>{
   const video=document.querySelector('video');video.src='./'+file;video.load();
   await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Video decode failure: '+file));});
   const report={file,width:video.videoWidth,height:video.videoHeight,duration:video.duration,frames:[]};
   const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const paint=canvas.getContext('2d');
   for(const time of times){video.currentTime=time;await new Promise(r=>video.onseeked=r);paint.drawImage(video,0,0,160,90);let sum=0;const p=paint.getImageData(0,0,160,90).data;for(let i=0;i<p.length;i+=4)sum+=p[i]+p[i+1]+p[i+2];report.frames.push({time,ready:video.readyState,meanRGB:sum/(160*90*3)});}
   video.currentTime=77;video.playbackRate=2;await video.play();await new Promise(r=>video.onended=r);report.playedToEnd=video.ended;return report;
  },{file,times:manifest.shots.map(s=>s.filmIn+s.duration*.55)});
  assert.equal(report.width,1920);assert.equal(report.height,1080);assert(Math.abs(report.duration-manifest.duration)<.1);assert(report.playedToEnd);assert(report.frames.every(f=>f.ready>=2&&f.meanRGB>1));reports.push(report);
 }
 await page.evaluate(async()=>{const v=document.querySelector('video');v.currentTime=53;await new Promise(r=>v.onseeked=r);});
 await page.screenshot({path:directory+'/player-review.png',fullPage:true});assert.deepEqual(errors,[]);
 await writeFile(directory+'/browser-review.json',JSON.stringify({reports,errors},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();}
