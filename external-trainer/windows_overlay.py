"""Windows native companion UI: click-through ESP canvas plus global function keys."""
import ctypes
from ctypes import wintypes
from dataclasses import asdict
import queue
import threading
import time
import tkinter as tk
from tkinter import ttk

from settings import PRESETS, preset

user32=ctypes.windll.user32
GWL_EXSTYLE=-20; WS_EX_LAYERED=0x80000; WS_EX_TRANSPARENT=0x20; WS_EX_TOOLWINDOW=0x80
WM_HOTKEY=0x0312; WM_QUIT=0x0012
HOTKEYS={0x72:'key:99',0x73:'key:118',0x75:'preset',0x76:'menu',0x77:'key:100',0x78:'key:101',0x79:'quit'}


def enable_dpi_awareness():
    try:ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except (AttributeError,OSError):
        try:user32.SetProcessDPIAware()
        except AttributeError:pass


class WindowsHotkeys(threading.Thread):
    def __init__(self, commands):
        super().__init__(daemon=True);self.commands=commands;self.ready=threading.Event();self.thread_id=0

    def run(self):
        self.thread_id=ctypes.windll.kernel32.GetCurrentThreadId()
        registered=[]
        try:
            for virtual_key,command in HOTKEYS.items():
                if user32.RegisterHotKey(None,virtual_key,0,virtual_key):registered.append(virtual_key)
            self.ready.set();message=wintypes.MSG()
            while user32.GetMessageW(ctypes.byref(message),None,0,0)>0:
                if message.message==WM_HOTKEY:self.commands.put(HOTKEYS.get(message.wParam,''))
        finally:
            for virtual_key in registered:user32.UnregisterHotKey(None,virtual_key)
            self.ready.set()

    def close(self):
        if self.thread_id:user32.PostThreadMessageW(self.thread_id,WM_QUIT,0,0)


class Overlay:
    def __init__(self, engine, quit_after=0):
        enable_dpi_awareness();self.engine=engine;self.quit_at=time.monotonic()+quit_after if quit_after else 0
        self.root=tk.Tk();self.root.withdraw();self.menu=None
        self.left=user32.GetSystemMetrics(76);self.top=user32.GetSystemMetrics(77)
        self.width=user32.GetSystemMetrics(78);self.height=user32.GetSystemMetrics(79)
        # Browser screen coordinates and the Windows virtual desktop both use physical pixels after DPI awareness.
        self.engine.displays=[dict(left=self.left,top=self.top,width=self.width,height=self.height,scale=1)]
        self.canvas_window=tk.Toplevel(self.root);self.canvas_window.overrideredirect(True)
        self.canvas_window.geometry(f'{self.width}x{self.height}{self.left:+d}{self.top:+d}')
        self.canvas_window.configure(bg='#00ff00');self.canvas_window.wm_attributes('-topmost',True,'-transparentcolor','#00ff00')
        self.canvas=tk.Canvas(self.canvas_window,bg='#00ff00',highlightthickness=0);self.canvas.pack(fill='both',expand=True)
        hwnd=self.canvas_window.winfo_id();style=user32.GetWindowLongW(hwnd,GWL_EXSTYLE)
        user32.SetWindowLongW(hwnd,GWL_EXSTYLE,style|WS_EX_LAYERED|WS_EX_TRANSPARENT|WS_EX_TOOLWINDOW)
        self.hotkeys=WindowsHotkeys(engine.commands);self.hotkeys.start();self.hotkeys.ready.wait(2)
        engine.thread.start();self.tick()
        print('Windows memory overlay ready · F7 settings · F8 aim · F4 ESP',flush=True)

    def position(self, x, y):return x-self.left,y-self.top

    def draw(self):
        self.canvas.delete('all');state=self.engine.snapshot();settings=self.engine.settings;region=state.get('region')
        if settings.esp_enabled and region and state.get('focused'):
            ox,oy=self.position(region['left'],region['top']);target=(state.get('target') or {}).get('id')
            for item in state.get('candidates',[]):
                box=item.get('box');selected=item.get('id')==target;color=settings.color_selected if selected else settings.color_tower if item.get('category')=='tower' else settings.color_enemy
                if box:
                    x,y,w,h=box;x+=ox;y+=oy
                    self.canvas.create_rectangle(x,y,x+w,y+h,outline=color,width=2 if selected else 1)
                    if settings.esp_labels:self.canvas.create_text(x,y-8,anchor='sw',fill=color,font=('Segoe UI',max(8,int(10*settings.esp_scale))),text=item.get('label',item.get('kind','enemy')))
                    if settings.esp_health:
                        fraction=max(0,min(1,item.get('health',0)/max(.001,item.get('maxHealth',1))))
                        self.canvas.create_rectangle(x,y+h+3,x+w,y+h+6,outline='',fill='#26323a');self.canvas.create_rectangle(x,y+h+3,x+w*fraction,y+h+6,outline='',fill='#75DDA4')
                elif settings.esp_arrows and item.get('arrow'):
                    arrow=item['arrow'];x,y=ox+arrow['x'],oy+arrow['y'];self.canvas.create_text(x,y,fill=color,text='▶',font=('Segoe UI',14,'bold'))
        if settings.hud_enabled:
            label='LOCKED' if state.get('active') else 'AIM ON' if state.get('armed') else 'AIM OFF'
            if not state.get('connected'):label='CONNECTING' if not state.get('error') else 'DISCONNECTED'
            message=state.get('message','Starting')[:58]
            self.canvas.create_rectangle(20,20,410,70,outline='#66E2DD',fill='#101519')
            self.canvas.create_text(32,33,anchor='w',fill='#66E2DD',font=('Segoe UI',10,'bold'),text='ABYSS / '+label+' / '+settings.profile)
            self.canvas.create_text(32,54,anchor='w',fill='#d9e3ec',font=('Segoe UI',9),text=message)

    def settings(self):
        if self.menu and self.menu.winfo_exists():self.menu.destroy();self.menu=None;self.engine.suspended=False;return
        self.engine.suspended=True;window=self.menu=tk.Toplevel(self.root);window.title('ABYSS / Trainer settings');window.geometry('510x235');window.attributes('-topmost',True)
        url=tk.StringVar(value=self.engine.settings.game_url);profile=tk.StringVar(value=self.engine.settings.profile);status=tk.StringVar(value='Use F7 to close. Changing the address restarts Chrome.')
        ttk.Label(window,text='Managed game address').pack(anchor='w',padx=18,pady=(18,2));ttk.Entry(window,textvariable=url,width=66).pack(padx=18)
        ttk.Label(window,text='Profile').pack(anchor='w',padx=18,pady=(14,2));ttk.Combobox(window,textvariable=profile,values=list(PRESETS),state='readonly').pack(anchor='w',padx=18)
        def apply():
            try:self.engine.update(asdict(preset(profile.get(),url.get())));status.set('Applied. Browser reconnecting when the address changed.')
            except (ValueError,OSError) as error:status.set(str(error))
        ttk.Button(window,text='Apply',command=apply).pack(anchor='w',padx=18,pady=14);ttk.Label(window,textvariable=status,wraplength=470).pack(anchor='w',padx=18)
        window.protocol('WM_DELETE_WINDOW',self.settings)

    def command(self, command):
        if command=='quit':self.close();return
        if command=='menu':self.settings();return
        if command=='preset':
            names=list(PRESETS);name=names[(names.index(self.engine.settings.profile)+1)%len(names)] if self.engine.settings.profile in names else names[0]
            self.engine.update(asdict(preset(name,self.engine.settings.game_url)));return
        if command=='key:100':self.engine.armed=not self.engine.armed
        elif command=='key:101':self.engine.armed=False
        elif command=='key:118':self.engine.update({'esp_enabled':not self.engine.settings.esp_enabled,'profile':'Custom'})
        elif command=='key:99':self.engine.update({'hud_enabled':not self.engine.settings.hud_enabled,'profile':'Custom'})

    def tick(self):
        while not self.engine.commands.empty():self.command(self.engine.commands.get_nowait())
        if self.engine.running:self.draw()
        if self.quit_at and time.monotonic()>=self.quit_at:self.close();return
        if self.engine.running:self.root.after(33,self.tick)

    def close(self):
        if not self.engine.running:return
        self.engine.running=False;self.engine.armed=False;self.engine.terminate_bridge();self.hotkeys.close()
        self.canvas_window.destroy();self.root.destroy()


def run(engine, quit_after=0):
    overlay=Overlay(engine,quit_after)
    try:overlay.root.mainloop()
    finally:engine.stop();overlay.hotkeys.close()
