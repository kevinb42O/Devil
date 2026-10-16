"""Regression: the Windows companion must never cover another application's window."""
import queue
import threading
import unittest
from unittest.mock import Mock
from app import Engine
from windows_overlay import Overlay

class WindowsWindowTests(unittest.TestCase):
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
