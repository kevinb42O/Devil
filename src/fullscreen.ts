// Safari versions with the prefixed API return void rather than a Promise.
type FullscreenElement = HTMLElement & {webkitRequestFullscreen?:()=>void|Promise<void>};
type FullscreenDocument = Document & {
 webkitFullscreenElement?:Element|null;
 webkitFullscreenEnabled?:boolean;
 webkitExitFullscreen?:()=>void|Promise<void>;
};
export const fullscreenEvents=['fullscreenchange','webkitfullscreenchange'] as const;
export function fullscreenElement(doc:Document=document):Element|null {
 return doc.fullscreenElement||(doc as FullscreenDocument).webkitFullscreenElement||null;
}
export function fullscreenAvailable(doc:Document=document):boolean {
 const root=doc.documentElement as FullscreenElement,legacy=doc as FullscreenDocument;
 return !!((typeof root.requestFullscreen==='function'&&typeof doc.exitFullscreen==='function'&&doc.fullscreenEnabled!==false)||
  (root.webkitRequestFullscreen&&legacy.webkitExitFullscreen&&legacy.webkitFullscreenEnabled!==false));
}
export async function enterFullscreen(doc:Document=document):Promise<void> {
 const root=doc.documentElement as FullscreenElement;
 if(root.requestFullscreen&&doc.fullscreenEnabled!==false)await root.requestFullscreen();
 else if(root.webkitRequestFullscreen&&(doc as FullscreenDocument).webkitFullscreenEnabled!==false)await root.webkitRequestFullscreen();
 else throw new Error('Fullscreen is unavailable.');
}
export async function exitFullscreen(doc:Document=document):Promise<void> {
 const legacy=doc as FullscreenDocument;
 if(!doc.fullscreenElement&&legacy.webkitFullscreenElement&&legacy.webkitExitFullscreen)await legacy.webkitExitFullscreen();
 else if(doc.exitFullscreen)await doc.exitFullscreen();
 else if((doc as FullscreenDocument).webkitExitFullscreen)await (doc as FullscreenDocument).webkitExitFullscreen!();
 else throw new Error('Fullscreen is unavailable.');
}
export function setupFullscreenMenu(button:HTMLButtonElement,label:HTMLElement,status:HTMLElement):void {
 let busy=false;
 const unavailable='Fullscreen is unavailable in this browser or window. Use your browser’s fullscreen option if available.';
 function sync(){
  const active=!!fullscreenElement(),available=fullscreenAvailable();
  label.textContent=active?'EXIT FULLSCREEN':'FULLSCREEN';
  button.setAttribute('aria-pressed',String(active));
  button.disabled=busy||!available;
  button.title=available?(active?'Exit fullscreen':'Enter fullscreen'):unavailable;
  if(!available)status.textContent=unavailable;
 }
 for(const event of fullscreenEvents)document.addEventListener(event,()=>{status.textContent='';sync();});
 for(const event of ['fullscreenerror','webkitfullscreenerror'])document.addEventListener(event,()=>{
  status.textContent='Fullscreen was blocked. Try again, or use your browser’s fullscreen option.';
  busy=false;sync();
 });
 button.addEventListener('click',async()=>{
  if(busy)return;
  busy=true;status.textContent='';sync();
  try {
   // Invoke directly during the click: browsers require transient user activation.
   if(fullscreenElement())await exitFullscreen();else await enterFullscreen();
  }catch{status.textContent='Fullscreen was blocked. Try again, or use your browser’s fullscreen option.';}
  finally{busy=false;sync();}
 });
 sync();
}
