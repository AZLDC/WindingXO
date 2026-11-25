"""無視窗檢查編輯器快捷鍵、另存新檔及捲軸，不啟動原生App。"""

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
        browser = pw.chromium.launch(channel='msedge', headless=True, ignore_default_args=['--hide-scrollbars'])
        page = browser.new_page(viewport={'width':1280, 'height':800})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.expose_function('hostCall', lambda method, *args: getattr(api, method)(*args))
        page.add_init_script('window.pywebview={api:new Proxy({},{get:(_,method)=>(...args)=>window.hostCall(method,...args)})};')

        def click(selector):
            page.locator(selector).evaluate('el=>el.click()')

        def filename(value):
            expect(page.locator('#filename')).to_be_visible()
            page.locator('#filename').fill(value)
            click('#dialogButtons button:first-child')

        def ready():
            expect(page.locator('#modal')).to_be_hidden()
            expect(page.locator('#text')).to_be_editable()

        page.goto((ROOT / 'desktop.html').as_uri())
        click('#angel')
        page.wait_for_function('!document.getElementById("angelPlayer").getAnimations().length')
        click('#newFile')
        assert page.locator('#toggleEditor, #editor [data-command="minimize"]').count()==0
        assert page.locator('#editor .window-controls button').count()==2
        expect(page.locator('#editorTitle')).to_have_text('Untitled - Angel Player')
        assert page.locator('#editor .toolbar, #editor .statusbar, #save, #editorStatus').count()==0
        page.locator('#text').fill('original')
        page.keyboard.press('Control+s')
        expect(page.locator('#filename')).to_have_value('Untitled.txt')
        filename('original.txt')
        ready()
        page.locator('#text').fill('updated')
        page.keyboard.press('Control+s')
        ready()
        assert api._store.read('original.txt')=='updated'
        page.locator('#text').fill('copy draft')
        page.keyboard.press('Control+Shift+s')
        expect(page.locator('#dialogTitle')).to_have_text('另存新檔')
        expect(page.locator('#filename')).to_have_value('original.txt')
        click('#dialogButtons button:nth-child(2)')
        ready()
        expect(page.locator('#editorTitle')).to_have_text('*original - Angel Player')
        expect(page.locator('#text')).to_have_value('copy draft')
        assert api._store.list()==['original.txt']
        page.keyboard.press('Control+Shift+s')
        filename('copy.txt')
        ready()
        expect(page.locator('#editorTitle')).to_have_text('copy - Angel Player')
        assert api._store.read('original.txt')=='updated'
        assert api._store.read('copy.txt')=='copy draft'
        page.keyboard.press('Control+Shift+s')
        filename('original.txt')
        expect(page.locator('#dialogTitle')).to_have_text('確認覆寫')
        click('#dialogButtons button:nth-child(2)')
        ready()
        assert api._store.read('original.txt')=='updated'
        expect(page.locator('#editorTitle')).to_have_text('copy - Angel Player')
        page.keyboard.press('Control+Shift+s')
        filename('original.txt')
        expect(page.locator('#dialogTitle')).to_have_text('確認覆寫')
        click('#dialogButtons button:first-child')
        ready()
        assert api._store.read('original.txt')=='copy draft'
        expect(page.locator('#editorTitle')).to_have_text('original - Angel Player')

        output = ROOT / '.scratch/local/editor'
        output.mkdir(parents=True, exist_ok=True)
        page.locator('#text').fill('\n'.join(f'{n:03} ' + 'Angel Player  '*30 for n in range(80)))
        for width, height in [(1280,800), (390,600)]:
            page.set_viewport_size({'width':width, 'height':height})
            page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            page.locator('#text').evaluate('el=>{el.scrollLeft=0;el.scrollTop=0;}')
            assert page.locator('#text').evaluate('el=>el.scrollWidth>el.clientWidth&&el.scrollHeight>el.clientHeight')
            assert page.locator('#text').evaluate("el=>getComputedStyle(el,'::-webkit-scrollbar-thumb').backgroundColor==='rgb(75, 180, 207)'")
            assert page.locator('#editor').evaluate('el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}')
            page.screenshot(path=str(output / f'editor-{width}.png'))
            page.locator('#text').focus()
            page.keyboard.press('Control+Home')
            page.keyboard.press('Control+End')
            page.wait_for_function('document.getElementById("text").scrollTop>0')
            page.keyboard.press('Control+Home')
        assert errors==[], errors
        browser.close()
    print('PASS: Ctrl+S, Save As, cancel, conflict confirmation, Untitled, no toolbar/footer, scroll overflow and two layouts; headless only')


if __name__ == '__main__':
    run()
