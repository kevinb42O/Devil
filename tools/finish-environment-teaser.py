"""Finish the environment-only film with continuous ambience and gentle dissolves."""
from pathlib import Path
import json, subprocess, re, wave, sys
import numpy as np
from PIL import Image, ImageDraw
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/teaser-environments'
EDIT=OUT/'edit';EDIT.mkdir(exist_ok=True)
FF=imageio_ffmpeg.get_ffmpeg_exe()
manifest=json.loads((OUT/'shot-manifest.json').read_text())
shots=manifest['shots'];duration=manifest['duration'];SR=48000

def run(args,name):
    result=subprocess.run([FF,'-hide_banner','-y',*map(str,args)],capture_output=True)
    log=result.stderr.decode(errors='replace');(EDIT/f'{name}.log').write_text(log)
    if result.returncode:raise RuntimeError(f'{name}: {log[-2000:]}')
    return result,log

def decode(path,channels=2):
    result=subprocess.run([FF,'-v','error','-i',str(path),'-f','f32le','-ar',str(SR),'-ac',str(channels),'-'],capture_output=True)
    if result.returncode:raise RuntimeError(result.stderr.decode())
    return np.frombuffer(result.stdout,dtype='<f4').reshape(-1,channels)

def smooth(x):
    x=np.clip(x,0,1);return x*x*(3-2*x)

def ambience_mix():
    n=round(duration*SR);clock=np.arange(n,dtype=np.float64)/SR
    mix=np.zeros((n,2),np.float32)
    bank=json.loads((ROOT/'src/environment-audio-manifest.json').read_text())
    groups=[]
    for shot in shots:
        if not groups or groups[-1]['bed']!=shot['bed']:groups.append({'bed':shot['bed'],'start':shot['filmIn'],'end':shot['filmOut']})
        else:groups[-1]['end']=shot['filmOut']
    offsets={'space':5,'storm':32,'veil':21,'furnace':37,'cathedral':31,'depth':17}
    trims={'space':1,'storm':.96,'veil':.92,'furnace':.94,'cathedral':.9,'depth':.87}
    audio_plan=[]
    for i,group in enumerate(groups):
        name=group['bed'];samples=decode(ROOT/'public/assets/audio/environment'/bank[name]['file'])
        envelope=np.ones(n,dtype=np.float64)
        if i:
            center=group['start']+.5
            envelope*=np.sqrt(smooth((clock-(center-2.75))/5.5))
        if i<len(groups)-1:
            center=groups[i+1]['start']+.5
            envelope*=np.sqrt(1-smooth((clock-(center-2.75))/5.5))
        # Continuous source phase for each environment, independent of picture
        # cuts within that chapter. Equal-power handovers span 5.5 seconds.
        index=((clock-group['start']+offsets[name])*SR).astype(np.int64)%len(samples)
        rms=float(np.sqrt(np.mean(samples.astype(np.float64)**2)))
        gain=.09*trims[name]/max(rms,1e-6)
        mix+=samples[index]*(envelope*gain).astype(np.float32)[:,None]
        audio_plan.append({**group,'crossfadeSeconds':5.5,'sourceOffset':offsets[name],'gain':gain})
        print('Mixed continuous',name,flush=True)
    # Quiet creature presence follows the moving camera. No movement, weapon,
    # spawn, combat or impact cues are used. The ambience remains the focus.
    cue_bank=json.loads((ROOT/'src/remake-audio-manifest.json').read_text())
    cue_names={'squid2':'chattersquid','gigapede':'chattercentipede2'}
    cache={}
    for shot in shots:
        if shot.get('title'):continue
        data=json.loads((OUT/'shots'/f"{shot['id']}-metadata.json").read_text())['audio']
        name=cue_names[data[0]['kind']]
        if name not in cache:cache[name]=decode(ROOT/'public/assets/audio/remake'/cue_bank[name]['file'],1)[:,0]
        cue=cache[name];count=round(shot['duration']*SR);t=np.arange(count)/SR
        sample_times=np.array([a['t'] for a in data]);pan=np.interp(t,sample_times,[a['pan'] for a in data]);distance=np.interp(t,sample_times,[a['distance'] for a in data])
        index=(np.arange(count)+int(shot['id'][:2])*SR)%len(cue)
        phase=index/SR;loopfade=smooth(phase/.2)*smooth((len(cue)/SR-phase)/.2)
        # Individual voice layers ease in/out over two seconds, much more
        # gently than the picture transition; retained at a distant level.
        env=np.sqrt(smooth(t/2)*smooth((shot['duration']-t)/2))
        level=.018/max(float(np.sqrt(np.mean(cue**2))),1e-6)
        mono=cue[index]*level*(14/(14+distance))*env*loopfade
        stereo=np.stack([mono*np.sqrt((1-pan)/2),mono*np.sqrt((1+pan)/2)],axis=1)
        begin=round(shot['filmIn']*SR);mix[begin:begin+count]+=stereo.astype(np.float32)
    envelope=smooth(clock/1.7)*smooth((duration-clock)/3.8)
    mix*=envelope.astype(np.float32)[:,None]
    assert np.isfinite(mix).all()
    with wave.open(str(EDIT/'continuous-mix.wav'),'wb') as w:
        w.setnchannels(2);w.setsampwidth(3);w.setframerate(SR)
        # Packed 24-bit PCM retains low-level atmosphere without float WAV
        # compatibility assumptions in downstream tools.
        pcm=np.round(np.clip(mix,-.999,.999)*8388607).astype('<i4').view(np.uint8).reshape(-1,4)[:,:3]
        w.writeframes(pcm.tobytes())
    (EDIT/'audio-plan.json').write_text(json.dumps({'beds':audio_plan,'voices':'Quiet panned creature loops; no action cues','preMasterPeak':float(np.max(np.abs(mix)))},indent=2))

if '--reuse-mix' not in sys.argv:ambience_mix()

picture=EDIT/'picture.mp4'
if '--reuse-picture' not in sys.argv:
    inputs=[];filters=[]
    for i,shot in enumerate(shots):
        inputs+=['-threads','1','-i',OUT/'shots'/f"{shot['id']}.mp4"]
        filters.append(f'[{i}:v]scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS,fps=30[v{i}]')
    previous='v0'
    for i in range(1,len(shots)):
        label=f'fade{i}'
        filters.append(f'[{previous}][v{i}]xfade=transition=fade:duration=1:offset={shots[i]["filmIn"]},fps=30[{label}]')
        previous=label
    filters.append(f'[{previous}]format=yuv420p,fade=t=in:d=0.7,fade=t=out:st={duration-1.5}:d=1.5,fps=30,tpad=stop_mode=clone:stop_duration=1,trim=duration={duration},setpts=N/(30*TB)[picture]')
    run([*inputs,'-filter_complex_threads','2','-filter_complex',';'.join(filters),'-map','[picture]','-an',
         '-c:v','h264_videotoolbox','-b:v','22M','-profile:v','high','-r','30','-fps_mode','cfr','-t',duration,
         '-color_range','tv','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',picture],'picture')
    print('Picture dissolves complete',flush=True)

_,analysis=run(['-i',EDIT/'continuous-mix.wav','-af','loudnorm=I=-18:TP=-2.5:LRA=10:print_format=json','-f','null','-'],'loudness-analysis')
level=json.loads(re.findall(r'\{\s*"input_i".*?\}',analysis,re.S)[-1])
normalizer=(f"loudnorm=I=-18:TP=-2.5:LRA=10:measured_I={level['input_i']}:measured_TP={level['input_tp']}:"
            f"measured_LRA={level['input_lra']}:measured_thresh={level['input_thresh']}:offset={level['target_offset']}:linear=true,aresample=48000,asetpts=N/SR/TB")
master=OUT/'abyss-daggers-environment-film-master.mp4'
if '--reuse-delivery' not in sys.argv:
 run(['-i',picture,'-i',EDIT/'continuous-mix.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-af',normalizer,
     '-c:a','aac','-b:a','320k','-ar','48000','-ac','2','-t',duration,'-movflags','+faststart',master],'master')
 print('Master complete',flush=True)
share=OUT/'abyss-daggers-environment-film-share.mp4'
if '--reuse-delivery' not in sys.argv:
 run(['-i',master,'-c:v','h264_videotoolbox','-b:v','5M','-profile:v','high',
     '-c:a','copy','-pix_fmt','yuv420p','-movflags','+faststart',share],'share')
 print('Share copy complete',flush=True)
report={'duration':duration,'fps':30,'resolution':[1920,1080],'source':'All frames rendered natively at fixed 30 fps; no first-person camera or combat.','files':{}}
for file in [master,share]:
    _,log=run(['-xerror','-i',file,'-af','ebur128=peak=true','-f','null','-'],file.stem+'-decode')
    frames=int(re.findall(r'frame=\s*(\d+)',log)[-1]);assert frames==round(duration*30),(file,frames)
    peak=float(re.findall(r'Peak:\s*([-\d.]+) dBFS',log)[-1]);assert peak<0
    report['files'][file.name]={'bytes':file.stat().st_size,'frames':frames,'integratedLUFS':float(re.findall(r'I:\s*([-\d.]+) LUFS',log)[-1]),'truePeakDBFS':peak,'fullyDecoded':True}
frames=[]
for i,shot in enumerate(shots):
    path=EDIT/f'review-{i:02}.jpg'
    run(['-ss',shot['filmIn']+shot['duration']*.55,'-i',master,'-frames:v','1','-q:v','2',path],f'review-{i:02}')
    with Image.open(path) as im:
        tile=Image.new('RGB',(480,300),'#080a0e');tile.paste(im.resize((480,270)),(0,0))
        ImageDraw.Draw(tile).text((10,280),f"{shot['filmIn']:02d}s  {shot['id']}",fill='#cebda6');frames.append(tile)
sheet=Image.new('RGB',(1920,300*((len(frames)+3)//4)),'#080a0e')
for i,frame in enumerate(frames):sheet.paste(frame,((i%4)*480,(i//4)*300))
sheet.save(OUT/'contact-sheet.jpg',quality=92)
run(['-ss','53','-i',master,'-frames:v','1','-q:v','2',OUT/'poster.jpg'],'poster')
(OUT/'delivery-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
