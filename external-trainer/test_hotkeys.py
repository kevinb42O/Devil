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
            kCGKeyboardEventKeycode='code',kCGKeyboardEventAutorepeat='repeat',CGEventGetIntegerValueField=lambda event,key:event.get(key,0),CGEventTapEnable=Mock())
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
        for code in (98,109):
            self.assertIsNone(handler.handle(None,10,dict(code=code),None))
            self.assertEqual(handler.engine.commands.get_nowait(),'key:'+str(code))

    def test_disabled_event_tap_is_reenabled(self):
        handler=self.make();event={}
        self.assertIs(handler.handle(None,1000,event,None),event)
        handler.q.CGEventTapEnable.assert_called_once_with('tap',True)

    def test_unrelated_game_input_is_passed_through(self):
        handler=self.make();event=dict(code=13)
        self.assertIs(handler.handle(None,10,event,None),event)
        self.assertTrue(handler.engine.commands.empty())


if __name__=='__main__':unittest.main()
