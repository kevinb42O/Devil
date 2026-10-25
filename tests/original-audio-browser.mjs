import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const base=process.env.GAME_URL||'http://127.0.0.1:5173';
for(const engine of [chromium,webkit]){
 const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 const browser=await engine.launch({headless:true,...(engine===chromium&&existsSync(chrome)?{executablePath:chrome}:{})});
 try{
  const page=await browser.newPage();const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/assets/audio/'))requests.push(r.url());});
  await page.route('**/original-audio-check',r=>r.fulfill({contentType:'text/html',body:'<button>Start audio</button>'}));
  await page.goto(base+'/original-audio-check');
  await page.evaluate(async()=>{
   const [{Sound},{Music},{MenuAudio},{EnvironmentAudio}]=await Promise.all([import('/src/audio.ts'),import('/src/music.ts'),import('/src/menu-audio.ts'),import('/src/environment-audio.ts')]);
   document.querySelector('button').onclick=async()=>{
    try{
     const menu=new MenuAudio();menu.unlock();
     const music=new Music();music.unlock();music.update(1);
     const sound=new Sound();const starting=sound.start();
     const environment=new EnvironmentAudio(sound.context,sound.master);const environmentTimer=setInterval(()=>environment.update(100,.1),50);
     await starting;
     const shipped=await (await fetch('/assets/audio/original/manifest.json')).json();
     // Decode each file without retaining a second full copy of the original bank.
     let decoded=0;
     for(const entry of Object.values({...shipped.files,...shipped.composites})){
      const response=await fetch('/assets/audio/original/'+entry.file);if(!response.ok)throw Error(entry.file+': '+response.status);
      const buffer=await sound.context.decodeAudioData(await response.arrayBuffer());
      if(!(buffer.duration>0))throw Error(entry.file);decoded++;
     }
     for(const name of ['rapid4','rapid5','rapid6','rapid7'])await sound.load(name);
     await sound.load('seekrapid7');
     if(sound.buffers.get('seekrapid7')!==sound.buffers.get('rapid7'))throw Error('aliases must share decoded buffers');
     await new Promise(resolve=>setTimeout(resolve,1500));menu.cue('confirm');
     await new Promise(resolve=>setTimeout(resolve,300));
     const result={decoded,sound:sound.diagnostics,music:music.diagnostics,menu:menu.diagnostics,environment:environment.diagnostics};
     clearInterval(environmentTimer);environment.stop();music.setHidden(true);menu.setHidden(true);sound.clear();
     window.result=result;
    }catch(e){window.failure=String(e);}
   };
  });
  await page.click('button');await page.waitForFunction(()=>window.result||window.failure,null,{timeout:180000});
  assert.equal(await page.evaluate(()=>window.failure),undefined);
  const result=await page.evaluate(()=>window.result);
  assert.equal(result.decoded,299);assert.deepEqual(result.sound.failed,[]);
  assert.equal(result.sound.source,'devil-daggers-original');
  assert.ok(result.music.tracks.some(t=>t.name==='menuatmos'&&t.playing&&t.time>0));
  assert.ok(result.environment.beds[0].streams[0].playing);
  assert.ok(result.menu.recent.includes('uiclick'));
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(url=>url.includes('/audio/original/')||url.includes('/audio/environment/')||/\/audio\/remake\/footstep-/.test(url)));
  console.log(engine.name()+': all 275 originals and 24 layered hand recordings decode; original music/menu and custom environments play; footsteps preserved; alias buffers shared.');
 }finally{await browser.close();}
}
