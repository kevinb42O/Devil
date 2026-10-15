"""Encode the in-engine frames from record-prelobby-emotes.mjs as looping GIFs."""
from pathlib import Path
from PIL import Image
source = Path('/tmp/devildaggers-prelobby-emotes')
output = Path('artifacts/prelobby-emotes')
output.mkdir(parents=True, exist_ok=True)
for view in ('first-person', 'friend'):
    files = sorted(source.glob(f'{view}-*.png'))
    if len(files) != 84:
        raise RuntimeError(f'{view}: expected 84 rendered frames, found {len(files)}')
    samples = [Image.open(file).convert('RGB').resize((432, 288)) for file in files[::7]]
    sheet = Image.new('RGB', (432, 288 * len(samples)))
    for row, sample in enumerate(samples):
        sheet.paste(sample, (0, row * 288))
    palette = sheet.quantize(colors=128)
    frames = [Image.open(file).convert('RGB').resize((720, 480), Image.Resampling.LANCZOS).quantize(palette=palette, dither=Image.Dither.NONE) for file in files]
    path = output / f'{view}.gif'
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=[80, 80, 90] * 28, loop=0, optimize=True, disposal=1)
    with Image.open(path) as check:
        assert check.n_frames == 84
        assert check.size == (720, 480)
    print(f'{path}: {path.stat().st_size:,} bytes, 84 frames, 7 seconds')
