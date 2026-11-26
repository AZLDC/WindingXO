"""JSON索引、部位掛載及右鍵改名的雙版本無視窗驗證。"""
import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'native'))
from main import DesktopAPI


def run():
    output = ROOT / '.scratch/local/catalog'
    output.mkdir(parents=True, exist_ok=True)
    audit = []
    with tempfile.TemporaryDirectory() as folder, sync_playwright() as pw, patch('storage.random.randint', return_value=35):
        browser = pw.chromium.launch(channel='msedge', headless=True)
        for native in (False, True):
            context = browser.new_context(viewport={'width': 1280, 'height': 800})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            if native:
                host = DesktopAPI(Path(folder))
                page.expose_function('hostCall', lambda method, *args: getattr(host, method)(*args))
                page.add_init_script('window.pywebview={api:new Proxy({},{get:(_,method)=>(...args)=>window.hostCall(method,...args)})};')
            else:
                page.add_init_script('Math.random=()=>0.5;')
            page.clock.install()
            page.goto((ROOT / 'desktop.html').as_uri())

            def call(method, *args):
                return page.evaluate('([method,args])=>api(method,...args)', [method, args])

            def click(selector):
                page.locator(selector).evaluate('el=>el.click()')

            def ready():
                page.wait_for_function('!busy && document.getElementById("modal").hidden')

            # 瀏覽器舊版資料庫升級時匯入修改過的內容，不重建範例。
            if not native:
                page.evaluate('''()=>new Promise((resolve,reject)=>{
                    const request=indexedDB.open('windingxo-browser',1);
                    request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('trash',{keyPath:'id'});db.createObjectStore('files',{keyPath:'name'}).put({name:'old.txt',content:'edited legacy'});};
                    request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);
                })''')
                self_check = call('list_catalog')
                assert [item['name'] for item in self_check] == ['old.txt']
                assert call('read_file', 'old.txt') == 'edited legacy'
                call('delete_file', 'old.txt')

            for index in range(4):
                call('save_file', f'skill{index}.txt', f'ability {index}')
            click('#angel')
            expect(page.locator('.file-row')).to_have_count(4)
            page.clock.run_for(700)
            expect(page.locator('#detailSize')).to_have_text('0% / 100%')
            page.locator('.file-row').first.hover()
            assert page.locator('#fileActions button:visible').all_text_contents() == ['Open', 'Delete', 'Compile', 'Active']
            expect(page.locator('#detailFileLabel')).to_have_text('FILE')
            page.locator('#fileActions').hover()
            expect(page.locator('#fileActions')).to_be_visible()
            page.locator('.library-heading').hover()
            expect(page.locator('#detailFileLabel')).to_have_text('SKILLS')
            # 完整編譯演出完成後才寫入索引。
            click('.file-row[data-name="skill0.txt"]')
            click('[data-action=compile]')
            expect(page.locator('#compileScreen')).to_be_visible()
            page.clock.run_for(8500)
            ready()
            assert call('list_catalog')[0]['cost'] == 35
            for index in range(1, 4):
                call('compile_file', f'skill{index}.txt')
            page.evaluate('loadFiles(true)')
            click('[data-region=head]')
            for index in (0, 1):
                click(f'.file-row[data-name="skill{index}.txt"]')
                click('[data-action=activate]')
                ready()
            expect(page.locator('#detailSize')).to_have_text('70% / 100%')
            expect(page.locator('#detailFilename')).to_contain_text('skill0 · 35%')
            click('.file-row[data-name="skill2.txt"]')
            click('[data-action=activate]')
            expect(page.locator('#dialogMessage')).to_contain_text('資源不足')
            click('#dialogButtons button')
            ready()
            assert next(item for item in call('list_catalog') if item['name'] == 'skill2.txt')['region'] is None
            click('[data-region=arms]')
            click('.file-row[data-name="skill2.txt"]')
            click('[data-action=activate]')
            ready()
            expect(page.locator('#detailSize')).to_have_text('35% / 100%')

            # 改稿沿用原本的編譯失效規則，重新命名仍保留草稿及消耗。
            click('.file-row[data-name="skill2.txt"]')
            click('[data-action=open]')
            ready()
            page.evaluate('''window.actualAPI=api;window.failInvalidation=true;
                api=async(method,...args)=>{if(method==='invalidate_file'&&failInvalidation){failInvalidation=false;throw new Error('test disk full');}return actualAPI(method,...args);};void 0''')
            page.locator('#text').fill('unsaved draft')
            expect(page.locator('#dialogMessage')).to_contain_text('狀態保存失敗')
            click('#dialogButtons button')
            click('#editor [data-command=close]')
            row = page.locator('.file-row[data-name="skill2.txt"]')
            row.dispatch_event('contextmenu', {'clientX': 100, 'clientY': 200})
            assert page.locator('#fileActions button:visible').all_text_contents() == ['Open', 'Delete', 'Compile', 'Active', 'Rename']
            click('[data-action=rename]')
            expect(page.locator('#filename')).to_be_visible()
            click('#dialogButtons button:last-child')
            ready()
            assert call('read_file', 'skill2.txt') == 'ability 2'
            row.dispatch_event('contextmenu', {'clientX': 100, 'clientY': 200})
            click('[data-action=rename]')
            page.locator('#filename').fill('skill0.txt')
            click('#dialogButtons button:first-child')
            expect(page.locator('#dialogMessage')).to_contain_text('同名')
            click('#dialogButtons button')
            ready()
            row.dispatch_event('contextmenu', {'clientX': 100, 'clientY': 200})
            click('[data-action=rename]')
            page.locator('#filename').fill('renamed.txt')
            click('#dialogButtons button:first-child')
            ready()
            assert page.evaluate('currentName') == 'renamed.txt'
            expect(page.locator('#text')).to_have_value('unsaved draft')
            entry = next(item for item in call('list_catalog') if item['name'] == 'renamed.txt')
            assert (entry['region'], entry['cost'], entry['compiled']) == (None, 35, False)
            assert call('compile_file', 'renamed.txt')['cost'] == 35
            call('activate_file', 'renamed.txt', 'arms')
            # 重載仍使用已保存的掛載。
            page.evaluate('allowNavigation=true')
            page.reload()
            click('#angel')
            expect(page.locator('.file-row')).to_have_count(4)
            page.clock.run_for(700)
            click('[data-region=arms]')
            expect(page.locator('#detailFilename')).to_have_text('renamed · 35%')
            expect(page.locator('#detailSize')).to_have_text('35% / 100%')
            # 關閉再開啟不重新要求索引。
            page.evaluate('window.catalogCalls=0;window.originalAPI=api;api=async(method,...args)=>{if(method==="list_catalog")catalogCalls++;return originalAPI(method,...args);};void 0')
            click('#minimizeAngel')
            click('#angel')
            page.clock.run_for(700)
            assert page.evaluate('catalogCalls') == 0, (native, page.evaluate('({calls:catalogCalls,cache:fileCatalog,request:Boolean(catalogRequest)})'))
            # hover仍只有原四項，移出立即恢復掛載清單。
            page.locator('.file-row').first.hover()
            expect(page.locator('[data-action=rename]')).to_be_hidden()
            page.locator('.library-heading').hover()
            expect(page.locator('#detailFilename')).to_have_text('renamed · 35%')
            click('.file-row[data-name="renamed.txt"]')
            click('[data-action=activate]')
            ready()
            expect(page.locator('#detailSize')).to_have_text('0% / 100%')
            # 同內容保留狀態，異內容失效但不重抽消耗。
            call('save_file', 'renamed.txt', 'ability 2', True)
            assert next(item for item in call('list_catalog') if item['name'] == 'renamed.txt')['compiled']
            call('save_file', 'renamed.txt', 'changed', True)
            changed = next(item for item in call('list_catalog') if item['name'] == 'renamed.txt')
            assert (changed['compiled'], changed['region'], changed['cost']) == (False, None, 35)
            rejected = page.evaluate('getWindingAPI().rename_file("renamed.txt","../invalid.txt")')
            assert rejected['ok'] is False
            assert call('read_file', 'renamed.txt') == 'changed'
            # 模擬另一分頁編譯及掛載，本頁快取仍是未編譯；改稿仍須清除持久狀態。
            click('.file-row[data-name="skill3.txt"]')
            click('[data-action=open]')
            ready()
            call('compile_file', 'skill3.txt')
            call('activate_file', 'skill3.txt', 'torso')
            page.evaluate('scriptStates.delete("skill3.txt")')
            page.locator('#text').fill('cross tab draft')
            page.evaluate('pendingInvalidation')
            assert next(item for item in call('list_catalog') if item['name'] == 'skill3.txt')['region'] is None
            call('compile_file', 'skill3.txt')
            call('activate_file', 'skill3.txt', 'torso')
            page.locator('#text').fill('cross tab draft, second edit')
            page.evaluate('pendingInvalidation')
            assert next(item for item in call('list_catalog') if item['name'] == 'skill3.txt')['region'] is None
            # 不保存草稿，另一分頁重新掛載後，本頁開始編譯再取消也必須清除。
            call('compile_file', 'skill3.txt')
            call('activate_file', 'skill3.txt', 'torso')
            click('#editor [data-command=close]')
            click('.file-row[data-name="skill3.txt"]')
            click('[data-action=compile]')
            expect(page.locator('#compileScreen')).to_be_visible()
            click('#cancelCompile')
            ready()
            state = next(item for item in call('list_catalog') if item['name'] == 'skill3.txt')
            assert (state['compiled'], state['region'], state['cost']) == (False, None, 35)
            # 長名稱及三項掛載，桌機／手機／矮視窗檢查。
            for index in range(3):
                name = f'Long ability {index} ' + '能力' * 15 + '.txt'
                call('save_file', name, 'layout')
                call('compile_file', name)
            if native:
                data = json.loads((Path(folder) / '.catalog.json').read_text(encoding='utf-8'))
                for item in data['files'].values():
                    if item['name'].startswith('Long ability'):
                        item['cost'] = 30
                (Path(folder) / '.catalog.json').write_text(json.dumps(data), encoding='utf-8')
            else:
                page.evaluate('''()=>new Promise((resolve,reject)=>{
                    const request=indexedDB.open('windingxo-browser',2);request.onsuccess=()=>{
                        const db=request.result,tx=db.transaction('catalog','readwrite'),store=tx.objectStore('catalog');
                        store.get('catalog.json').onsuccess=event=>{const data=JSON.parse(event.target.result);for(const item of Object.values(data.files))if(item.name.startsWith('Long ability'))item.cost=30;store.put(JSON.stringify(data),'catalog.json');};
                        tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);
                    };
                })''')
            for item in call('list_catalog'):
                if item['name'].startswith('Long ability'):
                    call('activate_file', item['name'], 'legs')
            page.evaluate('loadFiles(true)')
            click('[data-region=legs]')
            expect(page.locator('#detailSize')).to_have_text('90% / 100%')
            for width, height in ((1280, 800), (800, 600), (390, 844), (640, 480)):
                page.set_viewport_size({'width': width, 'height': height})
                page.clock.run_for(100)
                check = page.evaluate('''()=>{
                    const panel=document.querySelector('.angel-details'),controls=document.getElementById('regionControls');
                    const a=panel.getBoundingClientRect(),b=controls.getBoundingClientRect();
                    const outside=r=>r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight;
                    return {viewport:[innerWidth,innerHeight],overflow_count:Number(document.documentElement.scrollWidth>innerWidth)+Number(panel.scrollWidth>panel.clientWidth),overlap_count:Number(a.bottom>b.top),offscreen_count:Number(outside(a))+Number(outside(b)),clipped_count:Number(panel.clientHeight===0)};
                }''')
                check['native'] = native
                audit.append(check)
                assert not any(check[key] for key in ('overflow_count', 'overlap_count', 'offscreen_count', 'clipped_count')), check
                page.screenshot(path=str(output / f'{"native" if native else "browser"}-{width}.png'))
            assert errors == [], errors
            context.close()
        browser.close()
    (output / 'ui-audit.json').write_text(json.dumps(audit, indent=2), encoding='utf-8')
    print('PASS: browser + Python catalog migration, mounts, capacity, rename, draft, persistence, cached list; CHECK_6_UI_LAYOUT: PASS (8 layouts); headless only')


if __name__ == '__main__':
    run()
