import {MAX_CREW_PLAYERS} from './crew-config';
import {MqttWsSignalingClient} from './signaling';
export const LOBBY_TOPIC='abyss-daggers/v2/lobbies';
export const DISCOVERY_TOPIC='abyss-daggers/v2/discover';
export type PublicLobby={id:string;name:string;host:string;players:number;ready:number;state:'waiting'|'playing';updated:number;closed?:boolean};
export class LobbyBrowser{
 private client=new MqttWsSignalingClient();private rooms=new Map<string,PublicLobby>();private timer?:ReturnType<typeof setInterval>;onChange=()=>{};onStatus=(_s:string)=>{};
 get list(){const now=Date.now();return [...this.rooms.values()].filter(l=>now-l.updated<12000&&!l.closed).sort((a,b)=>Number(a.state==='playing')-Number(b.state==='playing')||a.name.localeCompare(b.name));}
 async start(){this.client.subscribe(LOBBY_TOPIC,raw=>{try{const l=JSON.parse(raw) as PublicLobby;if(typeof l.id!=='string'||typeof l.name!=='string'||typeof l.host!=='string'||!Number.isInteger(l.players)||l.players<1||l.players>MAX_CREW_PLAYERS||!['waiting','playing'].includes(l.state))return;if(l.closed)this.rooms.delete(l.id);else this.rooms.set(l.id,{...l,updated:Date.now(),name:l.name.slice(0,40),host:l.host.slice(0,24)});this.onChange();}catch{/* Invalid announcements are ignored. */}});this.timer=setInterval(()=>{this.onChange();if(this.client.isConnected())this.onStatus('PUBLIC LOBBIES · LIVE');else this.onStatus('RECONNECTING TO LOBBIES…');},2000);if(!await this.client.connect())this.onStatus('Connecting to lobby service…');else this.onStatus('PUBLIC LOBBIES · LIVE');this.refresh();}
 refresh(){this.client.publish(DISCOVERY_TOPIC,JSON.stringify({request:Date.now()}));this.onChange();}
 close(){if(this.timer)clearInterval(this.timer);this.client.close();}
}
