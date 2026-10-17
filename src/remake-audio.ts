import manifest from './remake-audio-manifest.json';
export type RemakeAudioAsset={file:string;gain:number;loop:boolean;duration:number;role:string};
export const REMAKE_AUDIO:Readonly<Record<string,RemakeAudioAsset>>=manifest;
/** Every cue resolves through the licensed replacement catalog; missing entries
 * are an error rather than a fallback to an extracted recording. */
export function remakeAudioAsset(name:string){
 const asset=REMAKE_AUDIO[name];if(!asset)throw Error(`Missing replacement audio: ${name}`);return asset;
}
export function remakeAudioUrl(name:string){return '/assets/audio/remake/'+remakeAudioAsset(name).file;}
