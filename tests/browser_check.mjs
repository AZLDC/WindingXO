// Node 22與系統Edge，無套件、無可見視窗；所有資料使用臨時profile。
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createServer} from 'node:http';
import {checkEchochrome} from './echochrome_flow.mjs';

// 額外以GitHub專案網站的子路徑測試，確認相對資產與HEAD導頁可用。
let server,baseURL;
if(process.env.WINDING_HTTP==='1'){
    server=createServer(async(request,response)=>{
        try{
            const path=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
            if(!path.startsWith('/WindingXO/')){response.writeHead(404).end();return;}
            const relative=path.slice('/WindingXO/'.length)||'index.html';
            if(relative.includes('..')||(!relative.startsWith('assets/')&&!/^[\w-]+\.html$/.test(relative))){response.writeHead(404).end();return;}
            const content=await readFile(resolve(relative));
            const type=relative.endsWith('.html')?'text/html':relative.endsWith('.css')?'text/css':relative.endsWith('.js')?'text/javascript':relative.endsWith('.png')?'image/png':relative.endsWith('.gif')?'image/gif':'application/json';
            response.writeHead(200,{'Content-Type':`${type}; charset=utf-8`});
            response.end(request.method==='HEAD'?undefined:content);
        }catch(_){response.writeHead(404).end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    baseURL=`http://127.0.0.1:${server.address().port}/WindingXO/`;
}

const profile=await mkdtemp(join(tmpdir(),'winding-browser-check-'));
const edge=process.env.WINDING_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket,next=0,pausedShutdownRequest;
const pending=new Map(),errors=[];
const contexts=new Map();
async function until(check,description,timeout=10000) {
    const end=Date.now()+timeout;
    do { try { const value=await check();if(value)return value; } catch (_) {} await delay(50); } while(Date.now()<end);
    throw new Error(`Timed out: ${description}`);
}
function send(method,params={}) {
    return new Promise((resolve,reject)=>{
        const id=++next;
        const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},15000);
        pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
    });
}
async function evaluate(expression,contextId) {
    const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,...(contextId ? {contextId} : {})});
    if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
}
const url=name=>baseURL?new URL(name,baseURL).href:pathToFileURL(resolve(name)).href;
async function navigate(name) {
    await send('Page.navigate',{url:url(name)});
    await until(()=>evaluate(`location.href===${JSON.stringify(url(name))}&&document.readyState==='complete'`),name);
}
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const enter=(selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
async function inFrame(expression) {
    const tree=await send('Page.getFrameTree');
    const id=contexts.get(tree.frameTree.childFrames?.[0]?.frame.id);
    if(!id)throw new Error('Frame not ready');
    return evaluate(expression,id);
}
const menuClick=label=>evaluate(`Array.from(document.querySelectorAll('#contextMenu button')).find(el=>el.textContent===${JSON.stringify(label)}).click()`);
const contextMenu=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('contextmenu',{clientX:300,clientY:210,bubbles:true,cancelable:true}))`);
async function ready() {await until(()=>evaluate('!busy&&document.getElementById("modal").hidden'),'editor ready');}
async function shortcut(shift=false) {
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,shiftKey:${shift},bubbles:true,cancelable:true}))`);
}
try {
    const port=await until(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]),'headless Edge');
    const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    socket.onmessage=event=>{
        const message=JSON.parse(event.data);
        if(message.id) {
            const task=pending.get(message.id);if(!task)return;
            pending.delete(message.id);clearTimeout(task.timer);
            if(message.error)task.reject(new Error(message.error.message));else task.resolve(message.result);
        } else if(message.method==='Fetch.requestPaused')pausedShutdownRequest=message.params.requestId;
        else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
        else if(message.method==='Runtime.executionContextCreated' && message.params.context.auxData?.isDefault)contexts.set(message.params.context.auxData.frameId,message.params.context.id);
        else if(message.method==='Runtime.executionContextsCleared')contexts.clear();
    };
    await send('Runtime.enable');await send('Page.enable');
    await navigate('desktop.html');
    await checkEchochrome({evaluate,send,click,until});
    assert.equal(await evaluate('typeof window.getWindingAPI'), 'function','HTML must provide a standalone API');
    assert.equal(await evaluate('Boolean(window.getWindingAPI())'),true);
    assert.equal(await evaluate('typeof window.WindingHistory'),'function','editor needs explicit undo history');
    await send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await until(()=>evaluate('document.hasFocus()'),'headless page focus');
    assert.equal(await evaluate(`(()=>{
        const d=window.windingCursorFrames;
        return d.frames.length===96&&new Set(d.frames).size>20&&d.width===32&&d.height===32&&d.hotspot.join(',')==='3,2'&&d.duration===6000&&getComputedStyle(document.body).cursor.includes('data:image/png')&&getComputedStyle(document.querySelector('#newFile')).cursor.includes('data:image/png')&&getComputedStyle(document.querySelector('#text')).cursor.includes('data:image/png')&&getComputedStyle(document.querySelector('.resize-handle[data-edge="e"]')).cursor==='ew-resize';
    })()`),true,'stored crystal frames apply to normal controls and include text fields and preserve resize cursors');
    assert.equal(await evaluate(`(async()=>{
        const image=new Image();image.src=windingCursorFrames.frames[0];await image.decode();
        const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
        const alpha=(x,y)=>ctx.getImageData(x,y,1,1).data[3];
        return image.width===32&&image.height===32&&alpha(11,10)===0&&alpha(18,17)===0&&alpha(5,6)>0;
    })()`),true,'crystal PNG must keep its transparent center and recessed tail');
    const cursorBefore=await evaluate('document.documentElement.dataset.cursorFrame');
    await delay(150);
    assert.notEqual(await evaluate('document.documentElement.dataset.cursorFrame'),cursorBefore,'crystal must rotate');
    await evaluate('window.dispatchEvent(new Event("winding:idle"))');
    const cursorPaused=await evaluate('document.documentElement.dataset.cursorFrame');
    await delay(150);
    assert.equal(await evaluate('document.documentElement.dataset.cursorFrame'),cursorPaused,'idle must stop cursor animation');
    await evaluate('window.dispatchEvent(new Event("winding:resume"))');
    await until(()=>evaluate(`document.documentElement.dataset.cursorFrame!==${JSON.stringify(cursorPaused)}`),'cursor resumes after idle');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:10,y:10,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:10,y:10,button:'left',clickCount:1});
    assert.equal(await evaluate('navigator.userActivation.isActive'),true,'fullscreen requires completed user activation');
    // 只驗證快捷鍵接線，避免headless全螢幕許可依OS焦點而不穩定。
    await evaluate('window.fsCalls=0;window.fsOriginal=getWindingAPI().toggle_fullscreen;getWindingAPI().toggle_fullscreen=async()=>{fsCalls++;return {ok:true};}');
    for(let index=0;index<2;index++) {
        await evaluate('document.body.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",altKey:true,bubbles:true,cancelable:true}))');
        assert.equal(await evaluate('fsCalls'),index+1);
    }
    await evaluate('getWindingAPI().toggle_fullscreen=fsOriginal');
    const seeds=await evaluate('api("list_files")');
    assert.equal(seeds.length,7);
    assert(seeds.includes('Hand Sonic.txt'));
    assert.match(await evaluate('api("read_file","Hand Sonic.txt")'),/GUARD SKILL: Hand Sonic/);
    await click('#angel');
    await until(()=>evaluate('document.querySelectorAll(".file-row").length===7'),'default list');
    await until(()=>evaluate('openingAnimation===null'),'Angel expansion finished');
    assert.equal(await evaluate('document.getElementById("fileActions").hidden'),true,'submenu must not open on initial display');
    const hover=async selector=>{
        const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    };
    await hover('.file-row');
    assert.equal(await evaluate('document.getElementById("fileActions").hidden'),false,'hover a primary file item');
    await hover('#fileActions');
    assert.equal(await evaluate('document.getElementById("fileActions").hidden'),false,'submenu must stay visible over itself');
    await hover('.library-heading');
    assert.equal(await evaluate('document.getElementById("fileActions").hidden'),true,'blank sidebar areas must close the submenu');
    await hover('.file-row');await hover('#angelCanvas');
    assert.equal(await evaluate('document.getElementById("fileActions").hidden'),true,'leaving the item and submenu must close it');
    await hover('.file-row');await evaluate('loadFiles()');
    assert.equal(await evaluate('document.getElementById("fileActions").hidden'),true,'rebuilding a list beneath a stationary pointer must not reopen it');
    await hover('#angelCanvas');
    const mesh=await evaluate(`({vertices:angelVisual.vertices.length,faces:angelVisual.faces.length,parts:[...new Set(angelVisual.faces.map(f=>f[3]))].sort(),source:angelVisual.provenance.source,sha256:angelVisual.provenance.sha256,valid:angelVisual.vertices.every(p=>p.length===3&&p.every(Number.isFinite))&&angelVisual.faces.every(f=>f.slice(0,3).every(i=>Number.isInteger(i)&&i>=0&&i<angelVisual.vertices.length))})`);
    assert(mesh.vertices>500&&mesh.vertices<15000&&mesh.faces>500&&mesh.faces<20000,'refined surface must remain bounded');
    assert.equal(mesh.vertices,8188);assert.equal(mesh.faces,16352);assert.match(mesh.source,/b2b267461d504a5b95976f367423d0b3/);assert.match(mesh.sha256,/^[a-f0-9]{64}$/);
    assert.equal(mesh.valid,true);assert.deepEqual(mesh.parts,['arms','head','legs','torso']);
    assert.equal(await evaluate(`(()=>{
        const points=JSON.stringify(angelVisual.vertices),faces=JSON.stringify(angelVisual.faces);
        const density=[...angelVisual.wireDivisions.values()];
        angelVisual.draw(0);angelVisual.draw(5.61);angelVisual.draw(11.22);
        return density.length===16352&&density.every(n=>Number.isInteger(n)&&n>=1&&n<=12)&&density.some(n=>n>=3)&&points===JSON.stringify(angelVisual.vertices)&&faces===JSON.stringify(angelVisual.faces);
    })()`),true,'dense visual wireframe must preserve imported proportions and topology');
    await click('[data-region="head"]');assert.equal(await evaluate('angelVisual.region'),'head');await click('[data-region="torso"]');
    assert.equal(await evaluate('typeof angelVisual.rulerMetrics'),'function','ruler bands need a shared inner/outer boundary');
    assert.match(await evaluate('document.getElementById("diskUsage").textContent'),/^(?:[0-9]+\.[0-9]+|—) GB · (?:[0-9]+\.[0-9]+|—)% USED$/);
    assert.equal(await evaluate(`(async()=>{
        const host=getWindingAPI(),original=host.get_disk_usage;
        try {
            host.get_disk_usage=async()=>({ok:true,value:{kind:'browser',total:2e9,used:5e8}});
            await refreshDiskUsage();if(document.getElementById('diskUsage').textContent!=='2.0 GB · 25.0% USED')return false;
            host.get_disk_usage=async()=>({ok:true,value:{kind:'browser',total:null,used:null}});
            await refreshDiskUsage();if(document.getElementById('diskUsage').textContent!=='— GB · —% USED')return false;
            host.get_disk_usage=async()=>({ok:true,value:{total:1e12,used:6.75e11}});
            await refreshDiskUsage();return document.getElementById('diskUsage').textContent==='1000.0 GB · 67.5% USED';
        } finally {host.get_disk_usage=original;await refreshDiskUsage();}
    })()`),true,'browser quota and native disk must share GB/USED wording; missing quota uses dashes');
    await click('#newFile');await ready();
    for(let step=0;step<15;step++)await enter('#text',`step ${step}`);
    for(let step=0;step<12;step++)await evaluate('text.dispatchEvent(new KeyboardEvent("keydown",{key:"z",ctrlKey:true,bubbles:true,cancelable:true}))');
    assert.equal(await evaluate('text.value'),'step 2','at least 10 undo steps');
    for(let step=0;step<12;step++)await evaluate('text.dispatchEvent(new KeyboardEvent("keydown",{key:"z",ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))');
    assert.equal(await evaluate('text.value'),'step 14');
    await evaluate('applyHistory()');await enter('#text','new branch');
    assert.equal(await evaluate('editHistory.canRedo'),false);
    await enter('#text','HTML-only note\n筆記');
    assert.equal(await contextMenu('#angelCanvas'),false,'native context menu must be prevented');
    assert.equal(await evaluate('document.getElementById("contextMenu").hidden'),true,'no background menu in Angel');
    await evaluate('Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>{window.fakeClipboard=value;},readText:async()=>window.fakeClipboard}});text.setSelectionRange(0,4)');
    await contextMenu('#text');await menuClick('Cut');await ready();
    assert.equal(await evaluate('window.fakeClipboard'),'HTML');
    assert.equal(await evaluate('text.value'),'-only note\n筆記');
    await evaluate('applyHistory()');
    await contextMenu('#text');await menuClick('Copy');await ready();
    await evaluate('window.fakeClipboard="PASTE"');
    await contextMenu('#text');await menuClick('Paste');await ready();
    assert.equal(await evaluate('text.value'),'PASTE-only note\n筆記');
    await evaluate('applyHistory()');
    await contextMenu('#editor .titlebar');await menuClick('Maximize');
    assert.equal(await evaluate('editor.classList.contains("maximized")'),true);
    await contextMenu('#editor .titlebar');await menuClick('Restore');
    await shortcut();
    await until(()=>evaluate('!document.getElementById("filename").hidden'),'filename');
    assert.equal(await evaluate('getComputedStyle(document.getElementById("filename")).cursor.includes("data:image/png")'),true,'filename input must use the crystal cursor');
    assert.equal(await evaluate('document.getElementById("modal").classList.contains("angel-modal")'),true);
    const before=await evaluate('(()=>{const r=document.getElementById("dialogTitle").getBoundingClientRect();return {x:r.x,y:r.y};})()');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x+20,y:before.y+12,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x+65,y:before.y+32,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x+65,y:before.y+32,button:'left',clickCount:1});
    const after=await evaluate('(()=>{const r=document.getElementById("dialogTitle").getBoundingClientRect();return {x:r.x,y:r.y};})()');
    assert(after.x>before.x && after.y>before.y,'save dialog must move');
    await enter('#filename','browser memo.txt');await click('#dialogButtons button');await ready();
    assert.equal(await evaluate('api("read_file","browser memo.txt")'),'HTML-only note\n筆記');
    await enter('#text','copy draft');await shortcut(true);
    await until(()=>evaluate('document.getElementById("dialogTitle").textContent==="另存新檔"'),'Save As');
    await enter('#filename','copy.txt');await click('#dialogButtons button');await ready();
    assert.equal(await evaluate('api("read_file","copy.txt")'),'copy draft');
    assert.equal(await evaluate('api("read_file","browser memo.txt")'),'HTML-only note\n筆記');
    const conflict=await evaluate('getWindingAPI().save_file("copy.txt","blocked")');
    assert.equal(conflict.conflict,true);assert.equal(conflict.ok,false);
    assert.equal((await evaluate('getWindingAPI().save_file("too large.txt","a".repeat(2097153))')).ok,false);
    assert.equal((await evaluate('getWindingAPI().save_file("../bad.txt","bad")')).ok,false);
    assert.equal((await evaluate('getWindingAPI().read_file("missing.txt")')).ok,false);
    assert.deepEqual(await evaluate('Promise.all([getWindingAPI().save_file("race.txt","one"),getWindingAPI().save_file("race.txt","two")]).then(results=>results.map(r=>r.ok).sort())'),[false,true]);
    await evaluate('api("save_file","Hand Sonic.txt","my edited skill",true)');
    await navigate('login.html');
    assert.equal(await evaluate('getWindingAPI().read_file("copy.txt").then(r=>r.value)'),'copy draft','file pages must share the library');
    await enter('#password',await evaluate('window.WINDING_CONFIG.password'));
    await click('#enter');
    await until(()=>evaluate('location.pathname.endsWith("/desktop.html")&&document.readyState==="complete"'),'login');
    assert.equal(await evaluate('api("read_file","Hand Sonic.txt")'),'my edited skill','seed must not overwrite edits');
    await click('#angel');
    await until(()=>evaluate('document.querySelectorAll(".file-row").length===10'),'persisted list');
    await click('.file-row[data-name="copy.txt"]');await click('[data-action="compile"]');
    await until(()=>evaluate('!document.getElementById("compileScreen").hidden'),'Compile');
    assert.equal(await evaluate('document.getElementById("editor").hidden'),true);
    assert.equal(await evaluate('document.getElementById("workspace").inert'),true);
    await evaluate('window.originalNow=performance.now.bind(performance);window.compileClock=originalNow();Object.defineProperty(performance,"now",{value:()=>compileClock+9000,configurable:true})');
    await until(()=>evaluate('document.getElementById("compileScreen").hidden'),'Compile completion');
    await evaluate('Object.defineProperty(performance,"now",{value:originalNow,configurable:true})');
    await ready();
    await click('.file-row[data-name="copy.txt"]');
    assert.equal(await evaluate('document.querySelector("[data-action=activate]").disabled'),false);
    await click('[data-action="activate"]');
    await ready();
    assert.equal(await evaluate(`document.querySelector('.file-row[data-name="copy.txt"] span').textContent`),'●');
    for(const [width,height] of [[1280,800],[390,600]]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        await delay(80);
        assert.deepEqual(await evaluate(`(()=>{
            const ctx=angelVisual.ctx,original=ctx.fillText,result=[];
            for(const [step,radius] of [[90,220],[45,220],[30,220],[90,35]]){
                const labels=[];ctx.fillText=value=>labels.push(value);
                angelVisual.ring(0,0,radius,0,360,.3,false,step);result.push(labels);
            }
            ctx.fillText=original;return result;
        })()`),[
            ['0','90','180','270'],
            ['0','45','90','135','180','225','270','315'],
            ['0','30','60','90','120','150','180','210','240','270','300','330'],
            ['0','90','180','270']
        ],'each ruler must use its own equal angle labels, including the small innermost circle');
        assert.equal(await evaluate(`(()=>{
            const original=angelVisual.ring,rings=[];
            angelVisual.ring=(...args)=>rings.push(args);
            angelVisual.draw(2);angelVisual.ring=original;
            const groups=new Map();
            for(const ring of rings){const key=ring[0]+','+ring[1];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(ring);}
            const tight=[...groups.values()].every(group=>group.every((ring,i)=>!i||Math.abs(ring[2]-(angelVisual.rulerMetrics(group[i-1][2]).innerRadius-2))<.01));
            const top=rings.slice(-3);
            const labels=[...groups.values()].every(group=>JSON.stringify(group.map(r=>r[7]))===JSON.stringify(group.length===4?[15,30,45,90]:[30,45,90]));
            const layers=rings.length===10&&rings.slice(0,7).every(r=>!r[6])&&top.every(r=>r[6]&&r[5]>.6&&r[1]+r[2]>=24);
            const ctx=angelVisual.ctx,stroke=ctx.stroke,fill=ctx.fill;
            function sample(front){let width=0,shadow=0,fills=0,color='';ctx.stroke=()=>{width=Math.max(width,ctx.lineWidth);shadow=Math.max(shadow,ctx.shadowBlur);color=ctx.strokeStyle;};ctx.fill=()=>fills++;angelVisual.ring(0,0,220,0,360,front?.64:.28,front);return {width,shadow,fills,color};}
            const back=sample(false),front=sample(true);ctx.stroke=stroke;ctx.fill=fill;angelVisual.draw(2);
            const rgb=s=>s.match(/[0-9.]+/g).map(Number);
            return groups.size===3&&tight&&labels&&layers&&front.width>back.width&&front.shadow>back.shadow&&front.fills>0&&back.fills===0&&rgb(front.color)[0]>rgb(back.color)[0]&&rgb(front.color)[3]>rgb(back.color)[3];
        })()`),true,'rulers must be tightly nested, front-masked, thicker and brighter');
        assert.equal(await evaluate('(()=>{const {cx,scale,halfWidth}=angelVisual.humanLayout();return cx-scale*halfWidth>=0&&cx+scale*halfWidth<=angelVisual.width;})()'),true,'imported T-pose arms must fit the canvas');
        assert.equal(await evaluate('(()=>{const s=getComputedStyle(document.querySelector(".visual-heading"));return s.backgroundImage==="none"&&s.backgroundColor==="rgba(0, 0, 0, 0)";})()'),true,'Angel heading and capacity must have a transparent background');
        if(process.env.WINDING_PREVIEW_DIR){
            await mkdir(process.env.WINDING_PREVIEW_DIR,{recursive:true});
            const wasHidden=await evaluate('editor.hidden');
            await evaluate('setEditorVisible(false);angelVisual.stop();angelVisual.draw(2)');
            const shot=await send('Page.captureScreenshot',{format:'png'});
            await writeFile(join(process.env.WINDING_PREVIEW_DIR,`ruler-${width}.png`),Buffer.from(shot.data,'base64'));
            if(width===1280){
                const clip=await evaluate('(()=>{const r=document.getElementById("angelCanvas").getBoundingClientRect(),{scale:s,cx,cy,halfWidth:b}=angelVisual.humanLayout();return {x:Math.floor(r.left+cx-s*b),y:Math.floor(r.top+cy-s*3.7),width:Math.ceil(s*b*2),height:Math.ceil(s*7.2),scale:1};})()');
                for(const [name,time] of [['front',0],['quarter',2],['side',5.61],['back',11.22]]){
                    await evaluate(`angelVisual.draw(${time})`);
                    const figure=await send('Page.captureScreenshot',{format:'png',clip});
                    await writeFile(join(process.env.WINDING_PREVIEW_DIR,`mesh-${name}.png`),Buffer.from(figure.data,'base64'));
                    if(name==='side'){
                        const headClip=await evaluate('(()=>{const r=document.getElementById("angelCanvas").getBoundingClientRect(),{scale:s,cx,cy}=angelVisual.humanLayout();return {x:r.left+cx-s*.9,y:r.top+cy-s*3.7,width:s*1.8,height:s*1.5,scale:3};})()');
                        const head=await send('Page.captureScreenshot',{format:'png',clip:headClip});
                        await writeFile(join(process.env.WINDING_PREVIEW_DIR,'head-side.png'),Buffer.from(head.data,'base64'));
                    }
                }
            }
            await evaluate(`if(!${wasHidden})setEditorVisible(true);angelVisual.start()`);
        }
        assert.equal(await evaluate(`(()=>{
            const a=document.getElementById('angelPlayer').getBoundingClientRect();
            const d=document.getElementById('diskUsage').getBoundingClientRect();
            const c=document.getElementById('regionControls').getBoundingClientRect();
            return a.x===0&&a.y===0&&a.width===innerWidth&&a.height===innerHeight&&d.right<=innerWidth&&c.bottom<=innerHeight;
        })()`),true);
        await click('.file-row[data-name="copy.txt"]');await click('[data-action="open"]');await ready();
        await evaluate('text.dispatchEvent(new MouseEvent("contextmenu",{clientX:innerWidth-1,clientY:innerHeight-1,bubbles:true,cancelable:true}))');
        assert.equal(await evaluate('(()=>{const r=document.getElementById("contextMenu").getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})()'),true);
        await evaluate('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
        assert.equal(await evaluate('document.activeElement===text'),true,'Escape returns focus to the editor');
        await shortcut(true);
        await until(()=>evaluate('!document.getElementById("filename").hidden'),'layout save dialog');
        assert.equal(await evaluate('(()=>{const r=document.querySelector("#modal .dialog").getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&Math.abs(r.x-(innerWidth-r.width)/2)<1;})()'),true);
        await click('#dialogButtons button:nth-child(2)');await ready();
    }
    await click('.file-row[data-name="copy.txt"]');await click('[data-action="open"]');await ready();
    await enter('#text','idle draft');
    await evaluate('window.idleTime=Date.now()+300000;Date.now=()=>idleTime;window.dispatchEvent(new Event("focus"))');
    assert.equal(await evaluate('Boolean(document.getElementById("idleScreen"))'),true);
    await shortcut();
    await until(()=>evaluate('location.pathname.endsWith("/Loading.html")&&document.readyState==="complete"'),'idle restart');
    await evaluate(`(()=>{
        let clock=0;Date.now=()=>clock;
        for(let i=0;i<=50;i++){
            clock=i*100;
            document.dispatchEvent(new MouseEvent('mousemove',{clientX:i,clientY:20,bubbles:true}));
        }
    })()`);
    await until(()=>evaluate('location.pathname.endsWith("/login.html")&&document.readyState==="complete"'),'boot movement');
    await enter('#password',await evaluate('window.WINDING_CONFIG.password'));await click('#enter');
    await until(()=>evaluate('location.pathname.endsWith("/desktop.html")&&document.readyState==="complete"'),'idle login');
    assert.equal(await evaluate('document.getElementById("angelPlayer").hidden'),true,'restart must leave Angel closed');
    assert.equal(await evaluate('document.getElementById("editor").hidden'),true);
    assert.equal(await evaluate('api("read_file","copy.txt")'),'idle draft','restart must save the current document');
    await contextMenu('#workspace');
    await menuClick('Angel Player を開く');
    await until(()=>evaluate('!player.hidden'),'XP context opens Angel');
    await click('#newFile');await ready();
    await evaluate('api("save_file","Untitled.txt","protected")');
    await enter('#text','anonymous autosave');
    await shortcut();
    await until(()=>evaluate('!document.getElementById("filename").hidden'),'pending manual save');
    await evaluate('window.saveImpl=getWindingAPI().save_file;getWindingAPI().save_file=async()=>({ok:false,error:"storage unavailable"});window.idleTime=Date.now()+300000;Date.now=()=>idleTime;window.dispatchEvent(new Event("focus"))');
    await shortcut();
    await until(()=>evaluate('!document.getElementById("idleScreen")&&!document.getElementById("modal").hidden'),'failed autosave stays open');
    assert.equal(await evaluate('text.value'),'anonymous autosave');
    assert.match(await evaluate('document.getElementById("dialogMessage").textContent'),/自動儲存失敗/);
    assert.equal(await evaluate('document.getElementById("filename").hidden'),false,'failed autosave must not replace a pending save dialog');
    await evaluate('getWindingAPI().save_file=saveImpl');
    await click('#dialogButtons button:nth-child(2)');await ready();
    await evaluate('idleTime+=300000;window.dispatchEvent(new Event("focus"))');
    await shortcut();
    await until(()=>evaluate('location.pathname.endsWith("/Loading.html")&&document.readyState==="complete"'),'unnamed autosave restart');
    assert.equal(await evaluate('getWindingAPI().read_file("Untitled.txt").then(r=>r.value)'),'protected');
    assert.equal(await evaluate('getWindingAPI().read_file("Untitled (1).txt").then(r=>r.value)'),'anonymous autosave');
    await navigate('desktop.html');
    await evaluate('api("list_files").then(async names=>{for(const name of names)await api("delete_file",name);})');
    await evaluate('loadFiles(true)');
    assert.equal(await evaluate('document.querySelector("#fileList .empty").textContent'),'(null)');
    await navigate('desktop.html');
    assert.deepEqual(await evaluate('api("list_files")'),[],'empty library must not reseed');
    await click('#angel');await until(()=>evaluate('document.querySelector("#fileList .empty")?.textContent==="(null)"'),'empty list');
    if(baseURL)await send('Fetch.enable',{patterns:[{urlPattern:'*assets/js/shutdown-text.js*',requestStage:'Request'}]});
    await click('#minimizeAngel');await click('#start');await click('#shutdown');
    if(baseURL){
        await until(()=>pausedShutdownRequest,'paused shutdown text script');
        await until(()=>evaluate('Boolean(document.querySelector("main h1"))'),'shutdown HTML before script');
        assert.equal(await evaluate('getComputedStyle(document.querySelector("main")).visibility'), 'hidden','before pixel script and scaling are ready, the page must remain black');
        await send('Fetch.continueRequest',{requestId:pausedShutdownRequest});
        await send('Fetch.disable');
    }
    await until(()=>evaluate('location.pathname.endsWith("/shutdown.html")&&document.readyState==="complete"'),'browser shutdown');
    await until(()=>evaluate('document.querySelector("main").classList.contains("pixel-ready")'),'shutdown pixels and fonts ready');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("main")).visibility'),'visible');
    assert.equal(await evaluate('!document.documentElement.classList.contains("crystal-cursor")&&!window.windingCursorFrames&&!document.documentElement.dataset.cursorFrame'),true,'simulated shutdown must not load or animate the crystal cursor');
    assert.equal(await evaluate('document.querySelector("h1").textContent'),'コンピューターの電源を切ることができます。（うそです！）');
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await delay(30);
    assert.equal(await evaluate(`(()=>{
        const c=document.getElementById('shutdownText'),s=getComputedStyle(c),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
        let visible=0;
        for(let i=0;i<pixels.length;i+=4){
            if(pixels[i+3]!==0&&pixels[i+3]!==255)return false;
            if(pixels[i+3]){visible++;if(pixels[i]!==192||pixels[i+1]!==192||pixels[i+2]!==192)return false;}
        }
        const r=c.getBoundingClientRect();
        return visible>100&&s.imageRendering==='pixelated'&&s.display!=='none'&&r.width/c.width===3&&r.x>=0&&r.right<=innerWidth;
    })()`),true,'shutdown text must use sharp gray-white pixels and integer scaling');
    assert.equal(await evaluate(`(()=>{
        const ctx=document.getElementById('shutdownText').getContext('2d'),original=ctx.fillText,calls=[];
        ctx.fillText=function(text,x,y){calls.push({text,font:this.font,y});return original.call(this,text,x,y);};
        try{window.dispatchEvent(new Event('resize'));}finally{ctx.fillText=original;}
        const body=calls.find(c=>c.text.includes('コンピューター')),note=calls.find(c=>c.text==='（うそです！）');
        return body&&note&&body.font.includes('12px')&&note.font.includes('8px')&&note.y>body.y;
    })()`),true,'parentheses and hiragana suffix must render smaller and lower than the main message');
    if(process.env.WINDING_PREVIEW_DIR){
        const shot=await send('Page.captureScreenshot',{format:'png'});
        await writeFile(join(process.env.WINDING_PREVIEW_DIR,'shutdown-pixel.png'),Buffer.from(shot.data,'base64'));
    }
    for(const width of [390,640]){
        await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
        await delay(30);
        assert.equal(await evaluate('(()=>{const c=document.getElementById("shutdownText"),r=c.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&[1,2,3].includes(r.width/c.width);})()'),true,'coarse shutdown pixels must fit narrow viewports without fractional stretching');
    }
    await evaluate('window.powerNow=Date.now();Date.now=()=>powerNow;window.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));powerNow+=299999;window.dispatchEvent(new Event("focus"))');
    assert.equal(await evaluate('location.pathname.endsWith("/shutdown.html")&&!document.getElementById("idleScreen")'),true,'safe power-off message remains before five minutes');
    await evaluate('powerNow+=1;window.dispatchEvent(new Event("focus"))');
    assert.equal(await evaluate('Boolean(document.getElementById("idleScreen"))&&document.querySelector("main").inert'),true,'five-minute shutdown idle must blank and lock the page');
    await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}))');
    await until(()=>evaluate('location.pathname.endsWith("/Loading.html")&&document.readyState==="complete"'),'shutdown idle wake returns to boot');
    // 真正入口使用滿版框架；不依賴file://跨frame的DOM存取權限。
    await navigate('index.html');
    await until(()=>inFrame('location.pathname.endsWith("/Loading.html")&&document.readyState==="complete"'),'shell Loading');
    for(const [width,height] of [[1280,800],[1920,1200],[1920,1080],[800,600],[640,480],[390,600]]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        await delay(60);
        const boot=await inFrame(`(()=>{
            const stage=document.getElementById('stage').getBoundingClientRect();
            const progress=document.querySelector('.progress').getBoundingClientRect();
            const logo=document.getElementById('logo').getBoundingClientRect();
            const artwork=document.getElementById('bootContent').getBoundingClientRect();
            return {width:stage.width,height:stage.height,x:stage.x,y:stage.y,viewport:[innerWidth,innerHeight],artworkOffset:artwork.y-stage.y,progressWidth:progress.width,progressGap:progress.top-logo.bottom,logoSize:document.getElementById('logo').style.fontSize,background:getComputedStyle(document.body).backgroundColor};
        })()`);
        const fit=Math.min(width/800,height/600),artScale=fit*1.25;
        const close=(actual,expected)=>assert(Math.abs(actual-expected)<.1,`${actual} should match ${expected}`);
        close(boot.width,800*fit);close(boot.height,600*fit);
        close(boot.x,(width-800*fit)/2);close(boot.y,(height-600*fit)/2);
        close(boot.artworkOffset,36*artScale);
        close(boot.progressWidth,128*artScale);assert.equal(boot.background,'rgb(0, 0, 0)');
        assert(boot.progressGap>=20*artScale&&boot.progressGap<=30*artScale,'boot artwork and progress spacing must scale together');
        assert(boot.x>=-.1&&boot.y>=-.1&&boot.x+boot.width<=width+.1&&boot.y+boot.height<=height+.1,'boot must fit without stretching or cropping');
        assert.equal(await inFrame('canvas.width===800&&canvas.height===600'),true,'boot renders at virtual 800x600');
        if(process.env.WINDING_PREVIEW_DIR && width===1280){
            const shot=await send('Page.captureScreenshot',{format:'png'});
            await writeFile(join(process.env.WINDING_PREVIEW_DIR,'boot-1280.png'),Buffer.from(shot.data,'base64'));
        }
    }
    assert.equal(await inFrame(`(()=>{
        const group=document.getElementById('cells'),track=document.getElementById('track'),blocks=[...group.children],bar=document.querySelector('.progress'),style=getComputedStyle(blocks[0],'::before');
        const phase=progressPhase;
        try{
            if(blocks.length!==3||getComputedStyle(track).overflow!=='hidden'||getComputedStyle(bar).boxShadow!=='none'||!style.backgroundImage.startsWith('linear-gradient(')||style.backgroundImage.includes('90deg')||!style.maskImage.includes('data:image/svg+xml')||style.zIndex!=='1')return false;
            progressPhase=.5;progress();
            const links=blocks.map(c=>getComputedStyle(c,'::after'));
            if(!links.slice(0,2).every(s=>s.content==='\"\"'&&s.backgroundColor==='rgb(17, 27, 87)'&&parseFloat(s.width)>0&&parseFloat(s.height)>0)||links[2].content!=='none')return false;
            const rects=blocks.map(c=>c.getBoundingClientRect());
            if(!rects.every(r=>r.width>0)||rects[1].left<=rects[0].right||rects[2].left<=rects[1].right)return false;
            progressPhase=0;progress();if(group.getBoundingClientRect().right>track.getBoundingClientRect().left+.1)return false;
            progressPhase=1;progress();return group.getBoundingClientRect().left>=track.getBoundingClientRect().right-.1;
        }finally{progressPhase=phase;progress();}
    })()`),true,'XP progress must retain three gradient blocks, two dark blue connectors, and clipped entry/exit');
    assert.equal(await inFrame(`(()=>{
        const original={last,spin,phase:progressPhase,render,progress,raf:requestAnimationFrame};
        try{
            render=()=>{};progress=()=>{};window.requestAnimationFrame=()=>0;
            last=0;progressPhase=0;let halfway;
            for(let i=0;i<=120;i++){tick(1000+i*20);if(i===60)halfway=progressPhase;}
            return Math.abs(halfway-.5)<.0001&&(progressPhase<.0001||progressPhase>.9999);
        }finally{last=original.last;spin=original.spin;progressPhase=original.phase;render=original.render;progress=original.progress;window.requestAnimationFrame=original.raf;}
    })()`),true,'XP progress must travel half a cycle in 1.2s and loop in 2.4s');
    assert.equal(await evaluate('location.href'),url('index.html'));
    assert.equal(await evaluate('(()=>{const r=document.getElementById("appFrame").getBoundingClientRect();return r.width===innerWidth&&r.height===innerHeight;})()'),true);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    const touch=(type,point={x:8,y:8})=>send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{...point,id:1,radiusX:1,radiusY:1,force:1}]});
    await inFrame('window.touchNow=100000;Date.now=()=>touchNow');
    await touch('touchStart');await inFrame('touchNow+=4999');await touch('touchMove',{x:9,y:8});
    assert.equal(await inFrame('location.pathname.endsWith("/Loading.html")'),true,'touch hold must wait the full five seconds');
    await touch('touchEnd');await inFrame('touchNow+=10000');await delay(70);
    assert.equal(await inFrame('location.pathname.endsWith("/Loading.html")'),true,'released touch must reset the boot hold');
    await touch('touchStart');await inFrame('touchNow+=4999');await touch('touchCancel');await inFrame('touchNow+=10000');await delay(70);
    assert.equal(await inFrame('location.pathname.endsWith("/Loading.html")'),true,'cancelled touch must reset the boot hold');
    const textPoint=await inFrame('(()=>{const r=document.querySelector(".xo").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');
    await touch('touchStart',textPoint);await inFrame('touchNow+=5000');await touch('touchMove',{x:textPoint.x+.5,y:textPoint.y});
    assert.equal(await inFrame('location.pathname.endsWith("/Loading.html")'),true,'pointer-events:none logo text must still block black-background timing');
    await touch('touchEnd');
    const progressPoint=await inFrame('(()=>{const r=document.querySelector(".progress").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');
    await touch('touchStart',progressPoint);await inFrame('touchNow+=5000');await touch('touchMove',{x:progressPoint.x+1,y:progressPoint.y});
    assert.equal(await inFrame('location.pathname.endsWith("/Loading.html")'),true,'holding the progress artwork must not enter login');
    await touch('touchMove',{x:8,y:8});await inFrame('touchNow+=4999');await touch('touchMove',{x:9,y:8});
    assert.equal(await inFrame('location.pathname.endsWith("/Loading.html")'),true,'entering the black background must start a fresh hold');
    await inFrame('touchNow+=1');
    await until(()=>inFrame('location.pathname.endsWith("/login.html")&&document.readyState==="complete"'),'mobile black-background hold enters shared login');
    await touch('touchEnd');
    assert.equal(await evaluate('location.href'),url('index.html'),'touch boot must keep the parent URL');
    const touchFallback=await send('Page.addScriptToEvaluateOnNewDocument',{source:'if(location.pathname.endsWith("/Loading.html"))Object.defineProperty(window,"PointerEvent",{value:undefined,configurable:true});'});
    await send('Page.reload');
    await until(()=>inFrame('location.pathname.endsWith("/Loading.html")&&document.readyState==="complete"'),'touch fallback boot');
    await inFrame('window.touchNow=100000;Date.now=()=>touchNow');await touch('touchStart');
    await inFrame('touchNow+=5000');
    await until(()=>inFrame('location.pathname.endsWith("/login.html")&&document.readyState==="complete"'),'TouchEvent fallback shares the boot entry');
    await touch('touchEnd');await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:touchFallback.identifier});
    await send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await send('Page.reload');
    await until(()=>inFrame('location.pathname.endsWith("/Loading.html")&&document.readyState==="complete"'),'mouse boot after mobile check');
    await inFrame(`(()=>{
        let clock=0;Date.now=()=>clock;
        for(let i=0;i<=50;i++){clock=i*100;document.dispatchEvent(new MouseEvent('mousemove',{clientX:i,clientY:20,bubbles:true}));}
    })()`);
    await until(()=>inFrame('location.pathname.endsWith("/login.html")&&document.readyState==="complete"'),'frame login');
    assert.equal(await inFrame('getComputedStyle(document.getElementById("password")).cursor.includes("data:image/png")'),true,'password input must use the crystal cursor');
    await inFrame('input.value=window.WINDING_CONFIG.password;input.dispatchEvent(new Event("input"));document.getElementById("enter").click()');
    await until(()=>inFrame('location.pathname.endsWith("/desktop.html")&&document.readyState==="complete"'),'frame desktop');
    assert.equal(await evaluate('location.href'),url('index.html'));
    await inFrame('document.getElementById("angel").click()');
    await until(()=>inFrame('document.querySelector("#fileList .empty")?.textContent==="(null)"'),'shared host storage');
    await inFrame('document.getElementById("newFile").click()');
    await until(()=>inFrame('!busy'),'frame new');
    await inFrame('text.value="framed draft";text.dispatchEvent(new Event("input"));text.dispatchEvent(new KeyboardEvent("keydown",{key:"s",ctrlKey:true,bubbles:true,cancelable:true}))');
    await until(()=>inFrame('!document.getElementById("filename").hidden'),'frame save dialog');
    await inFrame('document.getElementById("filename").value="framed.txt";document.querySelector("#dialogButtons button").click()');
    await until(()=>inFrame('!busy'),'frame save complete');
    assert.equal(await evaluate('getWindingAPI().read_file("framed.txt").then(r=>r.value)'),'framed draft');
    await inFrame('text.value="framed autosave";text.dispatchEvent(new Event("input"));window.frameIdle=Date.now()+300000;Date.now=()=>frameIdle;window.dispatchEvent(new Event("focus"));text.dispatchEvent(new KeyboardEvent("keydown",{key:"s",ctrlKey:true,bubbles:true,cancelable:true}))');
    await until(()=>inFrame('location.pathname.endsWith("/Loading.html")&&document.readyState==="complete"'),'frame idle restart stays inside');
    assert.equal(await evaluate('location.href'),url('index.html'));
    assert.equal(await evaluate('getWindingAPI().read_file("framed.txt").then(r=>r.value)'),'framed autosave');
    await send('Page.reload');
    await until(()=>inFrame('location.pathname.endsWith("/Loading.html")&&document.readyState==="complete"'),'refresh starts Loading');
    assert.equal(await evaluate('location.href'),url('index.html'));
    await inFrame('void getWindingAPI().close_app()');
    await until(()=>inFrame('location.pathname.endsWith("/shutdown.html")&&document.readyState==="complete"'),'frame shutdown');
    assert.equal(await evaluate('location.href'),url('index.html'));
    await inFrame('window.powerNow=Date.now()+300000;Date.now=()=>powerNow;window.dispatchEvent(new Event("focus"))');
    assert.equal(await inFrame('getComputedStyle(document.getElementById("idleScreen")).backgroundColor'),'rgb(0, 0, 0)');
    await inFrame('window.dispatchEvent(new MouseEvent("mousemove",{clientX:5,clientY:5,bubbles:true,cancelable:true}))');
    await until(()=>inFrame('location.pathname.endsWith("/Loading.html")&&document.readyState==="complete"'),'framed shutdown wakes to boot');
    assert.equal(await evaluate('location.href'),url('index.html'),'shutdown wake must preserve the outer URL');
    // 測試注入／原生API優先，不得偷偷改用瀏覽器庫。
    const injection=await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.pywebview={api:{list_files:async()=>({ok:true,value:[window===window.top?"Native.txt":"WRONG CHILD.txt"]})}}'});
    await navigate('desktop.html');
    assert.deepEqual(await evaluate('api("list_files")'),['Native.txt']);
    assert.equal(await evaluate('Boolean(window.windingBrowserAPI)'),false);
    await navigate('index.html');
    await until(()=>inFrame('Boolean(window.getWindingAPI())'),'native frame bridge');
    assert.deepEqual(await inFrame('getWindingAPI().list_files().then(r=>r.value)'),['Native.txt'],'child must use parent native bridge');
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
    assert.deepEqual(errors,[]);
    console.log('PASS: virtual storage, 12-step undo/redo, context editing/window actions, draggable App dialog, restart autosave/error/collisions and closed App, full-frame boot/login/save/refresh, mobile hold/reset/fallback, native isolation, two layouts');
} finally {
    server?.close();
    if(socket?.readyState===WebSocket.OPEN) {
        try {await send('Browser.close');} catch (_) {}
        socket.close();
    }
    if(child.exitCode===null)await until(()=>child.exitCode!==null,'headless Edge exit',5000).catch(()=>child.kill());
    for(let attempt=0;attempt<10;attempt++) {
        try {await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});break;} catch(error) {if(attempt===9)throw error;await delay(200);}
    }
    for(const task of pending.values())clearTimeout(task.timer);
}
