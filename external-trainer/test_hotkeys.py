import os
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from hotkeys import NativeHotkeys
from app import Engine


class HotkeyTests(unittest.TestCase):
    def make(self):
        handler=object.__new__(NativeHotkeys)
        handler.engine=Engine(demo=True);handler.engine.browser_pid=777;handler.captured=set();handler.tap='tap'
        handler.q=SimpleNamespace(kCGEventKeyDown=10,kCGEventKeyUp=11,kCGEventTapDisabledByTimeout=1000,kCGEventTapDisabledByUserInput=1001,
            kCGKeyboardEventKeycode='code',kCGKeyboardEventAutorepeat='repeat',CGEventGetIntegerValueField=lambda event,key:event.get(key,0),CGEventTapEnable=Mock(),
            CGEventKeyboardGetUnicodeString=lambda event,*args:(len(event.get('text','=' if event.get('code')==24 else '')),event.get('text','=' if event.get('code')==24 else '')))
        self.pid=777
        handler.workspace=SimpleNamespace(frontmostApplication=lambda:SimpleNamespace(processIdentifier=lambda:self.pid))
        return handler

    def test_chrome_does_not_receive_reserved_keys_or_their_repeats(self):
        handler=self.make();event=dict(code=100)
        self.assertIsNone(handler.handle(None,10,event,None));self.assertFalse(handler.engine.armed)
        self.assertIsNone(handler.handle(None,10,dict(code=100,repeat=1),None));self.assertFalse(handler.engine.armed)
        self.pid=999
        self.assertIsNone(handler.handle(None,11,event,None),'keyup remains consumed after focus changes')

    def test_other_app_function_keys_are_preserved(self):
        handler=self.make();self.pid=999;event=dict(code=97)
        self.assertIs(handler.handle(None,10,event,None),event)
        self.assertTrue(handler.engine.commands.empty())

    def test_settings_and_quit_remain_global(self):
        handler=self.make();self.pid=999
        for code in (24,109):
            self.assertIsNone(handler.handle(None,10,dict(code=code),None))
            self.assertEqual(handler.engine.commands.get_nowait(),'menu' if code==24 else 'key:'+str(code))

    def test_equals_toggles_once_per_press_and_f7_is_released(self):
        handler=self.make()
        self.assertIsNone(handler.handle(None,10,dict(code=24),None))
        self.assertEqual(handler.engine.commands.get_nowait(),'menu')
        self.assertIsNone(handler.handle(None,10,dict(code=24,repeat=1),None))
        self.assertTrue(handler.engine.commands.empty())
        self.assertIsNone(handler.handle(None,11,dict(code=24),None))
        event=dict(code=98)
        self.assertIs(handler.handle(None,10,event,None),event)
        self.assertTrue(handler.engine.commands.empty())

    def test_equals_follows_keyboard_layout_and_releases_after_shift_changes(self):
        handler=self.make()
        # The current Mac layout puts '=' on key 44; US position 24 types '-'.
        event=dict(code=24,text='-')
        self.assertIs(handler.handle(None,10,event,None),event)
        self.assertTrue(handler.engine.commands.empty())
        self.assertIsNone(handler.handle(None,10,dict(code=44,text='='),None))
        self.assertEqual(handler.engine.commands.get_nowait(),'menu')
        self.assertIsNone(handler.handle(None,11,dict(code=44,text=''),None))

    def test_disabled_event_tap_is_reenabled(self):
        handler=self.make();event={}
        self.assertIs(handler.handle(None,1000,event,None),event)
        handler.q.CGEventTapEnable.assert_called_once_with('tap',True)

    def test_unrelated_game_input_is_passed_through(self):
        handler=self.make();event=dict(code=13)
        self.assertIs(handler.handle(None,10,event,None),event)
        self.assertTrue(handler.engine.commands.empty())


if __name__=='__main__':unittest.main()
