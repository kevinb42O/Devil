/** Selected licensed photograph-based fire -> compact game flipbook. No online runtime/video decoder. */
import {chromium} from '@playwright/test';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const secondary=process.argv.includes('--secondary'),id=secondary?3758:52312;
const source=`assets/_sources/furnace/mixkit-${id}.mp4`,out='public/assets/environment/furnace';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173');
 const result=await page.evaluate(async id=>{
  const v=document.createElement('video');v.src='/assets/_sources/furnace/mixkit-'+id+'.mp4';v.preload='auto';await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j});
  const frames=[],tail=[];const grab=async(time)=>{v.currentTime=time;await new Promise(r=>v.onseeked=r);const c=document.createElement('canvas');c.width=256;c.height=256;const p=c.getContext('2d');p.fillStyle='#000';p.fillRect(0,0,256,256);p.drawImage(v,0,0,v.videoWidth,v.videoHeight,4,4,248,248);return c;};
  for(let i=0;i<64;i++)frames.push(await grab(3+i/12));
  for(let i=0;i<8;i++)tail.push(await grab(3-(8-i)/12));
  for(let i=0;i<8;i++){const t=i/7,a=t*t*(3-2*t),p=frames[56+i].getContext('2d');p.globalAlpha=a;p.drawImage(tail[i],0,0);}
  const atlas=document.createElement('canvas');atlas.width=atlas.height=2048;const p=atlas.getContext('2d');frames.forEach((c,i)=>p.drawImage(c,(i%8)*256,Math.floor(i/8)*256));
  return {image:atlas.toDataURL('image/webp',.94).split(',')[1],frame:frames[25].toDataURL().split(',')[1],duration:v.duration};
 },id);
 const data=Buffer.from(result.image,'base64'),hash=createHash('sha256').update(data).digest('hex'),file='real-flame-'+hash.slice(0,10)+'.webp';await writeFile(out+'/'+file,data);await writeFile('artifacts/furnace/selected-flame-'+id+'.png',Buffer.from(result.frame,'base64'));
 const manifest={file,url:'/assets/environment/furnace/'+file,columns:8,rows:8,frames:64,fps:12,cell:256,inset:4,bytes:data.length,sha256:hash,source:{title:secondary?'Intense flames on black background':'Mesmerizing close up of flames over a black background',page:secondary?'https://mixkit.co/free-stock-video/intense-flames-on-black-background-3758/':'https://mixkit.co/free-stock-video/mesmerizing-close-up-of-flames-over-a-black-background-52312/',download:`https://assets.mixkit.co/videos/${id}/${id}-720.mp4`,file:source,sha256:createHash('sha256').update(await readFile(source)).digest('hex'),license:'Mixkit Stock Video Free License',licenseURL:'https://mixkit.co/license/modal/videoFree/',retrieved:'2026-10-18',start:3,end:8.25,changes:'Selected 64 photographed flame frames, resized to padded 256px cells; 8-frame pre-roll crossfade makes the loop continuous. No raw stock video is shipped.'}};
 await writeFile(secondary?'src/furnace-flame-secondary.json':'src/furnace-flame-manifest.json',JSON.stringify(manifest,null,2)+'\n');await writeFile(secondary?'assets/provenance/furnace/selected-secondary.json':'assets/provenance/furnace/selected-source.json',JSON.stringify(manifest,null,2)+'\n');console.log({file,bytes:data.length,frames:64});
}finally{await browser.close();}
