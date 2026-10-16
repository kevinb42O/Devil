"""Windows settings and hotkeys. ESP is drawn inside Chrome, never over the desktop."""
import ctypes
from ctypes import wintypes
from dataclasses import asdict
import threading
import time
import tkinter as tk
from tkinter import ttk

from settings import PRESETS, preset

user32=ctypes.windll.user32
WM_HOTKEY=0x0312; WM_QUIT=0x0012
HOTKEYS={0x72:'key:99',0x73:'key:118',0x75:'preset',0x76:'menu',0x77:'key:100',0x78:'key:101',0x79:'quit'}


class WindowsHotkeys(threading.Thread):
    def __init__(self, commands):
        super().__init__(daemon=True);self.commands=commands;self.ready=threading.Event();self.thread_id=0

    def run(self):
        self.thread_id=ctypes.windll.kernel32.GetCurrentThreadId()
        registered=[]
        try:
            message=wintypes.MSG()
            # Create this thread's message queue before publishing its ID as ready.
            user32.PeekMessageW(ctypes.byref(message),None,0,0,0)
            for virtual_key in HOTKEYS:
                if user32.RegisterHotKey(None,virtual_key,0x4000,virtual_key):registered.append(virtual_key)
            self.ready.set()
            while user32.GetMessageW(ctypes.byref(message),None,0,0)>0:
                if message.message==WM_HOTKEY:
                    command=HOTKEYS.get(int(message.wParam))
                    if command:self.commands.put(command)
        finally:
            for virtual_key in registered:user32.UnregisterHotKey(None,virtual_key)
            self.ready.set()

    def close(self):
        if self.thread_id:user32.PostThreadMessageW(self.thread_id,WM_QUIT,0,0)


class Overlay:
    def __init__(self, engine, quit_after=0):
        self.engine=engine;self.quit_at=time.monotonic()+quit_after if quit_after else 0
        # Only the F7 settings dialog may create a visible native window. There is
        # deliberately no transparent Toplevel/Canvas covering the Windows desktop.
        self.root=tk.Tk();self.root.withdraw();self.menu=None;self.closed=False
        self.hotkeys=WindowsHotkeys(engine.commands);self.hotkeys.start();self.hotkeys.ready.wait(2)
        engine.thread.start();self.tick()
        print('Windows trainer ready - F7 settings - F8 aim - F4 ESP',flush=True)

    def settings(self):
        if self.menu and self.menu.winfo_exists():
            self.menu.destroy();self.menu=None;self.engine.suspended=False;return
        self.engine.suspended=True
        window=self.menu=tk.Toplevel(self.root);window.title('ABYSS / Trainer settings');window.geometry('510x235');window.attributes('-topmost',True)
        url=tk.StringVar(value=self.engine.settings.game_url);profile=tk.StringVar(value=self.engine.settings.profile)
        status=tk.StringVar(value='Use F7 to close. Changing the address restarts Chrome.')
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
        while not self.closed and not self.engine.commands.empty():self.command(self.engine.commands.get_nowait())
        if self.closed:return
        if self.quit_at and time.monotonic()>=self.quit_at:self.close();return
        if self.engine.running:self.root.after(33,self.tick)
        else:self.close()

    def close(self):
        if self.closed:return
        self.closed=True;self.engine.running=False;self.engine.armed=False
        self.engine.terminate_bridge();self.hotkeys.close();self.root.destroy()


def run(engine, quit_after=0):
    overlay=None
    try:
        overlay=Overlay(engine,quit_after)
        overlay.root.mainloop()
    finally:
        engine.stop()
        if overlay:overlay.hotkeys.close()
