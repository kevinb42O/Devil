from pathlib import Path
from PIL import Image
import json

root=Path(__file__).parent
paths=sorted((root/'frames').glob('*.png'))
size=(768,432)
# One shared palette prevents color flicker between frames.
samples=[Image.open(p).convert('RGB').resize((192,108)) for p in paths[::8]]
sheet=Image.new('RGB',(192*5,108*4))
for i,im in enumerate(samples):sheet.paste(im,((i%5)*192,(i//5)*108))
palette=sheet.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
frames=[Image.open(p).convert('RGB').resize(size,Image.Resampling.LANCZOS).quantize(palette=palette,dither=Image.Dither.NONE) for p in paths]
dest=root/'abyss-late-game-battle.gif'
frames[0].save(dest,save_all=True,append_images=frames[1:],duration=50,loop=0,optimize=False,disposal=1)
with Image.open(dest) as gif:
    assert gif.n_frames==160
    assert gif.info['loop']==0
    assert gif.size==size
    duration=sum((gif.seek(i) or gif.info.get('duration',0)) for i in range(gif.n_frames))
    assert duration==8000
print(json.dumps({'file':str(dest.resolve()),'bytes':dest.stat().st_size,'frames':160,'duration_seconds':8,'resolution':size,'loop':'forever'}))
