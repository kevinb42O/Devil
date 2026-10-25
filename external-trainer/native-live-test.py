"""Physical hotkey integration in a temporary managed browser profile; no gameplay."""
import os
import tempfile
import time
import traceback
from dataclasses import asdict
import Quartz as q
from AppKit import NSApplication,NSApplicationActivationPolicyAccessory,NSRunningApplication,NSApplicationActivateIgnoringOtherApps
from Foundation import NSObject,NSTimer
from app import Engine
from settings import Settings,preset
from overlay import Controller

class TestEngine(Engine):
    def update(self,values):
        with self.lock:self.settings=Settings.validated({**asdict(self.settings),**values})

application=NSApplication.sharedApplication();application.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
profile=tempfile.TemporaryDirectory(prefix='abyss-hotkeys-');os.environ['ABYSS_TRAINER_PROFILE']=profile.name
engine=TestEngine();engine.settings=preset('Precision')
controller=Controller.alloc().init();controller.start(engine,60)

def key(code):
    for down in (True,False):
        event=q.CGEventCreateKeyboardEvent(None,code,down)
        if code==24:q.CGEventKeyboardSetUnicodeString(event,1,'=')
        q.CGEventPost(q.kCGHIDEventTap,event)

class Verify(NSObject):
    def tick_(self,timer):
        try:self.check(timer)
        except Exception:
            self.error=traceback.format_exc();print(self.error,flush=True);timer.invalidate();controller.quit_(None)

    @__import__('objc').python_method
    def check(self,timer):
        if not controller.hotkeys.tap:raise RuntimeError('Accessibility permission is required for this live hotkey test')
        if self.stage==0:
            if not engine.status.get('connected'):return
            NSRunningApplication.runningApplicationWithProcessIdentifier_(engine.browser_pid).activateWithOptions_(NSApplicationActivateIgnoringOtherApps)
            self.stage=1;return
        if self.stage==1:
            key(97);self.stage=2;return
        if self.stage==2:
            assert engine.settings.profile=='Smooth','F6 must apply the next profile'
            assert engine.status.get('documentFocused'),'Chrome must not also handle F6 and move focus into its address bar'
            key(118);self.stage=3;return
        if self.stage==3:
            assert not engine.settings.esp_enabled,'F4 must toggle ESP'
            key(100);self.stage=4;return
        if self.stage==4:
            assert not engine.armed,'F8 must toggle aim'
            key(24);self.stage=5;return
        if self.stage==5:
            assert controller.menu.isVisible(),'= must open native settings'
            key(24);self.stage=6;return
        if self.stage==6:
            assert not controller.menu.isVisible(),'= must close native settings'
            self.passed=True;print('PASS: real memory connection, managed browser PID, reserved F6/F4/F8/= and browser focus preservation.',flush=True)
            timer.invalidate();controller.quit_(None)

verify=Verify.alloc().init();verify.stage=0;verify.error=None;verify.passed=False
verify.timer=NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(.7,verify,'tick:',None,True)
try:application.run()
finally:
    verify.timer.invalidate();engine.stop();controller.timer.invalidate();controller.hotkeys.close();controller.menu.orderOut_(None);controller.panel.orderOut_(None)
    profile.cleanup();os.environ.pop('ABYSS_TRAINER_PROFILE',None)
if not verify.passed:raise SystemExit(verify.error or 'Live hotkey test did not complete')
