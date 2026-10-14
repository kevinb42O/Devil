import type {LeaderboardRow} from './leaderboard';

/** Use the server's global order, never the order of players in this room. */
export function lobbyPodiumRank(name:string,scores:LeaderboardRow[]):1|2|3|null{
 const identity=name.trim().toLocaleLowerCase();
 if(!identity)return null;
 const index=scores.slice(0,3).findIndex(score=>score.player_name.trim().toLocaleLowerCase()===identity);
 return index<0?null:(index+1) as 1|2|3;
}

export function decorateLobbyRank(card:HTMLElement,name:string,scores:LeaderboardRow[]){
 const rank=lobbyPodiumRank(name,scores);if(!rank)return;
 card.dataset.podium=String(rank);
 const honor=document.createElement('span');honor.className='crew-rank-honor';
 const place=document.createElement('b');place.textContent=`#${rank}`;
 const title=document.createElement('span');title.textContent=['REIGNING CHAMPION','SILVER VANGUARD','BRONZE WARDEN'][rank-1];
 honor.append(place,title);honor.setAttribute('aria-label',`Global leaderboard number ${rank}: ${title.textContent}`);
 card.querySelector('.crew-avatar')!.before(honor);
 if(rank===1){
  const fire=document.createElement('div');fire.className='crew-crown-fire';fire.setAttribute('aria-hidden','true');
  for(let i=0;i<36;i++){
   const flame=document.createElement('i');
   // A continuous perimeter of varied flame clusters stays clear of the player name.
   flame.style.setProperty('--flame-x',`${i<14?(i+.5)/14*100:i<21?0:i<28?100:(i-27.5)/8*100}%`);
   flame.style.setProperty('--flame-y',`${i<14?100:i<28?18+(i%7)*12:0}%`);
   flame.style.setProperty('--flame-size',`${i<14?38+(i*13%30):i<28?30+(i*11%22):20+(i*7%16)}px`);
   flame.style.setProperty('--flame-width',`${i<14?23+(i*7%13):16+(i*3%9)}px`);
   flame.style.setProperty('--flame-speed',`${1.1+(i%5)*.19}s`);
   flame.style.setProperty('--flame-delay',`${-(i*0.37)}s`);
   fire.append(flame);
  }
  const embers=document.createElement('span');embers.className='crew-fire-embers';
  for(let i=0;i<9;i++){const ember=document.createElement('i');ember.style.setProperty('--ember-x',`${4+(i*37%92)}%`);ember.style.setProperty('--flame-delay',`${-i*.63}s`);embers.append(ember);}
  fire.append(embers);card.prepend(fire);
 }
}
