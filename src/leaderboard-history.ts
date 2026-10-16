import {loadLeaderboard} from './leaderboard';
import {loadCrewHistory} from './crew-leaderboard';
import {crewNames} from './crew-score';

/** Historical boards never affect current-season bests, crowns or score uploads. */
export class LeaderboardHistory {
 private crew=false;private size=2;private request=0;private offset=0;
 private section=document.createElement('section');private version=document.createElement('select');
 private search=document.createElement('input');private status=document.createElement('p');
 private rows=document.createElement('tbody');private more=document.createElement('button');
 constructor(anchor:Element,private readonly watch:(id:string,button:HTMLButtonElement)=>void){
  this.section.id='leaderboard-history';this.section.className='leaderboard-history';
  const title=document.createElement('h3');title.textContent='PREVIOUS RANKINGS';
  const explanation=document.createElement('p');explanation.textContent='Earlier scores are preserved here. Each gameplay version has its own rankings; new runs enter the current leaderboard above.';
  const filters=document.createElement('div');filters.className='leaderboard-actions';
  const versionLabel=document.createElement('label');versionLabel.textContent='GAMEPLAY VERSION';this.version.id='leaderboard-history-version';versionLabel.append(this.version);
  const searchLabel=document.createElement('label');searchLabel.textContent='FIND A PLAYER';this.search.type='search';this.search.maxLength=24;this.search.id='leaderboard-history-search';searchLabel.append(this.search);filters.append(versionLabel,searchLabel);
  this.status.setAttribute('role','status');this.status.id='leaderboard-history-status';
  const wrapper=document.createElement('div');wrapper.className='leaderboard-table';const table=document.createElement('table');const head=document.createElement('thead');
  head.innerHTML='<tr><th scope="col">#</th><th scope="col">PLAYER / PARTY</th><th scope="col">SECONDS</th><th scope="col">KILLS</th><th scope="col">GEMS</th><th scope="col">REPLAY</th></tr>';table.append(head,this.rows);wrapper.append(table);
  this.more.type='button';this.more.textContent='LOAD MORE PREVIOUS PARTIES';this.more.hidden=true;this.more.onclick=()=>void this.refresh(true);
  this.section.append(title,explanation,filters,this.status,wrapper,this.more);anchor.after(this.section);
  this.version.onchange=()=>void this.refresh();let debounce=0;this.search.oninput=()=>{clearTimeout(debounce);debounce=window.setTimeout(()=>void this.refresh(),200);};
  this.configure(false,2);
 }
 configure(crew:boolean,size:number){
  const changed=this.crew!==crew;this.crew=crew;this.size=size;
  if(changed||!this.version.options.length){this.version.replaceChildren();
   for(const [value,label] of crew?[[18,'Original crew · revision 18'],[19,'Shotgun · revision 19']]:[[6,'Previous solo · rules 6'],[5,'Classic solo · rules 5'],[4,'Classic solo · rules 4']]){
    const option=document.createElement('option');option.value=String(value);option.textContent=String(label);this.version.append(option);
   }
  }
  this.request++;this.rows.replaceChildren();this.more.hidden=true;
 }
 async refresh(append=false){
  const request=++this.request,crew=this.crew,size=this.size,rules=Number(this.version.value),search=this.search.value.trim();
  if(!append){this.offset=0;this.rows.replaceChildren();}this.more.hidden=true;this.status.textContent='Loading previous rankings…';
  try{
   const scores=crew?await loadCrewHistory(rules,size,search,this.offset):(await loadLeaderboard(rules)).map((score,index)=>({...score,rank:index+1})).filter(score=>score.player_name.toLowerCase().includes(search.toLowerCase()));
   if(request!==this.request)return;
   for(const score of scores){const row=document.createElement('tr');
    for(const value of [score.rank,'roster' in score?crewNames(score.roster):score.player_name,(score.survival_ms/1000).toFixed(3),score.kills,score.gems]){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);}
    const replay=document.createElement('td');if(score.replay_id){const watch=document.createElement('button');watch.type='button';watch.textContent='WATCH';watch.className='text-button';watch.setAttribute('aria-label',`Watch ${'roster' in score?crewNames(score.roster):score.player_name}'s replay`);watch.onclick=()=>this.watch(score.replay_id!,watch);replay.append(watch);}else replay.textContent='—';row.append(replay);this.rows.append(row);
   }
   this.offset+=scores.length;this.more.hidden=!crew||scores.length<100;
   this.status.textContent=this.offset?`${this.offset} previous ${crew?(this.offset===1?'party':'parties'):(this.offset===1?'player':'players')} · ${crew?size+' players · revision ':'rules '}${rules}`:`No published scores for ${crew?size+'-player crews in revision ':'solo rules '}${rules}. Other versions are available above.`;
  }catch(error){if(request!==this.request)return;this.status.textContent=error instanceof Error?error.message:'Previous rankings are unavailable.';}
 }
}
