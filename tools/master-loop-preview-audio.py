#!/usr/bin/env python3
"""Lay the game's actual ambience fades and arrival bell under the sped-up tour."""
import argparse,array,json,math,pathlib,subprocess

ROOT=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',default='ffmpeg');p.add_argument('--ascent',action='store_true');args=p.parse_args()
directory=ROOT/('artifacts/ascent' if args.ascent else 'artifacts/heaven')
timeline=json.loads((directory/'preview-audio-timeline.json').read_text())
manifest=json.loads((ROOT/'src/environment-audio-manifest.json').read_text());sr=24000;fps=timeline['fps']
buffers={}
for name,entry in manifest.items():
 raw=subprocess.check_output([args.ffmpeg,'-v','error','-i',str(ROOT/'public/assets/audio/environment'/entry['file']),'-f','f32le','-ar',str(sr),'-ac','2','pipe:1'])
 samples=array.array('f');samples.frombytes(raw);buffers[name]=samples
output=array.array('f',[0])*(math.ceil(timeline['frames']/fps*sr)*2)
ascent=json.loads((ROOT/'src/ascent-audio-manifest.json').read_text())
raw=subprocess.check_output([args.ffmpeg,'-v','error','-i',str(ROOT/'public/assets/audio/environment'/ascent['file']),'-f','f32le','-ar',str(sr),'-ac','2','pipe:1'])
launch=array.array('f');launch.frombytes(raw)
for frame,row in enumerate(timeline['mix']):
 start=round(frame/fps*sr);end=min(len(output)//2,round((frame+1)/fps*sr))
 for bed in row['beds']:
  samples=buffers[bed['name']];gain=math.sqrt(bed['weight'])*manifest[bed['name']]['gain']*.7*.8
  for sample in range(start,end):
   source=((sample+12*sr)*2)%len(samples)
   output[sample*2]+=samples[source]*gain;output[sample*2+1]+=samples[source+1]*gain
 if 480.4<=row['gameTime']%510<494:
  launchStart=round((row['gameTime']%510-480)*sr)*2
  for sample in range(start,end):
   source=launchStart+(sample-start)*2
   if source+1<len(launch):
    output[sample*2]+=launch[source]*ascent['gain']*.7*.8
    output[sample*2+1]+=launch[source+1]*ascent['gain']*.7*.8
bellTime=next(row['time'] for row in timeline['mix'] if row['gameTime']>=496)
for sample in range(round(bellTime*sr),min(len(output)//2,round((bellTime+5)*sr))):
 t=sample/sr-bellTime;envelope=min(1,t/.035)*math.exp(-t*1.9)
 value=sum(volume*math.sin(2*math.pi*92.4986*ratio*t) for ratio,volume in [(1,.13),(2.76,.045),(5.4,.018)])*envelope*.7*.8
 output[sample*2]+=value;output[sample*2+1]+=value
raw=directory/'preview-mix.f32';raw.write_bytes(output.tobytes())
target=directory/('ascent-with-sound.mp4' if args.ascent else 'endless-sanctuary-with-sound.mp4')
subprocess.run([args.ffmpeg,'-v','error','-y','-i',str(ROOT/timeline['output']),'-f','f32le','-ar',str(sr),'-ac','2','-i',str(raw),'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',str(target)],check=True)
raw.unlink();print(target)
