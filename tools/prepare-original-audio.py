"""Verify and package original recordings, without replacement-bank mastering.

All original cues retain their recorded relative levels (gain=1). Native
loudness.ini values are preserved as metadata; its undocumented engine math
is not guessed. Every native WAV is copied intact, including long tracks.
"""
import array
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import wave

ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'assets/original/devil-daggers/audio'
DEST=ROOT/'public/assets/audio/original'

def digest(data):return hashlib.sha256(data).hexdigest()

def role(name):
    if name.startswith('rapid'):return 'weapon-stream'
    if name.startswith('shot'):return 'weapon-burst'
    if name.startswith('level'):return 'upgrade'
    if name.startswith(('jump','land','skullclop')):return 'movement'
    if name.startswith(('chatter','eggdrone','eyearousedrone','subchatter')):return 'enemy-chatter'
    if name.startswith(('spawn','thornemerge')):return 'enemy-spawn'
    if name.startswith(('kill','ultrapedefall')):return 'enemy-death'
    if name.startswith(('damage','eyehit')):return 'enemy-damage'
    if name.startswith(('ricochet','gigaricochet')):return 'ricochet'
    if name.startswith(('magicpierce','magentastuckenemy')):return 'homing-impact'
    if name.startswith('magentadetonate'):return 'explosion'
    if name.startswith(('daggerdrone','magentadrone')):return 'homing-flight'
    if name in ('daggerseek','magentashot'):return 'homing-launch'
    if name.startswith(('gibcollect','collectgib')):return 'pickup'
    if name.startswith(('gibdrone','stealgib')):return 'gem-chatter'
    if name.startswith('daggercall'):return 'entrance-call'
    if name.startswith('daggercollect'):return 'entrance-pickup'
    if name.startswith('polarity'):return 'ambience'
    if name.startswith('menu'):return 'menu-music'
    if name.startswith('ui'):return 'ui'
    if name in ('death','fall'):return 'player-death'
    if name.startswith('splashgiga'):return 'death-contact'
    return 'effect'

def main():
    imported=json.loads((SOURCE/'manifest.json').read_text())
    loudness={name:float(value) for name,value in re.findall(r'(\w+)\s*=\s*(\d+(?:\.\d+)?)',(SOURCE/'loudness.ini').read_text())}
    DEST.mkdir(parents=True,exist_ok=True)
    old_manifest=json.loads((DEST/'manifest.json').read_text()) if (DEST/'manifest.json').exists() else {}
    sources={};catalog={}
    for entry in imported['files']:
        name=entry['name'];path=SOURCE/f'{name}.wav';data=path.read_bytes()
        assert len(data)==entry['bytes'] and digest(data)==entry['sha256'],name
        with wave.open(str(path)) as recording:
            assert recording.getsampwidth()==2
            duration=recording.getnframes()/recording.getframerate()
            samples=array.array('h',recording.readframes(recording.getnframes()))
        rms=math.sqrt(sum(float(x)*x for x in samples)/len(samples))/32768
        peak=max(abs(x) for x in samples)/32768
        filename=name+'.wav';target=DEST/filename
        shutil.copyfile(path,target)
        old=old_manifest.get('files',{}).get(name)
        if old and old['file']!=filename:
            stale=DEST/old['file']
            if stale.parent==DEST and stale.exists() and digest(stale.read_bytes())==old['sha256']:stale.unlink()
        encoded=target.read_bytes()
        sources[name]=dict(file=filename,duration=duration,rms=rms,peak=peak,bytes=len(encoded),sha256=digest(encoded),sourceSha256=entry['sha256'])
        cue_role=role(name)
        catalog[name]=dict(file=filename,gain=1,gainPolicy='recorded-level',loop=cue_role in ('weapon-stream','enemy-chatter','gem-chatter','homing-flight','ambience','entrance-call'),duration=duration,role=cue_role,original=name,nativeLoudness=loudness.get(name))
    aliases={'football-goal':('highscore1','courtyard-goal'),'crew-countdown':('uiclick','crew-countdown')}
    for tier in range(1,5):
        aliases[f'seekrapid{tier}']=('daggerseek','weapon-homing-stream')
        aliases[f'weapon{tier}-homing']=('magentashot' if tier==4 else 'daggerseek','homing-launch')
    for name,(original,cue_role) in aliases.items():catalog[name]={**catalog[original],'role':cue_role}
    shutil.copyfile(SOURCE/'loudness.ini',DEST/'loudness.ini')
    (ROOT/'src/original-audio-manifest.json').write_text(json.dumps(catalog,indent=2)+'\n')
    (DEST/'manifest.json').write_text(json.dumps(dict(sourceHash=imported['sourceHash'],mixPolicy='recorded-level',nativeMixerFormulaVerified=False,files=sources,cues=catalog),indent=2)+'\n')
    print(f'Verified {len(sources)} originals; direct recorded-level catalog; no replacement-bank inputs')

if __name__=='__main__':
    main()
    subprocess.run(['python3',str(ROOT/'tools/build-original-hand-audio.py')],check=True)
