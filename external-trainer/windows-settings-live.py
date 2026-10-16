"""Verify real Entry/Combobox edits reach disk and the live managed browser."""
import os
from pathlib import Path
import tempfile
import time
import tkinter as tk

from app import Engine
from windows_settings import SettingsForm

with tempfile.TemporaryDirectory(prefix='abyss-settings-live-') as temp:
    os.environ['ABYSS_TRAINER_PROFILE']=str(Path(temp)/'chrome')
    engine=Engine(config_root=temp);engine.thread.start()
    root=tk.Tk();root.withdraw();window=tk.Toplevel(root)
    form=SettingsForm(window,engine,lambda:None)
    def wait_for(predicate,timeout=60):
        until=time.monotonic()+timeout
        while time.monotonic()<until:
            root.update()
            if predicate():return
            time.sleep(.02)
        raise AssertionError('Timed out; bridge state: '+repr(engine.snapshot()))
    try:
        wait_for(lambda:engine.snapshot().get('connected'))
        form.controls['fov'].delete(0,'end');form.controls['fov'].insert(0,'83')
        form.controls['aim_mode'].set('smooth');form.controls['aim_mode'].event_generate('<<ComboboxSelected>>')
        wait_for(lambda:engine.snapshot().get('appliedSettings',{}).get('fov')==83 and engine.snapshot().get('appliedSettings',{}).get('aim_mode')=='smooth',10)
        assert Engine(config_root=temp).settings.fov==83
        assert Engine(config_root=temp).settings.aim_mode=='smooth'
        form.sliders['fov'].set(97)
        wait_for(lambda:engine.snapshot().get('appliedSettings',{}).get('fov')==97,10)
        assert Engine(config_root=temp).settings.fov==97
        assert form.save_as('My live smooth preset')
        form.profile.set('Precision');form.profile_picker.event_generate('<<ComboboxSelected>>');root.update()
        wait_for(lambda:engine.snapshot().get('appliedSettings',{}).get('aim_mode')=='snap',10)
        form.profile.set('My live smooth preset');form.profile_picker.event_generate('<<ComboboxSelected>>');root.update()
        wait_for(lambda:engine.snapshot().get('appliedSettings',{}).get('fov')==97 and engine.snapshot().get('appliedSettings',{}).get('aim_mode')=='smooth',10)
        print('PASS: FOV Entry + slider + smooth Combobox edits autosave to disk and reach live game; named preset reload restores both.',flush=True)
    finally:
        engine.stop();root.destroy();os.environ.pop('ABYSS_TRAINER_PROFILE',None)
