import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "native"))
import main as app


class ClosingEvent:
    def __init__(self):
        self.callbacks = []

    def __iadd__(self, callback):
        self.callbacks.append(callback)
        return self


class AppLifecycleTests(unittest.TestCase):
    def test_startup_uses_saved_state_and_close_writes_geometry(self):
        with tempfile.TemporaryDirectory() as folder:
            state_file = Path(folder) / "state.json"
            app.WindowState(False, 900, 650, 70, 40, True).save(state_file)
            created = []
            page_urls = []

            def create_window(*args, **options):
                page_urls.append(Path(args[1]))
                created.append(options)
                return NS(width=950, height=680, x=100, y=60, events=NS(closing=ClosingEvent()))

            def start(**options):
                for callback in created[0]["js_api"]._window.events.closing.callbacks:
                    callback()

            webview = NS(screens=[NS(x=0, y=0, width=1920, height=1080)], create_window=create_window, start=start)
            argv = ["main.py", "--texts-dir", str(Path(folder) / "texts"), "--state-file", str(state_file)]
            with patch.dict(sys.modules, {"webview": webview}), patch.object(sys, "argv", argv), patch.object(sys, "platform", "test"):
                app.main()
            self.assertEqual(page_urls, [app.ROOT / "index.html"])
            self.assertTrue(page_urls[0].is_file())
            self.assertFalse(created[0]["fullscreen"])
            self.assertFalse(created[0]["confirm_close"])
            self.assertTrue(created[0]["maximized"])
            self.assertEqual((created[0]["width"], created[0]["height"], created[0]["x"], created[0]["y"]), (900, 650, 70, 40))
            self.assertEqual(app.WindowState.load(state_file), app.WindowState(False, 950, 680, 100, 60))

    def test_close_app_only_destroys_own_window(self):
        with tempfile.TemporaryDirectory() as folder:
            api = app.DesktopAPI(Path(folder))
            closed = []
            api._window = NS(confirm_close=True, destroy=lambda: closed.append(True))
            self.assertEqual(api.close_app(), {"ok": True, "value": None})
            self.assertEqual(closed, [True])
            self.assertFalse(api._window.confirm_close)

    def test_entering_fullscreen_captures_normal_bounds_first(self):
        with tempfile.TemporaryDirectory() as folder:
            api = app.DesktopAPI(Path(folder))
            native = NS(is_fullscreen=False, _scale=1, WindowState="Maximized",
                        RestoreBounds=NS(Width=900, Height=600, X=70, Y=40))
            api._window = NS(native=native, toggle_fullscreen=lambda: setattr(native, "is_fullscreen", True))
            with patch.object(sys, "platform", "win32"):
                api.toggle_fullscreen()
            self.assertEqual(api._restore_state, app.WindowState(False, 900, 600, 70, 40, True))


if __name__ == "__main__":
    unittest.main()
