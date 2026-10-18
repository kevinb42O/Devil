"""Assemble the clean in-engine teaser takes, master audio and verify delivery.

Run with the bundled Python after tools/record-teaser.mjs. Requires imageio-ffmpeg,
Pillow and NumPy. No gameplay or source sound assets are changed.
"""
from pathlib import Path
import json, subprocess, re, sys
import imageio_ffmpeg
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/teaser'
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
manifest=json.loads((OUT/'shot-manifest.json').read_text())
shots=manifest['shots']
(OUT/'edit').mkdir(exist_ok=True)
def run(args, name):
    result=subprocess.run([FFMPEG,'-hide_banner','-y',*map(str,args)],capture_output=True,text=True)
    (OUT/'edit'/f'{name}.log').write_text(result.stderr)
    if result.returncode:
        raise RuntimeError(f'{name}: {result.stderr[-2500:]}')
    return result.stderr

cursor=0
timeline=[]
for shot in shots:
    source=OUT/'shots'/f"{shot['id']}.mp4"
    if not source.exists():raise FileNotFoundError(source)
    duration=shot['duration']
    # Hard picture cuts; tiny audio envelopes suppress boundary clicks without
    # swallowing attacks. The cathedral respite is deliberate mix automation.
    gain=.88 if shot['type'] in ('cathedral','surface','scale') and shot['start']>380 else 1
    af=f'aresample=48000:async=1:first_pts=0,atrim=start=0.07,asetpts=PTS-STARTPTS,apad,atrim=duration={duration},volume={gain},afade=t=in:d=0.012,afade=t=out:st={max(0,duration-.065)}:d=0.065'
    vf=f'trim=start=0.07,setpts=PTS-STARTPTS,fps=30:start_time=0,tpad=stop_mode=clone:stop_duration=1,trim=duration={duration},setpts=PTS-STARTPTS,format=yuv420p'
    inputs=['-i',source];audio_map='0:a:0'
    if shot['id'][:2] in ('14','15','16'):
        # One continuous cathedral bed across the three beauty shots avoids a
        # media-element seek gap and preserves the bell/air decay through cuts.
        bed=json.loads((ROOT/'src/environment-audio-manifest.json').read_text())['cathedral']
        inputs+=['-ss',48+cursor-47,'-i',ROOT/'public/assets/audio/environment'/bed['file']]
        audio_map='1:a:0'
        af=f'aresample=48000,atrim=duration={duration},asetpts=PTS-STARTPTS,volume={.78*1.35*bed["gain"]*.88}'
    clip_output=OUT/'edit'/f"{shot['id']}.mp4"
    if '--resume' not in sys.argv or not clip_output.exists() or clip_output.stat().st_size<100000:
      run([*inputs,'-map','0:v:0','-map',audio_map,'-vf',vf,'-af',af,
         '-c:v','h264_videotoolbox','-b:v','24M','-profile:v','high',
         '-c:a','aac','-b:a','320k','-ar','48000','-ac','2',
         '-video_track_timescale','15360','-movflags','+faststart',
         clip_output],shot['id'])
    timeline.append({**shot,'filmIn':cursor,'filmOut':cursor+duration})
    cursor+=duration
    print('Conformed',shot['id'],flush=True)

(OUT/'edit/timeline.json').write_text(json.dumps(timeline,indent=2))
(OUT/'edit/concat.txt').write_text(''.join(f"file '{s['id']}.mp4'\n" for s in shots))
assembly=OUT/'edit/assembly.mp4'
run(['-f','concat','-safe','0','-i',OUT/'edit/concat.txt','-c','copy',assembly],'assembly')

# Two-pass integrated loudness with a safe true-peak ceiling. Silence and the
# cathedral dip remain part of the programme instead of normalizing each shot.
analysis=run(['-i',assembly,'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=12:print_format=json','-f','null','-'],'loudness-analysis')
data=json.loads(re.findall(r'\{\s*"input_i".*?\}',analysis,re.S)[-1])
(OUT/'edit/loudness-analysis.json').write_text(json.dumps(data,indent=2))
normalizer=(f"loudnorm=I=-16:TP=-1.5:LRA=12:measured_I={data['input_i']}:"
            f"measured_TP={data['input_tp']}:measured_LRA={data['input_lra']}:"
            f"measured_thresh={data['input_thresh']}:offset={data['target_offset']}:linear=true")
sound=f'aresample=48000:async=1:first_pts=0,asetpts=N/SR/TB,{normalizer},aresample=48000,asetpts=N/SR/TB,afade=t=in:d=0.10,afade=t=out:st={cursor-1.25}:d=1.25'
master=OUT/'abyss-daggers-teaser-master.mp4'
run(['-i',assembly,'-vf',f'fps=30:start_time=0,tpad=stop_mode=clone:stop_duration=1,trim=duration={cursor},setpts=N/(30*TB),fade=t=in:d=0.12,fade=t=out:st={cursor-.6}:d=0.6',
     '-af',sound,'-t',cursor,'-c:v','h264_videotoolbox','-b:v','20M','-profile:v','high',
     '-c:a','aac','-b:a','320k','-ar','48000','-ac','2','-pix_fmt','yuv420p',
     '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
     '-r','30','-fps_mode','cfr','-movflags','+faststart',master],'master')
print('Master complete',flush=True)
share=OUT/'abyss-daggers-teaser-share.mp4'
run(['-i',master,'-c:v','h264_videotoolbox','-b:v','4500k','-profile:v','high',
     '-c:a','aac','-b:a','192k',
     '-pix_fmt','yuv420p','-movflags','+faststart',share],'share')
print('Share copy complete',flush=True)

# Decode every output frame and both audio channels. Capture error logs and
# measured programme loudness independently for each finished file.
report={'plannedDuration':cursor,'width':1920,'height':1080,'fps':30,'files':{},'shots':timeline}
for file in (master,share):
    log=run(['-xerror','-i',file,'-af','ebur128=peak=true','-f','null','-'],file.stem+'-decode')
    report['files'][file.name]={'bytes':file.stat().st_size,'decoded':True,'summary':log[-1500:]}

# One frame per cut, plus a poster from the actual movie.
frames=[]
for i,shot in enumerate(timeline):
    still=OUT/'edit'/f'review-{i:02}.jpg'
    run(['-ss',shot['filmIn']+shot['duration']*.55,'-i',master,'-frames:v','1','-q:v','2',still],f'review-{i:02}')
    with Image.open(still) as im:
        tile=Image.new('RGB',(480,300),'#080b10')
        tile.paste(im.resize((480,270)),(0,0))
        ImageDraw.Draw(tile).text((10,280),f"{shot['filmIn']:02d}s  {shot['id']}",fill='#d1c1ab')
        frames.append(tile)
sheet=Image.new('RGB',(480*4,300*((len(frames)+3)//4)),'#080b10')
for i,tile in enumerate(frames):sheet.paste(tile,((i%4)*480,(i//4)*300))
sheet.save(OUT/'contact-sheet.jpg',quality=90)
run(['-ss','50','-i',master,'-frames:v','1','-q:v','2',OUT/'poster.jpg'],'poster')
(OUT/'delivery-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:round(v['bytes']/1e6,1) for k,v in report['files'].items()}),flush=True)
