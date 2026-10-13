"""Inspect original local replay events without executing the game or third-party code.
Format: NoahStolk/ddinfo-core docs/game-formats and ReplayEventsParser.cs.
Usage: python3 tools/analyze-centipede-replay.py /absolute/replay.ddreplay
"""
import collections, hashlib, json, struct, sys, zlib
from pathlib import Path
b=Path(sys.argv[1]).read_bytes()
assert b[:6]==b'ddrpl.'
end,start=struct.unpack_from('<ff',b,18)
n=struct.unpack_from('<i',b,50)[0];p=54+n+26
spawn_length=struct.unpack_from('<i',b,p)[0];p+=4+spawn_length
length=struct.unpack_from('<i',b,p)[0];p+=4
raw=zlib.decompress(b[p+2:p+length],-15);p=0;tick=0;entity=0;counts=collections.Counter();spawns=[];events=[];initial=True
spawn_sizes={1:30,3:32,4:32,5:32,6:45,7:64,12:64,15:64,8:16,9:16,10:28,11:4,13:20}
event_sizes={1:10,2:22,4:10,5:12,6:0,7:28,11:0}
pedes=set()
while p<len(raw):
    kind=raw[p];p+=1;counts[kind]+=1
    if kind==0:
        typ=raw[p];p+=1;entity+=1
        if typ in (7,12,15):
            pedes.add(entity);spawns.append(dict(id=entity,type=typ,tick=tick,time=start+tick/60,position=struct.unpack_from('<fff',raw,p+4),unknownVector=struct.unpack_from('<fff',raw,p+16),orientation=struct.unpack_from('<9f',raw,p+28)))
        p+=spawn_sizes[typ]
    elif kind==9:
        p+=16 if initial else 12;initial=False;tick+=1
    elif kind in event_sizes:
        size=event_sizes[kind]
        if kind in (1,2,4):
            eid=struct.unpack_from('<i',raw,p)[0]
            if eid in pedes:events.append(dict(type=kind,id=eid,tick=tick,time=start+tick/60,raw=struct.unpack_from('<'+('9h' if kind==2 else '3h'),raw,p+4)))
        p+=size
        if kind==11:break
    else:raise ValueError(f'Unknown event {kind} at {p-1}')
report=dict(source=Path(sys.argv[1]).name,sha256=hashlib.sha256(b).hexdigest(),start=start,end=end,ticks=tick,eventCounts=dict(counts),pedeSpawns=spawns,pedeEventCounts=dict(collections.Counter(e['type'] for e in events)),pedeEvents=events)
print(json.dumps(report,indent=2))
