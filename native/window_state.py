"""視窗模式及一般視窗範圍的本機保存，不依賴 GUI 啟動。"""

import json
import os
import tempfile
from dataclasses import asdict, dataclass, replace
from pathlib import Path


@dataclass(frozen=True)
class WindowState:
    fullscreen: bool = True
    width: int = 1100
    height: int = 720
    x: int | None = None
    y: int | None = None
    maximized: bool = False

    @classmethod
    def load(cls, path: Path):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            state = cls(**data)
            valid_size = type(state.width) is int and type(state.height) is int and 360 <= state.width <= 16384 and 300 <= state.height <= 16384
            valid_position = (state.x is None and state.y is None) or all(type(value) is int and abs(value) <= 100000 for value in (state.x, state.y))
            return state if type(state.fullscreen) is bool and type(state.maximized) is bool and valid_size and valid_position else cls()
        except (OSError, ValueError, TypeError, UnicodeError):
            return cls()

    def save(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".window-", dir=path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(asdict(self), stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


def capture_window_state(native, restore_state: WindowState | None = None) -> WindowState:
    """WinForms 的範圍為實體像素，還原為 pywebview 使用的邏輯像素。"""
    scale = native._scale
    if native.is_fullscreen:
        # pywebview 的 old_size 可能是最大化大小，優先使用進入前保存的普通範圍。
        if restore_state is not None:
            return replace(restore_state, fullscreen=True)
        size, position = native.old_size, native.old_location
        width, height, x, y = size.Width, size.Height, position.X, position.Y
    elif str(native.WindowState) != "Normal":
        rect = native.RestoreBounds
        width, height, x, y = rect.Width, rect.Height, rect.X, rect.Y
    else:
        width, height = native.Size.Width, native.Size.Height
        x, y = native.Location.X, native.Location.Y
    return WindowState(bool(native.is_fullscreen), round(width / scale), round(height / scale), round(x / scale), round(y / scale),
                       not native.is_fullscreen and str(native.WindowState) == "Maximized")


def fit_window_state(state: WindowState, screens) -> WindowState:
    if not screens:
        return state

    def overlap(screen):
        if state.x is None:
            return 0
        return max(0, min(state.x + state.width, screen.x + screen.width) - max(state.x, screen.x)) * max(0, min(state.y + state.height, screen.y + screen.height) - max(state.y, screen.y))

    screen = max(screens, key=overlap)
    width, height = min(state.width, screen.width), min(state.height, screen.height)
    x = state.x if state.x is not None else screen.x + (screen.width - width) // 2
    y = state.y if state.y is not None else screen.y + (screen.height - height) // 2
    return replace(state, width=width, height=height,
                   x=max(screen.x, min(x, screen.x + screen.width - width)),
                   y=max(screen.y, min(y, screen.y + screen.height - height)))
