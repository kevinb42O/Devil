"""Named local presets, saved atomically without modifying built-in presets."""
from dataclasses import asdict
import json
from pathlib import Path
import tempfile

from settings import Settings, PRESETS


def preset_name(value):
    if not isinstance(value,str):raise ValueError('Enter a preset name.')
    name=value.strip()
    if not name or len(name)>48 or any(ord(c)<32 for c in name):
        raise ValueError('Preset names must contain 1–48 printable characters.')
    if name.casefold() in {n.casefold() for n in ('Custom',*PRESETS)}:
        raise ValueError('Choose your own name; built-in preset names are reserved.')
    return name


class PresetLibrary:
    def __init__(self,path):
        self.path=Path(path);self.values={};self.warning=None
        try:
            document=json.loads(self.path.read_text(encoding='utf-8'))
            if document.get('format')!='abyss-user-presets' or document.get('version')!=1:raise ValueError('Unsupported preset library')
            for name,values in document['presets'].items():
                clean=preset_name(name)
                self.values[clean]=Settings.validated({**values,'profile':clean})
        except FileNotFoundError:pass
        except (OSError,ValueError,TypeError,KeyError,AttributeError) as error:
            self.warning='Could not read your preset library: '+str(error)

    def names(self):return sorted(self.values,key=str.casefold)

    def save(self,name,settings):
        if self.warning:raise ValueError(self.warning+'; the original file has been preserved.')
        name=preset_name(name)
        # Treat differently cased spellings as the same existing preset.
        name=next((old for old in self.values if old.casefold()==name.casefold()),name)
        value=Settings.validated({**asdict(settings),'profile':name})
        candidate={**self.values,name:value};temporary=None
        try:
            with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=self.path.parent,prefix='.presets-',suffix='.tmp',delete=False) as stream:
                temporary=Path(stream.name)
                json.dump({'format':'abyss-user-presets','version':1,'presets':{key:asdict(setting) for key,setting in candidate.items()}},stream,indent=2)
            temporary.replace(self.path)
        finally:
            if temporary and temporary.exists():temporary.unlink()
        self.values=candidate
        return value
