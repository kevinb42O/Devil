"""Reserve trainer keys before Chrome handles them; callbacks stay on the main loop."""
import os

CODES={99,118,97,98,100,101,109}  # F3/F4/F6/F7/F8/F9/F10


class NativeHotkeys:
    def __init__(self,engine):
        import Quartz as q
        from AppKit import NSWorkspace
        from CoreFoundation import CFRunLoopGetMain,CFMachPortCreateRunLoopSource,CFRunLoopAddSource,kCFRunLoopCommonModes
        self.q=q;self.engine=engine;self.workspace=NSWorkspace.sharedWorkspace();self.captured=set();self.tap=None
        self.callback=self.handle
        mask=(1<<q.kCGEventKeyDown)|(1<<q.kCGEventKeyUp)
        self.tap=q.CGEventTapCreate(q.kCGSessionEventTap,q.kCGHeadInsertEventTap,q.kCGEventTapOptionDefault,mask,self.callback,None)
        if self.tap:
            self.source=CFMachPortCreateRunLoopSource(None,self.tap,0)
            CFRunLoopAddSource(CFRunLoopGetMain(),self.source,kCFRunLoopCommonModes)
            q.CGEventTapEnable(self.tap,True)

    def handle(self,proxy,event_type,event,refcon):
        q=self.q
        try:
            if event_type in (q.kCGEventTapDisabledByTimeout,q.kCGEventTapDisabledByUserInput):
                q.CGEventTapEnable(self.tap,True);return event
            code=q.CGEventGetIntegerValueField(event,q.kCGKeyboardEventKeycode)
            if code not in CODES:return event
            if event_type==q.kCGEventKeyUp:
                if code in self.captured:self.captured.discard(code);return None
                return event
            app=self.workspace.frontmostApplication();pid=app.processIdentifier() if app else 0
            managed=pid in (os.getpid(),self.engine.browser_pid)
            if not managed and code not in (98,109):return event
            self.captured.add(code)
            if not q.CGEventGetIntegerValueField(event,q.kCGKeyboardEventAutorepeat):
                if code==100:self.engine.armed=not self.engine.armed
                elif code==101:self.engine.armed=False
                else:self.engine.commands.put('key:'+str(code))
            return None
        except Exception as error:
            self.engine.hotkey_warning='Hotkey issue: '+str(error)
            return event

    def close(self):
        if self.tap:
            from CoreFoundation import CFRunLoopGetMain,CFRunLoopRemoveSource,kCFRunLoopCommonModes,CFMachPortInvalidate
            self.q.CGEventTapEnable(self.tap,False)
            CFRunLoopRemoveSource(CFRunLoopGetMain(),self.source,kCFRunLoopCommonModes)
            CFMachPortInvalidate(self.tap)
            self.tap=None
