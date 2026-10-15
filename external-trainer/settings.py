"""Validated local settings and user-facing profiles shared by the native UI."""
from dataclasses import dataclass, asdict
import math
import re
from urllib.parse import urlparse

KINDS = ('skull','skull2','skull3','skull4','transmuted1','transmuted2','transmuted3','transmuted4',
         'squid','squid2','squid3','spider','spider2','egg','egg2','spiderling','centipede','gigapede','ghostpede','leviathan','orb','thorn')
DISPLAY_NAMES={
    'skull':'Skull I','skull2':'Skull II','skull3':'Skull III','skull4':'Skull IV',
    'transmuted1':'Transmuted skull I','transmuted2':'Transmuted skull II','transmuted3':'Transmuted skull III','transmuted4':'Transmuted skull IV',
    'squid':'Tower I','squid2':'Tower II','squid3':'Tower III','spider':'Spider I','spider2':'Spider II','egg':'Egg I','egg2':'Egg II',
}


@dataclass
class Settings:
    game_url: str = 'http://127.0.0.1:5173'
    profile: str = 'Precision'
    prediction: bool = True
    aim_mode: str = 'snap'
    smooth_speed: float = 720.0
    fov: float = 360.0
    max_distance: float = 196.0
    selection: str = 'nearest'
    tower_priority: bool = True
    switch_bias: float = 8.0
    lock_ms: int = 120
    lead_limit: float = 1.5
    excluded_kinds: str = ''
    esp_enabled: bool = True
    esp_boxes: bool = True
    esp_style: str = 'corners'
    esp_labels: bool = True
    esp_health: bool = True
    esp_distance: bool = True
    esp_lines: bool = True
    esp_prediction: bool = True
    esp_arrows: bool = True
    esp_fov: bool = False
    esp_opacity: float = .9
    esp_scale: float = 1.0
    esp_max_targets: int = 120
    color_tower: str = '#F2AC66'
    color_enemy: str = '#8FAABB'
    color_selected: str = '#66E2DD'
    hud_enabled: bool = True
    hud_compact: bool = True
    hud_anchor: str = 'top_left'

    @classmethod
    def validated(cls, values):
        defaults = asdict(cls())
        if not isinstance(values, dict) or set(values) - set(defaults):
            raise ValueError('Unknown or malformed setting')
        ranges = dict(smooth_speed=(30,3600), fov=(1,360), max_distance=(1,336), switch_bias=(0,45),
                      lock_ms=(0,2000), lead_limit=(0,3), esp_opacity=(.1,1), esp_scale=(.6,2), esp_max_targets=(1,500))
        choices = dict(profile=('Custom','Precision','Smooth','Survival','Minimal'), aim_mode=('snap','smooth'),
                       selection=('crosshair','nearest','health','threat'), esp_style=('corners','box'),
                       hud_anchor=('top_left','top_right','bottom_left','bottom_right'))
        result = dict(defaults)
        for key,value in values.items():
            if type(defaults[key]) is bool:
                if type(value) is not bool:
                    raise ValueError(key+' must be a checkbox value')
            elif key in ranges:
                if type(value) is bool:
                    raise ValueError(key+' must be a number')
                try:
                    number = float(value)
                except (ValueError,TypeError):
                    raise ValueError(key+' must be a number') from None
                if not math.isfinite(number) or not ranges[key][0] <= number <= ranges[key][1]:
                    raise ValueError('%s must be between %s and %s' % (key,*ranges[key]))
                if type(defaults[key]) is int and not number.is_integer():
                    raise ValueError(key+' must be a whole number')
                value = int(number) if type(defaults[key]) is int else number
            elif not isinstance(value,str):
                raise ValueError(key+' must be text')
            if key in choices and value not in choices[key]:
                raise ValueError('Invalid choice for '+key)
            if key.startswith('color_'):
                if not re.fullmatch(r'#[0-9A-Fa-f]{6}',value):
                    raise ValueError(key+' must use #RRGGBB')
                value=value.upper()
            result[key]=value
        parsed=urlparse(result['game_url'])
        try:parsed.port
        except ValueError:raise ValueError('Game address has an invalid port') from None
        if parsed.scheme not in ('http','https') or not parsed.hostname or len(result['game_url'])>2048:
            raise ValueError('Game address must be an http or https URL')
        excluded={k.strip() for k in result['excluded_kinds'].split(',') if k.strip()}
        if excluded-set(KINDS):
            raise ValueError('Unknown enemy type: '+', '.join(sorted(excluded-set(KINDS))))
        result['excluded_kinds']=','.join(k for k in KINDS if k in excluded)
        return cls(**result)


PRESETS = {
    'Precision': {},
    'Smooth': dict(aim_mode='smooth',smooth_speed=540.0,fov=120.0,lock_ms=180,esp_fov=True),
    'Survival': dict(tower_priority=False,selection='threat',lock_ms=50,switch_bias=3.0),
    'Minimal': dict(esp_labels=False,esp_health=False,esp_distance=False,esp_lines=False,
                    esp_prediction=False,esp_arrows=False,esp_max_targets=40,esp_opacity=.65),
}


def preset(name, game_url=None):
    if name not in PRESETS:
        raise ValueError('Unknown preset')
    return Settings.validated({**asdict(Settings()), **PRESETS[name], 'profile':name,
                               **(dict(game_url=game_url) if game_url else {})})


def export_document(settings):
    return dict(format='abyss-memory-trainer',version=1,settings=asdict(settings))


def import_document(document):
    if not isinstance(document,dict) or document.get('format')!='abyss-memory-trainer' or type(document.get('version')) is not int or document.get('version')!=1:
        raise ValueError('Unsupported trainer settings file')
    return Settings.validated(document.get('settings'))
