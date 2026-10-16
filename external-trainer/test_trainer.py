import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import app
from dataclasses import asdict
from settings import Settings,PRESETS,preset,export_document,import_document


class SettingsTests(unittest.TestCase):
    def test_default_uses_immediate_nearest_selection_with_crystal_priority(self):
        self.assertEqual(Settings().selection,'nearest')
        self.assertTrue(Settings().tower_priority)
        for name in ('Precision','Smooth','Minimal'):
            self.assertEqual(preset(name).selection,'nearest')

    def test_invalid_settings(self):
        for values in [dict(game_url='file:///tmp/game'),dict(game_url='invalid'),dict(prediction='yes'),dict(unknown=1)]:
            with self.subTest(values=values),self.assertRaises((ValueError,TypeError)):
                app.Settings.validated(values)

    def test_persist_only_memory_settings(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(app,'ROOT',Path(tmp)):
            (Path(tmp)/'settings.json').write_text(json.dumps(dict(colors='#ff0000',width=500,auto_fire=True)))
            engine=app.Engine()
            self.assertTrue(engine.armed)
            self.assertEqual(engine.settings.game_url,'https://devil-green.vercel.app')
            engine.update(dict(prediction=False))
            saved=json.loads((Path(tmp)/'settings.json').read_text())
            self.assertEqual(set(saved),set(asdict(Settings())))
            self.assertNotIn('colors',saved)
            self.assertFalse(app.Engine().settings.prediction)

    def test_every_preset_is_valid_and_preserves_game_address(self):
        for name in PRESETS:
            value=preset(name,'http://localhost:9999')
            self.assertEqual(Settings.validated(asdict(value)),value)
            self.assertEqual(value.game_url,'http://localhost:9999')

    def test_strict_ranges_colors_types_and_filters(self):
        for values in [dict(fov=0),dict(fov=361),dict(max_distance=float('inf')),dict(smooth_speed=float('nan')),
                       dict(esp_opacity=0),dict(esp_max_targets=1.5),dict(color_tower='orange'),dict(color_enemy='#00000000'),
                       dict(excluded_kinds='skull,unknown'),dict(selection='random'),dict(esp_enabled='yes'),dict(game_url='http://localhost:abc')]:
            with self.subTest(values=values),self.assertRaises(ValueError):Settings.validated(values)
        settings=Settings.validated(dict(excluded_kinds='skull2, skull,skull2',color_tower='#aabbcc'))
        self.assertEqual(settings.excluded_kinds,'skull,skull2');self.assertEqual(settings.color_tower,'#AABBCC')

    def test_config_export_import_roundtrip_and_version_checks(self):
        original=preset('Smooth');self.assertEqual(import_document(export_document(original)),original)
        for invalid in [{},[],dict(format='abyss-memory-trainer',version=True,settings={}),dict(format='abyss-memory-trainer',version=2,settings={})]:
            with self.assertRaises(ValueError):import_document(invalid)

    def test_failed_save_does_not_change_live_settings(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(app,'ROOT',Path(tmp)):
            engine=app.Engine();before=engine.settings
            with patch.object(Path,'replace',side_effect=OSError('Disk unavailable')):
                with self.assertRaises(OSError):engine.update(dict(fov=90))
            self.assertEqual(engine.settings,before)
            self.assertFalse(list(Path(tmp).glob('.settings-*.tmp')))

    def test_settings_changes_during_connect_do_not_restart_browser(self):
        engine=app.Engine(demo=True)
        process=unittest.mock.Mock();process.poll.return_value=None;engine.process=process
        engine.update(dict(esp_enabled=False));process.terminate.assert_not_called()
        engine.reconnect();self.assertEqual(engine.reconnect_generation,1);process.terminate.assert_not_called()

    def test_corrupted_config_is_reported_without_overwriting_it(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(app,'ROOT',Path(tmp)):
            file=Path(tmp)/'settings.json';file.write_text('invalid json')
            engine=app.Engine();self.assertIsNotNone(engine.config_warning);self.assertEqual(file.read_text(),'invalid json')

    def test_disconnect_clears_stale_esp(self):
        engine=app.Engine(demo=True);engine.status=dict(active=True,connected=True,focused=True,candidates=[dict(id=1)],target=dict(id=1))
        engine.disconnected('Test disconnect')
        state=engine.snapshot();self.assertFalse(state['active']);self.assertFalse(state['focused']);self.assertEqual(state['candidates'],[]);self.assertIsNone(state['target'])


class NativeHotkeyTests(unittest.TestCase):
    def test_on_off_does_not_require_a_modifier(self):
        from overlay import Controller,NSEventTypeKeyDown
        engine=app.Engine(demo=True)
        controller=Controller.alloc().init();controller.engine=engine
        class Event:
            def __init__(self,code,repeat=False):self.code,self.repeat=code,repeat
            def type(self):return NSEventTypeKeyDown
            def isARepeat(self):return self.repeat
            def keyCode(self):return self.code
        controller.handleKey(Event(100));self.assertFalse(engine.armed)
        controller.handleKey(Event(100,repeat=True));self.assertFalse(engine.armed)
        controller.handleKey(Event(100));self.assertTrue(engine.armed)
        controller.handleKey(Event(101));self.assertFalse(engine.armed)
        controller.handleKey(Event(118));self.assertFalse(engine.settings.esp_enabled)
        controller.handleKey(Event(99));self.assertFalse(engine.settings.hud_enabled)
        for code,command in [(98,'menu'),(109,'quit')]:
            controller.handleKey(Event(code));self.assertEqual(engine.commands.get_nowait(),command)
        controller.handleKey(Event(97));self.assertEqual(engine.commands.get_nowait(),'preset')

    def test_multiple_monitor_coordinates(self):
        from overlay import Controller
        from Foundation import NSMakeRect
        controller=Controller.alloc().init();controller.bounds=NSMakeRect(-1920,0,3360,1080);controller.top=-180
        self.assertEqual(controller.local(0,0),(1920,180))


if __name__=='__main__':unittest.main()
