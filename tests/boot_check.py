"""以虛擬時鐘驗證移動開機，不操作系統鍵鼠。"""

from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def move(page, x):
    page.evaluate('(x)=>document.dispatchEvent(new MouseEvent("mousemove",{clientX:x,clientY:100,bubbles:true}))', x)


def moving(page, count, start=0):
    move(page, start)
    for i in range(count):
        page.clock.run_for(100)
        move(page, start+i+1)


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="msedge", headless=True)
        errors=[]
        for case in ['continuous','pause','blur','hidden','touch','touch-cancel']:
            page = browser.new_page(user_agent="WindingXO-Native")
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.clock.install(time=0)
            page.clock.pause_at(1000)
            page.goto((ROOT / "Loading.html").as_uri())
            page.clock.fast_forward(60000)
            assert page.url.endswith('Loading.html'), '沒有移動不應進登入'
            page.locator("#canvas").evaluate('el=>el.click()')
            page.keyboard.press("Enter")
            page.keyboard.press("Space")
            assert page.url.endswith("Loading.html"), "開機等待不可被點擊或按鍵跳過"
            move(page,77)
            page.clock.fast_forward(1000)
            move(page,77)
            page.clock.fast_forward(5000)
            assert page.url.endswith('Loading.html'), '單次移動或相同座標不得當作持續移動'
            if case.startswith('touch'):
                def touch(kind):
                    page.evaluate('(kind)=>window.dispatchEvent(new PointerEvent(kind,{pointerType:"touch",pointerId:1,isPrimary:true,clientX:5,clientY:5,bubbles:true}))',kind)
                touch('pointerdown')
                page.clock.run_for(4900)
                assert page.url.endswith('Loading.html')
                if case=='touch-cancel':
                    touch('pointerup');page.clock.run_for(200);touch('pointerdown')
                    page.clock.run_for(4900)
                    assert page.evaluate('document.body.dataset.bootPhase') is None
                page.clock.run_for(100)
                touch('pointerup')
            else:
                moving(page,10)
                if case=='pause':
                    page.clock.run_for(251)
                elif case=='blur':
                    page.evaluate('window.dispatchEvent(new Event("blur"))')
                    moving(page,20,101)
                    assert page.evaluate('document.body.dataset.bootPhase') is None
                    page.evaluate('window.dispatchEvent(new Event("focus"))')
                elif case=='hidden':
                    page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))')
                    moving(page,20,101)
                    assert page.evaluate('document.body.dataset.bootPhase') is None
                    page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"))')
                moving(page,9 if case=='continuous' else 19,201)
                assert page.evaluate('document.body.dataset.bootPhase') is None, '未滿2秒不能收尾'
                page.clock.run_for(100);move(page,400)
            assert page.evaluate('document.body.dataset.bootPhase')=='paused'
            frozen=page.locator('#cells').evaluate('el=>el.style.transform')
            page.clock.run_for(900)
            assert page.locator('#cells').evaluate('el=>el.style.transform')==frozen
            page.clock.run_for(100)
            assert page.evaluate('document.body.dataset.bootPhase')=='running'
            page.clock.run_for(900)
            assert page.url.endswith('Loading.html'), '收尾2秒前不能換頁'
            assert page.locator('#cells').evaluate('el=>el.style.transform')!=frozen
            page.clock.run_for(100)
            page.wait_for_url("**/login.html")
            page.close()
        assert errors==[], errors
        page=browser.new_page(user_agent='WindingXO-Native')
        page.add_init_script('HTMLCanvasElement.prototype.getContext=()=>null')
        page.clock.install(time=0)
        page.clock.pause_at(1000)
        page.goto((ROOT/'Loading.html').as_uri())
        moving(page,20)
        page.clock.run_for(1999)
        assert page.url.endswith('Loading.html')
        page.clock.run_for(1)
        page.wait_for_url('**/login.html')
        page.close()
        browser.close()
    print('PASS: mouse 2s, stop/blur/hidden reset, touch 5s/cancel, frozen 1s + running 1s; headless only')


if __name__ == "__main__":
    run()
