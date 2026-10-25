"""Layer original hand pairs 1+2, 2+3 and 3+4 for hands/upgrades 5, 6 and 7."""
import hashlib
import json
from pathlib import Path
import subprocess
import wave
import numpy as np

ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'assets/original/devil-daggers/audio'
DEST=ROOT/'public/assets/audio/original'

def read(name):
    with wave.open(str(SOURCE/(name+'.wav'))) as w:
        assert w.getframerate()==44100 and w.getnchannels()==2 and w.getsampwidth()==2
        return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2).astype(np.float64)/32768

def build():
    catalog=json.loads((ROOT/'src/original-audio-manifest.json').read_text())
    shipped=json.loads((DEST/'manifest.json').read_text())
    composites={}
    def layer(name,pair,loop=False):
        sources=[read(n) for n in pair]
        if loop:
            # Original streams span nominal eight-second phrases. Correct the
            # sub-percent export-length differences so the combined loop never
            # drifts or cuts one layer mid-phrase; retain the full 64s tier-4 take.
            aligned=[]
            for samples in sources:
                frames=round(len(samples)/44100/8)*8*44100
                phase=np.linspace(0,len(samples)-1,frames)
                take=np.column_stack([np.interp(phase,np.arange(len(samples)),samples[:,c]) for c in range(2)])
                # Smooth the loop join into the opening without adding silence.
                fade=441;weight=np.linspace(0,1,fade)[:,None]
                weight=weight*weight*(3-2*weight)
                take[-fade:]=take[-fade:]*(1-weight)+take[0]*weight
                aligned.append(take)
            frames=max(len(take) for take in aligned)
            sources=[np.tile(take,(frames//len(take),1)) for take in aligned]
        else:
            frames=max(len(take) for take in sources)
            sources=[np.pad(take,((0,frames-len(take)),(0,0))) for take in sources]
        # Preserve each original's own recorded level. The arithmetic mean
        # preserves the relative layer balance and cannot exceed the inputs'
        # peak ceiling. No RMS targets, per-hand boosts, or studio-bank gains.
        mixed=(sources[0]+sources[1])*.5
        pcm=np.round(mixed*32767).astype('<i2')
        filename=f'hand-{name}.wav';path=DEST/filename
        with wave.open(str(path),'wb') as w:
            w.setnchannels(2);w.setsampwidth(2);w.setframerate(44100);w.writeframes(pcm.tobytes())
        # Long loops/tails use the same browser-compatible encoding as originals.
        if frames/44100>10:
            filename=f'hand-{name}.m4a';encoded=DEST/filename
            if encoded.exists():encoded.unlink()
            subprocess.run(['/usr/bin/afconvert','-f','m4af','-d','aac','-b','160000',str(path),str(encoded)],check=True)
            path.unlink();path=encoded
        rms=float(np.sqrt(np.mean(mixed*mixed)));peak=float(np.max(np.abs(mixed)))
        cue_role='weapon-stream' if name.startswith('rapid') else 'upgrade' if name.startswith('levelup') else 'homing-launch' if name.startswith('weapon') else 'weapon-burst'
        catalog[name]=dict(file=filename,gain=1,gainPolicy='recorded-level-composite',duration=frames/44100,loop=loop,role=cue_role,layers=pair,layerWeights=[.5,.5])
        data=path.read_bytes();composites[name]=dict(file=filename,layers=pair,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),rms=rms,peak=peak,duration=frames/44100)
    for tier,(first,second) in {5:(1,2),6:(2,3),7:(3,4)}.items():
        layer(f'rapid{tier}',[f'rapid{first}',f'rapid{second}'],True)
        catalog[f'seekrapid{tier}']={**catalog[f'rapid{tier}'],'role':'weapon-homing-stream'}
        for variant in range(5):
            name=f'shot{tier}'+(f'alt{variant}' if variant else '')
            def shot(t):
                return f'shot{t}alt{variant or 1}' if t>=3 else f'shot{t}'
            layer(name,[shot(first),shot(second)])
        layer(f'weapon{tier}-homing',['magentashot' if t==4 else 'daggerseek' for t in (first,second)])
        layer(f'levelup{tier}',['leveldown' if first==1 else f'levelup{first}',f'levelup{second}'])
    shipped['composites']=composites;shipped['cues']=catalog
    (DEST/'manifest.json').write_text(json.dumps(shipped,indent=2)+'\n')
    (ROOT/'src/original-audio-manifest.json').write_text(json.dumps(catalog,indent=2)+'\n')
    print('Built 24 original layered stream, burst and upgrade recordings for hands 5–7')

if __name__=='__main__':build()
