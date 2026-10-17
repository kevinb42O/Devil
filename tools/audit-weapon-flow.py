#!/usr/bin/env python3
"""Audit sustained files for loudness gaps and narrow rhythmic modulation.
These are regression checks, not a substitute for listening to the game mix.
"""
import json,pathlib
import numpy as np
from scipy.io import wavfile
from scipy.ndimage import uniform_filter1d,median_filter
from scipy.signal import butter,sosfilt,welch
root=pathlib.Path(__file__).resolve().parent.parent;report={}
for tier in range(1,8):
 for prefix in ['rapid','seekrapid']:
  name=f'{prefix}{tier}';sr,pcm=wavfile.read(root/f'public/assets/audio/remake/{name}.wav');x=pcm.astype(float)/32768
  mean=(x*x).mean(1);size=sr//20;n=len(mean)//size
  blocks=np.sqrt(mean[:n*size].reshape(n,size).mean(1))[4:-4]
  ratio=float(np.quantile(blocks,.95)/np.quantile(blocks,.05))
  # Listen-band envelope, sampled at 200 Hz. A clocked tatata/rotor creates a
  # narrow peak above the local modulation floor; broad random turbulence does not.
  band=sosfilt(butter(2,[700,4500],btype='bandpass',fs=sr,output='sos'),x.mean(1))
  envelope=np.sqrt(np.maximum(uniform_filter1d(band*band,size=sr//200,mode='wrap'),1e-12))[::sr//200]
  db=20*np.log10(envelope[40:-40]);f,p=welch(db-db.mean(),200,nperseg=512)
  local=median_filter(p,size=17,mode='nearest');mask=(f>=4)&(f<=45)
  ratios=p[mask]/np.maximum(local[mask],1e-12);at=np.argmax(ratios);spur=float(ratios[at])
  item={'duration':len(x)/sr,'envelope95to5':ratio,'maxRhythmicSpur':spur,'spurHz':float(f[mask][at])};report[name]=item
  assert ratio<1.32,(name,'loudness gaps',item)
  assert spur<8,(name,'clocked flutter',item)
(root/'artifacts/weapon-audio/flow-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'{len(report)} sustained fields: no loudness gaps or narrow clocked flutter; max envelope ratio {max(v["envelope95to5"] for v in report.values()):.3f}, max rhythmic spur {max(v["maxRhythmicSpur"] for v in report.values()):.2f}.')
