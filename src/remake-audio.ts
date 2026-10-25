import footstepManifest from './footstep-audio-manifest.json';
import originalManifest from './original-audio-manifest.json';
export type RemakeAudioAsset={file:string;gain:number;loop:boolean;duration:number;role:string};
/** Original recordings supply every cue except the existing dry/wet footsteps. */
export const REMAKE_AUDIO:Readonly<Record<string,RemakeAudioAsset>>={
 ...originalManifest,
 ...footstepManifest,
};
export function remakeAudioAsset(name:string){
 const asset=REMAKE_AUDIO[name];if(!asset)throw Error(`Missing audio: ${name}`);return asset;
}
export function remakeAudioUrl(name:string){const asset=remakeAudioAsset(name);return '/assets/audio/'+(asset.role==='footstep'?'remake/':'original/')+asset.file;}
