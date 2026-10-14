import type {LeaderboardRow} from './leaderboard';
import type {OwnScore} from './score-queue';
const el=(id:string)=>document.getElementById(id)!;
export function crownBadge(){const badge=document.createElement('img');badge.src='/ui/sovereign-crown.svg';badge.alt='Crown of the Abyss';badge.className='crown-badge';return badge;}
/** The public board is already ordered by time, achievement date, then identity. */
export function ownsCrown(champion:LeaderboardRow|null,own:OwnScore|null){return !!champion&&!!own&&own.rank===1&&own.player_name===champion.player_name&&own.survival_ms===champion.survival_ms&&own.achieved_at===champion.achieved_at;}
export class CrownOfTheAbyss{
 private champion:LeaderboardRow|null=null;
 private pending=false;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private reigning=false;
 constructor(){try{this.reigning=localStorage.getItem('abyss-crown-reigning')==='true';}catch{/* Private browsing still gets a ceremony this session. */}}
 matchesName(name:string){return !!this.champion&&name.trim().toLocaleLowerCase()===this.champion.player_name.trim().toLocaleLowerCase();}
 setScores(scores:LeaderboardRow[],own:OwnScore|null,name:string){
  this.champion=scores[0]??null;const champion=this.champion;
  el('champion-shrine').hidden=false;el('champion-shrine').classList.toggle('is-vacant',!champion);el('champion-throne').hidden=!champion;
  el('shrine-name').textContent=champion?.player_name??'The crown awaits.';
  el('shrine-record').textContent=champion?`${(champion.survival_ms/1000).toFixed(3)} SECONDS OF DEFIANCE`:'Set the first record. Claim the throne.';
  if(champion){el('throne-name').textContent=champion.player_name;el('throne-record').textContent=(champion.survival_ms/1000).toFixed(3);}
  const reigning=ownsCrown(champion,own);
  if(reigning&&!this.reigning){this.pending=true;el('coronation-name').textContent=champion!.player_name;}
  if(!reigning)this.dismissCoronation();
  this.reigning=reigning;try{localStorage.setItem('abyss-crown-reigning',String(reigning));}catch{/* Cosmetic memory is optional. */}
  this.updatePlayer(name,own);
 }
 updatePlayer(name:string,own:OwnScore|null){
  const owned=ownsCrown(this.champion,own);
  document.querySelector('.player-card')?.classList.toggle('is-sovereign',owned);
  el('leaderboard-personal').classList.toggle('is-sovereign',owned);
  el('player-title').textContent=owned?'REIGNING CHAMPION':'THE CONDEMNED';
  // Use the published identity on the title; editing an unpublished nickname never awards a crown.
  el('player-title').title=owned?`Crown held by ${own!.player_name}`:name;
 }
 unavailable(){this.champion=null;el('champion-shrine').hidden=true;el('champion-throne').hidden=true;this.dismissCoronation();this.updatePlayer('',null);document.querySelectorAll('.sovereign-row').forEach(row=>{row.classList.remove('sovereign-row');row.querySelector('.crown-badge')?.remove();row.querySelector('.sovereign-row-title')?.remove();});document.querySelectorAll('.crew-slot.is-sovereign').forEach(card=>{card.classList.remove('is-sovereign');card.querySelector('.crown-badge')?.remove();const role=card.querySelector('small');if(role)role.textContent=role.textContent?.replace('REIGNING CHAMPION · ','')??'';});}
 showCoronation(atAltar:boolean){
  if(!atAltar){el('menu').classList.remove('is-coronating');el('coronation').hidden=true;clearTimeout(this.timer);this.timer=undefined;return;}
  if(!this.pending||this.timer)return;
  el('coronation').hidden=false;el('menu').classList.add('is-coronating');
  this.timer=setTimeout(()=>this.dismissCoronation(),7000);
 }
 dismissCoronation(){this.pending=false;clearTimeout(this.timer);this.timer=undefined;el('coronation').hidden=true;el('menu').classList.remove('is-coronating');}
}
