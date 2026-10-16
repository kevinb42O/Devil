"""Regression: the Windows companion must never cover another application's window."""
import queue
import threading
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock,patch
import app
from app import Engine
from windows_overlay import Overlay

class WindowsWindowTests(unittest.TestCase):
    def test_f7_saves_custom_settings_and_keeps_invalid_edits_open(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(app,'ROOT',Path(temp)):
            engine=Engine(demo=True);window=Overlay(engine)
            # Keep the background bridge disabled, but exercise real disk persistence.
            engine.thread.join();engine.demo=False
            try:
                window.command('menu')
                window.form.fields['fov'].set('77')
                window.form.fields['esp_opacity'].set('0.5')
                window.command('menu')
                self.assertIsNone(window.menu)
                self.assertFalse(engine.suspended)
                self.assertEqual(Engine().settings.fov,77)
                self.assertEqual(Engine().settings.esp_opacity,.5)
                window.command('menu')
                self.assertEqual(window.form.fields['fov'].get(),'77.0')
                window.form.fields['fov'].set('999')
                window.command('menu')
                self.assertTrue(window.menu.winfo_exists())
                self.assertTrue(engine.suspended)
                self.assertIn('Could not save',window.form.notice.get())
                self.assertEqual(Engine().settings.fov,77)
                window.form.fields['fov'].set('80')
                with patch.object(engine,'update',side_effect=OSError('Disk unavailable')):
                    window.command('menu')
                self.assertTrue(window.menu.winfo_exists())
                self.assertIn('Disk unavailable',window.form.notice.get())
                window.command('menu')
                self.assertIsNone(window.menu)
                self.assertEqual(Engine().settings.fov,80)
            finally:window.close();engine.stop()

    def test_no_native_overlay_and_settings_close_restores_input(self):
        engine=Engine(demo=True)
        window=Overlay(engine)
        try:
            window.root.update()
            self.assertEqual(window.root.winfo_children(),[], 'No desktop-sized native overlay may exist')
            self.assertEqual(window.root.state(),'withdrawn')
            window.settings();window.root.update()
            self.assertTrue(engine.suspended)
            self.assertEqual(len(window.root.winfo_children()),1)
            window.settings();window.root.update()
            self.assertFalse(engine.suspended)
            self.assertEqual(window.root.winfo_children(),[])
        finally:
            window.close();engine.stop()

if __name__=='__main__':unittest.main()
