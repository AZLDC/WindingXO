"""Angel Player 與日文 XP 分工的無視窗驗證。"""

import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'native'))
from main import DesktopAPI


def run():
    with tempfile.TemporaryDirectory() as folder, sync_playwright() as pw:
        api = DesktopAPI(Path(folder))
        closed = []
        api._window = SimpleNamespace(confirm_close=True,destroy=lambda:closed.append(True))
        browser = pw.chromium.launch(channel='msedge',headless=True)
        page = browser.new_page(viewport={'width':1280,'height':800})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.expose_function('hostCall',lambda method,*args:getattr(api,method)(*args))
        page.add_init_script("window.pywebview={api:new Proxy({},{get:(_,method)=>(...args)=>window.hostCall(method,...args)})};")

        def click(selector):
            page.locator(selector).evaluate('el=>el.click()')

        def enter(selector,value):
            page.locator(selector).evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}",value)

        def actions(name):
            page.locator(f'.file-row[data-name="{name}"]').evaluate('el=>el.click()')
            expect(page.locator('#fileActions')).to_be_visible()

        page.goto((ROOT/'desktop.html').as_uri())
        click('#start')
        assert page.locator('#startMenu #fileList').count()==0
        assert page.locator('#startMenu button').count()==2
        expect(page.locator('#start')).to_contain_text('スタート')
        expect(page.locator('#logout')).to_contain_text('ログオフ')
        expect(page.locator('#shutdown')).to_contain_text('終了オプション')
        click('#angel')
        expect(page.locator('#angelPlayer')).to_be_visible()
        expect(page.locator('.taskbar')).to_be_hidden()
        assert page.locator('#angelPlayer').bounding_box() == {'x':0,'y':0,'width':1280,'height':800}
        opening=page.locator('#angelPlayer').evaluate("el=>{const a=el.getAnimations()[0],k=a.effect.getKeyframes();a.pause();a.currentTime=100;return {duration:a.effect.getTiming().duration,clip:k[0].clipPath};}")
        assert opening['duration']==650 and 'circle(' in opening['clip']
        output=ROOT/'.scratch/local/angel'
        output.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=str(output/'opening-1280.png'))
        page.locator('#angelPlayer').evaluate('el=>el.getAnimations()[0].finish()')
        page.wait_for_function('!document.getElementById("angelPlayer").getAnimations().length')
        click('#start')
        expect(page.locator('#startMenu')).to_be_hidden()
        expect(page.locator('#fileList .empty')).to_have_text('(null)')
        expect(page.locator('#fileSidebar')).to_be_visible()
        expect(page.locator('#editor')).to_be_hidden()
        page.wait_for_function("Number(document.getElementById('angelCanvas').dataset.frames)>2")
        assert int(page.locator('#angelCanvas').get_attribute('data-vertices'))>500
        assert page.locator('#angelCanvas').get_attribute('data-rings')=='10'
        rulers=page.evaluate('''()=>{
            angelVisual.stop();
            const original=angelVisual.ring,frames=[];
            angelVisual.ring=(...args)=>frames.push(args);
            angelVisual.draw(1);angelVisual.draw(2);
            angelVisual.ring=original;angelVisual.start();
            return frames;
        }''')
        assert len(rulers)==20
        groups={}
        for a,b in zip(rulers[:10],rulers[10:]):
            assert a[4]>=360
            groups.setdefault((a[0],a[1]),[]).append(b[3]-a[3])
        assert len(groups)==3
        for (_,y),angles in groups.items():
            assert max(angles)-min(angles)<1e-9, '同心刻度必須整組同速同向'
            assert all(angle>0 for angle in angles) if y<0 else all(angle<0 for angle in angles)
        expect(page.locator('#diskUsage')).to_contain_text('% USED')
        disk_usage=api.get_disk_usage
        api.get_disk_usage=lambda:{'ok':True,'value':{'total':4_000_000_000,'used':1_280_000_000}}
        page.evaluate('refreshDiskUsage()')
        expect(page.locator('#diskUsage')).to_have_text('4.0 GB · 32.0% USED')
        api.get_disk_usage=lambda:{'ok':False,'error':'unavailable'}
        page.evaluate('refreshDiskUsage()')
        expect(page.locator('#diskUsage')).to_have_text('DISK UNAVAILABLE')
        api.get_disk_usage=disk_usage
        page.evaluate('refreshDiskUsage()')
        assert float(page.locator('#angelCanvas').get_attribute('data-ruler-font'))>=20
        first=page.locator('#angelCanvas').screenshot()
        before=int(page.locator('#angelCanvas').get_attribute('data-frames'))
        page.wait_for_function('(before)=>Number(document.getElementById("angelCanvas").dataset.frames)>before+5',arg=before)
        assert page.locator('#angelCanvas').screenshot()!=first
        click('[data-region="head"]')
        expect(page.locator('#regionName')).to_have_text('HEAD')
        click('#newFile')
        expect(page.locator('#editor')).to_be_visible()
        assert page.locator('#editor .toolbar, #editor .statusbar').count()==0
        expect(page.locator('#editorTitle')).to_have_text('Untitled - Angel Player')
        enter('#text','筆記\nprint("hello")')
        page.keyboard.press('Control+s')
        expect(page.locator('#filename')).to_be_visible()
        enter('#filename','memo.txt')
        click('#dialogButtons button:first-child')
        expect(page.locator('.file-name')).to_have_text('memo')
        expect(page.locator('#editorTitle')).to_have_text('memo - Angel Player')
        assert api._store.read('memo.txt')=='筆記\nprint("hello")'
        click('#editor [data-command="close"]')
        expect(page.locator('#editor')).to_be_hidden()
        expect(page.locator('#fileSidebar')).to_be_visible()
        actions('memo.txt')
        assert page.locator('#fileActions button').all_text_contents()==['Open','Delete','Compile','Active']
        expect(page.locator('[data-action="activate"]')).to_be_disabled()
        click('[data-action="open"]')
        expect(page.locator('#text')).to_have_value('筆記\nprint("hello")')
        actions('memo.txt')
        click('[data-action="delete"]')
        click('#dialogButtons button:nth-child(2)')
        assert api._store.list()==['memo.txt']
        # 文字面板仍可移動、調整大小及最大化，範圍限於右側工作區。
        title=page.locator('#editor .titlebar').bounding_box()
        old=page.locator('#editor').bounding_box()
        page.mouse.move(title['x']+50,title['y']+15)
        page.mouse.down();page.mouse.move(title['x']+75,title['y']+30,steps=3);page.mouse.up()
        moved=page.locator('#editor').bounding_box()
        assert moved['x']>old['x'] and moved['y']>old['y']
        handle=page.locator('#editor [data-edge="se"]').bounding_box()
        page.mouse.move(handle['x']+4,handle['y']+4);page.mouse.down()
        page.mouse.move(handle['x']+34,handle['y']+24,steps=3);page.mouse.up()
        assert page.locator('#editor').bounding_box()['width']>moved['width']
        click('#editor [data-command="maximize"]')
        assert page.locator('#editor').bounding_box()['width']==page.locator('#visualStage').bounding_box()['width']
        click('#editor [data-command="maximize"]')
        click('#editor [data-command="close"]')
        for width,height in [(1280,800),(390,600)]:
            page.set_viewport_size({'width':width,'height':height})
            page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            assert page.evaluate('''()=>{
                const original=angelVisual.ring,rings=[];
                angelVisual.ring=(...args)=>rings.push(args);
                angelVisual.draw(1);angelVisual.ring=original;angelVisual.draw(1);
                return rings.filter(r=>r[1]<0).length===3&&rings.filter(r=>r[1]<0).every(r=>r[1]+r[2]>20);
            }'''), '上方三環在窄版也須露出可見部分'
            actions('memo.txt')
            assert page.evaluate("""()=>['fileSidebar','fileActions','angelPlayer','diskUsage','regionControls'].every(id=>{
                const r=document.getElementById(id).getBoundingClientRect();
                return r.width>0&&r.height>0&&r.x>=0&&r.y>=0&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5;
            })""")
            assert page.locator('#regionControls [data-region]').count()==4
            assert page.locator('.angel-details [data-region]').count()==0
            assert page.locator('#regionControls').bounding_box()['y']>page.locator('.angel-details').bounding_box()['y']+page.locator('.angel-details').bounding_box()['height']
            assert page.locator('#angelPlayer').bounding_box()=={'x':0,'y':0,'width':width,'height':height}
            assert page.evaluate('''()=>{
                const heading=document.querySelector('.visual-heading'),title=heading.querySelector('span').getBoundingClientRect();
                const disk=document.getElementById('diskUsage').getBoundingClientRect();
                return title.left>=innerWidth/2&&innerWidth-title.right>=10&&innerWidth-title.right<=30&&Math.abs(title.left-disk.left)<1;
            }'''), '標題位於右半部、右緣留白，容量對齊A左側'
            click('[data-action="open"]')
            assert page.locator('#editor').evaluate("el=>{const r=el.getBoundingClientRect(),s=el.parentElement.getBoundingClientRect();return r.left>=s.left&&r.top>=s.top&&r.right<=s.right+.5&&r.bottom<=s.bottom+.5;}")
            click('#editor [data-command="close"]')
            page.screenshot(path=str(output/f'angel-{width}.png'))
            click('#minimizeAngel')
            expect(page.locator('.taskbar')).to_be_visible()
            click('#start')
            expect(page.locator('#fileActions')).to_be_hidden()
            page.screenshot(path=str(output/f'start-{width}.png'))
            assert page.locator('#startMenu #fileList').count()==0
            click('#start')
            click('#angelTask')
            page.wait_for_function('!document.getElementById("angelPlayer").getAnimations().length')
        # 多檔案只在Angel列表捲動，不進入系統功能表。
        for index in range(70): api._store.save(f'note-{index:02}.txt','note')
        click('#minimizeAngel')
        expect(page.locator('#angelPlayer')).to_be_hidden()
        frozen=page.locator('#angelCanvas').get_attribute('data-frames')
        page.wait_for_timeout(100)
        assert page.locator('#angelCanvas').get_attribute('data-frames')==frozen
        click('#angelTask')
        expect(page.locator('.file-row')).to_have_count(71)
        assert page.locator('#fileList').evaluate('el=>el.scrollHeight>el.clientHeight&&getComputedStyle(el).scrollbarWidth==="none"')
        actions('note-00.txt')
        click('[data-action="delete"]')
        click('#dialogButtons button:first-child')
        expect(page.locator('.file-row')).to_have_count(70)
        assert 'note-00.txt' not in api._store.list()
        assert len(list((Path(folder)/'.trash').iterdir()))==1
        actions('memo.txt')
        click('[data-action="open"]')
        enter('#text','unsaved draft')
        click('#minimizeAngel')
        click('#start');click('#logout')
        expect(page.locator('#dialogMessage')).to_have_text('文件尚未儲存，是否儲存變更？')
        click('#dialogButtons button:nth-child(3)')
        assert page.url.endswith('desktop.html')
        expect(page.locator('#text')).to_have_value('unsaved draft')
        click('#start');click('#logout')
        click('#dialogButtons button:nth-child(2)')
        page.wait_for_url('**/login.html')
        assert closed==[]
        expect(page.locator('#password')).to_have_value('')
        assert api._store.read('memo.txt')=='筆記\nprint("hello")'
        enter('#password','wrong-password')
        click('#enter')
        expect(page.locator('#status')).to_have_text('ACCESS DENIED')
        enter('#password',page.evaluate('window.WINDING_CONFIG.password'))
        click('#enter')
        page.wait_for_url('**/desktop.html')
        click('#angel')
        expect(page.locator('.file-row')).to_have_count(70)
        expect(page.locator('#activeCount')).to_have_text('00 ACTIVE')
        assert errors==[],errors
        browser.close()
    print('PASS: Japanese XP system menu, Angel persistent list, editor/file lifecycle, rotating mesh and rings, regions, panel controls, logout guard, two layouts; headless only')


if __name__=='__main__':
    run()
