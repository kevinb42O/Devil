"""Native click-through memory ESP, HUD and settings. No screen capture."""
import math
import time
import json
from dataclasses import asdict
import objc
from AppKit import (
    NSApplication, NSApplicationActivationPolicyAccessory, NSBackingStoreBuffered, NSBezierPath,
    NSButton, NSColor, NSControlStateValueOff, NSControlStateValueOn, NSFont, NSFontAttributeName,
    NSEvent, NSEventMaskKeyDown, NSEventMaskKeyUp, NSEventTypeKeyDown, NSEventTypeApplicationDefined,
    NSForegroundColorAttributeName, NSMaxY, NSPanel, NSScreen, NSScreenSaverWindowLevel, NSTextField,
    NSUnionRect, NSView, NSWindowCollectionBehaviorCanJoinAllSpaces, NSWindowCollectionBehaviorFullScreenAuxiliary,
    NSWindowCollectionBehaviorStationary, NSWindowStyleMaskBorderless, NSWindowStyleMaskNonactivatingPanel,
    NSWindowStyleMaskTitled, NSPopUpButton, NSTabView, NSTabViewItem, NSOpenPanel, NSSavePanel,
    NSModalResponseOK, NSAppearance, NSAppearanceNameDarkAqua, NSGraphicsContext,
)
from Foundation import NSObject, NSTimer, NSString
from settings import Settings, KINDS, PRESETS, DISPLAY_NAMES, preset, import_document, export_document


def ink(hex_value, alpha=1):
    r,g,b=bytes.fromhex(hex_value.lstrip('#'))
    return NSColor.colorWithCalibratedRed_green_blue_alpha_(r/255,g/255,b/255,alpha)


def text(value,x,y,size=12,color=None):
    attributes={NSForegroundColorAttributeName:color or NSColor.whiteColor()}
    font=NSFont.systemFontOfSize_(size)
    if font is not None:attributes[NSFontAttributeName]=font
    NSString.stringWithString_(str(value)).drawAtPoint_withAttributes_((x,y),attributes)


def line(x1,y1,x2,y2,width=1):
    path=NSBezierPath.bezierPath();path.setLineWidth_(width)
    path.moveToPoint_((x1,y1));path.lineToPoint_((x2,y2));path.stroke()


class OverlayPanel(NSPanel):
    def canBecomeKeyWindow(self):return False
    def canBecomeMainWindow(self):return False


class OverlayView(NSView):
    def isFlipped(self):return True

    def drawRect_(self,rect):
        try:self.paint()
        except Exception as error:
            # Keep native drawing exceptions inside Python rather than crashing AppKit.
            if getattr(self,'last_error',None)!=str(error):
                self.last_error=str(error);print('Overlay rendering error: '+str(error),flush=True)

    @objc.python_method
    def paint(self):
        owner=self.owner;engine=owner.engine;state=engine.snapshot();settings=engine.settings
        region=state.get('region');target=state.get('target');focused=state.get('focused',False)
        if region and (focused or engine.demo) and settings.esp_enabled:
            ox,oy=owner.local(region['left'],region['top']);w,h=region['width'],region['height']
            NSGraphicsContext.saveGraphicsState()
            try:
                NSBezierPath.bezierPathWithRect_(((ox,oy),(w,h))).addClip()
                opacity=settings.esp_opacity;scale=settings.esp_scale
                if settings.esp_fov and settings.fov<170:
                    radius=h/2*math.tan(math.radians(settings.fov/2))/math.tan(math.radians(state.get('cameraFov',90)/2))
                    ink(settings.color_selected,opacity*.3).setStroke()
                    NSBezierPath.bezierPathWithOvalInRect_(((ox+w/2-radius,oy+h/2-radius),(radius*2,radius*2))).stroke()
                labeled=set();arrows=set()
                for item in sorted(state.get('candidates',[]),key=lambda point:point.get('id')==(target or {}).get('id')):
                    selected=item.get('id')==(target or {}).get('id')
                    color=ink(settings.color_selected if selected else settings.color_tower if item.get('category')=='tower' else settings.color_enemy,
                              opacity*(1 if item.get('aimable') else .45))
                    color.setStroke();box=item.get('box')
                    if not box:
                        arrow=item.get('arrow')
                        if settings.esp_arrows and arrow and (item['enemy'] not in arrows or selected):
                            x,y=ox+arrow['x'],oy+arrow['y'];angle=arrow['angle'];size=8*scale
                            path=NSBezierPath.bezierPath()
                            for i,offset in enumerate([0,2.5,-2.5]):
                                point=(x+math.cos(angle+offset)*size,y+math.sin(angle+offset)*size)
                                if i==0:path.moveToPoint_(point)
                                else:path.lineToPoint_(point)
                            path.closePath();color.setFill();path.fill()
                            arrows.add(item['enemy'])
                        continue
                    bx,by,bw,bh=box;x,y=ox+bx,oy+by
                    if settings.esp_boxes:
                        if settings.esp_style=='corners':
                            length=max(3,min(14*scale,bw*.28,bh*.28))
                            for cx,cy,sx,sy in [(x,y,1,1),(x+bw,y,-1,1),(x,y+bh,1,-1),(x+bw,y+bh,-1,-1)]:
                                line(cx,cy,cx+sx*length,cy,2 if selected else 1);line(cx,cy,cx,cy+sy*length,2 if selected else 1)
                        else:
                            path=NSBezierPath.bezierPathWithRect_(((x,y),(bw,bh)));path.setLineWidth_(2 if selected else 1);path.stroke()
                    if settings.esp_health:
                        bar=max(16,min(100*scale,bw));fraction=max(0,min(1,item.get('health',0)/max(.001,item.get('maxHealth',1))))
                        NSColor.colorWithCalibratedWhite_alpha_(.05,opacity).setFill();NSBezierPath.bezierPathWithRect_(((x,y+bh+3),(bar,3*scale))).fill()
                        ink('#75DDA4' if fraction>.5 else '#EAB966' if fraction>.2 else '#EF7A83',opacity).setFill()
                        NSBezierPath.bezierPathWithRect_(((x,y+bh+3),(bar*fraction,3*scale))).fill()
                    if (item['enemy'] not in labeled and item['enemy']!=(target or {}).get('enemy')) or selected:
                        parts=[]
                        if settings.esp_labels:parts.append(item.get('label',item['kind']))
                        if settings.esp_distance:parts.append('%.1f u'%item.get('distance',0))
                        if parts:text('  /  '.join(parts),max(ox,x),max(oy,y-17*scale),10*scale,color)
                        labeled.add(item['enemy'])
                    if selected:
                        if settings.esp_lines:
                            color.setStroke();line(ox+w/2,oy+h/2,ox+item['x'],oy+item['y'])
                        lead=item.get('lead')
                        if settings.esp_prediction and lead and lead.get('box'):
                            lx,ly=ox+lead['x'],oy+lead['y'];color.setStroke()
                            line(lx-4,ly,lx+4,ly);line(lx,ly-4,lx,ly+4)
            finally:NSGraphicsContext.restoreGraphicsState()
        if not settings.hud_enabled:return
        width,height=(400,78) if settings.hud_compact else (560,112)
        if region and focused:
            left,top=owner.local(region['left'],region['top']);rw,rh=region['width'],region['height']
        else:left,top=22,24;rw,rh=owner.bounds.size.width-44,owner.bounds.size.height-48
        x=left+12 if settings.hud_anchor.endswith('left') else left+max(0,rw-width-12)
        y=top+12 if settings.hud_anchor.startswith('top') else top+max(0,rh-height-12)
        NSColor.colorWithCalibratedWhite_alpha_(.035,.88).setFill()
        NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius_(((x,y),(width,height)),8,8).fill()
        label='LOCKED' if state.get('active') else 'AIM ON' if state['armed'] else 'AIM OFF'
        if state.get('error'):label='AIM FAULT'
        if not state.get('connected'):label='DISCONNECTED' if state.get('error') or state.get('disconnected') else 'CONNECTING'
        if engine.demo:label='DEMO'
        color=ink(settings.color_selected) if not state.get('error') else ink('#EF7A83')
        text('ABYSS  /  '+label+'  /  '+settings.profile,x+12,y+9,12,color)
        message=state.get('message','Starting')
        if target and not state.get('error'):
            message='%s · HP %.0f · %.1f u'%(target.get('label',target['kind']),target.get('health',0),target.get('distance',0))
        if time.monotonic()<owner.notice_until and not state.get('error'):message=owner.notice
        text(str(message)[:65 if not settings.hud_compact else 49],x+12,y+30,11)
        text('F7 settings  F8 aim  F4 ESP  F3 HUD  F10 quit',x+12,y+53,10,ink('#A4B5C3'))
        if not settings.hud_compact:
            text('%s targets · %.2f ms · %s aim updates'%(state.get('targets',0),state.get('averageMs',0),state.get('aimApplications',0)),x+12,y+80,11)


class Controller(NSObject):
    def init(self):
        self=objc.super(Controller,self).init()
        if self is None:return None
        self.notice='';self.notice_until=0;self.fields={};self.kind_fields={};self.field_types={};self.last_layout_check=0
        return self

    @objc.python_method
    def local(self,x,y):return x-self.bounds.origin.x,y-self.top

    @objc.python_method
    def say(self,message):self.notice,self.notice_until=str(message),time.monotonic()+6

    @objc.python_method
    def layout(self):
        screens=NSScreen.screens();bounds=screens[0].frame();primary_height=screens[0].frame().size.height
        displays=[]
        for screen in screens:
            frame=screen.frame();bounds=NSUnionRect(bounds,frame)
            displays.append(dict(left=frame.origin.x,top=primary_height-NSMaxY(frame),width=frame.size.width,height=frame.size.height,scale=screen.backingScaleFactor()))
        changed=getattr(self,'bounds',None)!=bounds or self.engine.displays!=displays
        self.bounds=bounds;self.top=primary_height-NSMaxY(bounds)
        self.engine.displays=displays
        if hasattr(self,'panel') and changed:
            self.panel.setFrame_display_(bounds,True);self.view.setFrame_(((0,0),bounds.size))

    @objc.python_method
    def start(self,engine,quit_after):
        self.engine=engine;self.quit_at=time.monotonic()+quit_after if quit_after else 0
        self.layout()
        self.panel=OverlayPanel.alloc().initWithContentRect_styleMask_backing_defer_(self.bounds,
            NSWindowStyleMaskBorderless|NSWindowStyleMaskNonactivatingPanel,NSBackingStoreBuffered,False)
        self.panel.setOpaque_(False);self.panel.setBackgroundColor_(NSColor.clearColor());self.panel.setHasShadow_(False)
        self.panel.setIgnoresMouseEvents_(True);self.panel.setLevel_(NSScreenSaverWindowLevel)
        self.panel.setCollectionBehavior_(NSWindowCollectionBehaviorCanJoinAllSpaces|NSWindowCollectionBehaviorFullScreenAuxiliary|NSWindowCollectionBehaviorStationary)
        self.panel.setHidesOnDeactivate_(False)
        self.view=OverlayView.alloc().initWithFrame_(((0,0),self.bounds.size));self.view.owner=self
        self.panel.setContentView_(self.view);self.panel.orderFrontRegardless();engine.overlay_id=self.panel.windowNumber()
        from hotkeys import NativeHotkeys
        self.hotkeys=NativeHotkeys(engine)
        self.global_monitor=self.local_monitor=None
        if not self.hotkeys.tap:
            engine.hotkey_warning='Enable Accessibility for the launcher to reserve trainer function keys.'
            mask=NSEventMaskKeyDown|NSEventMaskKeyUp
            self.global_monitor=NSEvent.addGlobalMonitorForEventsMatchingMask_handler_(mask,self.handleKey)
            self.local_monitor=NSEvent.addLocalMonitorForEventsMatchingMask_handler_(mask,self.handleLocalKey)
        self.buildMenu()
        self.timer=NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(1/30,self,'tick:',None,True)
        engine.thread.start()
        if engine.config_warning:self.say(engine.config_warning)
        elif engine.hotkey_warning:self.say(engine.hotkey_warning)
        print('Native memory overlay ready · F7 settings · F8 aim · F4 ESP',flush=True)

    @objc.python_method
    def handleKey(self,event):
        if event.type()!=NSEventTypeKeyDown or event.isARepeat():return
        self.key(event.keyCode())

    @objc.python_method
    def key(self,code):
        try:
            if code==100:self.engine.armed=not self.engine.armed
            elif code==101:self.engine.armed=False
            elif code in (99,118):
                key='esp_enabled' if code==118 else 'hud_enabled'
                self.engine.update({key:not getattr(self.engine.settings,key),'profile':'Custom'})
                if key in self.fields:self.fields[key].setState_(NSControlStateValueOn if getattr(self.engine.settings,key) else NSControlStateValueOff)
                if hasattr(self,'profile_popup'):self.profile_popup.selectItemWithTitle_('Custom')
            elif code==97:self.engine.commands.put('preset')
            else:
                command={98:'menu',109:'quit'}.get(code)
                if command:self.engine.commands.put(command)
        except (ValueError,OSError) as error:self.say(error)

    @objc.python_method
    def handleLocalKey(self,event):self.handleKey(event);return event

    @objc.python_method
    def buildMenu(self):
        screen=NSScreen.mainScreen().visibleFrame();width,height=660,660
        frame=((screen.origin.x+max(10,(screen.size.width-width)/2),screen.origin.y+max(10,(screen.size.height-height)/2)),(width,height))
        self.menu=NSPanel.alloc().initWithContentRect_styleMask_backing_defer_(frame,NSWindowStyleMaskTitled|NSWindowStyleMaskNonactivatingPanel,NSBackingStoreBuffered,False)
        self.menu.setTitle_('ABYSS / Trainer settings · F7 close');self.menu.setLevel_(NSScreenSaverWindowLevel+1)
        self.menu.setCollectionBehavior_(NSWindowCollectionBehaviorCanJoinAllSpaces|NSWindowCollectionBehaviorFullScreenAuxiliary)
        self.menu.setHidesOnDeactivate_(False);self.menu.setReleasedWhenClosed_(False)
        self.menu.setAppearance_(NSAppearance.appearanceNamed_(NSAppearanceNameDarkAqua))
        content=self.menu.contentView()
        self.label(content,'ABYSS / MEMORY TRAINER',20,622,300,18)
        self.profile_popup=NSPopUpButton.alloc().initWithFrame_pullsDown_(((360,616),(180,30)),False)
        self.profile_popup.addItemsWithTitles_(['Custom',*PRESETS]);content.addSubview_(self.profile_popup)
        self.button(content,'Load preset','loadPreset:',545,616,95)
        tabs=NSTabView.alloc().initWithFrame_(((16,90),(628,510)));content.addSubview_(tabs)
        pages={}
        for name in ('Aim','ESP','Targets','Connection'):
            item=NSTabViewItem.alloc().initWithIdentifier_(name);item.setLabel_(name)
            view=NSView.alloc().initWithFrame_(((0,0),(600,460)));item.setView_(view);tabs.addTabViewItem_(item);pages[name]=view
        aim=pages['Aim']
        self.choice(aim,'aim_mode','Aim behavior',[('snap','Instant snap'),('smooth','Smooth tracking')],420)
        self.check(aim,'prediction','Lead moving targets at projectile speed',386)
        self.number(aim,'fov','Aim cone · degrees (360 = all directions)',350)
        self.number(aim,'max_distance','Maximum range · world units',314)
        self.number(aim,'smooth_speed','Smooth turn speed · degrees / second',278)
        self.choice(aim,'selection','Target selection',[('crosshair','Closest to crosshair'),('nearest','Nearest distance'),('health','Lowest remaining health'),('threat','Soonest approaching threat')],242)
        self.check(aim,'tower_priority','Prioritize hittable attached tower crystals',206)
        self.number(aim,'switch_bias','Lock preference · 0–45',170)
        self.number(aim,'lock_ms','Minimum target hold · milliseconds',134)
        self.number(aim,'lead_limit','Maximum prediction · seconds',98)
        self.label(aim,'Aim activates only when you fire. No modifier key. No automatic firing.',16,48,570,11)
        self.label(aim,'Blocked crystals yield to enemies. Nearest distance ignores lock preference and hold time.',16,28,570,10)
        esp=pages['ESP']
        for i,(key,title) in enumerate([('esp_enabled','Enable ESP'),('esp_boxes','Target boxes'),('esp_labels','Enemy / crystal labels'),
            ('esp_health','Health bars'),('esp_distance','Distance'),('esp_lines','Selected target tracer'),('esp_prediction','Predicted intercept marker'),
            ('esp_arrows','Off-screen indicators'),('esp_fov','Draw aim cone'),('hud_enabled','Show status HUD'),('hud_compact','Compact HUD')]):
            self.check(esp,key,title,420-i*31,x=16,width=260)
        self.choice(esp,'esp_style','Box style',[('corners','Corners'),('box','Full box')],420,x=290,control_x=425,control_width=160)
        self.number(esp,'esp_opacity','Opacity · 0.1–1',384,x=290,control_x=465,control_width=120)
        self.number(esp,'esp_scale','Label size · 0.6–2',348,x=290,control_x=465,control_width=120)
        self.number(esp,'esp_max_targets','Maximum ESP points',312,x=290,control_x=465,control_width=120)
        self.choice(esp,'hud_anchor','HUD corner',[('top_left','Top left'),('top_right','Top right'),('bottom_left','Bottom left'),('bottom_right','Bottom right')],276,x=290,control_x=425,control_width=160)
        for i,(key,title) in enumerate([('color_tower','Tower · #RRGGBB'),('color_selected','Selected · #RRGGBB'),('color_enemy','Enemies · #RRGGBB')]):
            self.number(esp,key,title,240-i*36,x=290,control_x=465,control_width=120,text_field=True)
        self.label(esp,'F4 toggles ESP. F3 toggles the HUD. Aim can stay on while ESP is hidden.',16,48,570,11)
        targets=pages['Targets'];self.label(targets,'Include these aim targets. Excluded enemies remain visible in ESP.',16,430,570,12)
        for i,kind in enumerate(KINDS):
            field=NSButton.checkboxWithTitle_target_action_(DISPLAY_NAMES.get(kind,kind.capitalize()),self,'changed:')
            field.setFrame_(((16+(i//11)*290,390-(i%11)*32),(270,25)));targets.addSubview_(field);self.kind_fields[kind]=field
        conn=pages['Connection'];self.label(conn,'Managed game address',16,420,570,13)
        field=NSTextField.alloc().initWithFrame_(((16,384),(568,28)));conn.addSubview_(field)
        field.setDelegate_(self)
        self.fields['game_url']=field;self.field_types['game_url']='text'
        self.label(conn,'Changing this address restarts the managed game browser.',16,350,570,11)
        self.label(conn,'This adapter attaches to the local development build. No screen capture is used.',16,326,570,11)
        self.connection_status=self.label(conn,'',16,228,570,12,height=74)
        self.button(conn,'Reconnect memory','reconnect:',16,174,170)
        self.label(conn,'Reconnect reattaches to the current session when the browser is still open.',16,142,570,11)
        self.label(conn,'F8 aim · F9 off · F6 next preset · F7 settings · F10 quit',16,64,570,12)
        self.label(conn,'Profiles and exported settings are stored locally. Game source files are untouched.',16,34,570,11)
        self.form_notice=self.label(content,'',20,66,620,11)
        for title,action,x,w in [('Apply','apply:',20,110),('Defaults','defaults:',140,92),('Import…','importSettings:',244,90),('Export…','exportSettings:',346,90),('Close','closeMenu:',540,100)]:self.button(content,title,action,x,20,w)
        self.fill(self.engine.settings);self.menu.orderOut_(None)

    @objc.python_method
    def label(self,parent,value,x,y,width=270,size=12,height=24):
        field=NSTextField.labelWithString_(value);field.setFrame_(((x,y),(width,height)));field.setFont_(NSFont.systemFontOfSize_(size))
        field.setUsesSingleLineMode_(False);parent.addSubview_(field);return field

    @objc.python_method
    def button(self,parent,title,action,x,y,width):
        button=NSButton.buttonWithTitle_target_action_(title,self,action);button.setFrame_(((x,y),(width,32)));parent.addSubview_(button);return button

    @objc.python_method
    def check(self,parent,key,title,y,x=16,width=560):
        field=NSButton.checkboxWithTitle_target_action_(title,self,'changed:');field.setFrame_(((x,y),(width,26)))
        parent.addSubview_(field);self.fields[key]=field;self.field_types[key]='bool'

    @objc.python_method
    def number(self,parent,key,title,y,x=16,control_x=348,control_width=235,text_field=False):
        self.label(parent,title,x,y,control_x-x-6)
        field=NSTextField.alloc().initWithFrame_(((control_x,y),(control_width,26)))
        field.setDelegate_(self)
        parent.addSubview_(field);self.fields[key]=field;self.field_types[key]='text' if text_field else 'number'

    @objc.python_method
    def choice(self,parent,key,title,items,y,x=16,control_x=348,control_width=235):
        self.label(parent,title,x,y,control_x-x-6)
        field=NSPopUpButton.alloc().initWithFrame_pullsDown_(((control_x,y-2),(control_width,30)),False)
        field.addItemsWithTitles_([title for _,title in items]);field.setTarget_(self);field.setAction_('changed:')
        parent.addSubview_(field);self.fields[key]=field;self.field_types[key]=items

    @objc.python_method
    def fill(self,settings):
        values=asdict(settings)
        for key,field in self.fields.items():
            kind=self.field_types[key];value=values[key]
            if kind=='bool':field.setState_(NSControlStateValueOn if value else NSControlStateValueOff)
            elif isinstance(kind,list):field.selectItemAtIndex_([k for k,_ in kind].index(value))
            else:field.setStringValue_(str(value))
        excluded=set(settings.excluded_kinds.split(','))
        for key,field in self.kind_fields.items():field.setState_(NSControlStateValueOff if key in excluded else NSControlStateValueOn)
        self.profile_popup.selectItemWithTitle_(settings.profile)

    @objc.python_method
    def read_form(self):
        values={}
        for key,field in self.fields.items():
            kind=self.field_types[key]
            values[key]=field.state()==NSControlStateValueOn if kind=='bool' else kind[field.indexOfSelectedItem()][0] if isinstance(kind,list) else field.stringValue()
        values['excluded_kinds']=','.join(k for k,f in self.kind_fields.items() if f.state()!=NSControlStateValueOn)
        values['profile']=self.profile_popup.titleOfSelectedItem()
        return Settings.validated(values)

    def changed_(self,sender):
        self.profile_popup.selectItemWithTitle_('Custom');self.form_notice.setStringValue_('Unsaved changes · Apply to use them')

    def controlTextDidChange_(self,notification):
        self.changed_(None)

    def apply_(self,sender):
        try:
            self.engine.update(asdict(self.read_form()));self.form_notice.setStringValue_('Saved · settings are active')
            self.say('Settings saved · '+self.engine.settings.profile)
        except (ValueError,TypeError,OSError) as error:self.form_notice.setStringValue_(str(error));self.say(error)

    def loadPreset_(self,sender):
        name=self.profile_popup.titleOfSelectedItem()
        try:
            if name in PRESETS:self.fill(preset(name,self.fields['game_url'].stringValue()));self.form_notice.setStringValue_('Preset loaded · Apply to activate')
        except ValueError as error:self.form_notice.setStringValue_(str(error))

    def defaults_(self,sender):
        self.fill(preset('Precision',self.engine.settings.game_url));self.form_notice.setStringValue_('Defaults loaded · Apply to activate')

    def reconnect_(self,sender):self.engine.reconnect();self.say('Reconnecting to game memory')

    def importSettings_(self,sender):
        panel=NSOpenPanel.openPanel();panel.setAllowedFileTypes_(['json']);panel.setAllowsMultipleSelection_(False)
        if panel.runModal()!=NSModalResponseOK:return
        try:
            from pathlib import Path
            data=json.loads(Path(panel.URL().path()).read_text());self.fill(import_document(data));self.form_notice.setStringValue_('Imported · Apply to activate')
        except (ValueError,TypeError,OSError) as error:self.form_notice.setStringValue_(str(error))

    def exportSettings_(self,sender):
        try:data=export_document(self.read_form())
        except (ValueError,TypeError) as error:self.form_notice.setStringValue_(str(error));return
        panel=NSSavePanel.savePanel();panel.setAllowedFileTypes_(['json']);panel.setNameFieldStringValue_('abyss-trainer.json')
        if panel.runModal()!=NSModalResponseOK:return
        try:
            from pathlib import Path
            Path(panel.URL().path()).write_text(json.dumps(data,indent=2));self.form_notice.setStringValue_('Settings exported')
        except OSError as error:self.form_notice.setStringValue_(str(error))

    def closeMenu_(self,sender):self.menu.orderOut_(None);self.engine.suspended=False

    def quit_(self,sender):
        self.engine.armed=False;self.engine.running=False
        self.engine.terminate_bridge()
        application=NSApplication.sharedApplication();application.stop_(None)
        if application.modalWindow():application.abortModal()
        event=NSEvent.otherEventWithType_location_modifierFlags_timestamp_windowNumber_context_subtype_data1_data2_(NSEventTypeApplicationDefined,(0,0),0,0,0,None,0,0,0)
        application.postEvent_atStart_(event,True)

    def tick_(self,timer):
        while not self.engine.commands.empty():
            command=self.engine.commands.get_nowait()
            if command.startswith('key:'):self.key(int(command.split(':',1)[1]))
            elif command=='menu':
                if self.menu.isVisible():self.closeMenu_(None)
                else:self.engine.suspended=True;self.fill(self.engine.settings);self.menu.makeKeyAndOrderFront_(None)
            elif command=='preset':
                try:
                    names=list(PRESETS);name=names[(names.index(self.engine.settings.profile)+1)%len(names)] if self.engine.settings.profile in names else names[0]
                    self.engine.update(asdict(preset(name,self.engine.settings.game_url)));self.fill(self.engine.settings);self.say('Profile: '+name)
                except (ValueError,OSError) as error:self.say(error)
            elif command=='quit':self.quit_(None)
        if time.monotonic()-self.last_layout_check>1:self.layout();self.last_layout_check=time.monotonic()
        if self.menu.isVisible():
            state=self.engine.snapshot();self.connection_status.setStringValue_('%s\n%s targets · %s aim updates · %.2f ms average'%(state.get('message','Connecting'),state.get('targets',0),state.get('aimApplications',0),state.get('averageMs',0)))
            if self.engine.hotkey_warning:self.connection_status.setStringValue_(self.engine.hotkey_warning)
        self.view.setNeedsDisplay_(True)
        if self.quit_at and time.monotonic()>=self.quit_at:
            state=self.engine.snapshot();print('Overlay smoke: '+json.dumps(dict(transparent=not self.panel.isOpaque(),click_through=self.panel.ignoresMouseEvents(),memory_connected=state.get('connected',False),error=state.get('error',False),message=state.get('message'))),flush=True);self.quit_(None)


def run(engine,quit_after=0):
    application=NSApplication.sharedApplication();application.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
    controller=Controller.alloc().init();controller.start(engine,quit_after)
    try:application.run()
    finally:
        engine.stop();controller.timer.invalidate();controller.hotkeys.close()
        if controller.global_monitor:NSEvent.removeMonitor_(controller.global_monitor)
        if controller.local_monitor:NSEvent.removeMonitor_(controller.local_monitor)
        controller.panel.orderOut_(None);controller.menu.orderOut_(None)
