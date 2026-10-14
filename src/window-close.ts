import './window-close.css';

/** Keep each cross on the same navigation path as its existing back button. */
export function setupWindowCloseButtons(dismissCoronation:()=>void){
 const windows=[
  ['#player-profile .panel','profile-cancel','Close player profile'],
  ['#leaderboard .panel','leaderboard-close','Close leaderboard'],
  ['#friends .friends-shell','friends-close','Close crew lobby'],
  ['#pause .panel','resume','Close pause menu and resume run'],
  ['#death .panel','home','Close results and return to altar'],
  ['#settings .panel','settings-close','Close settings'],
  ['#history .panel','history-close','Close run history'],
  ['#install-dialog','install-close','Close install window'],
  ['#death-analysis','analysis-skip','Close death replay and return to results'],
  ['#replay-controls','replay-exit','Close replay'],
  ['#crew-replay-controls','crew-replay-exit','Close team replay'],
  ['#coronation','coronation-dismiss','Close coronation'],
 ];
 for(const [selector,targetId,label] of windows){
  const window=document.querySelector<HTMLElement>(selector);
  if(!window)continue;
  const button=document.createElement('button');
  button.type='button';button.id=`${targetId}-cross`;button.className='window-close';
  button.setAttribute('aria-label',label);button.title=label;
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  button.onclick=targetId==='coronation-dismiss'?dismissCoronation:()=>document.getElementById(targetId)?.click();
  window.classList.add('window-closable');window.prepend(button);
 }
}
