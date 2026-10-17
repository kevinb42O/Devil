#!/usr/bin/env python3
"""Seven supernatural hand weapons, designed from synthesis and organic textures.
The original game's files are reference analysis only: never read by this builder.
No rifle, firearm, mechanical-cocking, explosion or shotgun recording is used.
Run after build-remake-audio.py when rebuilding the complete bank.
"""
import hashlib,json,pathlib,warnings,wave,subprocess,tempfile,argparse
import numpy as np
from scipy.io import wavfile
from scipy.io.wavfile import WavFileWarning
from scipy.signal import butter,sosfilt,resample_poly,iirpeak,lfilter,welch
from scipy.ndimage import gaussian_filter1d,uniform_filter1d
warnings.filterwarnings('ignore',category=WavFileWarning)
ROOT=pathlib.Path(__file__).resolve().parent.parent;OUT=ROOT/'public/assets/audio/remake';P=ROOT/'assets/provenance/remake/audio';SR=48000
parser=argparse.ArgumentParser();parser.add_argument('--streams-only',action='store_true');args=parser.parse_args()
index={r['name']:r for r in json.loads((P/'pro/selected-sources.json').read_text())}
manifest=json.loads((OUT/'manifest.json').read_text());recipes=json.loads((P/'recipes.json').read_text());sources={r['file']:r for r in json.loads((P/'sources.json').read_text())};cache={};paths=set()
N={
 'wind':'SWSH_Swing 3 Large 03_DDUMAIS_NONE.wav',
 'skin':'Skin Peel 04.wav',
 'breath':'Male 1 - Breathing - Gasping - Ehrlund M1.wav',
 'organic':'Bluezone_BC0280_biohazard_creature_organic_texture_analog_002_02.wav',
 'spell':'MAGEvil_Dark Spell Dark Energy Attack_RogueWaves_DruidMagic.wav',
 'water':'Heavy Water Churning, Deep, Ocean Drones, Wind.wav',
 'beast':'Monster Within - Large Beast - Taunt2Stun03.wav',
 'insect':'Bluezone_BC0280_biohazard_atmos_organic_insect_ambience_001.wav',
 'leaf':'SWSH_Dry Bamboo Leaf Swishes 1_RogueWaves_DruidMagic.wav',
 'ice':'Bluezone_BC0278_ice_crack_break_002.wav',
 'lion':'primal-lion-designed.mp3',
 'lionfield':'primal-lion-field.mp3',
 'roar':'MonsterPack2_LargeMonster11_Roar03.wav',
 'snarl':'MonsterPack2_Monster06_Attack13.wav',
 'call':'MonsterPack2_Monster10_Call09.wav',
 'bear':'bear_pain_hurt_groan_01.wav',
 'banshee':'MR - Banshee Damage VO 07.wav',
 'hunter':'Monster Within - Hunter - Fley_Attack02.wav',
 'gibbon':'Gibbons_02.wav',
}
# Different excitation, throat resonances and turbulent gestures for each hand.
PROFILES=[
 ('CINDER','wind',193,[(147,2,.60),(266,3,.80)],.24,1.0),
 ('FERAL','skin',81,[(175,2,.48),(410,2,.22)],.20,.64),
 ('HEX','organic',48,[(715,3,.19),(1180,6,.27)],.28,.73),
 ('ABYSS','spell',61,[(350,2,.17),(1420,5,.23)],.31,.55),
 ('RIFT','breath',68,[(290,3,.27),(930,3,.28)],.32,.62),
 ('TYRANT','water',44,[(190,2,.39),(585,4,.23)],.23,.49),
 ('ECLIPSE','beast',53,[(735,5,.32),(1650,4,.17)],.34,.43),
]
def bp(x,lo,hi,order=2):return sosfilt(butter(order,[lo,hi],btype='bandpass',fs=SR,output='sos'),x)
def low(x,hz):return sosfilt(butter(2,hz,fs=SR,output='sos'),x)
def unit(x,rms=1):return x*(rms/max(1e-9,np.sqrt(np.mean(x*x))))
def smooth(rng,n,hz=12):return unit(low(rng.standard_normal(n),hz))
def edges(x,attack=.001,release=.06):
 x=x.copy();a=min(len(x)//2,int(attack*SR));b=min(len(x)//2,int(release*SR))
 if a:x[:a]*=np.sin(np.linspace(0,np.pi/2,a))**2
 if b:x[-b:]*=np.cos(np.linspace(0,np.pi/2,b))**2
 return x

def recording(key):
 name=N[key];row=index[name];paths.add(row['file']);sources[row['file']]=row
 if key not in cache:
  path=ROOT/row['file']
  if path.suffix.lower()!='.wav':
   with tempfile.TemporaryDirectory(prefix='primal-decode-') as temp:
    decoded=pathlib.Path(temp)/'source.wav'
    subprocess.run(['afconvert',str(path),str(decoded),'-f','WAVE','-d','LEI16@48000'],check=True,capture_output=True)
    hz,x=wavfile.read(decoded)
  else:hz,x=wavfile.read(path)
  denom=np.iinfo(x.dtype).max if np.issubdtype(x.dtype,np.integer) else 1;x=x.astype(float)/denom
  if x.ndim>1:x=x.mean(1)
  if hz!=SR:x=resample_poly(x,SR,hz)
  cache[key]=x-x.mean()
 return cache[key]
def texture(key,n,rate,rng):
 x=recording(key);x=resample_poly(x,1000,round(rate*1000));start=int(rng.uniform(0,max(1,len(x)-n)))
 if len(x)<n:x=np.tile(x,1+n//len(x))
 x=x[start:start+n]
 if len(x)<n:x=np.resize(x,n)
 return unit(bp(x,35,4500))

def throat(n,f0,formants,rng,burst=False):
 t=np.arange(n)/SR
 # Irregular glottal flow with pitch drift: a continuous tearing pressure, not
 # discrete muzzle reports. Recorded vocals carry the foreground articulation.
 wander=smooth(rng,n,9);flutter=smooth(rng,n,42)
 freq=f0*(1+.045*np.tanh(wander)+.013*flutter)
 if burst:freq*=1+.64*np.exp(-t/.038)-.24*(1-np.exp(-t/.25))
 phase=2*np.pi*np.cumsum(freq)/SR+rng.uniform(-np.pi,np.pi)
 core=np.sin(phase)+.44*np.sin(phase*1.367+wander*.3)+.32*np.sin(phase*.713+flutter*.06)+.19*np.sin(2*phase+.35)
 rough=bp(rng.standard_normal(n),70,1800)
 rough=unit(rough)*(.24+.16*np.sin(phase*.5)**2)
 core=core*(.82+.15*np.tanh(smooth(rng,n,24)))+rough*.12
 excitation=(.55*np.sin(phase)+.19*np.sin(3*phase)+unit(bp(rng.standard_normal(n),100,5000))*.32)
 mouth=np.zeros(n)
 for hz,q,gain in formants:
  b,a=iirpeak(hz,q,fs=SR);mouth+=unit(lfilter(b,a,excitation))*gain
 return unit(low(core,480)),unit(mouth)

def shear(n,rng,level):
 # A dispersive air tear: moving spectral folds, no gun recording or hit sample.
 t=np.arange(n)/SR;noise=rng.standard_normal(n)
 dark=unit(bp(noise,180,1400));bright=unit(bp(noise,1300,5800))
 angle=2*np.pi*(240*t+1800*.048*(1-np.exp(-t/.048)))
 fold=(.65+.35*np.sin(angle))
 return (dark*.7+bright*(.22+level*.018))*fold

def diffuse(x,rng,amount=.15):
 # Dense, dark early reflections, below the dry gesture. No audible slap / echo.
 out=x.copy()
 for delay,gain in [(.013,.29),(.019,-.22),(.031,.18),(.047,.14),(.061,-.11),(.083,.08)]:
  at=int(delay*SR);out[at:]+=low(x[:-at],2300)*gain*amount
 return out

# Lead / chest double / scream for each hand. Rates preserve intelligible animal
# formants; the previous .4x texture layer buried the voice in the sub-bass.
VOCALS=[
 ('lion','hunter','gibbon',1.04,.78,.92),
 ('bear','lionfield','snarl',.94,.85,1.04),
 ('hunter','roar','banshee',1.08,.81,.90),
 ('roar','lion','banshee',.92,.78,.80),
 ('lionfield','hunter','gibbon',.94,.82,.86),
 ('beast','bear','call',.86,.77,.94),
 ('lion','beast','banshee',.88,.76,.83),
]
vocal_cache={}
def prepared_vocal(key,take,rate):
 # Keep a whole vocal gesture. Explicit lion boundaries exclude field ambience
 # and neighbouring calls, while the smaller studio files are individual takes.
 recording(key) # Record provenance even when the decoded articulation is cached.
 cache_key=(key,take%4,round(rate,4))
 if cache_key in vocal_cache:return vocal_cache[cache_key]
 raw=cache[key].copy()
 if key=='lion':
  start=[11.18,4.90,8.35,11.28][take%4];raw=raw[int(start*SR):int((start+1.24)*SR)]
 elif key=='lionfield':
  start=[16.94,12.08,14.57,18.65][take%4];raw=raw[int(start*SR):int((start+1.15)*SR)]
 elif key=='gibbon':
  start=[1.25,2.15,3.25,4.1][take%4];raw=raw[int(start*SR):int((start+1.3)*SR)]
 else:
  active=np.flatnonzero(abs(raw)>abs(raw).max()*.07)
  if len(active):raw=raw[max(0,int(active[0])-round(.007*SR)):]
 if key in ('water','organic','spell','wind','skin','breath'):raw=raw[:int(2.2*SR)]
 raw=resample_poly(raw,1000,round(rate*1000))
 # Gentle expansion removes room tone without clipping natural consonants.
 env=np.sqrt(np.maximum(0,low(raw*raw,35)));floor=max(env.max()*.055,1e-8)
 raw*=np.minimum(1,env/floor)
 raw=bp(raw,100,7600)
 # Carve the boxy low middle, bring the teeth and the open mouth forward.
 raw=raw-low(raw,280)*.24+bp(raw,700,3400)*.85
 raw=unit(raw,.7)
 # Oversampled parallel saturation keeps a close, grainy throat without alias fizz.
 over=resample_poly(raw,2,1);over=.58*over+.42*np.tanh(over*1.65)/1.3
 raw=resample_poly(over,1,2)[:len(raw)]
 # De-ess only the loudest high-band spikes; retain the scream's presence.
 teeth=bp(raw,3800,7600);e=np.sqrt(np.maximum(0,low(teeth*teeth,55)))
 control=np.minimum(1,.32/np.maximum(e,1e-6));raw=raw-teeth+teeth*control
 raw=edges(raw,.0015,.055);raw=unit(raw)
 vocal_cache[cache_key]=raw
 return raw

def vocal_hit(key,n,rate,take,depth=False):
 raw=prepared_vocal(key,take,rate)
 # Start on the opening bite of the roar, not its breath/silence. The roar then
 # blooms naturally behind the immediate dry throat impulse.
 window=min(len(raw),int(.36*SR));block=240
 energy=np.sqrt(np.mean(np.pad(raw[:window],(0,(-window)%block)).reshape(-1,block)**2,1))
 crossings=np.flatnonzero(energy>energy.max()*.32)
 start=max(0,int(crossings[0])*block-48) if len(crossings) else 0
 raw=raw[start:];x=np.zeros(n);m=min(n,len(raw));x[:m]=raw[:m]
 t=np.arange(n)/SR
 envelope=(1-np.exp(-t/.0015))*np.exp(-t/(.38 if depth else .47))
 x*=envelope
 return edges(x,.0008,.08)

spectral_cache={}
def vocal_flow(key,n,rate,take,rng):
 # A continuous time-domain stochastic field. There are no grain hops, frame
 # resets, glottal pulses, sample articulations or rhythmic amplitude controls.
 # Recordings supply a broad spectral envelope only, stripped of harmonic combs.
 bank_key=(key,round(rate,4))
 recording(key)
 if bank_key not in spectral_cache:
  envelopes=[]
  for source_take in range(4):
   raw=prepared_vocal(key,source_take,rate)
   f,power=welch(raw,SR,nperseg=4096)
   envelope=np.exp(gaussian_filter1d(np.log(np.maximum(power,1e-14)),6))
   envelopes.append(envelope)
  spectral_cache[bank_key]=(f,envelopes)
 f,envelopes=spectral_cache[bank_key];freq=np.fft.rfftfreq(n,1/SR)
 fields=[]
 for index in [take%4,(take+2)%4]:
  envelope=np.sqrt(np.interp(freq,f,envelopes[index]))
  noise=np.fft.rfft(rng.standard_normal(n));noise*=envelope
  field=np.fft.irfft(noise,n=n);fields.append(unit(bp(field,100,6500)))
 # Equal-power blending changes colour slowly without opening/closing a gate.
 blend=.5+.16*np.tanh(smooth(rng,n,.16))
 return unit(fields[0]*np.sqrt(1-blend)+fields[1]*np.sqrt(blend))

def gesture(level,n,rng,mode,side=0):
 name,key,f0,formants,air,speed=PROFILES[level-1];t=np.arange(n)/SR
 f0=(f0 if mode=='stream' else [73,66,49,62,57,44,52][level-1])*(1+side*.032)
 if mode=='stream':
  lead,chest,scream,lr,cr,sr=VOCALS[level-1]
  if side>0 and level>=5:lead,chest=chest,lead;lr,cr=cr,lr
  take=int(rng.integers(0,4))
  organic=vocal_flow(key,n,speed*(1+side*.035),take,rng)
  growl=vocal_flow(lead,n,lr,take,rng)
  double=vocal_flow(chest,n,cr,take+1,rng)
  air=vocal_flow(scream,n,sr,take+2,rng)
  lo,hi=[(75,330),(60,270),(55,240),(45,230),(55,300),(45,210),(50,260)][level-1]
  pressure=unit(bp(rng.standard_normal(n),lo,hi))
  x=pressure*.40+growl*.48+double*.27+organic*.13+bp(air,700,4200)*.11
  # Leave the localization band to enemies. Soft air above it supplies detail
  # without a constant harsh scream directly in the listener's ears.
  freq=np.fft.rfftfreq(n,1/SR)
  presence=1-.48*np.exp(-.5*(np.log(np.maximum(freq,1)/2300)/.58)**2)
  softness=1/(1+(freq/6500)**4)
  x=np.fft.irfft(np.fft.rfft(x)*presence*softness,n=n)
 else:
  body,mouth=throat(n,f0,formants,rng,True)
  organic=texture(key,n,speed*(1+side*.035),rng)
  # Heavy expulsion: attack, resonant rip, then a continuous decaying exhalation.
  # Its ~1 second tail is essential to the original reference's satisfying body.
  attack=1-np.exp(-t/.0018)
  pressure=attack*(.65*np.exp(-t/.19)+.35*np.exp(-t/.48))
  if level==1:pressure=attack*(.62*np.exp(-t/.21)+.38*np.exp(-t/.45))
  rip=attack*np.exp(-t/(.19 if mode=='shot' else .25))
  breath=attack*(t/.035)*np.exp(-t/.074)
  x=body*pressure*.97+mouth*rip*[.16,.18,.63,.46,.49,.41,.68][level-1]
  x+=shear(n,rng,level)*breath*(.38 if level<=2 else .31)
  x+=organic*attack*np.exp(-t/.24)*.16
  if mode=='homing':
   # Homing is an airy, serrated hiss rather than the regular bass expulsion.
   x=x*.38+unit(bp(organic,1500,7400))*rip*.30+shear(n,rng,level)*rip*.17
  # Saturation before the tail preserves the low pressure rather than turning
  # the entire sound into a flat distorted blast.
  x=np.tanh(x*1.8)*.57+x*.23
  lead,chest,scream,lr,cr,sr=VOCALS[level-1]
  if side>0 and level>=5:lead,chest=chest,lead;lr,cr=cr,lr
  take=int(rng.integers(0,4))
  roar=vocal_hit(lead,n,lr,take)
  double=vocal_hit(chest,n,cr,take+1,True)
  cry=vocal_hit(scream,n,sr,take+2)
  # A layered open-jaw attack, body, answering scream and dissipating breath.
  # Vocals dominate the perceived identity; pressure only supplies physical mass.
  x=x*.43+roar*1.10+double*.49+bp(cry,700,6000)*(.34 if mode=='shot' else .52)
  if level in (3,4):x+=body*pressure*.62
  bite=vocal_hit('snarl' if level%2 else 'hunter',n,1.28,take)
  x+=bp(bite,1000,6500)*np.exp(-t/.045)*.30
  x=diffuse(x,rng,.37)
 return bp(x,32,9200)

def stereo(level,duration,mode,take=0):
 n=round(duration*SR);seed=17031+level*1009+take*131+{'stream':0,'shot':170,'homing':370}[mode]
 left=gesture(level,n,np.random.default_rng(seed),mode,-1 if level>=5 else 0)
 if level>=5:
  right=gesture(level,n,np.random.default_rng(seed+77),mode,1)
  # Centre the weight while separating left/right throat and air.
  bass=low((left+right)*.5,180)
  left=left-low(left,180)+bass;right=right-low(right,180)+bass
 else:
  # Narrow spectral diffusion at the edges, a solid central attack and body.
  side=bp(left,700,6000);offset=round((.0011+level*.00013)*SR)
  spread=np.roll(side,offset)*.08
  right=left-spread;left=left+spread
 return np.column_stack((left,right))

report={}
def write(name,x,role,gain,loop=False):
 if loop:
  # Crossfade the whole excitation state over 100 ms, before normalization.
  k=4800;w=np.linspace(0,1,k)[:,None];x=np.concatenate((x[-k:]*(1-w)+x[:k]*w,x[k:-k]))
 else:x=np.column_stack([edges(x[:,ch],.0005,.09) for ch in range(2)])
 x-=x.mean(0);target=.18 if loop else .13 if role in ('weapon-burst','homing-launch') else .14
 # Bring sparse vocal transients under control before the final loudness trim.
 # Otherwise one scream spike turns down the entire eight-second stream.
 x*=target/max(np.sqrt(np.mean(x*x)),1e-9)
 shaped=[]
 for ch in range(2):
  over=resample_poly(x[:,ch],2,1)
  shaped.append(resample_poly(.78*np.tanh(over/.78),1,2)[:len(x)])
 x=np.column_stack(shaped)
 if loop:
  # Stereo-linked flow leveling: remove breath-sized dips/bumps while preserving
  # the continuously changing spectral detail. Wrapped windows preserve seams.
  energy=uniform_filter1d(np.mean(x*x,axis=1),size=2400,mode='wrap')
  correction=np.clip(np.sqrt(np.median(energy)/np.maximum(energy,1e-12)),.72,1.40)
  correction=uniform_filter1d(correction,size=480,mode='wrap')
  x*=correction[:,None]
 x*=min(.9/max(abs(x).max(),1e-9),target/max(np.sqrt(np.mean(x*x)),1e-9))
 dest=OUT/(name+'.wav')
 with wave.open(str(dest),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(np.round(x*32767).astype('<i2').tobytes())
 manifest[name]=dict(file=dest.name,gain=gain,loop=loop,duration=round(len(x)/SR,6),role=role,bytes=dest.stat().st_size,sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),peak=round(float(abs(x).max()),6),rms=round(float(np.sqrt(np.mean(x*x))),6),license='Sonniss-GDC-2026-08-27')
 design=('continuous stochastic pressure and broad vocal colour; no grains, glottal pulses, phrase envelopes or frame-rate modulation; slow equal-power colour morphs, reduced localization-band energy and level control' if loop else 'foreground animal roar, chest double, scream, dry snarl attack and original pressure synthesis')
 recipes[name]={'sources':sorted(paths),'changes':f'{identity}: {design}; oversampled mastering, presence shaping and short diffusion. No firearm/explosion/weapon recording. Source recordings are not Devil Daggers samples. Take {take_id}.'}
 f,p=welch(x.mean(1),SR,nperseg=4096);energy=np.cumsum(np.mean(x*x,axis=1));energy/=energy[-1]
 report[name]={'peak':manifest[name]['peak'],'rms':manifest[name]['rms'],'duration':manifest[name]['duration'],'lowEnergy':round(float(sum(p[f<500])/sum(p)),4),'medianHz':round(float(f[np.searchsorted(np.cumsum(p)/sum(p),.5)])),'presenceEnergy':round(float(sum(p[(f>=500)&(f<5000)])/sum(p)),4),'energyTimes':[round(float(np.searchsorted(energy,v)/SR),4) for v in [.1,.5,.9,.99]]}
for level,profile in enumerate(PROFILES,1):
 identity=profile[0];paths=set()
 if not args.streams_only:
  for take_id in range(5 if level==4 else 4):write(f'shot{level}alt{take_id+1}',stereo(level,1.22,'shot',take_id+1),'weapon-burst',.66)
  take_id=0;write(f'shot{level}',stereo(level,1.22,'shot'),'weapon-burst',.66)
 take_id=0
 stream=stereo(level,24.2,'stream');write(f'rapid{level}',stream,'weapon-stream',.39,True)
 # The homing flow is the same hand breathing through a bright, spectral edge.
 seek=stream*.67
 for ch in range(2):seek[:,ch]+=unit(bp(stream[:,ch],1100,6500))*.105
 write(f'seekrapid{level}',seek,'weapon-homing-stream',.32,True)
 if not args.streams_only:
  start=stereo(level,.15,'shot',4);start*=np.exp(-np.arange(len(start))/SR/.025)[:,None]
  write(f'weapon{level}-start',start,'weapon-start',.19)
  tail=stereo(level,.38,'homing',5);tail*=np.linspace(.45,0,len(tail))[:,None]
  write(f'weapon{level}-stop',tail,'weapon-release',.13)
  write(f'weapon{level}-homing',stereo(level,1.22,'homing',2),'homing-launch',.48)
# Merge at commit time so unrelated audio edits made during generation survive.
current=json.loads((OUT/'manifest.json').read_text());current.update({n:manifest[n] for n in report});manifest=current
# Weapon loudness is deliberately below spatial threat feedback.
weapon_gains={'weapon-stream':.07,'weapon-homing-stream':.06,'weapon-burst':.36,'weapon-start':.09,'weapon-release':.06,'homing-launch':.27}
for item in manifest.values():
 if item['role'] in weapon_gains:item['gain']=weapon_gains[item['role']]
current_recipes=json.loads((P/'recipes.json').read_text());current_recipes.update({n:recipes[n] for n in report});recipes=current_recipes
current_sources={r['file']:r for r in json.loads((P/'sources.json').read_text())};current_sources.update(sources);sources=current_sources
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(ROOT/'src/remake-audio-manifest.json').write_text(json.dumps({n:{k:v[k] for k in ['file','gain','loop','duration','role']} for n,v in manifest.items()},indent=2)+'\n')
(P/'recipes.json').write_text(json.dumps(recipes,indent=2)+'\n');(P/'sources.json').write_text(json.dumps(list(sources.values()),indent=2)+'\n')
a=ROOT/'artifacts/weapon-audio';a.mkdir(parents=True,exist_ok=True);(a/'analysis.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'Rebuilt {len(report)} supernatural cues. No firearm samples. Original reference audio is not part of generation.')
for level in range(1,8):print(level,report[f'rapid{level}'])
