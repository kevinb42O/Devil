/** Stable cosmetic IDs shared by the lobby, transport and saved replays. */
export const PLAYER_COLORS=[
 {id:'crimson',name:'Crimson',hex:'#d95757'},
 {id:'ember',name:'Ember',hex:'#e79a55'},
 {id:'gold',name:'Gold',hex:'#ddc66b'},
 {id:'jade',name:'Jade',hex:'#73c99a'},
 {id:'frost',name:'Frost',hex:'#77cddd'},
 {id:'azure',name:'Azure',hex:'#7c9ee8'},
 {id:'violet',name:'Violet',hex:'#b294e2'},
 {id:'rose',name:'Rose',hex:'#e694b8'},
] as const;
export type PlayerColor=typeof PLAYER_COLORS[number]['id'];
export const DEFAULT_PLAYER_COLOR:PlayerColor='crimson';
export function isPlayerColor(value:unknown):value is PlayerColor{return PLAYER_COLORS.some(color=>color.id===value);}
export function playerColor(value:unknown){return PLAYER_COLORS.find(color=>color.id===value)??PLAYER_COLORS[0];}
