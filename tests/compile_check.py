"""無視窗檢查獨立 Compile 演出，不操作系統鍵鼠。"""

import sys
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'native'))
from main import DesktopAPI


def run():
    with tempfile.TemporaryDirectory() as folder, sync_playwright() as pw:
        api = DesktopAPI(Path(folder))
        api._store.save('demo.py', "print('toy')")
        api._store.save('notes.txt', 'plain note')
        browser = pw.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width':1280, 'height':800})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.expose_function('hostCall', lambda method, *args: getattr(api, method)(*args))
        page.add_init_script("""window.pywebview = {api: new Proxy({}, {
            get: (_, method) => (...args) => window.hostCall(method, ...args)
        })};""")
        page.clock.install(time=0)
        page.clock.pause_at(1000)
        page.goto((ROOT / 'desktop.html').as_uri())
        page.locator('#angel').evaluate('el=>el.click()')
        expect(page.locator('.file-row')).to_have_count(2)
        page.clock.run_for(700)

        def click(selector):
            page.locator(selector).evaluate('el => el.click()')

        def actions(name='demo.py'):
            expect(page.locator('.file-row')).to_have_count(2)
            click(f'.file-row[data-name="{name}"]')

        def start(name='demo.py'):
            actions(name)
            click('[data-action="compile"]')
            expect(page.locator('#compileScreen')).to_be_visible()
            expect(page.locator('#compileProgress')).to_have_attribute('max', '100')

        def complete():
            page.clock.fast_forward(10000)
            assert page.locator('#compileProgress').evaluate('el => el.value') == 100
            expect(page.locator('#compileScreen')).to_be_visible()
            page.clock.fast_forward(350)
            expect(page.locator('#compileScreen')).to_be_hidden()
            expect(page.locator('#text')).to_be_editable()

        start()
        assert page.locator('#workspace').evaluate('el=>el.inert')
        assert page.locator('#compileScreen').evaluate("el=>{const s=getComputedStyle(el);return s.backgroundImage==='none'&&s.backgroundColor==='rgba(0, 0, 0, 0)';}")
        # 透明遮罩仍攔截真實命中測試；背景按鈕不能取得焦點或被點擊。
        point=page.locator('#newFile').bounding_box()
        x,y=point['x']+point['width']/2,point['y']+point['height']/2
        assert page.evaluate('([x,y])=>document.elementFromPoint(x,y).id',[x,y])=='compileScreen'
        page.mouse.click(x,y)
        page.locator('#newFile').evaluate('el=>el.focus()')
        assert page.evaluate('!document.getElementById("workspace").contains(document.activeElement)')
        page.keyboard.press('Tab')
        assert page.evaluate('document.activeElement.id')=='cancelCompile'
        expect(page.locator('#editor')).to_be_hidden()
        assert page.locator('#compileTitle').evaluate("el=>getComputedStyle(el).userSelect") == 'none'
        assert page.locator('#compileFilename').evaluate("el=>getComputedStyle(el).userSelect") == 'none'
        expect(page.locator('#editor')).to_be_hidden()
        expect(page.locator('.taskbar')).to_be_hidden()
        page.clock.fast_forward(2000)
        assert 24 <= page.locator('#compileProgress').evaluate('el => el.value') <= 26
        output = ROOT / '.scratch/local/compile'
        output.mkdir(parents=True, exist_ok=True)
        for width, height in [(1280, 800), (390, 600)]:
            page.set_viewport_size({'width':width, 'height':height})
            page.clock.run_for(34)
            page.screenshot(path=str(output / f'{width}.png'))
            assert page.evaluate("""() => ['compileProgress','cancelCompile','compileTitle','compileFilename'].every(id => {
                const r = document.getElementById(id).getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
            })""")
            assert page.locator('#compileScreen').evaluate('el => getComputedStyle(el).backgroundImage === "none"')
        complete()
        assert not page.locator('#workspace').evaluate('el=>el.inert')
        expect(page.locator('#editor')).to_be_hidden()
        actions()
        expect(page.locator('[data-action="activate"]')).to_be_enabled()
        click('[data-action="activate"]')
        expect(page.locator('.file-row[data-name="demo.py"] > span:first-child')).to_have_text('●')
        actions()
        expect(page.locator('[data-action="activate"]')).to_have_text('Deactive')
        click('[data-action="activate"]')
        expect(page.locator('.file-row[data-name="demo.py"] > span:first-child')).to_have_text('▤')
        actions()
        expect(page.locator('[data-action="activate"]')).to_have_text('Active')
        click('[data-action="activate"]')
        actions()
        click('[data-action="open"]')
        expect(page.locator('#text')).to_have_value("print('toy')")
        page.locator('#text').evaluate("el => {el.value='unsaved draft';el.dispatchEvent(new Event('input'));}")
        expect(page.locator('.file-row[data-name="demo.py"] > span:first-child')).to_have_text('▤')
        title = page.locator('#editorTitle').text_content()
        start('notes.txt')
        expect(page.locator('#compileFilename')).to_have_text('notes')
        page.locator('#text').evaluate("el => el.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))")
        expect(page.locator('#text')).to_have_value('unsaved draft')
        complete()
        expect(page.locator('#text')).to_have_value('unsaved draft')
        expect(page.locator('#editorTitle')).to_have_text(title)
        expect(page.locator('#editor')).to_be_visible()
        assert api._store.read('demo.py') == "print('toy')"
        actions('notes.txt')
        expect(page.locator('[data-action="activate"]')).to_be_enabled()
        click('[data-action="activate"]')
        actions()
        expect(page.locator('[data-action="activate"]')).to_be_disabled()
        click('[data-action="compile"]')
        expect(page.locator('#compileScreen')).to_be_visible()
        click('#cancelCompile')
        expect(page.locator('#compileScreen')).to_be_hidden()
        actions()
        expect(page.locator('[data-action="activate"]')).to_be_disabled()
        click('[data-action="compile"]')
        expect(page.locator('#compileScreen')).to_be_visible()
        page.locator('#cancelCompile').evaluate("el => el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))")
        expect(page.locator('#compileScreen')).to_be_hidden()
        expect(page.locator('#text')).to_have_value('unsaved draft')
        assert errors == [], errors
        browser.close()
    print('PASS: standalone terminal, slow progress and full hold, unchanged editor, per-file activation, cancel, two layouts; headless only')


if __name__ == '__main__':
    run()
