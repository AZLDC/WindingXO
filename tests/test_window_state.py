import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS

from native.window_state import WindowState, capture_window_state, fit_window_state


class WindowStateTests(unittest.TestCase):
    def test_first_start_and_bad_config_use_fullscreen(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "window.json"
            self.assertTrue(WindowState.load(path).fullscreen)
            path.write_text("broken", encoding="utf-8")
            self.assertTrue(WindowState.load(path).fullscreen)

    def test_geometry_and_mode_survive_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "data/window.json"
            for fullscreen in (False, True):
                state = WindowState(fullscreen=fullscreen, width=940, height=640, x=-900, y=50)
                state.save(path)
                self.assertEqual(WindowState.load(path), state)

    def test_capture_fullscreen_preserves_restore_geometry(self):
        native = NS(is_fullscreen=True, _scale=1.5, WindowState="Maximized",
                    old_size=NS(Width=1500, Height=975), old_location=NS(X=180, Y=75))
        self.assertEqual(capture_window_state(native), WindowState(True, 1000, 650, 120, 50))

    def test_capture_windowed_and_minimized(self):
        native = NS(is_fullscreen=False, _scale=1,
                    WindowState="Normal", Size=NS(Width=960, Height=630), Location=NS(X=80, Y=40))
        self.assertEqual(capture_window_state(native), WindowState(False, 960, 630, 80, 40))
        native.WindowState = "Minimized"
        native.RestoreBounds = NS(Width=960, Height=630, X=80, Y=40)
        self.assertEqual(capture_window_state(native), WindowState(False, 960, 630, 80, 40))

    def test_maximized_state_preserves_restore_bounds(self):
        native = NS(is_fullscreen=False, _scale=1, WindowState="Maximized",
                    RestoreBounds=NS(Width=1000, Height=700, X=60, Y=40))
        self.assertEqual(capture_window_state(native), WindowState(False, 1000, 700, 60, 40, True))

    def test_disconnected_monitor_and_smaller_screen(self):
        screen = NS(x=0, y=0, width=800, height=600)
        state = fit_window_state(WindowState(False, 1200, 900, 4000, 50), [screen])
        self.assertEqual((state.width, state.height), (800, 600))
        self.assertEqual((state.x, state.y), (0, 0))

    def test_negative_monitor_position_is_preserved(self):
        screen = NS(x=-1920, y=0, width=1920, height=1080)
        state = WindowState(False, 900, 600, -1800, 50)
        self.assertEqual(fit_window_state(state, [screen]), state)

    def test_fullscreen_from_maximized_uses_normal_restore_bounds(self):
        restore = WindowState(False, 900, 600, 70, 40, True)
        native = NS(is_fullscreen=True, _scale=1, WindowState="Maximized",
                    old_size=NS(Width=1920, Height=1080), old_location=NS(X=0, Y=0))
        self.assertEqual(capture_window_state(native, restore), WindowState(True, 900, 600, 70, 40, True))


if __name__ == "__main__":
    unittest.main()
