import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const file=process.argv[2]||'surface-study.mp4';const times=process.argv.slice(3).map(Number);if(!times.length)times.push(2,6);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173');
 const meta=await page.evaluate(async file=>{
  const video=document.createElement('video');video.src='/artifacts/furnace-film/'+file;video.preload='auto';document.body.append(video);window.reviewVideo=video;
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Video failed to decode'));});
  const context=new AudioContext(),data=await (await fetch(video.src)).arrayBuffer(),audio=await context.decodeAudioData(data);let power=0,peak=0;const samples=audio.getChannelData(0);for(const x of samples){power+=x*x;peak=Math.max(peak,Math.abs(x));}await context.close();
  return {duration:video.duration,width:video.videoWidth,height:video.videoHeight,audioChannels:audio.numberOfChannels,audioDuration:audio.duration,rms:Math.sqrt(power/samples.length),peak};
 },file);
 for(const time of times){
  const data=await page.evaluate(async time=>{const v=window.reviewVideo;v.currentTime=time;await new Promise(resolve=>v.onseeked=resolve);const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;canvas.getContext('2d').drawImage(v,0,0);return canvas.toDataURL('image/png').split(',')[1];},time);
  await writeFile(`artifacts/furnace-film/${file.replace('.mp4','')}-${time}.png`,Buffer.from(data,'base64'));
 }
 await writeFile(`artifacts/furnace-film/${file.replace('.mp4','')}-media.json`,JSON.stringify(meta,null,2));console.log(meta);
}finally{await browser.close();}
