"""Lion-like final bellow lasting the complete tower descent, from recorded vocals."""
import numpy as np
from scipy.signal import butter,sosfilt,resample_poly
SOURCE='tower-beast-roar.mp3'
BREATH='Male 1 - Breathing - Gasping - Ehrlund M1.wav'
STONE='Crushed Rock - DROP - Thick - Mono.wav'
SOURCES=[SOURCE,BREATH,STONE]
NAMES=['killminisquid','killsquid','killultrasquid']

def build(recording,tier,duration,sr):
 n=round(duration*sr);t=np.arange(n)/sr
 def extract(name,start,length):
  x=recording(name).mean(axis=1)[round(start*sr):round((start+length)*sr)]
  return x.copy()
 def fit(x):return resample_poly(x,n,len(x))[:n]
 def band(x,lo,hi):return sosfilt(butter(2,[lo,hi],btype='bandpass',fs=sr,output='sos'),x)
 def unit(x):return x/max(np.sqrt(np.mean(x*x)),1e-9)
 # The small tower groans; the two larger towers use a strong bellow pitched
 # progressively lower by fitting longer/thicker gestures to the same descent.
 start,length=[(1.20,1.95),(4.49,1.82),(4.49,1.54)][tier-1]
 vocal=band(fit(extract(SOURCE,start,length)),55,4600 if tier==1 else 3900)
 # Keep the body present through the entire descent, then relinquish it to the
 # shared arena reverb. No repeated roars or abruptly chopped sample loops.
 vocal=unit(np.tanh(vocal*1.6))*(.95-.32*(t/duration)**1.4)
 breath=band(fit(extract(BREATH,.15,1.6)),180,3100)
 breath=unit(breath)*np.clip((t/duration-.55)/.25,0,1)*(1-t/duration)**.3
 stone=band(fit(extract(STONE,0,1.1)),45,550)
 stone=unit(stone)*np.exp(-t/.4)
 x=vocal*.18+breath*.017+stone*.016
 attack=np.minimum(1,t/.008);release=np.minimum(1,(duration-t)/.095)
 x*=attack*np.maximum(0,release)**1.5
 return x
