/** An exhaustive ledger, not a claim that every imported asset has a trigger. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {SOUND_NAMES} from '../src/audio';
import originals from '../src/original-audio-manifest.json';
import classification from '../assets/provenance/original-audio-classification.json';
const shipped=JSON.parse(readFileSync('public/assets/audio/original/manifest.json','utf8'));
const catalog=originals as Record<string,{original?:string;layers?:string[]}>;
const used=new Map<string,string[]>();
const runtime=[...SOUND_NAMES,'football-goal','crew-countdown','menuatmos','uihover','uiclick','uislider'];
for(const name of runtime){const entry=catalog[name];if(!entry)continue;
 for(const original of entry.layers??(entry.original?[entry.original]:[]))used.set(original,[...(used.get(original)??[]),name]);
}
const absent:Record<string,string>={
 highscore2:'The native friends-leaderboard proximity warning has no matching native friends-ranking system in this game.',
 legends:'Original skull-throne lobby Easter egg is absent.',
 secretsnake2:'Original hidden lobby Easter egg is absent.',
 menutheme:'Native splash/title sequence is absent; menu uses menuatmos.',
 sorathlogo:'Sorath branding splash is absent.',
 sorathstone:'Original Sorath-stone lobby Easter egg is absent.',
 ultrapedecrash:'Ghostpede floor-crash behavior is absent from the implemented orbiting movement; death correctly uses ultrapedefall.',
};
const rows=Object.keys(shipped.files).sort().map(name=>{
 let status:string,reason:string;
 if(used.has(name)){status=name==='leveldown'?'extension-input':'routed';reason=name==='leveldown'?'Explicit source for the requested extra-hand upgrade pair and debug hand-I transition.':'Connected to implemented events or the requested hand composites.';}
 else if(classification.nativeUnusedOrPrototype.includes(name)){status='native-unused-or-prototype';reason='The reference catalog marks this as unused or prototype, including uncertain unused entries.';}
 else if(/^(meat\d+|meatmed\d+|meatbig\d+|shard\d+)$/.test(name)){status='absent-native-behavior';reason='Original bouncing meat/shard debris physics is absent; liquid droplets are not those bodies.';}
 else if(absent[name]){status='absent-native-behavior';reason=absent[name];}
 else{status='unresolved';reason='No classified event; must be resolved before this audit passes.';}
 return {name,status,reason,cues:used.get(name)??[]};
});
const summary=Object.fromEntries([...new Set(rows.map(r=>r.status))].map(status=>[status,rows.filter(r=>r.status===status).length]));
const report={sourceCount:rows.length,mixPolicy:'recorded-level',nativeMixerFormulaVerified:false,summary,reference:classification.source,recordings:rows};
mkdirSync('artifacts/original-audio',{recursive:true});writeFileSync('artifacts/original-audio/coverage.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary));
const unresolved=rows.filter(r=>r.status==='unresolved');if(unresolved.length)throw Error('Unresolved originals: '+unresolved.map(r=>r.name).join(', '));
if(rows.length!==275)throw Error('Incomplete original bank');
