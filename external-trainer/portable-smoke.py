"""Check a clean extracted Windows distribution without installed Python/Node on PATH."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

parser = argparse.ArgumentParser()
parser.add_argument('archive', type=Path)
parser.add_argument('--url', default='https://devil-green.vercel.app')
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix='Abyss portable smoke ') as temporary:
    destination = Path(temporary)
    with zipfile.ZipFile(args.archive) as archive:
        names = archive.namelist()
        assert not any('/.chrome-profile/' in name or name.endswith('/user-presets.json') for name in names), 'Private user data in archive'
        archive.extractall(destination)
    executable = destination / 'Abyss Trainer' / 'Abyss Trainer.exe'
    assert executable.is_file(), 'Executable missing'
    assert (executable.parent / '_internal' / 'runtime' / 'node.exe').is_file(), 'Bundled Node missing'
    environment = os.environ.copy()
    environment['PATH'] = str(Path(environment.get('SystemRoot', 'C:/Windows')) / 'System32')
    for key in ('PYTHONHOME', 'PYTHONPATH', 'NODE_PATH', 'ABYSS_TRAINER_PROFILE'):
        environment.pop(key, None)
    for flags in (['--demo', '--quit-after', '1'], ['--url', args.url, '--quit-after', '25']):
        result = subprocess.run([str(executable), *flags], cwd=destination, env=environment,
                                capture_output=True, text=True, encoding='utf-8', errors='replace',
                                timeout=50, creationflags=subprocess.CREATE_NO_WINDOW)
        print(result.stdout, end='')
        if result.returncode:
            print(result.stderr)
        assert result.returncode == 0, 'Portable application failed'
        assert 'Windows trainer ready' in result.stdout, 'Native UI failed to initialize'
        if '--demo' not in flags:
            assert 'Game memory connected' in result.stdout, 'Portable browser bridge did not connect to the game'
    assert not (executable.parent / 'settings.json').exists(), 'Testing should not save personal settings'
print('PASS: extracted ZIP launches Tk and connects using bundled Node with a clean PATH.')
