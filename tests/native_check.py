"""Windows 真實 WebView2 視窗、快捷鍵與持久化整合檢查。"""

import ctypes
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from ctypes import wintypes
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def host():
    import webview

    webview.settings["REMOTE_DEBUGGING_PORT"] = int(sys.argv[2])
    folder = sys.argv[3]
    (Path(folder) / "host.pid").write_text(str(os.getpid()), encoding="ascii")
    sys.path.insert(0, str(ROOT / "native"))
    from main import main

    sys.argv = [sys.argv[0], "--texts-dir", folder, "--state-file", str(Path(folder) / "window-state.json")]
    main()


def wait_for(check, seconds=10):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = check()
        if value:
            return value
        time.sleep(0.1)
    raise AssertionError("Native check timed out")


def run():
    from playwright.sync_api import expect, sync_playwright

    user32 = ctypes.windll.user32
    user32.SetProcessDPIAware()
    user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.GetWindowLongW.restype = ctypes.c_long
    user32.GetWindow.argtypes = [wintypes.HWND, ctypes.c_uint]
    user32.GetWindow.restype = wintypes.HWND
    output = ROOT / ".scratch/local/native"
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as folder, socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        sock.close()
        with (output / "host.log").open("w", encoding="utf-8") as log:
            process = subprocess.Popen(
                [sys.executable, __file__, "--host", str(port), folder],
                stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW,
            )
            try:
                def endpoint_ready():
                    if process.poll() is not None:
                        raise AssertionError((output / "host.log").read_text(encoding="utf-8"))
                    try:
                        with urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1) as response:
                            return json.load(response)
                    except OSError:
                        return None

                wait_for(endpoint_ready)
                host_pid = int((Path(folder) / "host.pid").read_text(encoding="ascii"))
                handles = []
                callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

                @callback_type
                def collect(hwnd, _):
                    pid = wintypes.DWORD()
                    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                    if pid.value == host_pid and user32.IsWindowVisible(hwnd):
                        handles.append(hwnd)
                    return True

                def find_window():
                    handles.clear()
                    user32.EnumWindows(collect, 0)
                    return handles

                wait_for(find_window)
                hwnd = handles[0]

                def caption():
                    return bool(user32.GetWindowLongW(hwnd, -16) & 0x00C00000)

                assert not caption(), "Startup must be borderless"
                assert not user32.GetWindowLongW(hwnd, -20) & 0x80, "Must not be a tool window"
                assert not user32.GetWindow(hwnd, 4), "Taskbar entry requires unowned application window"
                with sync_playwright() as pw:
                    browser = pw.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
                    page = browser.contexts[0].pages[0]
                    page.on('pageerror', lambda error: print('JS ERROR:', error, flush=True))
                    page.wait_for_function("Boolean(window.pywebview?.api?.toggle_fullscreen)")
                    assert page.evaluate("window.windingNative")
                    page.wait_for_function("innerWidth === screen.width && innerHeight === screen.height", timeout=5000)
                    page.keyboard.press("Alt+Enter")
                    wait_for(caption)
                    assert page.url.endswith("index.html"), "Alt+Enter must not enter login"
                    page.keyboard.press("Alt+Enter")
                    wait_for(lambda: not caption())
                    page.wait_for_function("innerWidth === screen.width && innerHeight === screen.height", timeout=5000)
                    frame = page.frame(name="winding-content")
                    # 僅在使用者明確允許執行此原生測試時，產生開機所需的移動。
                    for step in range(60):
                        if frame.url.endswith('login.html'):
                            break
                        page.mouse.move(50+step*2, 80)
                        time.sleep(.1)
                    frame.wait_for_url("**/login.html")
                    frame.wait_for_load_state('load')
                    assert not caption(), "Login navigation must preserve fullscreen"
                    frame.wait_for_function("Boolean(window.getWindingAPI())")
                    page.keyboard.press("Alt+Enter")
                    wait_for(caption)
                    frame.locator("#password").fill(frame.evaluate("window.WINDING_CONFIG.password"))
                    page.keyboard.press("Enter")
                    frame.wait_for_url("**/desktop.html")
                    frame.wait_for_load_state('load')
                    assert caption(), "Desktop must preserve windowed state"
                    frame.wait_for_function("Boolean(window.getWindingAPI())")
                    # WebView2 跨頁後先以真實點擊建立自動化輸入焦點。
                    frame.locator("#angel").click()
                    frame.locator("#newFile").click()
                    page.keyboard.press("Alt+Enter")
                    wait_for(lambda: not caption())
                    frame.locator("#text").fill("真實 Python 視窗儲存\nprint('hello')")
                    page.keyboard.press("Control+s")
                    frame.locator("#filename").fill("native.py")
                    frame.locator("#dialogButtons").get_by_text("儲存", exact=True).click()
                    expect(frame.locator("#editorTitle")).to_have_text("native.py - Angel Player")
                    assert (Path(folder) / "native.py").read_text(encoding="utf-8").startswith("真實 Python")
                    frame.locator(".file-row").click()
                    page.screenshot(path=str(output / "native.png"))
                    frame.locator('#fileActions [data-action="open"]').click()
                    expect(frame.locator("#text")).to_have_value("真實 Python 視窗儲存\nprint('hello')")
                    browser.close()
                (output / "result.json").write_text(json.dumps({
                    "startup_borderless":True,"taskbar_eligible":True,"alt_enter_all_pages":True,
                    "navigation_preserves_mode":True,"native_save_read":True,
                }, indent=2), encoding="utf-8")
                print("PASS: native startup fullscreen, taskbar eligibility, Alt+Enter on all pages, navigation mode, real disk save and Open")
            finally:
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
                process.wait(timeout=10)


if __name__ == "__main__":
    if "--host" in sys.argv:
        host()
    else:
        run()
