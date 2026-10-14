import './pwa.css';
import {fullscreenElement,fullscreenEvents} from './fullscreen';

type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
type OfflinePack={version:string;bytes:number;files:string[]};
export function installedApp(){
 return matchMedia('(display-mode: standalone)').matches||(matchMedia('(display-mode: fullscreen)').matches&&!fullscreenElement())||(navigator as Navigator&{standalone?:boolean}).standalone===true;
}
export function setupPwa(){
 const dialog=document.querySelector<HTMLDialogElement>('#install-dialog')!;
 const open=document.querySelector<HTMLButtonElement>('#install-open')!;
 const install=document.querySelector<HTMLButtonElement>('#install-app')!;
 const save=document.querySelector<HTMLButtonElement>('#offline-save')!;
 const status=document.querySelector<HTMLElement>('#offline-status')!;
 const instructions=document.querySelector<HTMLElement>('#install-instructions')!;
 let prompt:InstallPrompt|null=null,pack:OfflinePack|null=null,downloading=false;
 function sync(){
  const installed=installedApp();document.body.dataset.installed=String(installed);
  open.textContent=installed?'APP & OFFLINE ↓':'INSTALL APP ↓';
  install.hidden=installed||!prompt;
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  instructions.textContent=installed?'Abyss is running as an installed app.':prompt?'Install Abyss for a Home Screen icon and a dedicated game window.':ios?'On iPhone or iPad: open Abyss in Safari, choose Share (or More → Share), then Add to Home Screen. Keep Open as Web App enabled if shown, tap Add, and launch Abyss from its new icon.':'Open your browser menu and choose Install app or Add to Home screen, then launch Abyss from its icon. Use Chrome on Android if your browser does not offer installation.';
 }
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event as InstallPrompt;sync();});
 window.addEventListener('appinstalled',()=>{prompt=null;sync();});
 for(const event of fullscreenEvents)document.addEventListener(event,sync);
 for(const mode of ['standalone','fullscreen'])matchMedia(`(display-mode: ${mode})`).addEventListener('change',sync);
 open.addEventListener('click',()=>{sync();dialog.showModal();});
 document.querySelector('#install-close')!.addEventListener('click',()=>dialog.close());
 install.addEventListener('click',async()=>{
  if(!prompt)return;const pending=prompt;prompt=null;install.disabled=true;
  try{await pending.prompt();await pending.userChoice;}catch{instructions.textContent='Use your browser menu to install Abyss.';}
  finally{install.disabled=false;sync();}
 });
 sync();
 if(!import.meta.env.PROD){status.textContent='Offline downloads are available in the production build served over HTTPS or localhost.';return;}
 if(!('serviceWorker' in navigator)||!window.isSecureContext){status.textContent='Installation and offline saving require an HTTPS connection.';return;}
 // Register immediately. Updated workers activate without reloading a run;
 // the next navigation loads the latest online release.
 void (async()=>{
  const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
  registration.addEventListener('updatefound',()=>{
   const worker=registration.installing;
   worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller&&!downloading)status.textContent='An update is ready. Reload Abyss when your run is finished to apply it.';});
  });
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));
  const response=await fetch('/offline-pack.json');if(!response.ok)throw Error('Offline list unavailable');pack=await response.json() as OfflinePack;
  const cache=await caches.open(`abyss-pwa-${pack.version}`);
  const complete=await cache.match('/offline-ready');
  status.textContent=complete?'Game saved for offline play. Your browser may remove downloads if device storage runs low.':`Save the complete game, including sound and music (about ${Math.ceil(pack.bytes/1048576)} MB). Keep Abyss open until the download finishes. Wi-Fi recommended.`;
  save.disabled=false;save.textContent=complete?'CHECK OFFLINE DOWNLOAD':'SAVE GAME FOR OFFLINE PLAY';
 })().catch(()=>{status.textContent='Offline setup could not finish. Reopen Abyss online to try again.';});
 save.addEventListener('click',async()=>{
  if(!pack||downloading)return;downloading=true;save.disabled=true;
  try{
   const cache=await caches.open(`abyss-pwa-${pack.version}`);
   let done=0,next=0,failed=false;
   const progress=()=>{status.textContent=`Saving game for offline play… ${Math.floor(done/pack!.files.length*100)}%. Keep Abyss open.`;};progress();
   // Concurrent downloads are bounded so decoding/rendering can keep working.
   const downloads=await Promise.allSettled(Array.from({length:3},async()=>{
    while(next<pack!.files.length&&!failed){
     const url=pack!.files[next++];
     try{
      if(!await cache.match(url)){
       const response=await fetch(url);if(!response.ok||response.status!==200)throw Error('Download failed');
       await cache.put(url,response);
      }
      done++;progress();
     }catch(error){failed=true;throw error;}
    }
   }));
   if(downloads.some(result=>result.status==='rejected'))throw Error('Download incomplete');
   await cache.put('/offline-ready',new Response(pack.version));
   try{await navigator.storage?.persist?.();}catch{/* Persistence is optional. */}
   status.textContent='Game saved. You can launch Abyss and play solo offline. Online features still require internet. Your browser may remove downloads if device storage runs low.';
   save.textContent='CHECK OFFLINE DOWNLOAD';
  }catch{status.textContent='The download could not finish. Check your connection and free storage, then retry. Saved files will be reused.';}
  finally{downloading=false;save.disabled=false;}
 });
 // Keep the display awake during play where supported, and reacquire the lock
 // after returning from another app. The existing game lifecycle pauses play.
 let wake:WakeLockSentinel|null=null,pendingWake=false;
 async function syncWake(){
  const playing=document.body.dataset.gameMode==='playing'&&!document.hidden;
  if(!playing){if(wake){const old=wake;wake=null;await old.release().catch(()=>{});}return;}
  if(wake||pendingWake||!navigator.wakeLock)return;
  pendingWake=true;
  try{
   const lock=await navigator.wakeLock.request('screen');
   if(document.body.dataset.gameMode!=='playing'||document.hidden){await lock.release();return;}
   wake=lock;lock.addEventListener('release',()=>{if(wake===lock)wake=null;});
  }catch{/* Battery policy and platform support can deny wake locks. */}
  finally{pendingWake=false;}
 }
 new MutationObserver(()=>void syncWake()).observe(document.body,{attributes:true,attributeFilter:['data-game-mode']});
 document.addEventListener('visibilitychange',()=>void syncWake());
}
