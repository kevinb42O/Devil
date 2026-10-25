"""Exercise the native forms and capture only this test's own settings window."""
from pathlib import Path
import subprocess
import objc
from AppKit import NSApplication,NSApplicationActivationPolicyAccessory,NSTabView
from Foundation import NSObject,NSTimer
from overlay import Controller
from app import Engine
from settings import PRESETS,preset
from dataclasses import asdict
from settings import Settings

application=NSApplication.sharedApplication();application.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
engine=Engine(demo=True);controller=Controller.alloc().init();controller.start(engine,12)
for name in PRESETS:
    controller.fill(preset(name));assert controller.read_form()==preset(name),name
controller.fill(Settings.validated({'godmode':True}));assert controller.read_form().godmode
controller.fill(preset('Precision'));controller.menu.makeKeyAndOrderFront_(None)
output=Path(__file__).parent/'.qa';output.mkdir(exist_ok=True)
tabs=next(view for view in controller.menu.contentView().subviews() if view.isKindOfClass_(NSTabView))

class Render(NSObject):
    def tick_(self,timer):
        if self.index==5:
            controller.menu.orderOut_(None)
            engine.settings=Settings.validated({**asdict(engine.settings),'fov':60,'esp_fov':True})
            display=engine.displays[0];w,h=display['width']-80,display['height']-130
            selected=dict(id='1:crystal0',enemy=1,kind='squid2',category='tower',priority=0,aimable=True,
                x=w*.55,y=h*.5,box=[w*.55-18,h*.5-18,36,36],health=4,maxHealth=10,distance=12.3,
                label='TOWER II · CRYSTAL 1',lead=dict(x=w*.55+20,y=h*.5,box=[0,0,5,5]))
            other=dict(id='2:body',enemy=2,kind='skull2',category='enemy',priority=2,aimable=True,
                x=w*.3,y=h*.65,box=[w*.3-14,h*.65-14,28,28],health=3,maxHealth=5,distance=8.4,label='SKULL II')
            blocked=dict(id='3:crystal1',enemy=3,kind='squid3',category='tower',priority=0,aimable=False,
                x=w*.7,y=h*.3,box=[w*.7-20,h*.3-20,40,40],health=24,maxHealth=30,distance=22,label='TOWER III · CRYSTAL 2')
            offscreen=dict(id='4:body',enemy=4,kind='skull4',priority=2,category='enemy',aimable=True,
                box=None,arrow=dict(x=w-26,y=h*.5,angle=0),health=100,maxHealth=100,distance=40,label='SKULL IV')
            engine.status=dict(connected=True,focused=True,active=False,targets=3,candidates=[selected,other,blocked,offscreen],target=selected,
                cameraFov=90,region=dict(left=display['left']+40,top=display['top']+70,width=w,height=h),message='ESP drawing verification')
            self.index+=1;return
        if self.index==6:
            subprocess.run(['/usr/sbin/screencapture','-x','-o','-l',str(controller.panel.windowNumber()),str(output/'overlay.png')],check=True,capture_output=True)
            timer.invalidate();print('Native form roundtrips, five tabs and ESP rendering passed.',flush=True);controller.quit_(None);return
        name=('aim','survival','esp','targets','connection')[self.index]
        subprocess.run(['/usr/sbin/screencapture','-x','-o','-l',str(controller.menu.windowNumber()),str(output/(name+'.png'))],check=True,capture_output=True)
        self.index+=1
        if self.index<5:tabs.selectTabViewItemAtIndex_(self.index)

renderer=Render.alloc().init();renderer.index=0
renderer.timer=NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(1,renderer,'tick:',None,True)
try:application.run()
finally:
    renderer.timer.invalidate();engine.stop();controller.timer.invalidate();controller.hotkeys.close();controller.menu.orderOut_(None);controller.panel.orderOut_(None)
