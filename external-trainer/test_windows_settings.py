from dataclasses import asdict
import json
from pathlib import Path
import tempfile
import tkinter as tk
import unittest
from unittest.mock import patch

import app
from settings import Settings, KINDS, PRESETS, preset
from windows_settings import SettingsForm


class SettingsFormTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.patch=patch.object(app,'ROOT',Path(self.temp.name));self.patch.start()
        self.engine=app.Engine()
        self.root=tk.Tk();self.root.withdraw();self.window=tk.Toplevel(self.root)
        self.form=SettingsForm(self.window,self.engine,lambda:None)

    def tearDown(self):
        self.root.destroy();self.patch.stop();self.temp.cleanup()

    def test_all_settings_and_presets_roundtrip(self):
        self.assertEqual(set(self.form.fields)|{'profile','excluded_kinds'},set(asdict(Settings())))
        self.assertEqual(set(self.form.kind_fields),set(KINDS))
        self.assertEqual([self.form.tabs.tab(tab,'text') for tab in self.form.tabs.tabs()],['Aim','ESP','Targets','Connection'])
        for name in PRESETS:
            with self.subTest(name=name):
                value=preset(name,'http://localhost:1234');self.form.fill(value)
                self.assertEqual(self.form.read_form(),value)

    def test_apply_preserves_custom_values_and_persists_across_restart(self):
        custom=Settings.validated(dict(profile='Custom',fov=73,max_distance=150,esp_boxes=False,esp_opacity=.4,excluded_kinds='skull,orb',hud_anchor='bottom_right'))
        self.form.fill(custom);self.form.apply()
        self.assertEqual(self.engine.settings,custom)
        self.assertEqual(app.Engine().settings,custom)
        self.form.fields['fov'].set('82');self.form.apply()
        self.assertEqual(self.engine.settings.fov,82)
        self.assertEqual(self.engine.settings.esp_opacity,.4)
        self.assertFalse(self.engine.settings.esp_boxes)
        self.assertEqual(self.engine.settings.excluded_kinds,'skull,orb')

    def test_selecting_preset_does_not_reset_custom_values_on_apply(self):
        self.form.fields['fov'].set('92');self.form.profile.set('Minimal');self.form.apply()
        self.assertEqual(self.engine.settings.fov,92)
        self.assertEqual(self.engine.settings.profile,'Custom')

    def test_load_preset_and_defaults_are_staged_until_apply(self):
        before=self.engine.settings;self.form.profile.set('Smooth');self.form.load_preset()
        self.assertEqual(self.engine.settings,before)
        self.assertEqual(self.form.read_form(),preset('Smooth'))
        self.form.defaults();self.assertEqual(self.engine.settings,before)
        self.assertEqual(self.form.read_form(),preset('Precision'))

    def test_invalid_values_and_failed_save_leave_live_settings_unchanged(self):
        before=self.engine.settings;self.form.fields['fov'].set('999');self.form.apply()
        self.assertEqual(self.engine.settings,before);self.assertIn('fov',self.form.notice.get())
        self.form.fields['fov'].set('90')
        with patch.object(self.engine,'update',side_effect=OSError('Disk unavailable')):self.form.apply()
        self.assertEqual(self.engine.settings,before);self.assertIn('Disk unavailable',self.form.notice.get())

    def test_import_export_and_invalid_import_preserve_live_settings(self):
        self.form.fill(preset('Smooth'));file=Path(self.temp.name)/'export.json';self.form.export_path(file)
        self.form.defaults();self.form.import_path(file)
        self.assertEqual(self.form.read_form(),preset('Smooth'))
        self.assertEqual(self.engine.settings,preset('Precision'))
        before=self.form.read_form();file.write_text('{}')
        with self.assertRaises(ValueError):self.form.import_path(file)
        self.assertEqual(self.form.read_form(),before)

    def test_form_controls_fit_inside_each_tab(self):
        self.window.update()
        def check(widget):
            for child in widget.winfo_children():
                if child.winfo_ismapped():
                    self.assertLessEqual(child.winfo_x()+child.winfo_width(),widget.winfo_width()+2,str(child))
                    self.assertLessEqual(child.winfo_y()+child.winfo_height(),widget.winfo_height()+2,str(child))
                    check(child)
        for geometry in ('820x720','780x690'):
            self.window.geometry(geometry)
            for tab in self.form.tabs.tabs():
                self.form.tabs.select(tab);self.window.update();check(self.window)

if __name__=='__main__':unittest.main()
