"""Recorded creature chatter: intact gestures, irregular phrasing, dry mono space.
All source recordings in this bank are CC0; source cuts are seconds in originals.
"""
import numpy as np
from scipy.signal import butter,sosfilt,resample_poly
SR=48000
# primary, original cut boundaries, playback rate, loop length, passband, gain, identity
PROFILES={
 'chatterskull':('insectoid',[(.18,1.42),(2.1,1.35),(3.4,.96)],1.04,7.13,350,8200,.28,'close brittle jaw chatter'),
 'chatterskull2':('rodent',[(6.05,1.12),(7.7,.68),(9.25,.85),(10.55,1.1)],.83,8.39,230,7600,.31,'nasal rasp and agitated teeth'),
 'chatterskull3':('snarls',[(.08,1.18),(3.35,.93),(6.75,.93)],1.15,7.61,200,7200,.33,'serrated breathy skull snarl'),
 'chatterskull4':('snarls',[(10.57,1.25),(12.58,1.38),(16.42,1.24)],.74,10.31,100,6500,.37,'large hollow rasping throat'),
 'chatterskullblack':('insectoid',[(2.08,1.25),(.2,1.36),(3.4,1.02)],1.23,6.79,550,9000,.29,'frantic narrow mandible chatter'),
 'chatterskull2black':('rodent',[(10.5,1.2),(9.24,.86),(6.03,1.18)],1.04,7.87,330,8500,.32,'strangled high nasal chitter'),
 'chatterskull3black':('snarls',[(8.72,1.03),(5.13,.95),(14.23,1.5)],.93,8.93,160,7800,.35,'broken throaty hiss and rasp'),
 'chatterskull4black':('snarls',[(14.22,1.5),(1.57,1.35),(10.57,1.25)],.62,11.17,85,6100,.39,'deep choking jaw growl'),
 'chatterminisquid':('gurgles',[(.93,1.76),(5.37,1.42),(9.82,2.3)],1.03,8.57,180,5800,.32,'small wet hollow throat'),
 'chattersquid':('gurgles',[(14.57,3.88),(25.97,1.65),(30.62,2.6)],.82,12.43,100,5300,.38,'resonant bubbling squid cavity'),
 'chattersquidultra':('gurgles',[(37.0,4.18),(52.5,4.05)],.64,15.37,65,4700,.43,'enormous slow submerged throat'),
 'chatterspider':('insectoid',[(.18,1.42),(2.08,1.3),(3.4,.99)],.87,8.11,300,8800,.32,'dry close mandible flex and leg chatter'),
 'chattergigaspider':('teeth-fast',[(.08,1.32),(1.45,1.23),(2.72,1.3)],.63,9.47,130,7000,.38,'heavy hollow carapace ratchet'),
 'chatterspiderling':('insectoid',[(3.38,1.02),(.18,1.35),(2.1,1.27)],1.46,5.83,850,10500,.24,'tiny fast scuttling mouth clicks'),
 'chattercentipede':('teeth',[(.15,2.5),(3.05,2.6),(6.05,2.8)],1.08,10.67,250,8500,.35,'rolling articulated bone rattle'),
 'chattercentipede2':('teeth-fast',[(.1,1.75),(2.0,1.9),(.65,2.4)],.72,12.17,95,6600,.40,'heavy grinding segmented carapace'),
 'chatterultrapede':('insectoid',[(.17,1.44),(2.08,1.35),(3.38,1.04)],.68,10.97,210,8000,.38,'rasping spectral mandible shiver'),
 'chatterleviathan':('snarls',[(12.56,1.4),(14.22,1.5),(16.42,1.25),(1.55,1.4)],.48,15.83,55,5400,.46,'vast chesty rasping leviathan breath'),
 'eyearousedrone':('gurgles',[(44.85,4.85),(52.45,4.1)],1.18,9.79,250,7200,.33,'restless wet searching mutter'),
 'eyepacifydrone':('gurgles',[(30.6,2.65),(25.95,1.7)],.93,7.43,160,4700,.25,'subdued wounded wet throat'),
 'chatterthorn':('snarls',[(5.12,.99),(6.7,.98),(8.7,1.1)],1.35,6.53,600,9400,.30,'thorny dry tearing exhalations'),
 'eggdrone':('idle',[(.78,.9),(2.1,.48)],1.13,5.47,320,4900,.21,'restrained living shell breath'),
 'eggdrone2':('gurgles',[(1.92,.85),(5.35,1.4),(26.0,1.6)],1.1,6.97,180,4600,.25,'swollen wet shell stirring'),
 'subchattercentipede':('teeth',[(3,2.8),(6,2.9),(.12,2.6)],.85,12.79,65,1700,.22,'subterranean muffled bone rattle'),
}

def render(name,recording):
 primary,cuts,rate,duration,low,high,gain,identity=PROFILES[name]
 seed=sum((i+1)*ord(c) for i,c in enumerate(name));rng=np.random.default_rng(seed)
 x=np.zeros(round(duration*SR));sources=[];events=[]
 def take(source,start,length,speed):
  key='chatter-'+source;sources.append(key);a=recording(key).mean(axis=1)[round(start*SR):round((start+length)*SR)].copy()
  a=resample_poly(a,1000,round(speed*1000));a-=a.mean()
  # Remove room rumble before gain; preserve the recording's internal envelope.
  a=sosfilt(butter(2,[low,min(high,19000)],btype='bandpass',fs=SR,output='sos'),a)
  a*=min(.13/max(np.sqrt(np.mean(a*a)),1e-9),.68/max(np.max(abs(a)),1e-9))
  n=min(384,len(a)//4);a[:n]*=np.linspace(0,1,n);a[-n:]*=np.linspace(1,0,n)
  return a
 # Distribute full performances with unequal rests. Each phrase is a different
 # cut, retaining microtiming; no fixed pulse train or repeated 320 ms grains.
 lengths=[length/rate for _,length in cuts];rests=rng.uniform(.25,1.0,len(cuts));rests*=max(.1,duration-sum(lengths))/sum(rests)
 at=0
 for i,(start,length) in enumerate(cuts):
  a=take(primary,start,length,rate);offset=round(at*SR);n=min(len(a),len(x)-offset)
  x[offset:offset+n]+=a[:n]*(1 if i==0 else rng.uniform(.80,1.0));events.append(round(at,5));at+=len(a)/SR+rests[i]
 # Low-level, independent physical articulation bridges the short rests. Bone
 # and tongue recordings supply real transients, never outdoor insect ambience.
 secondary='tongue' if primary in ['gurgles','snarls','idle'] else 'teeth'
 for start,offset,length in [(1.0,0,2.1),(4.0,duration*.37,2.35),(7.0,duration*.72,2.15)]:
  a=take(secondary,start,length,rate*.93);offset=round(offset*SR)
  # Fold the last tail into the next cycle; a loop carries its own decay.
  np.add.at(x,(np.arange(len(a))+offset)%len(x),a*.13)
 # Gentle parallel saturation adds throat density while keeping click attacks.
 x=.55*x+.45*np.tanh(x*7)/7
 n=round(.006*SR);x[:n]*=np.linspace(0,1,n);x[-n:]*=np.linspace(1,0,n)
 return x,gain,dict(identity=identity,articulationSeconds=events,rate=rate,spectralWindowHz=[low,high],addedReverb=False,primarySource='chatter-'+primary,sourceCutsSeconds=cuts,phrasing='Intact recorded gestures and unequal natural rests; independent low mouth/bone layer; no periodic grain sequencing.',sources=list(dict.fromkeys(sources)))
