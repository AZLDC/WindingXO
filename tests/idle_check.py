"""無視窗驗證閒置黑屏、喚醒重新登入及草稿復原。"""

import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

from playwright.sync_api import expect, sync_playwright

from boot_check import moving

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'native'))
from main import DesktopAPI


def run():
    with tempfile.TemporaryDirectory() as folder, sync_playwright() as pw:
        api=DesktopAPI(Path(folder))
        api._store.save('memo.txt','saved')
        closed=[]
        toggles=[]
        api._window=SimpleNamespace(confirm_close=False,destroy=lambda:closed.append(True),toggle_fullscreen=lambda:toggles.append(True))
        browser=pw.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(user_agent='WindingXO-Native',viewport={'width':1280,'height':800})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.expose_function('hostCall',lambda method,*args:getattr(api,method)(*args))
        page.add_init_script('''if(window===window.top){const connect=()=>{
            window.pywebview={api:new Proxy({},{get:(_,method)=>(...args)=>window.hostCall(method,...args)})};
            window.dispatchEvent(new Event('pywebviewready'));
        };if(sessionStorage.getItem('defer-api'))setTimeout(connect,500);else connect();}''')
        page.clock.install(time=0)
        page.clock.pause_at(1000)

        def click(selector):
            page.locator(selector).evaluate('el=>el.click()')

        def boot_login():
            expect(page.locator('#stage')).to_be_visible()
            page.clock.fast_forward(10000)
            assert page.url.endswith('Loading.html')
            moving(page,20)
            page.clock.run_for(2000)
            page.wait_for_url('**/login.html')

        page.goto((ROOT/'login.html').as_uri())
        page.clock.fast_forward(299999)
        assert page.locator('#idleScreen').count()==0
        # 真實按鍵重新計算5分鐘；不是從頁面載入固定倒數。
        page.keyboard.press('a')
        page.clock.fast_forward(299999)
        assert page.locator('#idleScreen').count()==0
        page.clock.fast_forward(1)
        expect(page.locator('#idleScreen')).to_be_visible()
        assert page.locator('#loginForm').evaluate('el=>el.closest("main").inert')
        # 喚醒點擊不能同時按到登入頁電源。
        click('#power')
        page.wait_for_url('**/Loading.html')
        assert closed==[]
        boot_login()

        # 桌面沒有開Angel時也必須黑屏，Alt+Enter只喚醒、不改原生模式。
        page.goto((ROOT/'desktop.html').as_uri())
        page.evaluate('window.dispatchEvent(new Event("blur"))')
        # 模擬背景計時器被節流，時鐘已過5分鐘但timeout未執行。
        page.clock.set_system_time(page.evaluate('Date.now()')+300000)
        assert page.locator('#idleScreen').count()==0
        page.evaluate('window.dispatchEvent(new Event("focus"))')
        expect(page.locator('#idleScreen')).to_be_visible()
        page.keyboard.press('Alt+Enter')
        page.wait_for_url('**/Loading.html')
        assert toggles==[]
        boot_login()
        page.locator('#password').fill(page.evaluate('window.WINDING_CONFIG.password'))
        click('#enter')
        page.wait_for_url('**/desktop.html')
        click('#angel')
        page.clock.run_for(700)
        expect(page.locator('.file-row')).to_have_count(1)
        click('.file-row')
        click('[data-action="open"]')
        page.locator('#text').fill('unsaved experiment')
        page.clock.fast_forward(299999)
        assert page.locator('#idleScreen').count()==0
        page.clock.fast_forward(1)
        expect(page.locator('#idleScreen')).to_be_visible()
        before=page.locator('#angelCanvas').get_attribute('data-frames')
        page.clock.run_for(100)
        assert page.locator('#angelCanvas').get_attribute('data-frames')==before
        output=ROOT/'.scratch/local/idle'
        output.mkdir(parents=True,exist_ok=True)
        for width,height in [(1280,800),(390,600)]:
            page.set_viewport_size({'width':width,'height':height})
            assert page.locator('#idleScreen').bounding_box()=={'x':0,'y':0,'width':width,'height':height}
            assert page.locator('#idleScreen').evaluate('el=>getComputedStyle(el).backgroundColor')=='rgb(0, 0, 0)'
            page.screenshot(path=str(output/f'black-{width}.png'))
        # Ctrl+S喚醒不能保存到底層文件，也不得出現beforeunload確認。
        dialogs=[]
        page.on('dialog',lambda dialog:(dialogs.append(dialog.type),dialog.dismiss()))
        page.keyboard.press('Control+s')
        page.wait_for_url('**/Loading.html')
        assert api._store.read('memo.txt')=='unsaved experiment'
        boot_login()
        expect(page.locator('#password')).to_have_value('')
        page.locator('#password').fill(page.evaluate('window.WINDING_CONFIG.password'))
        page.evaluate('sessionStorage.setItem("defer-api","true")')
        click('#enter')
        page.wait_for_url('**/desktop.html')
        page.clock.run_for(500)
        expect(page.locator('#angelPlayer')).to_be_hidden()
        expect(page.locator('#editor')).to_be_hidden()
        assert api._store.read('memo.txt')=='unsaved experiment'
        assert dialogs==[] and errors==[], (dialogs,errors)
        assert closed==[] and toggles==[]
        browser.close()
    print('PASS: 5min boundaries/reset, login/desktop/Angel blackout, keyboard/mouse wake swallowed, boot/login cycle, autosaved and App stays closed, two layouts; headless only')


if __name__=='__main__':
    run()
