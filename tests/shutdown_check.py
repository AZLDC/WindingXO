"""關機入口使用假視窗驗證；不會關閉真實 App 或操作系統電源。"""

import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "native"))
from main import DesktopAPI


def run():
    with tempfile.TemporaryDirectory() as folder, sync_playwright() as pw:
        api = DesktopAPI(Path(folder))
        closed = []
        api._window = SimpleNamespace(confirm_close=True, destroy=lambda: closed.append(True))
        browser = pw.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width":1280, "height":800})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.expose_function("hostCall", lambda method, *args: getattr(api, method)(*args))
        page.add_init_script("""window.pywebview = {api: new Proxy({}, {
            get: (_, method) => (...args) => window.hostCall(method, ...args)
        })};""")

        def click(selector):
            page.locator(selector).evaluate("el=>el.click()")

        def text(selector, value):
            page.locator(selector).evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input'));}", value)

        page.goto((ROOT / "login.html").as_uri())
        expect(page.locator("#power")).to_be_visible()
        click("#power")
        expect(page.locator("#power")).to_be_enabled()
        assert len(closed) == 1
        assert api._window.confirm_close is False
        output = ROOT / ".scratch/local/shutdown"
        output.mkdir(parents=True, exist_ok=True)
        for width, height in [(1280,800),(390,600)]:
            page.set_viewport_size({"width":width,"height":height})
            assert page.locator("#power").evaluate("el=>{const r=el.getBoundingClientRect();return r.x>0&&r.y>0&&r.right<=innerWidth&&r.bottom<=innerHeight;}")
            page.screenshot(path=str(output / f"login-{width}.png"))

        page.goto((ROOT / "desktop.html").as_uri())
        click("#start")
        assert page.locator('#startMenu #fileList').count() == 0
        expect(page.locator('#logout')).to_be_visible()
        expect(page.locator("#shutdown")).to_be_visible()
        click("#shutdown")
        expect(page.locator("#text")).to_be_editable()
        assert len(closed) == 2
        click("#angel")
        click("#newFile")
        text("#text", "unsaved draft")
        click('#minimizeAngel')
        click("#start")
        click("#shutdown")
        expect(page.locator("#dialogMessage")).to_have_text("文件尚未儲存，是否儲存變更？")
        click("#dialogButtons button:nth-child(3)")
        expect(page.locator("#text")).to_be_editable()
        assert len(closed) == 2
        expect(page.locator("#text")).to_have_value("unsaved draft")
        click("#start")
        click("#shutdown")
        click("#dialogButtons button:nth-child(1)")
        expect(page.locator("#filename")).to_be_visible()
        text("#filename", "saved.txt")
        click("#dialogButtons button:nth-child(1)")
        expect(page.locator("#text")).to_be_editable()
        assert len(closed) == 3
        assert api._store.read("saved.txt") == "unsaved draft"
        text("#text", "discarded edit")
        click("#start")
        click("#shutdown")
        click("#dialogButtons button:nth-child(2)")
        expect(page.locator("#text")).to_be_editable()
        assert len(closed) == 4
        assert api._store.read("saved.txt") == "unsaved draft"

        for index in range(70):
            api._store.save(f"note-{index}.txt", "note")
        click('#angelTask')
        expect(page.locator('.file-row')).to_have_count(71)
        for width, height in [(1280,800),(390,600)]:
            page.set_viewport_size({"width":width,"height":height})
            page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
            expect(page.locator(".file-row")).to_have_count(71)
            assert page.evaluate("""()=>{
                const list=document.getElementById('fileList');
                const a=list.getBoundingClientRect();
                return list.scrollHeight>list.clientHeight&&a.bottom<=innerHeight&&a.top>=0;
            }""")
            page.locator("#fileList").evaluate("el=>el.scrollTop=el.scrollHeight")
            click('#minimizeAngel')
            click('#start')
            assert page.locator('#startMenu #fileList').count() == 0
            before = page.locator("#shutdown").bounding_box()
            expect(page.locator('.taskbar')).to_be_visible()
            assert page.locator("#shutdown").bounding_box() == before
            page.screenshot(path=str(output / f"menu-{width}.png"))
            click("#start")
            click('#angelTask')
        assert errors == [], errors
        browser.close()
    print("PASS: login power, Japanese XP shutdown, save/discard/cancel, independent Angel file list, two layouts; fake window and headless only")


if __name__ == "__main__":
    run()
