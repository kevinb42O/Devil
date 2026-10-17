#!/usr/bin/env python3
"""Build the studio horror bank from selected professional recordings.
No bulk downloads. Originals stay private; ship edited cues only in the game.
Python + NumPy + SciPy + macOS afconvert. --check verifies the complete bank.
"""
import argparse,hashlib,json,pathlib,re,subprocess,tempfile,wave,warnings
import numpy as np
from tower_death_audio import build as build_tower_death, SOURCES as TOWER_DEATH_SOURCES, NAMES as TOWER_DEATH_NAMES
from crystal_detach_audio import build as build_crystal_detach, SOURCES as CRYSTAL_DETACH_SOURCES
from chatter_design import PROFILES as CHATTER_PROFILES, render as render_chatter
from emergence_audio import PROFILES as EMERGENCE_PROFILES,TARGET_RMS as EMERGENCE_RMS,build as build_emergence
from scipy.io import wavfile
from scipy.io.wavfile import WavFileWarning
from scipy.signal import resample_poly,butter,sosfilt,find_peaks,fftconvolve
warnings.filterwarnings('ignore',category=WavFileWarning)
ROOT=pathlib.Path(__file__).resolve().parent.parent;OUT=ROOT/'public/assets/audio/remake';P=ROOT/'assets/provenance/remake/audio'
SR=48000;LICENSE='Sonniss-GDC-2026-08-27'
args=argparse.ArgumentParser();args.add_argument('--check',action='store_true');args.add_argument('--only',choices=['combat-hands','movement','gems','gem-hits','gem-breaks','tower-deaths','pickups','upgrades','emergences','chatter']);args=args.parse_args()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
if args.check:
 manifest=json.loads((OUT/'manifest.json').read_text())
 for name,item in manifest.items():assert sha(OUT/item['file'])==item['sha256'],name
 sources=json.loads((P/'sources.json').read_text())
 for item in sources:assert sha(ROOT/item['file'])==item['sha256'],item['file']
 print(f'Verified {len(manifest)} studio cues/tracks and {len(sources)} source files.');raise SystemExit
index={i['name']:i for i in [*json.loads((P/'pro/selected-sources.json').read_text()),*json.loads((P/'chatter/sources.json').read_text())]}
cache={};used={};recipes={};manifest={};temp=tempfile.TemporaryDirectory(prefix='studio-audio-')
if args.only:
 manifest=json.loads((OUT/'manifest.json').read_text());recipes=json.loads((P/'recipes.json').read_text())
 used={row['file']:row for row in json.loads((P/'sources.json').read_text())}
def recording(name):
 if name not in cache:
  row=index[name];p=ROOT/row['file']
  if p.suffix=='.mp3':
   decoded=pathlib.Path(temp.name)/(name+'.wav');subprocess.run(['afconvert','-f','WAVE','-d','LEI16',str(p),str(decoded)],check=True);p=decoded
  hz,x=wavfile.read(str(p));x=x.astype(float)/2147483648 if x.dtype==np.int32 else x.astype(float)/32768
  if x.ndim==1:x=x[:,None]
  if hz!=SR:x=resample_poly(x,SR,hz,axis=0)
  x-=x.mean(axis=0);cache[name]=x;used[row['file']]=row
 return cache[name]
def fade(x,seconds=.008):
 x=x.copy();n=min(round(SR*seconds),len(x)//3)
 if n:x[:n]*=np.linspace(0,1,n)[:,None] if x.ndim==2 else np.linspace(0,1,n);x[-n:]*=np.linspace(1,0,n)[:,None] if x.ndim==2 else np.linspace(1,0,n)
 return x
def clip(name,length=1.2,pick=0,rate=1):
 # Extract a real articulation from multi-take recordings; preserve its attack.
 x=recording(name).mean(axis=1);frame=480;energy=np.sqrt(np.mean(np.pad(x,(0,(-len(x))%frame)).reshape(-1,frame)**2,axis=1))
 peaks,_=find_peaks(energy,distance=30,prominence=max(.001,float(energy.max())*.12))
 if len(peaks):begin=max(0,int(peaks[pick%len(peaks)])*frame-int(.04*SR))
 else:
  active=np.flatnonzero(abs(x)>max(.001,float(np.max(abs(x)))*.012));begin=max(0,int(active[0]) - 240) if len(active) else 0
 end=min(len(x),begin+round(length*SR));x=x[begin:end].copy()
 if rate!=1:x=resample_poly(x,1000,round(rate*1000))
 return fade(x)
def mix(*layers):
 out=np.zeros(max((round(t*SR)+len(x) for x,t,g in layers),default=1))
 for x,t,g in layers:
  at=round(t*SR);out[at:at+len(x)]+=x*g
 return out
def articulation(name,start,duration,rate=1):
 # Explicit take boundaries: a burst recording must never bring its next shot
 # into a single-trigger cue. Keep attack and decay within this one articulation.
 x=recording(name).mean(axis=1)[round(start*SR):round((start+duration)*SR)].copy()
 if rate!=1:x=resample_poly(x,1000,round(rate*1000))
 active=np.flatnonzero(abs(x)>max(.0001,float(np.max(abs(x)))*.008))
 if len(active):x=x[max(0,int(active[0])-48):]
 n=min(round(.035*SR),len(x)//3);x[-n:]*=np.linspace(1,0,n)
 return fade(x,.001)
def bed(name,duration=6,pick=0):
 x=recording(name).mean(axis=1);length=round(duration*SR)
 if len(x)>length:
  at=min(len(x)-length,int(len(x)*(.15+.13*(pick%4))));x=x[at:at+length]
 else:x=np.resize(x,length)
 cross=round(.18*SR);a=np.linspace(0,1,cross);joined=x[:cross]*a+x[-cross:]*(1-a);x=np.concatenate([joined,x[cross:-cross]])
 return x

def gem_room(x,decay,wet,loop=False):
 # Diffuse stereo reflections of the recording itself; fixed delays and no
 # modulation preserve the pickup's note. Circular folding keeps chatter seamless.
 room=sosfilt(butter(2,[300,4800],btype='bandpass',fs=SR,output='sos'),x)
 impulse=np.zeros((round(decay*SR),2))
 for channel in range(2):
  for i in range(96):
   t=.026+(decay-.027)*(i/95)**1.18
   t+=((i*17+channel*11)%19)/SR*7
   at=min(len(impulse)-1,round(t*SR))
   impulse[at,channel]+=np.exp(-4.8*t/decay)*(1 if (i*7+channel*3)%11<6 else -1)
  impulse[:,channel]/=max(np.sqrt(np.sum(impulse[:,channel]**2)),1e-9)
 output=np.zeros((len(x) if loop else len(x)+len(impulse)-1,2))
 output[:len(x)]+=x[:,None]
 for channel in range(2):
  reflected=fftconvolve(room,impulse[:,channel])
  if loop:
   output[:,channel]+=reflected[:len(x)]*wet
   output[:len(reflected)-len(x),channel]+=reflected[len(x):]*wet
  else:output[:,channel]+=reflected*wet
 return output

def write(name,x,role,gain,paths,loop=False,license=LICENSE):
 x=x.copy();x-=x.mean(axis=0);active=abs(x)>max(.0001,float(np.max(abs(x)))*.02);rms=float(np.sqrt(np.mean(x[active]**2))) if active.any() else 1
 if role=='enemy-chatter':rms=float(np.sqrt(np.mean(x*x)))
 x*=min((.105 if role=='enemy-chatter' else .18 if name in TOWER_DEATH_NAMES else .14)/max(rms,1e-9),(.76 if role=='enemy-chatter' else .88)/max(float(np.max(abs(x))),1e-9))
 if role=='enemy-chatter':gain=round(min(.95,gain*.038/max(float(np.sqrt(np.mean(x*x))),1e-9)),6)
 if not loop:x=fade(x)
 if role=='weapon-burst':gain=round(min(.7,.05/max(np.sqrt(np.sum(x[:SR//2]**2)/(SR//2)),1e-9)),6)
 dest=OUT/(name+'.wav')
 with wave.open(str(dest),'wb') as w:w.setparams((x.shape[1] if x.ndim==2 else 1,2,SR,0,'NONE','not compressed'));w.writeframes(np.round(x*32767).astype('<i2').tobytes())
 manifest[name]=dict(file=dest.name,gain=gain,loop=loop,duration=round(len(x)/SR,6),bytes=dest.stat().st_size,sha256=sha(dest),peak=round(float(np.max(abs(x))),5),rms=round(float(np.sqrt(np.mean(x*x))),5),role=role,license=license)
 recipes[name]=dict(sources=list(dict.fromkeys(paths)),changes='Selected real articulation/texture; trimmed, subtly varied, mixed and balanced at 48 kHz. No arcade-tone or oscillator layers.')

# Recorded library selections: organic energy instead of bleeps and toy lasers.
BEAM='LASRMisc_Beam Transient_04_SFRMS_SCIWPNS.wav';SPELL='MAGEvil_Dark Spell Dark Energy Attack_RogueWaves_DruidMagic.wav';ENERGY='Bluezone_BC0286_invader_weapon_scifi_shot_002.wav'
SHOT='SCIWeap_Heavyweapon12 Shot 04_DDUMAIS_NONE.wav';BURST='GUNAuto_Sci Fi Shotgun Burst_04_SFRMS_SCIWPNS.wav';RPU='GUNAuto_RPU1 Fire_02_SFRMS_SCIWPNS.wav'
BODY='Heavy Body Crunch 02.wav';SKIN='Skin Peel 04.wav';BITE='Zombie Bite 04.wav';STONE='Crushed Rock - DROP - Thick - Mono.wav';PEBBLE='Pebbles - DROP - Dense - Mono.wav';GLASS='CERMBrk_Ceramic Roof Tile Cracking_JSE_SD.wav'
ROAR='MonsterPack2_LargeMonster11_Roar03.wav';ATTACK='MonsterPack2_Monster06_Attack13.wav';DEAD='MonsterPack2_Monster09_Death02.wav';CALL='MonsterPack2_Monster10_Call09.wav';INSECT='Bluezone_BC0280_biohazard_atmos_organic_insect_ambience_001.wav';TEXTURE='Bluezone_BC0280_biohazard_creature_organic_texture_041.wav';ALIEN='Bluezone_BC0286_invader_alien_scifi_texture_022.wav'
PING='FUI Hologram Ping Tone Echoed-2.wav';SWIPE='FUI Navigation Swipe-2.wav';EASE='FUI Ease Into Position.wav';FLUTTER='Short Rising Flutter.wav';SWORD='METLFric_Designed Metal Sword Sheath 04_DDUMAIS_NONE.wav';WIND='SWSH_Swing 3 Large 03_DDUMAIS_NONE.wav';SLASH='SWSH_Sword Slash Impact V2 Assorted 18_DDUMAIS_NONE.wav'
DRONE='Dark Drone Deep Waves Of Darkness.wav';PAD='Dark Pad Deep Pulsating Movement.wav';BELLS='DSGNDron_Mystery Bells_JSE_CD.wav';PULSE='DSGNDron_Slow Pulse Drone_JSE_CD.wav';SWELL='DSGNDron_Evolving Guitar Swell_JSE_CD.wav';MONSTER_AMBIENCE='Monster Ambience, Distant Destruction, Huge Groans.wav'
GEM_BELLS='Enchanting_Bells_4.wav';GEM_CRACK='Bluezone_BC0278_ice_crack_break_002.wav';GEM_ABSORB='MAGElem_Water Spell Splash Attack Medium 2_RogueWaves_DruidMagic.wav'
# Chatter performances and editorial cuts live in chatter_design.py.
names=list(json.loads((ROOT/'src/remake-audio-manifest.json').read_text()))
if args.only=='combat-hands':names=[name for name in names if name.startswith(('shot','levelup')) or name=='leveldown']
elif args.only=='movement':names=['jump1','jump2','jump3','land','land2']
elif args.only=='gems':names=['gibcollect','gibcollect2','gibcollect3','gibcollectmagic','gibcollectmagic2','gibcollectmagic3','crystalbreak1','crystalbreak2','crystalbreak3','crystalhit1','crystalhit2','crystalhit3','gemchatter']
elif args.only=='tower-deaths':names=TOWER_DEATH_NAMES
elif args.only=='gem-breaks':names=['crystalbreak1','crystalbreak2','crystalbreak3']
elif args.only=='gem-hits':names=['crystalhit1','crystalhit2','crystalhit3']
elif args.only=='pickups':names=['gibcollect','gibcollect2','gibcollect3','gibcollectmagic','gibcollectmagic2','gibcollectmagic3']
elif args.only=='emergences':names=list(EMERGENCE_PROFILES)
elif args.only=='chatter':names=list(CHATTER_PROFILES)
elif args.only=='upgrades':names=[f'levelup{i}' for i in range(2,8)]
for name in names:
 if name in ['menutheme','menuatmos']:continue
 seed=int(hashlib.sha256(name.encode()).hexdigest()[:8],16);v=seed%7;rate=.96+(seed%9)*.01;paths=[];role='effect';gain=.4;loop=False
 def c(source,length=1.2,pick=None,speed=1):paths.append(index[source]['file']);return clip(source,length,v if pick is None else pick,speed)
 def b(source,duration=6):paths.append(index[source]['file']);return bed(source,duration,v)
 if name in ['crew-countdown','crew-release-laugh','football-goal']:
  # These existing recordings already have clear Creative Commons provenance and human voices.
  old=json.loads((OUT/'manifest.json').read_text())[name];manifest[name]=old
  previous=json.loads((P/'recipes.json').read_text())[name];recipes[name]=previous
  for file in previous['sources']:
   source=next(i for i in json.loads((P/'sources.json').read_text()) if i['file']==file);used[file]=source
  continue
 if name.startswith('rapid'):
  tier=int(name[-1]);grain=mix((c(BEAM,.13,speed=1.08-tier*.03),0,.65),(c(ENERGY,.12,speed=.95),0,.35));length=round(SR*2);x=np.zeros(length)
  for i in range(20):np.add.at(x,(np.arange(len(grain))+i*length//20)%length,grain)
  x=sosfilt(butter(2,7500,fs=SR,output='sos'),x);role='weapon-stream';gain=.1+tier*.004;loop=True
 elif name.startswith('shot'):
  tier=int(name[4]);speed=rate*(1.03-tier*.035)
  paths.extend(index[source]['file'] for source in [SHOT,BODY,'Impact 021.wav'])
  x=mix((articulation(SHOT,0,.175,speed),0,.85),
        (articulation(BODY,.39,.19,speed),0,.24),
        (articulation('Impact 021.wav',0,.38,speed),0,.45))
  x=sosfilt(butter(2,6500,fs=SR,output='sos'),x);role='weapon-burst';gain=.4
 elif name in ['daggerseek','magentashot']:
  x=mix((c(SPELL,1.1,speed=.94),0,.7),(c(ENERGY,.7,speed=.88),0,.45));role='homing-launch';gain=.4
 elif name in ['daggerdrone','magentadrone']:
  x=b(ALIEN,4);role='homing-flight';gain=.12;loop=True
 elif name in CHATTER_PROFILES:
  x,gain,chatter_recipe=render_chatter(name,recording)
  paths.extend(index[source]['file'] for source in chatter_recipe['sources']);role='enemy-chatter';loop=True
 elif name.startswith('daggercall') or name.startswith('polarity'):
  x=b(BELLS if name.startswith('daggercall') else DRONE,8);role='ambience';gain=.1 if name.startswith('daggercall') else .035;loop=True
 elif name.startswith('levelup'):
  tier=int(name[-1])
  # Different principal recordings and different gestures, not one pitched roar.
  profiles={
   2:('snake_hiss_03.wav',.25,1.30,.73,'serpent: splitting skin and a long pressure hiss'),
   3:('bear_pain_hurt_groan_01.wav',0,1.085,.70,'bear: chest impact and a close guttural snarl'),
   4:(DEAD,.05,3.55,.88,'maw: sustained tearing roar with a stone collapse'),
   5:('Monster Within - Hunter - Fley_Attack02.wav',0,1.45,.77,'hunter: sharp split-throat attack and answering shriek'),
   6:('Gibbons_02.wav',.15,3.25,.83,'feral chorus: rising animal cries and a grinding body'),
   7:('Monster Within - Large Beast - Taunt2Stun03.wav',0,2.70,.65,'apex: enormous descending beast bellow and chest rumble'),
  }
  primary,start,duration,speed,identity=profiles[tier]
  def layer(source,start,duration,speed=1):
   paths.append(index[source]['file']);part=articulation(source,start,duration,speed)
   rms=np.sqrt(np.mean(part*part));part*=min(.13/max(rms,1e-9),.8/max(np.max(abs(part)),1e-9));return part
  voice=layer(primary,start,duration,speed)
  release=min(round(.22*SR),len(voice)//3);voice[-release:]*=np.linspace(1,0,release)
  if tier==2:
   x=mix((voice,.04,1),(layer(SKIN,0,.75,.9),0,.5),(layer(GLASS,0,.4,.8),0,.38),(layer(SPELL,0,1.9,.95),.05,.23))
  elif tier==3:
   x=mix((voice,.015,1),(layer(BODY,.39,.35,.8),0,.65),(layer('Impact 045.wav',0,2.2,.9),0,.5),(layer(ATTACK,.03,1.1,.78),1.0,.32))
  elif tier==4:
   x=mix((voice,.025,1),(layer(STONE,0,1.8,.72),.02,.48),(layer('Impact 021.wav',0,1.4,.86),0,.6),(layer(SKIN,0,.8,.8),.13,.25))
  elif tier==5:
   x=mix((voice,0,1),(layer('MR - Banshee Damage VO 07.wav',0,.85,.58),1.05,.52),(layer(SLASH,0,.5,.86),0,.48),(layer(SWORD,0,1.3,.78),1.35,.27))
  elif tier==6:
   x=mix((voice,.035,1),(layer(TEXTURE,0,2.8,.86),.1,.27),(layer(PEBBLE,0,1.5,.72),0,.32),(layer('Impact 045.wav',0,2.2,.8),0,.45))
  else:
   x=mix((voice,.035,1),(layer(ROAR,0,.9,.7),.03,.35),(layer('Impact 045.wav',0,2.4,.68),0,.7),(layer(STONE,0,2.2,.68),.18,.34))
  x=sosfilt(butter(2,[45,9000],btype='bandpass',fs=SR,output='sos'),x)
  # Soft saturation thickens recorded throats/impacts while retaining headroom.
  x=np.tanh(x*1.35)/1.35
  # Compact dark stereo space around a centered, immediate physical attack.
  room=sosfilt(butter(2,3200,fs=SR,output='sos'),x)
  length=max(len(x)+round(.65*SR),round({2:2.7,3:3.2,4:4.7,5:3.4,6:4.7,7:5.0}[tier]*SR))
  stereo=np.zeros((length,2));stereo[:len(x)]+=x[:,None]
  for delay,left,right in [(.061,.14,.04),(.097,.04,.15),(.163,.095,.035),(.229,.035,.085),(.337,.05,.018),(.461,.012,.035),(.613,.015,.006)]:
   at=round(delay*SR);stereo[at:at+len(room),0]+=room*left;stereo[at:at+len(room),1]+=room*right
  x=stereo;role='upgrade';gain={2:.59,3:.62,4:.64,5:.60,6:.63,7:.67}[tier]
 elif name=='leveldown':
  tier=1;speed=.94
  paths.extend(index[source]['file'] for source in [BODY,'Impact 021.wav',WIND,SKIN])
  # An anatomical rupture and low pressure release. No pings, bells, chords,
  # musical risers or synthesized power-up tones in the hand upgrade identity.
  body=articulation(BODY,.39,.19,speed)
  impact=articulation('Impact 021.wav',0,1.05,speed)
  air=articulation(WIND,0,.85,speed)
  skin=articulation(SKIN,0,.55,speed)
  x=mix((body,0,.75),(impact,0,.9+tier*.12),(air,.015,.24),(skin,0,.16))
  x=sosfilt(butter(2,[45,3200 if tier<4 else 2600],btype='bandpass',fs=SR,output='sos'),x)
  if name=='leveldown':x=fade(x[::-1],.025)*np.linspace(1,.15,len(x))
  role='upgrade';gain=.48
 elif name.startswith('daggercollect'):
  x=mix((c(SWELL,2.1),0,.65),(c(SPELL,1.0,speed=1.05),0,.25),(c(PING,.8),.05,.4));role='entrance-pickup';gain=.45
 elif name.startswith('gibcollect'):
  # Rounded absorption with a small recorded bell accent for pickup clarity.
  take=int(name[-1])-1 if name[-1].isdigit() else 0;magic='magic' in name
  paths.extend(index[s]['file'] for s in [GEM_ABSORB,GEM_CRACK,GEM_BELLS])
  speed=.9
  body=articulation(GEM_ABSORB,[1.425,1.61,1.49][take],.27,speed)
  body*=min(.12/max(np.sqrt(np.mean(body*body)),1e-9),.6/max(np.max(abs(body)),1e-9))
  intake=fade(body[:round(.045*SR)][::-1],.004)*np.linspace(.15,.7,min(len(body),round(.045*SR)))
  contact=articulation(GEM_CRACK,[.25,.93,2.25][take],.065,1.1)
  contact*=min(.1/max(np.sqrt(np.mean(contact*contact)),1e-9),.5/max(np.max(abs(contact)),1e-9))
  x=mix((intake,0,.22),(body,.022,1),(contact,.024,.065))
  x=sosfilt(butter(2,[160,5600 if magic else 4400],btype='bandpass',fs=SR,output='sos'),x)
  x*=np.exp(-np.arange(len(x))/SR/.13)
  bell=articulation(GEM_BELLS,2.44,.26)
  bell=sosfilt(butter(2,[850,7500],btype='bandpass',fs=SR,output='sos'),bell)
  bell*=min(.1/max(np.sqrt(np.mean(bell*bell)),1e-9),.5/max(np.max(abs(bell)),1e-9))
  bell*=np.exp(-np.arange(len(bell))/SR/.18)
  x=mix((x,0,1),(bell,.012,.34 if magic else .30))
  x=gem_room(x,.85,.55);role='pickup';gain=.125 if magic else .12
 elif name.startswith('crystalhit'):
  # One real small-glass contact: no ceramic crunch or added musical layer.
  # Cut before the scattered shards; the full fracture belongs to destruction.
  take=int(name[-1])-1
  source='Bluezone_BC0274_glass_impact_break_small_014.wav'
  paths.append(index[source]['file'])
  x=articulation(source,0,.18,[.97,1,1.03][take])
  x=sosfilt(butter(2,[350,8000],btype='bandpass',fs=SR,output='sos'),x)
  x*=np.exp(-np.arange(len(x))/SR/.10)
  x=gem_room(x,.55,.42);role='crystal-hit';gain=.36
 elif name.startswith('crystalbreak'):
  take=int(name[-1])-1
  paths.extend(index[source]['file'] for source in CRYSTAL_DETACH_SOURCES)
  x=build_crystal_detach(recording,take,SR);role='crystal-break';gain=.65
 elif name=='gemchatter':
  paths.append(index[GEM_BELLS]['file']);x=bed(GEM_BELLS,4.4,pick=1)
  x=sosfilt(butter(2,[1000,6500],btype='bandpass',fs=SR,output='sos'),x)
  x=gem_room(x,1.45,.65,loop=True)
  role='gem-chatter';gain=.18;loop=True
 elif name in EMERGENCE_PROFILES:
  x,gain,identity=build_emergence(name,c,SR);role='enemy-spawn'
 elif name.startswith('spawn') or name in ['thornemerge','eyearouse','unburrowcentipede','leviathanbeckon','leviathanbeckon2','leviathantransmute']:
  x=mix((c('Impact 045.wav',1.2),0,.35),(c(ROAR if 'leviathan' in name else ATTACK,1.8,speed=.92),.05,.8));role='enemy-spawn';gain=.5
  if 'squid' in name:x=mix((c(STONE,1.4),0,.7),(c('DSGNRise_String Riser 13_JSE_HJS.wav',1.5),0,.4))
 elif name in TOWER_DEATH_NAMES:
  paths.extend(index[source]['file'] for source in TOWER_DEATH_SOURCES)
  duration=float(re.search(r'TOWER_DEATH_DURATION=([0-9.]+)',(ROOT/'src/enemy-presentation.ts').read_text())[1])
  x=build_tower_death(recording,TOWER_DEATH_NAMES.index(name)+1,duration,SR);role='enemy-death';gain=.68
 elif name.startswith('kill') or name in ['ultrapedecrash','eggburst','eggburst2']:
  x=mix((c(BODY,.7,speed=rate),0,.7),(c(DEAD,1.8,speed=rate),0,.65),(c(GLASS,.6),.02,.25));role='enemy-death';gain=.45
 elif name.startswith('damage') or name=='eyehit':
  x=mix((c(GLASS,.5),0,.6),(c(BODY,.35,speed=1.04),0,.2));role='enemy-damage';gain=.4
 elif name=='daggerhit1':x=c(SLASH,.35);role='armor-impact';gain=.3
 elif name.startswith('ricochet') or name.startswith('magicpierce'):
  x=mix((c(SWORD,.24,speed=1.05),0,.6),(c(GLASS,.2),0,.25));role='ricochet';gain=.24
 elif name.startswith('magentadetonate'):
  x=mix((c('EXPLDsgn_Explosion Rumble Distorted_07_SFRMS_SCIWPNS.wav',2.1),0,.7),(c(BODY,.6),0,.3));role='explosion';gain=.5
 elif name.startswith('spidereat') or name=='ultrapedeeat':x=mix((c(BITE,.85),0,.8),(c(SKIN,.7),0,.2));role='enemy-feed';gain=.3
 elif name.startswith('jump'):
  # A tight air release at takeoff, with a brighter double rush for a timed hop.
  hop=name=='jump3';speed=1.38 if hop else 1.08 if name=='jump2' else 1.18
  air=c(WIND,.22 if hop else .24,pick=0,speed=speed)
  x=mix((air,0,1),(c(WIND,.12,pick=1,speed=1.65),.035,.65)) if hop else air
  x=sosfilt(butter(2,[220,7800 if hop else 5600],btype='bandpass',fs=SR,output='sos'),x)
  x*=np.exp(-np.arange(len(x))/SR/(.095 if hop else .12));role='movement';gain=.24 if hop else .18
 elif name in ['land','land2']:
  # One compact, warm contact. Loose rock and the wood crack used to dominate
  # every ordinary jump and obscure the immediately following bunnyhop cue.
  heavy=name=='land2';length=.22 if heavy else .14
  x=c(STONE,length,pick=0,speed=.9 if heavy else 1.05)
  x=sosfilt(butter(2,[65,1100 if heavy else 850],btype='bandpass',fs=SR,output='sos'),x)
  x*=np.exp(-np.arange(len(x))/SR/(.065 if heavy else .04));role='movement';gain=.23 if heavy else .16
 elif name in ['eggbounce','skullclop1']:
  x=mix((c(STONE,.35),0,.8),(c('WOODImpt_Impact Wood 23_DDUMAIS_NONE.wav',.18),0,.25));role='movement';gain=.35
 elif name in ['death','fall']:
  x=mix((c(BODY,.8),0,.7),(c('Male 1 - Breathing - Gasping - Ehrlund M1.wav',1.3),.03,.55),(c(DEAD,1.4,speed=1.02),0,.25));role='player-death';gain=.6
 elif name=='burrowcentipede':x=mix((c(STONE,1.5),0,.6),(c(TEXTURE,1.5),0,.4));role='enemy-burrow';gain=.4
 elif name in ['uihover','uiclick','uislider']:
  x=c(EASE if name=='uihover' else SWIPE if name=='uislider' else 'GUNMech_Heavy Mech Cock 03_DDUMAIS_NONE.wav',.13,pick=0);role='interface';gain={'uihover':.3,'uiclick':.5,'uislider':.28}[name]
 elif name=='highscore1':x=mix((c(SWELL,2.5),0,.7),(c(BELLS,2.0),0,.4));role='interface';gain=.4
 else:raise ValueError(name)
 write(name,x,role,gain,paths,loop,license='CC0-1.0' if name in CHATTER_PROFILES else LICENSE)
 if name in EMERGENCE_PROFILES:manifest[name]['gain']=round(min(.65,EMERGENCE_RMS[name]/max(manifest[name]['rms'],1e-9)),6)
 if name in EMERGENCE_PROFILES:recipes[name].update(identity=identity,addedReverb=False,changes='Distinct layered real-world emergence gesture: earth displacement, material strain, break-through and settling debris; equalized layers, gentle pressure compression and mono HRTF-ready export. No string riser, oscillator, arcade cue or explosion.')
 if name in TOWER_DEATH_NAMES:recipes[name]['changes']='Lion-like final beast bellow from cylon8472 Beast Roar lvl2 (CC0), with recorded terminal breath and low stone settling. Three size-specific gestures; full-length mono body matched to TOWER_DEATH_DURATION, final 95 ms release, shared spatial arena reverb. No stock generic kill scream or looping roar.'
 if name.startswith('shot'):recipes[name]['changes']='One isolated heavy-weapon articulation with simultaneous body/impact layers; explicit take boundaries exclude all subsequent blasts; warm filtering and calibrated attack gain.'
 if name.startswith('levelup'):recipes[name].update(primarySource=index[primary]['file'],identity=identity,changes='Distinct recorded animal/monster performance for this hand; bespoke physical impact/rupture layers, full vocal gesture, gentle saturation and dark stereo reflections. No generated tones; later hands do not reuse a pitched earlier upgrade.')
 if name=='leveldown':recipes[name]['changes']='Organic body rupture, skin tension, low physical impact and air pressure; reversed downgrade gesture.'
 if name.startswith('jump'):recipes[name]['changes']='Immediate filtered air release with a short decay; successful bunnyhop uses a faster, brighter double rush and higher gain to distinguish the timing reward.'
 if name in ['land','land2']:recipes[name]['changes']='Single short stone contact, band limited to a warm body with exponential decay; no wood crack or loose rock tail. Heavy falls retain a longer, deeper contact.'
 if name.startswith('gibcollect'):recipes[name]['changes']='Rounded liquid absorption from a recorded water spell, tiny mineral contact and one fixed recorded bell articulation at the same pitch across every pickup. Only the non-tonal liquid/contact takes vary. No randomized pitch or gain; deterministic overlap compensation. Diffuse stereo reverb: 850 ms reflection window, filtered 300–4800 Hz, wet level .55. No harp or generated tones.'
 if name.startswith('crystalbreak'):recipes[name]['changes']='SKYES Audio 96 kHz glass fracture and fine shard recordings with Raconteur Sound 192 kHz crystal-glass resonance. Three edited articulations, softened 3.8 kHz presence, bright fine debris and a short naturally pitched crystal ring. Mono export preserves socket direction; shared arena sends supply stereo space. No ice crunch, oscillator, generated note or rising pickup jingle.'
 if name.startswith('crystalhit'):recipes[name]['changes']='Single recorded small-glass contact, cut to the first 180 ms before scattered debris, with three subtle speed variations. Band limited 350–8000 Hz with a damped contact decay. Diffuse stereo reverb: 550 ms reflection window, wet level .42, gain .36. No ceramic, bell, oscillator or added musical layer; full fracture remains separate.'
 if name=='gemchatter':recipes[name]['changes']='Recorded enchanting bells with diffuse stereo reverb: 1.45 s reflection window, filtered 300–4800 Hz, wet level .65. Circular convolution wraps the decay seamlessly into the loop. Quiet positional shimmer; no modulation or synthesized drone.'
 if name in CHATTER_PROFILES:
  recipes[name].update({k:v for k,v in chatter_recipe.items() if k!='sources'});recipes[name]['primarySource']=index[chatter_recipe['primarySource']]['file']
  recipes[name]['changes']='CC0 recorded creature and mouth-foley performances; intact gestures, irregular rests, dry mono, restrained parallel saturation, peak-limited RMS calibration.'

# Cinematic environmental compositions: evolving stereo recordings, no toy melody.
for name,layers in ([] if args.only else [('menutheme',[(PAD,.65),(SWELL,.35)]),('menuatmos',[(DRONE,.55),(MONSTER_AMBIENCE,.3),(BELLS,.12)])]):
 duration=60;x=np.zeros((SR*duration,2));paths=[]
 for source,gain in layers:
  original=recording(source);paths.append(index[source]['file']);original=original[:,:2] if original.shape[1]>1 else np.repeat(original,2,axis=1)
  length=min(len(original),SR*30);part=original[:length];cross=SR//2;cycle=np.concatenate([part[:cross]*np.linspace(0,1,cross)[:,None]+part[-cross:]*np.linspace(1,0,cross)[:,None],part[cross:-cross]],axis=0)
  tiled=np.resize(cycle,(SR*duration,2));x+=tiled*gain
 x*=min(.09/max(np.sqrt(np.mean(x*x)),1e-9),.85/max(float(np.max(abs(x))),1e-9));x=fade(x,.3)
 pcm=pathlib.Path(temp.name)/(name+'.wav')
 with wave.open(str(pcm),'wb') as w:w.setparams((2,2,SR,0,'NONE','not compressed'));w.writeframes(np.round(x*32767).astype('<i2').tobytes())
 dest=OUT/(name+'.m4a');subprocess.run(['afconvert','-f','m4af','-d','aac','-b','192000',str(pcm),str(dest)],check=True)
 manifest[name]=dict(file=dest.name,gain=.65,loop=True,duration=duration,bytes=dest.stat().st_size,sha256=sha(dest),peak=round(float(np.max(abs(x))),5),rms=round(float(np.sqrt(np.mean(x*x))),5),role='menu-music' if name=='menutheme' else 'entrance-music',license=LICENSE)
 recipes[name]=dict(sources=paths,changes='Project soundscape: layered studio stereo drones and swell recordings, level balanced, 60 seconds, AAC 192 kbit/s.')
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(ROOT/'src/remake-audio-manifest.json').write_text(json.dumps({n:{k:v[k] for k in ['file','gain','loop','duration','role']} for n,v in manifest.items()},indent=2)+'\n')
(P/'sources.json').write_text(json.dumps(list(used.values()),indent=2)+'\n');(P/'recipes.json').write_text(json.dumps(recipes,indent=2)+'\n')
print('Built',len(manifest),'studio cues/tracks from',len(used),'source recordings;',round(sum(i['bytes'] for i in manifest.values())/1e6,2),'MB.')
