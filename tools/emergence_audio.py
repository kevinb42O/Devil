"""Authored emergence gestures from recorded earth, stone, tissue and air.
Each tuple: source, seconds, take, speed, offset, level, low cut, high cut.
No synthesized tones, string risers, game bleeps or generic explosion layers.
"""
import numpy as np
from scipy.signal import butter,sosfilt
STONE='Crushed Rock - DROP - Thick - Mono.wav'
PEBBLE='Pebbles - DROP - Dense - Mono.wav'
SAND='DIG002.wav'
GRAVEL='DIG043.wav'
SCRAPE='DIG056.wav'
SHELL='CERMBrk_Ceramic Roof Tile Cracking_JSE_SD.wav'
SKIN='Skin Peel 04.wav'
BODY='Heavy Body Crunch 02.wav'
AIR='SWSH_Swing 3 Large 03_DDUMAIS_NONE.wav'
WATER='Heavy Water Churning, Deep, Ocean Drones, Wind.wav'
GROAN='Monster Ambience, Distant Destruction, Huge Groans.wav'
INSECT='Bluezone_BC0280_biohazard_atmos_organic_insect_ambience_001.wav'
# duration, game gain, description, recorded layers
PROFILES={
 'spawnminisquid':(2.6,.34,'tower I: dry split stone, short gravel lift, small settling fragments',[
  (GRAVEL,1.8,0,.95,0,.65,100,4600),(STONE,.65,1,1.03,.18,.8,80,6200),(PEBBLE,1.2,0,1.1,1.25,.3,500,7800)]),
 'spawnsquid':(3.7,.38,'tower II: long masonry scrape, two heavy stone joints, cascading gravel',[
  (SCRAPE,2.8,1,.85,0,.7,70,3800),(STONE,.9,2,.85,.3,.65,55,5000),(SHELL,.7,1,.8,1.25,.3,350,5800),(GRAVEL,1.2,2,.95,2.2,.35,220,6200)]),
 'spawnultrasquid':(4.9,.41,'tower III: deep earth heave, three broad slab fractures, long falling rubble',[
  (SAND,3.6,1,.75,0,.55,45,2100),(STONE,1.4,0,.72,.35,.8,45,3400),(SCRAPE,2.4,2,.8,1.2,.6,90,4000),(SHELL,.7,2,.7,2.35,.35,180,5100),(PEBBLE,1.5,2,.82,3.3,.4,300,6000)]),
 'spawnspider':(3.15,.32,'spider: shell plates unfolding through granular soil with dry leg contacts',[
  (GRAVEL,1.9,2,1.1,0,.55,160,5800),(SHELL,.7,0,.95,.15,.65,300,6500),(SKIN,.7,1,1.15,1,.28,220,5000),(PEBBLE,.7,1,1.2,2.3,.3,600,7000)]),
 'spawngigaspider':(8.9,.36,'giga spider: slow ground displacement, heavy carapace flex, staggered leg purchase',[
  (SAND,5.8,2,.85,0,.5,55,2700),(BODY,1.5,0,.8,.35,.55,70,2800),(SCRAPE,3.6,0,.78,2,.55,100,3900),(SHELL,1.2,2,.78,5.3,.6,200,5100),(STONE,1,2,.85,7.7,.5,80,4200)]),
 'spawncentipede':(2.8,.20,'centipede approach: muffled sand and small tunnelling stones below the floor',[
  (SAND,2.6,0,.9,0,.8,60,1200),(PEBBLE,1.4,1,.9,1.1,.25,100,1800)]),
 'spawncentipede2':(2.95,.23,'gigapede approach: dragging gravel and deep moving earth',[
  (SCRAPE,2.5,1,.7,0,.8,45,1700),(STONE,1.5,0,.7,1,.45,45,1400)]),
 'spawnultrapede':(3.3,.24,'ghostpede arrival: cold broad air pressure with brittle shed shell',[
  (AIR,1.3,1,.65,0,.65,100,5000),(SKIN,1.2,2,.75,.4,.5,200,4500),(SHELL,1.5,2,.75,1.4,.4,500,7000)]),
 'spawnleviathan':(8.7,.40,'leviathan: deep water displacement, bodily pressure and distant colossal strain',[
  (WATER,6.8,0,.85,0,.7,40,2200),(GROAN,5.5,1,.82,.8,.5,65,2800),(BODY,1.2,2,.65,2.1,.35,50,1800),(STONE,1.8,1,.7,6.2,.4,65,3500)]),
 'eyearouse':(6.8,.34,'orb: wet membrane opening, inward air draw and slow organic weight',[
  (WATER,3.5,1,1.1,0,.4,150,3400),(SKIN,1.5,0,.75,.2,.7,140,5500),(AIR,1.2,0,.7,1.6,.45,140,4200),(BODY,1.4,1,.72,4.9,.4,70,2100)]),
 'thornemerge':(2.4,.31,'thorn: fibrous tear, sharp mineral split and grit shedding',[
  (SKIN,.9,2,.9,0,.65,240,6500),(SHELL,1,1,1.1,.1,.6,500,8000),(SCRAPE,1.5,2,1.1,.65,.35,300,5500)]),
 'spawnegg':(.85,.23,'egg I: small wet release and a light shell flex',[
  (SKIN,.45,0,1.25,0,.6,250,5500),(BODY,.35,2,1.3,.08,.25,180,2800)]),
 'spawnegg2':(1.15,.27,'egg II: swollen membrane release, double shell creak and heavy tissue',[
  (BODY,.7,1,.9,0,.45,100,3100),(SKIN,.8,2,.95,.08,.65,180,5100),(SHELL,.35,1,1.1,.55,.18,600,6500)]),
 'unburrowcentipede':(2.2,.37,'centipede surface: gravel break-through, rapid plate chatter, falling sand',[
  (GRAVEL,1.3,1,1.05,0,.65,130,5700),(SHELL,.65,2,1.12,.08,.55,500,7800),(INSECT,.8,1,1.1,.25,.2,800,8500),(SAND,1.1,2,1.05,.9,.35,250,4600)]),
 'unburrowgigapede':(3.5,.42,'gigapede surface: broad stone rupture, heavy body surge and long rubble trail',[
  (STONE,1.7,2,.74,0,.75,45,3700),(BODY,1.4,0,.8,.1,.4,70,2400),(GRAVEL,2.2,0,.85,.6,.6,150,5400),(PEBBLE,1.6,1,.9,1.7,.4,450,6500)]),
 'unburrowghostpede':(2.8,.35,'ghostpede surface: rushing air, desiccated membrane and dispersed shell shards',[
  (AIR,1.6,2,.8,0,.6,130,5500),(SKIN,1.1,1,.85,.1,.5,250,6200),(SHELL,1.6,0,.9,.8,.5,650,7800)]),
}


# Final sustained level at the spatial reference distance, before master gain.
# Equalize the rendered result, since transient-heavy stones and sustained
# water/body recordings have very different crest factors.
TARGET_RMS={
 'spawnminisquid':.020,'spawnsquid':.027,'spawnultrasquid':.034,
 'spawnspider':.019,'spawngigaspider':.027,
 'spawncentipede':.010,'spawncentipede2':.013,'spawnultrapede':.014,
 'spawnleviathan':.035,'eyearouse':.024,'thornemerge':.020,
 'spawnegg':.011,'spawnegg2':.014,
 'unburrowcentipede':.022,'unburrowgigapede':.030,'unburrowghostpede':.025,
}

def build(name,clip,sr):
 duration,gain,identity,layers=PROFILES[name];out=np.zeros(round(duration*sr))
 for source,seconds,take,speed,offset,level,low,high in layers:
  x=clip(source,seconds,pick=take,speed=speed)
  x=sosfilt(butter(2,[low,high],btype='bandpass',fs=sr,output='sos'),x)
  # Equalize physical layers before composing; one loud recording must not
  # bury the finer debris. Preserve the takes' internal dynamic articulation.
  x*=min(.12/max(float(np.sqrt(np.mean(x*x))),1e-9),.65/max(float(np.max(abs(x))),1e-9))
  fade=min(round(.045*sr),len(x)//3);x[:fade]*=np.linspace(0,1,fade);x[-fade:]*=np.linspace(1,0,fade)
  at=round(offset*sr);length=min(len(x),len(out)-at)
  if length>0:out[at:at+length]+=x[:length]*level
 # Gentle pressure compression, without flattening the small settling detail.
 out=np.tanh(out*1.25)/1.25
 out[-min(len(out),round(.14*sr)):]*=np.linspace(1,0,min(len(out),round(.14*sr)))
 return out,gain,identity
