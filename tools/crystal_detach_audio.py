"""Recorded crystal release: sharp separation, fine shards, restrained resonance.
Sources are the selected 96kHz SKYES glass and 192kHz Raconteur crystal masters.
No synthesized notes, noise, or random runtime pitch changes.
"""
import numpy as np
from scipy.signal import butter, sosfilt, resample_poly, iirpeak, lfilter

BREAK='Window,Small,Break,Medium Impact,Large Amount of Clinking Pieces.wav'
CRACK='Window,Small,Crack,Medium Impact,Bright.wav'
SHARDS='Glass,Shards,Smash,Medium Impact,Lots of Large Shards.wav'
CRYSTAL='Crystal, Glass, Tall Narrow, Tone, Rubbing, Musical_01.wav'
SOURCES=[BREAK,CRACK,SHARDS,CRYSTAL]

def build(recording,take,sr):
 def cut(name,start,length,rate=1):
  x=recording(name).mean(axis=1)[round(start*sr):round((start+length)*sr)].copy()
  if rate!=1:x=resample_poly(x,1000,round(rate*1000))
  x-=x.mean();return x
 def band(x,low,high):return sosfilt(butter(2,[low,high],btype='bandpass',fs=sr,output='sos'),x)
 def level(x,rms):return x*(rms/max(np.sqrt(np.mean(x*x)),1e-9))
 def envelope(x,decay,attack=.002):
  t=np.arange(len(x))/sr;x=x*np.minimum(1,t/attack)*np.exp(-t/decay)
  n=min(round(.04*sr),len(x));x[-n:]*=np.linspace(1,0,n);return x
 # Different real shard articulations, one consistent resonant identity.
 speed=[1.02,1.07,.98][take]
 fracture=band(cut(BREAK,.006,.86,speed),480,11200)
 # Ease the abrasive presence band without removing fine high-frequency detail.
 b,a=iirpeak(3800,1.1,fs=sr);fracture-=lfilter(b,a,fracture)*.38
 fracture=level(envelope(fracture,.32),.105)
 snap=level(envelope(band(cut(CRACK,.002,.105,speed),900,10500),.038,.0007),.055)
 shards=band(cut(SHARDS,[.24,.47,.12][take],.46,[1.22,1.16,1.28][take]),1900,11500)
 shards=level(envelope(shards,.16,.004),.026)
 # A real crystal glass gently rings after the fracture, with no rising jingle.
 resonance=band(cut(CRYSTAL,2.2,1.5,1.25),700,6500)
 resonance=level(envelope(resonance,.26,.006),.021)
 out=np.zeros(round(1.48*sr))
 for layer,delay in [(fracture,0),(snap,0),(shards,.034),(resonance,.014)]:
  at=round(delay*sr);length=min(len(layer),len(out)-at);out[at:at+length]+=layer[:length]
 # The shared runtime arena return supplies space after this directional gesture.
 return out
