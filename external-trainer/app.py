#!/usr/bin/env python3
"""External native overlay and browser-memory trainer. No screen capture."""
import argparse
import os
from dataclasses import asdict
import json
from pathlib import Path
import queue
import shutil
import subprocess
import sys
import threading
import time
import tempfile
import traceback

RESOURCE_ROOT = Path(__file__).resolve().parent
ROOT = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else RESOURCE_ROOT


from settings import Settings


class Engine:
    def __init__(self, demo=False, config_root=None):
        self.config_root=Path(config_root) if config_root is not None else ROOT
        self.lock = threading.RLock()
        self.commands = queue.Queue()
        self.settings = Settings()
        self.config_warning = None
        if not demo:
            try:
                saved = json.loads((self.config_root / 'settings.json').read_text())
                self.settings = Settings.validated({k:v for k,v in saved.items() if k in asdict(self.settings)})
            except FileNotFoundError:
                pass
            except (OSError, ValueError, TypeError) as error:
                self.config_warning='Could not load settings; defaults active: '+str(error)
        self.armed = True
        self.activate = False
        self.running = True
        self.demo = demo
        self.overlay_id = 0
        self.suspended = False
        self.status = dict(message='Connecting to game memory', targets=0, active=False)
        self.process = None
        self.reconnect_requested = False
        self.reconnect_generation = 0
        self.displays = []
        self.browser_pid = 0
        self.hotkey_warning = None
        self.settings_revision = 0
        self.thread = threading.Thread(target=self.loop, daemon=True)

    def update(self, values):
        with self.lock:
            old_url = self.settings.game_url
            candidate = Settings.validated({**asdict(self.settings), **values})
            if not self.demo:
                temp = None
                try:
                    with tempfile.NamedTemporaryFile(mode='w',dir=self.config_root,prefix='.settings-',suffix='.tmp',delete=False) as saved:
                        temp=Path(saved.name);saved.write(json.dumps(asdict(candidate),indent=2))
                    temp.replace(self.config_root / 'settings.json')
                finally:
                    if temp and temp.exists():temp.unlink()
            self.settings = candidate
            self.settings_revision += 1
            if self.settings.game_url != old_url:
                self.reconnect_requested = True
                self.terminate_bridge()

    def snapshot(self):
        with self.lock:
            return dict(**self.status, armed=self.armed, held=False,
                        demo=self.demo, settings=asdict(self.settings))

    def prepare_input(self):
        pass  # Hotkeys are handled by AppKit on its main thread.

    def reconnect(self):
        with self.lock:
            self.reconnect_generation += 1
            if not self.process or self.process.poll() is not None:
                self.reconnect_requested=True

    def terminate_bridge(self):
        process=self.process
        if process and process.poll() is None:
            # On Windows terminate() kills Node before its browser cleanup runs.
            # Closing stdin requests graceful shutdown through the bridge's EOF handler.
            try:
                if process.stdin:process.stdin.close()
                else:process.terminate()
            except (BrokenPipeError,OSError,ValueError):pass

    def disconnected(self,message,error=False):
        with self.lock:
            self.status=dict(message=message,error=error,disconnected=True,connected=False,
                             active=False,focused=False,targets=0,candidates=[],target=None)

    def send_controls(self, process):
        while self.running and process.poll() is None:
            try:
                with self.lock:
                    message = dict(**asdict(self.settings), enabled=self.armed and not self.demo, suspended=self.suspended,
                                   generation=self.reconnect_generation,displays=self.displays,settings_revision=self.settings_revision)
                process.stdin.write(json.dumps(message)+'\n')
                process.stdin.flush()
            except (BrokenPipeError, OSError, ValueError):
                return
            time.sleep(.05)

    def loop(self):
        if self.demo:
            with self.lock:
                self.status.update(message='Memory overlay demo · no game connection', connected=False)
            return
        while self.running:
            self.reconnect_requested = False
            process = None
            try:
                bundled_node = RESOURCE_ROOT / 'runtime' / 'node.exe'
                node = str(bundled_node) if bundled_node.is_file() else shutil.which('node')
                if not node:
                    raise RuntimeError('Node.js is required for the browser-memory connection')
                bridge_env = os.environ.copy()
                bridge_env.setdefault('ABYSS_TRAINER_PROFILE', str(ROOT / '.chrome-profile'))
                process = subprocess.Popen([node, str(RESOURCE_ROOT / 'memory-bridge.mjs'), self.settings.game_url],
                    cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, bufsize=1, env=bridge_env)
                self.process = process
                writer = threading.Thread(target=self.send_controls, args=(process,), daemon=True)
                writer.start()
                for line in process.stdout:
                    if not self.running:
                        break
                    try:
                        state = json.loads(line)
                    except ValueError:
                        continue
                    if not isinstance(state,dict):continue
                    with self.lock:
                        newly_connected = state.get('connected') and not self.status.get('connected')
                        self.status = state
                        self.status.setdefault('targets', 0)
                        self.status.setdefault('active', False)
                        self.activate = state.get('firing', False)
                        if state.get('browserPid'):self.browser_pid=state['browserPid']
                    if newly_connected:
                        print('Game memory connected · aim '+('ON' if self.armed else 'OFF')+' · no modifier key.', flush=True)
                if self.running:
                    self.disconnected(self.status.get('message') if self.status.get('error') else 'Browser closed · F7 → Reconnect memory',bool(self.status.get('error')))
            except Exception as error:
                self.disconnected(str(error),True)
            finally:
                if process:
                    try:
                        process.wait(timeout=6)
                    except subprocess.TimeoutExpired:
                        process.terminate()
                        try:process.wait(timeout=2)
                        except subprocess.TimeoutExpired:
                            process.kill();process.wait()
                    for stream in (process.stdin,process.stdout):
                        if stream:
                            try:stream.close()
                            except OSError:pass
                self.process = None
            if self.running:
                while self.running and not self.reconnect_requested:
                    time.sleep(.1)

    def stop(self):
        self.armed = False
        self.running = False
        self.terminate_bridge()
        self.thread.join(timeout=10)


def main():
    parser = argparse.ArgumentParser(description='Native external memory aimbot overlay')
    parser.add_argument('--demo', action='store_true')
    parser.add_argument('--url', default=None, help='Game address (defaults to the production deployment)')
    parser.add_argument('--quit-after', type=float, default=0, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if sys.platform not in ('darwin','win32'):
        parser.error('The native overlay currently supports macOS and Windows')
    engine = Engine(args.demo)
    if args.url:
        engine.settings = Settings.validated({**asdict(engine.settings),'game_url':args.url})
    try:
        if sys.platform=='darwin':
            from overlay import run
        else:
            from windows_overlay import run
        if args.demo:
            run(engine, quit_after=args.quit_after)
            return
        if sys.platform=='darwin':
            import fcntl
            with (ROOT / '.trainer.lock').open('a+') as lock:
                try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                except BlockingIOError:
                    print('The trainer is already running. F7 opens its settings.',flush=True)
                    return
                lock.seek(0);lock.truncate();lock.write(str(__import__('os').getpid()));lock.flush()
                run(engine, quit_after=args.quit_after)
        else:
            run(engine, quit_after=args.quit_after)
    except Exception as error:
        print('Trainer startup failed: '+str(error),file=sys.stderr,flush=True)
        traceback.print_exc()
        raise


if __name__ == '__main__':
    main()
