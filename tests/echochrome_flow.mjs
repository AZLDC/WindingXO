// 外部搜尋以新分頁驗證；iframe 導覽使用臨時測試站。
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';

export async function checkEchochrome({evaluate,send,click,until}) {
    assert.equal(await evaluate('Boolean(document.getElementById("openEchochrome"))'),true,'開始選單應提供 Echochrome');
    const server=createServer((req,res)=>{
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        res.end(`<title>Fixture ${req.url}</title><h1>${req.url}</h1>`);
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const submit=async value=>{
        await evaluate(`(()=>{const input=document.getElementById('echoAddress');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));input.form.requestSubmit();})()`);
    };
    const src=()=>evaluate('document.getElementById("echoFrame").getAttribute("src")');
    try {
        // 無視窗瀏覽器的預設大小依機器而異，先固定桌面尺寸再開視窗。
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        await click('#start');await click('#openEchochrome');
        assert.equal(await evaluate('document.getElementById("echochrome").hidden'),false);
        assert.equal(await evaluate('Boolean(document.getElementById("echoHome"))'),true,'應提供白底搜尋首頁');
        assert.equal(await evaluate('document.getElementById("echoHome").hidden'),false);
        assert.equal(await src(),'about:blank');
        assert.equal(await evaluate('document.getElementById("startMenu").hidden'),true);
        assert.equal(await evaluate('document.getElementById("echoBack").disabled'),true);
        await mkdir('.scratch/local/echochrome',{recursive:true});
        const before=new Set((await send('Target.getTargets')).targetInfos.map(target=>target.targetId));
        await evaluate('document.getElementById("echoQuery").value="Angel Beats! 立華奏 & XP"');
        const point=await evaluate('(()=>{const r=document.getElementById("echoSearchButton").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
        const search=await until(async()=> (await send('Target.getTargets')).targetInfos.find(target=>!before.has(target.targetId)&&target.url.startsWith('https://www.google.com/search?')),'Google search opens a new tab');
        assert.equal(new URL(search.url).searchParams.get('q'),'Angel Beats! 立華奏 & XP');
        assert.equal(await evaluate('document.getElementById("echoHome").hidden'),false,'搜尋不離開首頁');
        assert.equal(await src(),'about:blank');
        await send('Target.closeTarget',{targetId:search.targetId});
        await send('Page.bringToFront');
        for(const [width,height] of [[1280,800],[390,844]]) {
            await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
            await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
            const layout=await evaluate(`(()=>{const home=document.getElementById('echoHome').getBoundingClientRect();const boxes=[...document.querySelectorAll('#echoHome input,#echoHome button')].map(el=>el.getBoundingClientRect());return {home:home.toJSON(),boxes:boxes.map(r=>r.toJSON()),valid:boxes.every(r=>r.width>=20&&r.height>=20&&r.left>=home.left&&r.right<=home.right&&r.top>=home.top&&r.bottom<=home.bottom)};})()`);
            assert.equal(layout.valid,true,`首頁搜尋框與按鈕不得裁切: ${JSON.stringify(layout)}`);
            const shot=await send('Page.captureScreenshot',{format:'png'});
            await writeFile(`.scratch/local/echochrome/home-${width}.png`,Buffer.from(shot.data,'base64'));
        }
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
        await submit(`${base}/one`);
        assert.equal(await evaluate('document.getElementById("echoHome").hidden'),true);
        await click('#echoBack');assert.equal(await evaluate('document.getElementById("echoHome").hidden'),false);
        await click('#echoForward');
        await until(()=>evaluate('document.getElementById("echoFrame").dataset.loaded==="true"'),'first iframe fixture loaded');
        await until(async()=>{
            const tree=await send('Page.getFrameTree');
            const targets=await send('Target.getTargets');
            return tree.frameTree.childFrames?.some(child=>child.frame.url===`${base}/one`)||targets.targetInfos.some(target=>target.type==='iframe'&&target.url===`${base}/one`);
        },'iframe must actually navigate to the test page');
        await submit(`${base}/two`);
        await until(()=>src().then(value=>value===`${base}/two`),'second address');
        await click('#echoBack');assert.equal(await src(),`${base}/one`);
        await click('#echoForward');assert.equal(await src(),`${base}/two`);
        await click('#echoBack');await submit(`${base}/three`);
        assert.equal(await evaluate('document.getElementById("echoForward").disabled'),true,'新導頁清除前進分支');
        for(const invalid of ['javascript:alert(1)','data:text/html,unsafe','file:///C:/Windows/','chrome://newtab','https://user:secret@example.com/']) {
            await submit(invalid);assert.equal(await src(),`${base}/three`,'拒絕不安全網址且保留原頁');
            assert.equal(await evaluate('document.getElementById("echoAddress").validationMessage.length>0'),true);
        }
        await submit(`${base}/three`);
        const initial=await evaluate('document.getElementById("echochrome").getBoundingClientRect().toJSON()');
        await click('#echoMaximize');
        assert.equal(await evaluate('document.getElementById("echochrome").classList.contains("maximized")'),true);
        await click('#echoMaximize');
        assert.deepEqual(await evaluate('document.getElementById("echochrome").getBoundingClientRect().toJSON()'),initial);
        await click('#echoMinimize');
        assert.equal(await evaluate('document.getElementById("echochrome").hidden'),true);
        assert.equal(await evaluate('document.getElementById("echoTask").hidden'),false);
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        await click('#echoTask');assert.equal(await src(),`${base}/three`);
        assert.deepEqual(await evaluate('document.getElementById("echochrome").getBoundingClientRect().toJSON()'),initial,'最小化期間resize不可清空視窗尺寸');
        await click('#angel');
        assert.equal(await evaluate('document.getElementById("echochrome").inert'),true,'Angel 前景不可操作其他視窗');
        await click('#minimizeAngel');
        assert.equal(await evaluate('document.getElementById("echochrome").inert'),false);
        const audits=[];
        await mkdir('.scratch/local/echochrome',{recursive:true});
        for(const [width,height] of [[1280,800],[390,844]]) {
            await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
            await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
            const check=await evaluate(`(()=>{
                const win=document.getElementById('echochrome'),r=win.getBoundingClientRect();
                const controls=[...win.querySelectorAll('header button,form button,input')].filter(el=>el.getClientRects().length);
                const boxes=controls.map(el=>el.getBoundingClientRect());
                return {viewport:'${width}x${height}',overflow_count:document.documentElement.scrollWidth>innerWidth?1:0,
                    offscreen_count:r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight-36?1:0,
                    clipped_count:boxes.filter(b=>b.width<20||b.height<20||b.left<r.left||b.right>r.right).length,
                    overlap_count:boxes.filter((a,i)=>boxes.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)).length};
            })()`);
            assert.deepEqual([check.overflow_count,check.offscreen_count,check.clipped_count,check.overlap_count],[0,0,0,0]);
            audits.push(check);
            const shot=await send('Page.captureScreenshot',{format:'png'});
            await writeFile(`.scratch/local/echochrome/${width}.png`,Buffer.from(shot.data,'base64'));
        }
        await writeFile('.scratch/local/echochrome/ui-audit.json',JSON.stringify({viewports:audits},null,2));
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
        await click('#echoClose');
        assert.equal(await evaluate('document.getElementById("echoTask").hidden'),true);
        assert.equal(await src(),'about:blank');
        await click('#start');await click('#openEchochrome');
        assert.equal(await src(),'about:blank','重新啟動回搜尋首頁');
        assert.equal(await evaluate('document.getElementById("echoHome").hidden'),false);
        assert.equal(await evaluate('document.getElementById("echoQuery").value'),'','重新開啟清空搜尋詞');
        await click('#echoClose');
        console.log('PASS: Echochrome entry, iframe navigation/history, unsafe URLs, window lifecycle, Angel isolation, desktop/mobile layout');
    } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
