"""Complete Windows settings form using the shared validated configuration schema."""
from dataclasses import asdict
import json
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, simpledialog, colorchooser

from settings import Settings, KINDS, DISPLAY_NAMES, PRESETS, NUMERIC_RANGES, preset, import_document, export_document
from preset_library import PresetLibrary


class ScrollablePage(ttk.Frame):
    def __init__(self,parent):
        super().__init__(parent)
        self.canvas=tk.Canvas(self,background='#11171f',highlightthickness=0,borderwidth=0)
        vertical=ttk.Scrollbar(self,orient='vertical',command=self.canvas.yview)
        horizontal=ttk.Scrollbar(self,orient='horizontal',command=self.canvas.xview)
        self.canvas.configure(yscrollcommand=vertical.set,xscrollcommand=horizontal.set)
        self.rowconfigure(0,weight=1);self.columnconfigure(0,weight=1)
        self.canvas.grid(row=0,column=0,sticky='nsew');vertical.grid(row=0,column=1,sticky='ns');horizontal.grid(row=1,column=0,sticky='ew')
        self.content=ttk.Frame(self.canvas,padding=14)
        self.item=self.canvas.create_window(0,0,anchor='nw',window=self.content)
        self.content.bind('<Configure>',self.resize)
        self.canvas.bind('<Configure>',self.resize)

    def resize(self,event=None):
        self.canvas.itemconfigure(self.item,width=max(self.canvas.winfo_width(),self.content.winfo_reqwidth()))
        self.canvas.configure(scrollregion=self.canvas.bbox('all'))


class SettingsForm:
    def __init__(self, window, engine, close):
        self.window=window;self.engine=engine;self.fields={};self.controls={};self.sliders={};self.slider_values={};self.kind_fields={};self.loading=False;self.autosave_timer=None
        self.library=PresetLibrary(engine.config_root/'user-presets.json');self.source_profile=None
        window.title('ABYSS / Control studio');window.geometry('960x820');window.minsize(780,690)
        self.theme()
        frame=ttk.Frame(window,padding=24);frame.pack(fill='both',expand=True)
        header=ttk.Frame(frame);header.pack(fill='x',pady=(0,12))
        identity=ttk.Frame(header);identity.pack(side='left')
        ttk.Label(identity,text='◆  A B Y S S',style='Brand.TLabel').pack(anchor='w')
        ttk.Label(identity,text='C O N T R O L   S T U D I O    /    0 1',style='Muted.TLabel').pack(anchor='w',pady=(4,0))
        self.profile=tk.StringVar(window)
        ttk.Button(header,text='Save as…',command=self.save_as).pack(side='right',padx=(8,0))
        ttk.Button(header,text='Load',command=self.load_preset).pack(side='right')
        self.profile_picker=ttk.Combobox(header,textvariable=self.profile,values=['Custom',*PRESETS,*self.library.names()],state='readonly',width=18)
        self.profile_picker.pack(side='right',padx=8)
        self.profile_picker.bind('<<ComboboxSelected>>',lambda event:self.load_preset())
        ttk.Label(frame,text='Changes save automatically  ·  = saves and closes  ·  Save as… creates your named preset',style='Muted.TLabel').pack(anchor='w',pady=(0,16))
        self.tabs=ttk.Notebook(frame);self.tabs.pack(fill='both',expand=True)
        pages={};self.scroll_pages={}
        for name in ('Aim','Survival','ESP','Targets','Connection'):
            page=ScrollablePage(self.tabs);self.tabs.add(page,text=name);pages[name]=page.content
            self.scroll_pages[str(page)]=page
        window.bind('<MouseWheel>',self.scroll)
        window.bind('<Control-Return>',lambda event:self.apply())
        self.aim=pages['Aim'];self.esp=pages['ESP']
        aim=pages['Aim']
        self.heading(aim,'01 / AIM ENGINE','Precision tracking. Tuned to your hands.')
        tracking=self.card(aim,'TRACKING',0,1);selection=self.card(aim,'TARGET SELECTION',1,1)
        self.choice(tracking,'aim_mode','Aim behavior',['snap','smooth'])
        self.check(tracking,'prediction','Predict moving targets')
        for key,label in [('fov','Field of view / degrees'),('max_distance','Target range / units'),('smooth_speed','Tracking speed / degrees per second')]:self.entry(tracking,key,label)
        self.choice(selection,'selection','Priority',['crosshair','nearest','health','threat'])
        self.check(selection,'tower_priority','Prioritize hittable tower crystals')
        for key,label in [('switch_bias','Lock preference'),('lock_ms','Target hold / milliseconds'),('lead_limit','Prediction horizon / seconds')]:self.entry(selection,key,label)
        ttk.Label(aim,text='ACTIVE WHEN FIRING   /   Nearest selection ignores lock preference and target hold.',style='Muted.TLabel',wraplength=670).grid(column=0,row=2,columnspan=2,sticky='w',pady=16)
        survival=pages['Survival'];self.heading(survival,'SURVIVAL ASSIST','Normal movement. Earlier reactions to danger.')
        protection=self.card(survival,'PROTECTION',0,1);protection.grid_configure(columnspan=2,padx=0)
        for key,label in [('emergency_targeting','Emergency enemies override towers and target locks'),('auto_dodge','Automatically dodge predicted collisions'),('edge_guard','Steer away from unsafe arena edges')]:self.check(protection,key,label)
        self.entry(protection,'dodge_horizon','Look ahead / seconds (0.2–1.5)')
        ttk.Label(survival,text='Intervenes only when your route predicts danger. F8 disables aim and movement assists. Settings suspend both. Escape is not guaranteed.',style='Muted.TLabel',wraplength=670).grid(column=0,row=2,columnspan=2,sticky='w',pady=16)
        esp=pages['ESP'];self.heading(esp,'02 / VISUAL INTELLIGENCE','Only the information you want. Exactly where you want it.')
        left=self.card(esp,'VISIBLE LAYERS',0,1);right=self.card(esp,'APPEARANCE',1,1)
        for key,label in [('esp_enabled','Enable ESP'),('esp_boxes','Target boxes'),('esp_labels','Enemy / crystal labels'),('esp_health','Health bars'),('esp_distance','Distance'),('esp_lines','Selected target tracer'),('esp_prediction','Predicted intercept marker'),('esp_arrows','Off-screen indicators'),('esp_fov','Draw aim cone')]:self.check(left,key,label)
        self.choice(right,'esp_style','Box style',['corners','box'])
        for key,label in [('esp_opacity','Overlay opacity'),('esp_scale','Label scale'),('esp_max_targets','Maximum visible points')]:self.entry(right,key,label)
        hud=self.card(esp,'STATUS DISPLAY',0,2);colors=self.card(esp,'PALETTE',1,2)
        self.check(hud,'hud_enabled','Show status HUD');self.check(hud,'hud_compact','Compact HUD')
        self.choice(hud,'hud_anchor','Position',['top_left','top_right','bottom_left','bottom_right'])
        for key,label in [('color_tower','Tower crystals'),('color_selected','Selected target'),('color_enemy','Enemies')]:self.entry(colors,key,label)
        targets=pages['Targets']
        self.heading(targets,'03 / TARGET LIBRARY','Choose aim targets. Excluded enemies remain visible in ESP.')
        for i,kind in enumerate(KINDS):
            var=tk.BooleanVar(window);self.kind_fields[kind]=var
            ttk.Checkbutton(targets,text=DISPLAY_NAMES.get(kind,kind.capitalize()),variable=var).grid(column=i//11,row=1+i%11,sticky='w',padx=(0,50),pady=5)
            var.trace_add('write',self.changed)
        conn=pages['Connection'];self.heading(conn,'04 / CONNECTION','Your managed session. Connected to the live game.')
        self.entry(conn,'game_url','Managed game address')
        ttk.Label(conn,text='Changing this address restarts the managed browser.\nReconnect reattaches without restarting the current run.',style='Muted.TLabel',wraplength=650).grid(column=0,row=2,columnspan=2,sticky='w',pady=16)
        self.connection_status=tk.StringVar(window)
        ttk.Label(conn,textvariable=self.connection_status,wraplength=650,style='Notice.TLabel',padding=18).grid(column=0,row=3,columnspan=2,sticky='ew',pady=16)
        ttk.Button(conn,text='Reconnect memory',command=self.reconnect).grid(column=0,row=4,sticky='w')
        self.notice=tk.StringVar(window)
        # Reserve the footer BEFORE the expanding Notebook is allocated any space.
        # Otherwise large fonts/DPI can consume the entire window and unmap Apply.
        actions=ttk.Frame(frame);actions.pack(side='bottom',fill='x',before=self.tabs)
        self.notice_label=ttk.Label(frame,textvariable=self.notice,wraplength=700,style='Notice.TLabel',padding=(12,10))
        self.notice_label.pack(side='bottom',fill='x',pady=(12,10),before=self.tabs)
        self.buttons={}
        for label,command in [('Apply',self.apply),('Defaults',self.defaults),('Import…',self.import_file),('Export…',self.export_file)]:
            button=ttk.Button(actions,text=label,command=command,width=7,style='Accent.TButton' if label=='Apply' else 'TButton')
            button.pack(side='left',padx=(0,8));self.buttons[label]=button
        ttk.Button(actions,text='Close',command=close,width=7).pack(side='right')
        self.fill(engine.settings);self.refresh_status();self.notice.set(self.library.warning or 'Settings loaded. Valid edits save automatically; = saves and returns to the game.')

    def heading(self,parent,title,subtitle):
        parent.columnconfigure(0,weight=1);parent.columnconfigure(1,weight=1)
        group=ttk.Frame(parent);group.grid(column=0,row=0,columnspan=2,sticky='ew',pady=(2,20))
        ttk.Label(group,text=title,style='Section.TLabel').pack(anchor='w')
        ttk.Label(group,text=subtitle,style='Muted.TLabel',wraplength=650).pack(anchor='w',pady=(5,0))

    def card(self,parent,title,column,row):
        card=ttk.LabelFrame(parent,text='  '+title+'  ',padding=16)
        card.grid(column=column,row=row,sticky='nsew',padx=(0,8) if column==0 else (8,0),pady=(0,14))
        card.columnconfigure(0,weight=1);card.columnconfigure(1,weight=1)
        return card

    def scroll(self,event):
        if isinstance(event.widget,ttk.Combobox):return
        page=self.scroll_pages.get(self.tabs.select())
        if page and event.delta:
            canvas=page.canvas
            if event.state&1:canvas.xview_scroll(-1 if event.delta>0 else 1,'units')
            else:canvas.yview_scroll(-1 if event.delta>0 else 1,'units')

    def theme(self):
        style=ttk.Style(self.window);style.theme_use('clam')
        background='#11171f';surface='#19222d';field='#0d131b';text='#e4edf6';muted='#96a9bd';accent='#66dfcf'
        self.window.configure(background=background)
        self.window.option_add('*TCombobox*Listbox.background',surface)
        self.window.option_add('*TCombobox*Listbox.foreground',text)
        self.window.option_add('*TCombobox*Listbox.selectBackground','#29444d')
        self.window.option_add('*TCombobox*Listbox.selectForeground',accent)
        style.configure('.',font=('Segoe UI',10),background=background,foreground=text)
        style.configure('TFrame',background=background)
        style.configure('TLabel',background=background,foreground=text)
        style.configure('Brand.TLabel',font=('Segoe UI',21,'bold'),foreground=accent)
        style.configure('Section.TLabel',font=('Segoe UI',13,'bold'),foreground='#eaf2fa')
        style.configure('TLabelframe',background=background,bordercolor='#2a3747',lightcolor='#2a3747',darkcolor='#2a3747',borderwidth=1,relief='solid')
        style.configure('TLabelframe.Label',background=background,foreground='#9cb3c9',font=('Segoe UI',9,'bold'))
        style.configure('Muted.TLabel',foreground=muted,font=('Segoe UI',9))
        style.configure('Notice.TLabel',background=surface,foreground=accent,font=('Segoe UI',9))
        style.configure('TNotebook',background=background,borderwidth=0)
        style.configure('TNotebook.Tab',background=surface,foreground=muted,padding=(22,10),borderwidth=0)
        style.map('TNotebook.Tab',background=[('selected','#263d47'),('active','#22313e')],foreground=[('selected',accent),('active',text)])
        style.configure('TButton',background=surface,foreground=text,borderwidth=0,padding=(12,9),focusthickness=1,focuscolor=accent)
        style.map('TButton',background=[('pressed','#2d4353'),('active','#253747')])
        style.configure('Accent.TButton',background=accent,foreground=field,font=('Segoe UI',10,'bold'))
        style.map('Accent.TButton',background=[('pressed','#38b3a5'),('active','#8eeadc')])
        for widget in ('TEntry','TCombobox'):
            style.configure(widget,fieldbackground=field,background=surface,foreground=text,insertcolor=text,bordercolor='#2e4052',lightcolor='#2e4052',darkcolor='#2e4052',padding=6,arrowsize=14)
            style.map(widget,fieldbackground=[('readonly',field)],foreground=[('readonly',text)],bordercolor=[('focus',accent)])
        style.configure('TCheckbutton',background=background,foreground=text,indicatorbackground=field,indicatorforeground=accent,padding=(0,3))
        style.map('TCheckbutton',background=[('active',background)],indicatorbackground=[('selected','#254b4b'),('active','#263746')])
        style.configure('Horizontal.TScale',background=background,troughcolor='#253342',sliderlength=18,sliderthickness=14,borderwidth=0,gripcount=0)
        style.map('Horizontal.TScale',background=[('active',accent),('!active','#44a99e')])
        style.configure('Vertical.TScrollbar',background='#2b3b4b',troughcolor=background,bordercolor=background,arrowcolor='#7b94aa',arrowsize=11)
        style.configure('Horizontal.TScrollbar',background='#2b3b4b',troughcolor=background,bordercolor=background,arrowcolor='#7b94aa',arrowsize=11)

    def variable(self,key,boolean=False):
        var=tk.BooleanVar(self.window) if boolean else tk.StringVar(self.window)
        self.fields[key]=var;var.trace_add('write',self.changed);return var

    def entry(self,parent,key,label):
        row=parent.grid_size()[1];parent.columnconfigure(1,weight=1)
        if key in NUMERIC_RANGES:
            group=ttk.Frame(parent);group.grid(column=0,row=row,columnspan=2,sticky='ew',pady=(8,10));group.columnconfigure(0,weight=1)
            ttk.Label(group,text=label,wraplength=240).grid(column=0,row=0,sticky='w',padx=(0,8))
            var=self.variable(key)
            control=ttk.Entry(group,textvariable=var,width=7,justify='right');control.grid(column=1,row=0,sticky='e')
            self.controls[key]=control
            low,high=NUMERIC_RANGES[key]
            slider_var=tk.DoubleVar(self.window,value=low);self.slider_values[key]=slider_var
            slider=ttk.Scale(group,from_=low,to=high,variable=slider_var,command=lambda value:self.move_slider(key,value),takefocus=True)
            slider.grid(column=0,row=1,columnspan=2,sticky='ew',pady=(10,2));self.sliders[key]=slider
            ttk.Label(group,text=f'{low:g}',style='Muted.TLabel').grid(column=0,row=2,sticky='w')
            ttk.Label(group,text=f'{high:g}',style='Muted.TLabel').grid(column=1,row=2,sticky='e')
            var.trace_add('write',lambda *_:self.sync_slider(key))
            return
        ttk.Label(parent,text=label).grid(column=0,row=row,sticky='w',pady=7,padx=(0,10))
        control=ttk.Entry(parent,textvariable=self.variable(key),width=12 if key.startswith('color_') else 20)
        control.grid(column=1,row=row,sticky='ew',pady=7);self.controls[key]=control
        if key.startswith('color_'):
            ttk.Button(parent,text='Pick color…',command=lambda:self.pick_color(key)).grid(column=1,row=row+1,sticky='e',pady=(0,6))

    def sync_slider(self,key):
        try:number=float(self.fields[key].get())
        except (ValueError,TypeError):return
        low,high=NUMERIC_RANGES[key]
        if low<=number<=high:self.slider_values[key].set(number)

    def move_slider(self,key,value):
        low,high=NUMERIC_RANGES[key]
        step={'dodge_horizon':.05,'esp_opacity':.01,'esp_scale':.01,'lead_limit':.01,'switch_bias':.1,'lock_ms':10,'smooth_speed':10}.get(key,1)
        number=max(low,min(high,low+round((float(value)-low)/step)*step))
        self.fields[key].set(f'{number:.2f}'.rstrip('0').rstrip('.') if step<1 else str(round(number)))

    def pick_color(self,key):
        value=colorchooser.askcolor(color=self.fields[key].get(),parent=self.window,title='Choose '+key.removeprefix('color_')+' color')[1]
        if value:self.fields[key].set(value.upper())

    def choice(self,parent,key,label,values):
        row=parent.grid_size()[1];parent.columnconfigure(1,weight=1)
        ttk.Label(parent,text=label).grid(column=0,row=row,sticky='w',pady=7,padx=(0,10))
        control=ttk.Combobox(parent,textvariable=self.variable(key),values=values,state='readonly',width=18)
        control.grid(column=1,row=row,sticky='ew',pady=7);self.controls[key]=control

    def check(self,parent,key,label):
        ttk.Checkbutton(parent,text=label,variable=self.variable(key,True)).grid(column=0,row=parent.grid_size()[1],columnspan=2,sticky='w',pady=5)

    def changed(self,*_):
        if not self.loading:
            self.profile.set(self.source_profile if self.source_profile in self.library.values else 'Custom')
            self.notice.set('Editing… valid changes save automatically.')
            self.cancel_autosave()
            self.autosave_timer=self.window.after(350,self.apply)

    def cancel_autosave(self):
        if self.autosave_timer:
            self.window.after_cancel(self.autosave_timer);self.autosave_timer=None

    def fill(self,settings):
        self.cancel_autosave()
        self.loading=True
        try:
            for key,value in asdict(settings).items():
                if key in self.fields:self.fields[key].set(value)
            excluded=set(settings.excluded_kinds.split(','))
            for kind,var in self.kind_fields.items():var.set(kind not in excluded)
            self.profile.set(settings.profile)
            self.source_profile=settings.profile
        finally:self.loading=False

    def read_form(self):
        values={key:var.get() for key,var in self.fields.items()}
        values['excluded_kinds']=','.join(kind for kind,var in self.kind_fields.items() if not var.get())
        # Selecting a preset does not alter any values until Load preset is clicked.
        # Derive the saved profile from actual form values so edits cannot be mislabeled.
        values['profile']=self.source_profile if self.source_profile in self.library.values else 'Custom'
        result=Settings.validated(values)
        if result.profile!='Custom':return result
        for name in PRESETS:
            candidate=preset(name,result.game_url)
            if {k:v for k,v in asdict(result).items() if k!='profile'}=={k:v for k,v in asdict(candidate).items() if k!='profile'}:
                return candidate
        return result

    def apply(self):
        self.cancel_autosave()
        try:
            settings=self.read_form()
            if settings.profile in self.library.values:self.library.save(settings.profile,settings)
            self.engine.update(asdict(settings))
            # Do not refill the fields here: autosave must not move the cursor or
            # replace partially selected text while the user continues typing.
            self.profile.set(settings.profile);self.source_profile=settings.profile
            self.notice.set(f'Saved: {settings.profile} / {settings.aim_mode} / FOV {settings.fov:g}°. = returns to game.')
            return True
        except (ValueError,TypeError,OSError) as error:
            self.notice.set('Could not save: '+str(error));return False

    def load_preset(self):
        try:
            name=self.profile.get()
            if self.autosave_timer and not self.apply():return
            if name in self.library.values:
                self.fill(Settings.validated({**asdict(self.library.values[name]),'game_url':self.fields['game_url'].get()}))
            elif name in PRESETS:self.fill(preset(name,self.fields['game_url'].get()))
            else:return
            self.apply()
        except (ValueError,TypeError) as error:self.notice.set(str(error))

    def save_as(self,name=None):
        if name is None:name=simpledialog.askstring('Save your preset','Give this preset a name:',parent=self.window)
        if name is None:return False
        try:
            settings=self.read_form()
            saved=self.library.save(name,settings)
            self.profile_picker.configure(values=['Custom',*PRESETS,*self.library.names()])
            self.fill(saved)
            return self.apply()
        except (ValueError,TypeError,OSError) as error:
            self.notice.set('Could not save preset: '+str(error));return False

    def defaults(self):
        self.fill(preset('Precision',self.engine.settings.game_url));self.apply()

    def reconnect(self):
        self.engine.reconnect();self.notice.set('Reconnecting to game memory.')

    def refresh_status(self):
        state=self.engine.snapshot()
        applied=state.get('appliedSettings')
        confirmed=f"\nGame confirmed: {applied['aim_mode']} / FOV {applied['fov']:g}°" if applied and applied.get('fov') is not None and applied.get('aim_mode') else ''
        self.connection_status.set(f"{state.get('message','Connecting')}\n{state.get('targets',0)} targets / {state.get('aimApplications',0)} aim updates / {state.get('averageMs',0):.2f} ms average{confirmed}")

    def import_path(self,path):
        settings=import_document(json.loads(Path(path).read_text(encoding='utf-8')))
        if settings.profile not in ('Custom',*PRESETS):
            settings=self.library.save(settings.profile,settings)
            self.profile_picker.configure(values=['Custom',*PRESETS,*self.library.names()])
        self.fill(settings);self.apply()

    def export_path(self,path):
        data=export_document(self.read_form())
        Path(path).write_text(json.dumps(data,indent=2),encoding='utf-8');self.notice.set('Settings exported.')

    def import_file(self):
        path=filedialog.askopenfilename(parent=self.window,filetypes=[('Trainer settings','*.json')])
        if not path:return
        try:self.import_path(path)
        except (ValueError,TypeError,OSError) as error:self.notice.set(str(error))

    def export_file(self):
        path=filedialog.asksaveasfilename(parent=self.window,initialfile='abyss-trainer.json',defaultextension='.json',filetypes=[('Trainer settings','*.json')])
        if not path:return
        try:self.export_path(path)
        except (ValueError,TypeError,OSError) as error:self.notice.set(str(error))
