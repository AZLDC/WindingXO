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
        for case in ['continuous','pause','reset','boundary']:
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
            moving(page,20)
            if case=='pause':
                page.clock.run_for(2000);move(page,200)
            elif case=='reset':
                page.clock.run_for(3001);move(page,200)
                moving(page,20,201)
            elif case=='boundary':
                page.clock.run_for(3000);move(page,200)
            page.clock.run_for(100);move(page,300)
            for i in range(28):
                page.clock.run_for(100);move(page,301+i)
            assert page.url.endswith('Loading.html'), '未滿5秒不得進入登入'
            page.clock.run_for(100);move(page,400)
            page.wait_for_url("**/login.html")
            page.close()
        assert errors==[], errors
        browser.close()
    print('PASS: no timeout, mouse-only 5s, pause excluded, <=3s continuation and >3s reset; headless only')


if __name__ == "__main__":
    run()
