"""Complete Windows settings form using the shared validated configuration schema."""
from dataclasses import asdict
import json
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog

from settings import Settings, KINDS, DISPLAY_NAMES, PRESETS, preset, import_document, export_document


class SettingsForm:
    def __init__(self, window, engine, close):
        self.window=window;self.engine=engine;self.fields={};self.kind_fields={};self.loading=False
        window.title('ABYSS / Trainer settings');window.geometry('820x720');window.minsize(780,690)
        self.theme()
        frame=ttk.Frame(window,padding=24);frame.pack(fill='both',expand=True)
        header=ttk.Frame(frame);header.pack(fill='x',pady=(0,12))
        identity=ttk.Frame(header);identity.pack(side='left')
        ttk.Label(identity,text='A B Y S S',style='Brand.TLabel').pack(anchor='w')
        ttk.Label(identity,text='TRAINER  /  CONTROL ROOM',style='Muted.TLabel').pack(anchor='w',pady=(4,0))
        self.profile=tk.StringVar(window)
        ttk.Button(header,text='Load preset',command=self.load_preset).pack(side='right')
        self.profile_picker=ttk.Combobox(header,textvariable=self.profile,values=['Custom',*PRESETS],state='readonly',width=15)
        self.profile_picker.pack(side='right',padx=8)
        ttk.Label(frame,text='F7 closes this panel  ·  Aim is suspended while you edit',style='Muted.TLabel').pack(anchor='w',pady=(0,16))
        self.tabs=ttk.Notebook(frame);self.tabs.pack(fill='both',expand=True)
        pages={}
        for name in ('Aim','ESP','Targets','Connection'):
            page=ttk.Frame(self.tabs,padding=14);self.tabs.add(page,text=name);pages[name]=page
        self.aim=pages['Aim'];self.esp=pages['ESP']
        aim=pages['Aim']
        self.choice(aim,'aim_mode','Aim behavior',['snap','smooth'])
        self.check(aim,'prediction','Lead moving targets at projectile speed')
        for key,label in [('fov','Aim cone / degrees (1–360)'),('max_distance','Maximum range / world units (1–336)'),('smooth_speed','Smooth turn speed / degrees per second (30–3600)')]:self.entry(aim,key,label)
        self.choice(aim,'selection','Target selection',['crosshair','nearest','health','threat'])
        self.check(aim,'tower_priority','Prioritize hittable attached tower crystals')
        for key,label in [('switch_bias','Lock preference (0–45)'),('lock_ms','Minimum target hold / milliseconds (0–2000)'),('lead_limit','Maximum prediction / seconds (0–3)')]:self.entry(aim,key,label)
        ttk.Label(aim,text='Aim activates when you fire. Nearest selection ignores lock preference and hold time.',wraplength=650).grid(column=0,row=aim.grid_size()[1],columnspan=2,sticky='w',pady=12)
        esp=pages['ESP'];left=ttk.Frame(esp);right=ttk.Frame(esp)
        left.pack(side='left',anchor='n',fill='y');right.pack(side='right',anchor='n',fill='both',expand=True,padx=(18,0))
        for key,label in [('esp_enabled','Enable ESP'),('esp_boxes','Target boxes'),('esp_labels','Enemy / crystal labels'),('esp_health','Health bars'),('esp_distance','Distance'),('esp_lines','Selected target tracer'),('esp_prediction','Predicted intercept marker'),('esp_arrows','Off-screen indicators'),('esp_fov','Draw aim cone'),('hud_enabled','Show status HUD'),('hud_compact','Compact HUD')]:self.check(left,key,label)
        self.choice(right,'esp_style','Box style',['corners','box'])
        for key,label in [('esp_opacity','Opacity (0.1–1)'),('esp_scale','Label size (0.6–2)'),('esp_max_targets','Maximum ESP points (1–500)')]:self.entry(right,key,label)
        self.choice(right,'hud_anchor','HUD corner',['top_left','top_right','bottom_left','bottom_right'])
        for key,label in [('color_tower','Tower / #RRGGBB'),('color_selected','Selected / #RRGGBB'),('color_enemy','Enemies / #RRGGBB')]:self.entry(right,key,label)
        targets=pages['Targets']
        ttk.Label(targets,text='Include these aim targets. Excluded enemies remain visible in ESP.').grid(column=0,row=0,columnspan=2,sticky='w',pady=(0,12))
        for i,kind in enumerate(KINDS):
            var=tk.BooleanVar(window);self.kind_fields[kind]=var
            ttk.Checkbutton(targets,text=DISPLAY_NAMES.get(kind,kind.capitalize()),variable=var).grid(column=i//11,row=1+i%11,sticky='w',padx=(0,50),pady=5)
            var.trace_add('write',self.changed)
        conn=pages['Connection'];self.entry(conn,'game_url','Managed game address')
        ttk.Label(conn,text='Changing this address restarts the managed browser.\nReconnect reattaches without restarting the current run.',wraplength=650).grid(column=0,row=1,columnspan=2,sticky='w',pady=16)
        self.connection_status=tk.StringVar(window)
        ttk.Label(conn,textvariable=self.connection_status,wraplength=650).grid(column=0,row=2,columnspan=2,sticky='w',pady=16)
        ttk.Button(conn,text='Reconnect memory',command=self.reconnect).grid(column=0,row=3,sticky='w')
        self.notice=tk.StringVar(window)
        ttk.Label(frame,textvariable=self.notice,wraplength=740,style='Notice.TLabel',padding=(12,10)).pack(fill='x',pady=(16,12))
        actions=ttk.Frame(frame);actions.pack(fill='x')
        for label,command in [('Apply',self.apply),('Defaults',self.defaults),('Import…',self.import_file),('Export…',self.export_file)]:ttk.Button(actions,text=label,command=command,style='Accent.TButton' if label=='Apply' else 'TButton').pack(side='left',padx=(0,8))
        ttk.Button(actions,text='Close',command=close).pack(side='right')
        self.fill(engine.settings);self.refresh_status();self.notice.set('Your current settings are loaded. Changes take effect after Apply.')

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

    def variable(self,key,boolean=False):
        var=tk.BooleanVar(self.window) if boolean else tk.StringVar(self.window)
        self.fields[key]=var;var.trace_add('write',self.changed);return var

    def entry(self,parent,key,label):
        row=parent.grid_size()[1];parent.columnconfigure(1,weight=1)
        ttk.Label(parent,text=label).grid(column=0,row=row,sticky='w',pady=7,padx=(0,10))
        ttk.Entry(parent,textvariable=self.variable(key),width=20).grid(column=1,row=row,sticky='ew',pady=7)

    def choice(self,parent,key,label,values):
        row=parent.grid_size()[1];parent.columnconfigure(1,weight=1)
        ttk.Label(parent,text=label).grid(column=0,row=row,sticky='w',pady=7,padx=(0,10))
        ttk.Combobox(parent,textvariable=self.variable(key),values=values,state='readonly',width=18).grid(column=1,row=row,sticky='ew',pady=7)

    def check(self,parent,key,label):
        ttk.Checkbutton(parent,text=label,variable=self.variable(key,True)).grid(column=0,row=parent.grid_size()[1],columnspan=2,sticky='w',pady=5)

    def changed(self,*_):
        if not self.loading:
            self.profile.set('Custom');self.notice.set('Unsaved changes. Apply to activate.')

    def fill(self,settings):
        self.loading=True
        try:
            for key,value in asdict(settings).items():
                if key in self.fields:self.fields[key].set(value)
            excluded=set(settings.excluded_kinds.split(','))
            for kind,var in self.kind_fields.items():var.set(kind not in excluded)
            self.profile.set(settings.profile)
        finally:self.loading=False

    def read_form(self):
        values={key:var.get() for key,var in self.fields.items()}
        values['excluded_kinds']=','.join(kind for kind,var in self.kind_fields.items() if not var.get())
        # Selecting a preset does not alter any values until Load preset is clicked.
        # Derive the saved profile from actual form values so edits cannot be mislabeled.
        values['profile']='Custom'
        result=Settings.validated(values)
        for name in PRESETS:
            candidate=preset(name,result.game_url)
            if {k:v for k,v in asdict(result).items() if k!='profile'}=={k:v for k,v in asdict(candidate).items() if k!='profile'}:
                return candidate
        return result

    def apply(self):
        try:
            settings=self.read_form();self.engine.update(asdict(settings));self.fill(settings)
            self.notice.set('Saved. Settings are active.')
        except (ValueError,TypeError,OSError) as error:self.notice.set(str(error))

    def load_preset(self):
        try:
            if self.profile.get() not in PRESETS:raise ValueError('Choose a preset, then click Load preset.')
            self.fill(preset(self.profile.get(),self.fields['game_url'].get()));self.notice.set('Preset loaded. Apply to activate.')
        except (ValueError,TypeError) as error:self.notice.set(str(error))

    def defaults(self):
        self.fill(preset('Precision',self.engine.settings.game_url));self.notice.set('Defaults loaded. Apply to activate.')

    def reconnect(self):
        self.engine.reconnect();self.notice.set('Reconnecting to game memory.')

    def refresh_status(self):
        state=self.engine.snapshot()
        self.connection_status.set(f"{state.get('message','Connecting')}\n{state.get('targets',0)} targets / {state.get('aimApplications',0)} aim updates / {state.get('averageMs',0):.2f} ms average")

    def import_path(self,path):
        settings=import_document(json.loads(Path(path).read_text(encoding='utf-8')))
        self.fill(settings);self.notice.set('Imported. Apply to activate.')

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
