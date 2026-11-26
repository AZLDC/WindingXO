"""Winding XO Windows 桌面入口。"""

import argparse
import ctypes
import logging
import shutil
import sys
from pathlib import Path

from storage import TextStore
from window_state import WindowState, capture_window_state, fit_window_state

ROOT = Path(__file__).resolve().parent.parent


class DesktopAPI:
    def __init__(self, root: Path):
        self._store = TextStore(root)
        self._window = None
        self._fullscreen = True
        self._restore_state = None

    def _call(self, operation, *args):
        try:
            return {"ok": True, "value": operation(*args)}
        except FileExistsError as error:
            return {"ok": False, "conflict": True, "error": str(error)}
        except (OSError, ValueError, UnicodeError) as error:
            return {"ok": False, "error": str(error)}

    def list_files(self):
        return self._call(self._store.list)

    def list_catalog(self):
        return self._call(self._store.catalog)

    def compile_file(self, name):
        return self._call(self._store.compile, name)

    def invalidate_file(self, name):
        return self._call(self._store.invalidate, name)

    def activate_file(self, name, region):
        return self._call(self._store.activate, name, region)

    def rename_file(self, name, new_name):
        return self._call(self._store.rename, name, new_name)

    def get_disk_usage(self):
        def usage():
            total, used, free = shutil.disk_usage(ROOT)
            return {"total": total, "used": used, "free": free}
        return self._call(usage)

    def read_file(self, name):
        return self._call(self._store.read, name)

    def save_file(self, name, content, overwrite=False):
        return self._call(self._store.save, name, content, overwrite)

    def delete_file(self, name):
        return self._call(self._store.delete, name)

    def toggle_fullscreen(self):
        native = getattr(self._window, "native", None)
        if sys.platform == "win32" and native is not None and not native.is_fullscreen:
            self._restore_state = capture_window_state(native)
        self._window.toggle_fullscreen()
        self._fullscreen = not self._fullscreen

    def close_app(self):
        def close():
            # 網頁已處理未儲存文件，避免原生關閉提示重複詢問。
            self._window.confirm_close = False
            self._window.destroy()
        return self._call(close)


def main():
    parser = argparse.ArgumentParser(description="Macrosoft Winding XO")
    parser.add_argument("--texts-dir", type=Path, default=ROOT / "texts")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--state-file", type=Path, default=ROOT / "data/window-state.json")
    args = parser.parse_args()
    try:
        import webview
    except ImportError:
        raise SystemExit("請先用 RUN.cmd 安裝套件並啟動。")
    if sys.platform == "win32":
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Macrosoft.WindingXO.Desktop")
    api = DesktopAPI(args.texts_dir)
    state = fit_window_state(WindowState.load(args.state_file), webview.screens)
    api._fullscreen = state.fullscreen
    api._restore_state = state
    window = webview.create_window(
        "Macrosoft Winding XO", str(ROOT / "index.html"),
        js_api=api, width=state.width, height=state.height, x=state.x, y=state.y, min_size=(360, 300),
        maximized=state.maximized and not state.fullscreen,
        fullscreen=state.fullscreen, background_color="#000000", text_select=True,
        confirm_close=False,
    )
    api._window = window

    def remember_window():
        try:
            if sys.platform == "win32":
                current = capture_window_state(window.native, api._restore_state)
            else:
                current = WindowState(api._fullscreen, window.width, window.height, window.x, window.y)
            current.save(args.state_file)
        except OSError:
            logging.exception("無法儲存視窗位置與大小")

    window.events.closing += remember_window
    webview.start(
        gui="edgechromium" if sys.platform == "win32" else None,
        debug=args.debug, user_agent="WindingXO-Native",
    )


if __name__ == "__main__":
    main()
