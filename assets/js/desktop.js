'use strict';

const $ = id => document.getElementById(id);
const editor = $('editor'), text = $('text');
const player = $('angelPlayer');
const angelVisual = new window.AngelVisual($('angelCanvas'));
const editHistory = new window.WindingHistory(20);
let currentName = '', savedText = '', selectedFile = '', zIndex = 10, busy = false;
let fileVersion = 0, allowNavigation = false, openingAnimation = null;
const fileContents = new Map();
const geometry = new WeakMap();
// 只保存本次桌面中的演出狀態，不編譯或執行任何文件內容。
const scriptStates = new Map();

function ask(title, message, labels = ['確定'], input = null) {
    window.hideContextMenu?.();
    const dialog=$('modal').querySelector('.dialog');
    dialog.style.position='';dialog.style.left='';dialog.style.top='';
    $('modal').classList.toggle('angel-modal',!player.hidden);
    return new Promise(resolve => {
        const previousFocus = document.activeElement;
        $('dialogTitle').textContent = title;
        $('dialogMessage').textContent = message;
        $('filename').hidden = input === null;
        $('filename').value = input || '';
        $('dialogButtons').replaceChildren();
        const finish = value => {
            $('modal').hidden = true;
            $('modal').onkeydown = null;
            previousFocus?.focus();
            resolve(value);
        };
        labels.forEach((label, index) => {
            const button = document.createElement('button');
            button.textContent = label;
            button.onclick = () => finish(index === 0 ? (input === null ? label : {value: $('filename').value}) : label);
            $('dialogButtons').append(button);
        });
        $('modal').hidden = false;
        const focusables = () => [...$('modal').querySelectorAll('input:not([hidden]), button')];
        (input === null ? $('dialogButtons').firstChild : $('filename')).focus();
        if (input !== null) $('filename').select();
        $('modal').onkeydown = event => {
            if (event.key === 'Escape') { event.preventDefault(); finish(null); }
            if (event.key === 'Enter' && event.target === $('filename')) {
                event.preventDefault(); $('dialogButtons').firstChild.click();
            }
            if (event.key === 'Tab') {
                const items = focusables(), index = items.indexOf(document.activeElement);
                event.preventDefault();
                items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
            }
        };
    });
}

async function api(method, ...args) {
    const host = window.getWindingAPI();
    if (!host) throw new Error('本機儲存尚未就緒。');
    const result = await host[method](...args);
    if (!result.ok) {
        const error = new Error(result.error);
        error.conflict = result.conflict;
        throw error;
    }
    return result.value;
}

async function action(operation) {
    if (busy || !$('modal').hidden) return;
    busy = true;
    text.readOnly = true;
    try { await operation(); }
    catch (error) { await ask('Angel Player', error.message); }
    finally { busy = false; text.readOnly = false; }
}

function updateTitle() {
    $('editorTitle').textContent = `${text.value !== savedText ? '*' : ''}${currentName.replace(/\.txt$/i, '') || 'Untitled'} - Angel Player`;
    updateDetails();
}

async function save(saveAs = false) {
    let name = currentName;
    if (saveAs || !name) {
        const answer = await ask(saveAs ? '另存新檔' : '儲存', '檔名：', ['儲存', '取消'], name || 'Untitled.txt');
        if (!answer || typeof answer !== 'object') return false;
        name = answer.value;
    }
    const snapshot = text.value;
    try { name = await api('save_file', name, snapshot, !saveAs && Boolean(currentName)); }
    catch (error) {
        if (!error.conflict || await ask('確認覆寫', `${name}\n已有同名文件，是否覆寫？`, ['覆寫', '取消']) !== '覆寫') {
            if (!error.conflict) throw error;
            return false;
        }
        name = await api('save_file', name, snapshot, true);
    }
    if (scriptStates.get(name)?.content !== snapshot) scriptStates.delete(name);
    currentName = name;
    savedText = snapshot;
    selectedFile = name;
    fileContents.set(name, snapshot);
    updateTitle();
    await loadFiles();
    return true;
}

async function compile(name) {
    const snapshot = await api('read_file', name), progress = $('compileProgress');
    fileContents.set(name, snapshot);
    const previousFocus = document.activeElement;
    scriptStates.delete(name);
    progress.value = 0;
    $('compilePercent').textContent = '0%';
    $('compileFilename').textContent = name.replace(/\.txt$/i, '');
    $('compileScreen').hidden = false;
    angelVisual.stop();
    $('workspace').inert = true;
    document.querySelector('.taskbar').inert = true;
    $('cancelCompile').focus();
    let timer, completionTimer;
    try {
        const completed = await new Promise(resolve => {
            const started = performance.now();
            const finish = result => { clearInterval(timer); clearTimeout(completionTimer); resolve(result); };
            $('cancelCompile').onclick = () => finish(false);
            $('compileScreen').onkeydown = event => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
                if (event.key === 'Tab') { event.preventDefault(); $('cancelCompile').focus(); }
            };
            timer = setInterval(() => {
                progress.value = Math.min(100, (performance.now() - started) / 80);
                $('compilePercent').textContent = `${Math.floor(progress.value)}%`;
                if (progress.value >= 100) {
                    clearInterval(timer);
                    completionTimer = setTimeout(() => finish(true), 350);
                }
            }, 50);
        });
        if (completed) scriptStates.set(name, {content: snapshot, active: false});
    } finally {
        clearInterval(timer); clearTimeout(completionTimer);
        $('compileScreen').hidden = true;
        $('compileScreen').onkeydown = null;
        $('cancelCompile').onclick = null;
        $('workspace').inert = false;
        document.querySelector('.taskbar').inert = !player.hidden;
        previousFocus?.focus();
        if (!player.hidden) angelVisual.start();
        updateTitle();
        if (!player.hidden) await loadFiles();
    }
}

async function canLeave() {
    if (text.value === savedText) return true;
    const choice = await ask('Angel Player', '文件尚未儲存，是否儲存變更？', ['儲存', '不儲存', '取消']);
    if (choice === '儲存') return save();
    return choice === '不儲存';
}

async function openFile(name) {
    if (!await canLeave()) return false;
    const content = await api('read_file', name);
    if (scriptStates.get(name)?.content !== content) scriptStates.delete(name);
    currentName = name; savedText = content; text.value = content;
    editHistory.reset(content);
    fileContents.set(name, content);
    updateTitle(); setEditorVisible(true);
    return true;
}

function raise(win) {
    win.style.zIndex = ++zIndex;
}

function setEditorVisible(visible) {
    editor.hidden = !visible;
    if (visible) { constrain(editor); raise(editor); text.focus(); }
}

function showAngel(origin = $('angel').querySelector('.angel-icon')) {
    if (!player.hidden) return;
    const icon = origin.getBoundingClientRect();
    closeMenu();
    document.body.classList.add('angel-open');
    document.querySelector('.taskbar').inert = true;
    $('startMenu').inert = true;
    player.hidden = false;
    $('angelTask').hidden = false;
    $('angelTask').classList.add('active');
    angelVisual.start();
    if (openingAnimation) openingAnimation.cancel();
    const x = icon.left + icon.width/2, y = icon.top + icon.height/2;
    const radius = Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
    const animation = player.animate([
        {clipPath:`circle(${Math.max(icon.width,icon.height)/2}px at ${x}px ${y}px)`,opacity:.3},
        {clipPath:`circle(${radius}px at ${x}px ${y}px)`,opacity:1}
    ], {duration:650,easing:'cubic-bezier(.2,.65,.2,1)'});
    openingAnimation = animation;
    animation.onfinish = () => { if (openingAnimation === animation) openingAnimation = null; };
    if (!editor.hidden) constrain(editor);
    loadFiles();
    refreshDiskUsage();
}

async function refreshDiskUsage() {
    try {
        const disk = await api('get_disk_usage');
        const browser=disk.kind==='browser';
        $('diskUsage').setAttribute('aria-label',browser?'瀏覽器儲存配額與使用率':'磁碟總容量與使用率');
        if (!Number.isFinite(disk.total) || !Number.isFinite(disk.used) || !(disk.total > 0) || disk.used < 0 || disk.used > disk.total) {
            if (browser) { $('diskUsage').textContent='— GB · —% USED'; return; }
            throw new Error('Invalid disk usage');
        }
        $('diskUsage').textContent = `${(disk.total/1e9).toFixed(1)} GB · ${(disk.used/disk.total*100).toFixed(1)}% USED`;
    } catch (_) { $('diskUsage').textContent = 'DISK UNAVAILABLE'; }
}

function hideAngel() {
    if (openingAnimation) { openingAnimation.cancel(); openingAnimation = null; }
    player.hidden = true;
    document.body.classList.remove('angel-open');
    document.querySelector('.taskbar').inert = false;
    $('startMenu').inert = false;
    $('angelTask').classList.remove('active');
    fileVersion++;
    hideActions();
    angelVisual.stop();
}

function workspaceSize() { return {width: $('visualStage').clientWidth, height: $('visualStage').clientHeight}; }
function setRect(win, rect) {
    for (const key of ['left', 'top', 'width', 'height']) win.style[key] = `${rect[key]}px`;
}
function rectOf(win) {
    return {left: win.offsetLeft, top: win.offsetTop, width: win.offsetWidth, height: win.offsetHeight};
}
function constrain(win) {
    const area = workspaceSize();
    if (win.classList.contains('maximized')) { setRect(win, {left:0, top:0, ...area}); return; }
    const r = rectOf(win);
    r.width = Math.min(area.width, Math.max(190, r.width));
    r.height = Math.min(area.height, Math.max(160, r.height));
    r.left = Math.max(0, Math.min(r.left, area.width - r.width));
    r.top = Math.max(0, Math.min(r.top, area.height - r.height));
    setRect(win, r);
}
function maximize(win) {
    if (win.classList.contains('maximized')) {
        win.classList.remove('maximized');
        setRect(win, geometry.get(win));
    } else {
        geometry.set(win, rectOf(win));
        win.classList.add('maximized');
    }
    const button = win.querySelector('[data-command=maximize]');
    button.textContent = win.classList.contains('maximized') ? '❐' : '□';
    button.setAttribute('aria-label', win.classList.contains('maximized') ? '還原' : '最大化');
    constrain(win);
}

function drag(win, handle, edge = '') {
    handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button') || win.classList.contains('maximized')) return;
        event.preventDefault(); raise(win);
        const start = rectOf(win), x = event.clientX, y = event.clientY, area = workspaceSize();
        handle.setPointerCapture(event.pointerId);
        const move = e => {
            const dx = e.clientX - x, dy = e.clientY - y, r = {...start};
            if (!edge) {
                r.left = Math.max(0, Math.min(start.left + dx, area.width - r.width));
                r.top = Math.max(0, Math.min(start.top + dy, area.height - r.height));
            } else {
                if (edge.includes('e')) r.width = Math.max(190, Math.min(area.width - r.left, start.width + dx));
                if (edge.includes('s')) r.height = Math.max(160, Math.min(area.height - r.top, start.height + dy));
                if (edge.includes('w')) { r.left = Math.max(0, Math.min(start.left + dx, start.left + start.width - 190)); r.width = start.width + start.left - r.left; }
                if (edge.includes('n')) { r.top = Math.max(0, Math.min(start.top + dy, start.top + start.height - 160)); r.height = start.height + start.top - r.top; }
            }
            setRect(win, r);
        };
        const stop = () => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', stop);
            handle.removeEventListener('pointercancel', stop);
            handle.removeEventListener('lostpointercapture', stop);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
        handle.addEventListener('lostpointercapture', stop);
    });
}

for (const win of [editor]) {
    const title = win.querySelector('.titlebar');
    win.addEventListener('pointerdown', () => raise(win));
    drag(win, title);
    title.addEventListener('dblclick', e => { if (!e.target.closest('button')) maximize(win); });
    for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
        const handle = document.createElement('div');
        handle.className = 'resize-handle'; handle.dataset.edge = edge;
        win.append(handle); drag(win, handle, edge);
    }
    win.querySelector('.window-controls').onclick = event => {
        const command = event.target.closest('button')?.dataset.command;
        if (command === 'maximize') maximize(win);
        if (command === 'close') setEditorVisible(false);
    };
}

function hideActions() {
    $('fileActions').hidden = true;
    document.querySelectorAll('.file-row.selected').forEach(row => row.classList.remove('selected'));
}
function closeMenu() {
    $('startMenu').hidden = true;
    $('start').setAttribute('aria-expanded', 'false');
}
function showActions(row, focus = false) {
    hideActions(); selectedFile = row.dataset.name;
    row.classList.add('selected');
    const menu = $('fileActions'), r = row.getBoundingClientRect();
    const state = scriptStates.get(selectedFile), activate = menu.querySelector('[data-action=activate]');
    activate.textContent = state?.active ? 'Deactive' : 'Active';
    activate.disabled = busy || !state;
    menu.hidden = false;
    menu.style.left = `${Math.max(0, Math.min($('fileSidebar').getBoundingClientRect().right - 1, innerWidth-menu.offsetWidth))}px`;
    menu.style.top = `${Math.max(2, Math.min(r.top, innerHeight - menu.offsetHeight - 2))}px`;
    if (focus) menu.querySelector('button').focus();
    updateDetails();
}
async function loadFiles() {
    const version = ++fileVersion;
    hideActions();
    const list = $('fileList');
    list.replaceChildren();
    const message = document.createElement('p'); message.className = 'empty'; message.textContent = '讀取中…'; list.append(message);
    try {
        const files = await api('list_files');
        if (version !== fileVersion) return;
        list.replaceChildren();
        $('fileCount').textContent = `${String(files.length).padStart(2,'0')} FILES`;
        if (!files.length) { message.textContent = '(null)'; list.append(message); }
        const fragment = document.createDocumentFragment();
        for (const name of files) {
            const row = document.createElement('button'); row.className = 'file-row'; row.dataset.name = name;
            const displayName = name.replace(/\.txt$/i, '');
            row.setAttribute('role', 'menuitem'); row.setAttribute('aria-haspopup', 'menu'); row.title = displayName;
            const icon = document.createElement('span'); icon.textContent = scriptStates.get(name)?.active ? '●' : '▤';
            const label = document.createElement('span'); label.className = 'file-name'; label.textContent = displayName;
            const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '▶';
            row.append(icon, label, arrow);
            // 重建列表或展開App時的pointerenter不算滑鼠操作，避免首項自行展開。
            row.onpointermove = () => { if ($('fileActions').hidden || selectedFile !== name) showActions(row); };
            row.onpointerleave = event => { if (!event.relatedTarget?.closest('#fileActions, .file-row')) hideActions(); };
            row.onclick = () => showActions(row);
            row.onkeydown = event => { if (event.key === 'ArrowRight') { event.preventDefault(); showActions(row, true); } };
            fragment.append(row);
        }
        list.append(fragment);
    } catch (error) { if (version === fileVersion) message.textContent = error.message; }
}

$('start').onclick = () => {
    if (!player.hidden) return;
    hideActions();
    if (!$('startMenu').hidden) { closeMenu(); return; }
    $('startMenu').hidden = false;
    $('start').setAttribute('aria-expanded', 'true');
};
$('fileList').addEventListener('scroll', hideActions);
$('fileActions').addEventListener('pointerleave', event => {
    if (!event.relatedTarget?.closest('.file-row')) hideActions();
});
document.addEventListener('pointermove', event => {
    if (!$('fileActions').hidden && !event.target.closest('.file-row, #fileActions')) hideActions();
});
document.documentElement.addEventListener('pointerleave', hideActions);
window.addEventListener('blur', hideActions);
$('fileActions').onclick = event => {
    const operation = event.target.closest('button')?.dataset.action, name = selectedFile;
    if (!operation) return;
    hideActions();
    action(async () => {
        if (operation === 'activate') {
            const state = scriptStates.get(name);
            if (state) { state.active = !state.active; updateTitle(); }
        }
        if (operation === 'open') await openFile(name);
        if (operation === 'compile') await compile(name);
        if (operation === 'delete') {
            if (await ask('確認刪除', `要刪除「${name}」嗎？`, ['刪除', '取消']) !== '刪除') return;
            await api('delete_file', name);
            scriptStates.delete(name);
            fileContents.delete(name);
            if (currentName === name) { currentName = ''; savedText = ''; updateTitle(); }
            if (selectedFile === name) selectedFile = '';
            updateDetails();
            await loadFiles();
        }
    });
};
function dismissMenus(event) {
    if (!event.target.closest('#startMenu, #fileActions, #start')) closeMenu();
    if (!event.target.closest('#fileSidebar, #fileActions')) hideActions();
}
document.addEventListener('pointerdown', dismissMenus);
document.addEventListener('click', dismissMenus);
document.addEventListener('keydown', event => {
    if (event.ctrlKey && event.key.toLowerCase()==='z' && $('modal').hidden) {
        event.preventDefault();
        if (!busy && !player.hidden && !editor.hidden) applyHistory(event.shiftKey);
    }
    if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        window.hideContextMenu?.(true);
        if (!player.hidden && !editor.hidden) action(() => save(event.shiftKey));
    }
    const menu = event.target.closest('#startMenu, #fileList, #fileActions, #contextMenu');
    if (menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...menu.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
    }
    if (event.key === 'Escape' && $('modal').hidden) { closeMenu(); hideActions(); window.hideContextMenu?.(true); }
    if (event.key === 'ArrowLeft' && event.target.closest('#fileActions')) {
        hideActions(); [...$('fileList').children].find(row => row.dataset.name === selectedFile)?.focus();
    }
});
$('angel').onclick = () => showAngel();
$('angelTask').onclick = () => { if (player.hidden) showAngel($('angelTask')); else hideAngel(); };
$('minimizeAngel').onclick = hideAngel;
$('closeAngel').onclick = () => action(async () => {
    if (!await canLeave()) return;
    text.value = savedText;
    editHistory.reset(savedText);
    setEditorVisible(false);
    updateTitle();
    hideAngel();
    $('angelTask').hidden = true;
});
$('newFile').onclick = () => action(async () => {
    hideActions();
    if (!await canLeave()) return;
    currentName = ''; savedText = ''; text.value = '';
    editHistory.reset('');
    updateTitle(); setEditorVisible(true);
});
$('shutdown').onclick = () => {
    closeMenu();
    action(async () => {
        if (!await canLeave()) return;
        allowNavigation = true;
        try { await api('close_app'); } catch (error) { allowNavigation = false; throw error; }
    });
};
$('logout').onclick = () => {
    closeMenu();
    action(async () => {
        if (!await canLeave()) return;
        allowNavigation = true;
        location.assign(new URL('./login.html', location.href).href);
    });
};
function edited() {
    editHistory.record(text.value,text.selectionStart,text.selectionEnd);
    scriptStates.delete(currentName);
    updateTitle();
    if (selectedFile === currentName && !$('fileActions').hidden) {
        const activate = $('fileActions').querySelector('[data-action=activate]');
        activate.textContent = 'Active'; activate.disabled = true;
    }
}
text.oninput = edited;
text.addEventListener('beforeinput',()=>editHistory.select(text.selectionStart,text.selectionEnd));
function applyHistory(redo=false) {
    if (busy || text.readOnly || !$('modal').hidden) return;
    const state=redo ? editHistory.redo() : editHistory.undo();
    if (!state) return;
    text.value=state.value;text.focus();text.setSelectionRange(state.start,state.end);
    edited();window.hideContextMenu?.();
}
text.addEventListener('keydown', event => {
    if (busy || text.readOnly) return;
    if (event.key === 'Tab') {
        event.preventDefault();
        text.setRangeText('\t', text.selectionStart, text.selectionEnd, 'end'); edited();
    }
});
window.addEventListener('resize', () => { closeMenu(); hideActions(); if (!player.hidden && !editor.hidden) constrain(editor); });
document.addEventListener('visibilitychange', () => {
    if (document.hidden) angelVisual.stop();
    else if (!player.hidden && $('compileScreen').hidden && !$('idleScreen')) angelVisual.start();
});
window.addEventListener('beforeunload', event => {
    if (!allowNavigation && text.value !== savedText) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('winding:idle', () => angelVisual.stop());
window.addEventListener('winding:resume', () => {
    if (!player.hidden && $('compileScreen').hidden) angelVisual.start();
});
window.addEventListener('winding:restart', event => event.waitUntil((async()=>{
    try {
        if (text.value!==savedText) {
            const snapshot=text.value;
            let name=currentName || 'Untitled.txt',suffix=1;
            while (true) {
                try {name=await api('save_file',name,snapshot,Boolean(currentName));break;}
                catch (error) {if(currentName || !error.conflict)throw error;name=`Untitled (${suffix++}).txt`;}
            }
            currentName=name;savedText=snapshot;
        }
        allowNavigation=true;
    } catch(error) {
        setTimeout(()=>{
            const message=`自動儲存失敗：${error.message}`;
            if(!$('modal').hidden)$('dialogMessage').textContent+=`\n\n${message}`;
            else ask('Angel Player',message);
        },0);
        throw error;
    }
})()));
const regions = {
    head: ['HEAD','Head contour and orientation grid.'],
    torso: ['TORSO','Upper body contour and surface grid.'],
    arms: ['ARMS','Arm joints and limb surface grid.'],
    legs: ['LEGS','Lower limb contour and joint grid.']
};
document.querySelectorAll('[data-region]').forEach(button => {
    button.onclick = () => {
        angelVisual.region = button.dataset.region;
        document.querySelectorAll('[data-region]').forEach(item => item.setAttribute('aria-pressed',String(item===button)));
        $('regionName').textContent = regions[angelVisual.region][0];
        $('regionDescription').textContent = regions[angelVisual.region][1];
    };
});
function updateDetails() {
    $('fileList').querySelectorAll('.file-row').forEach(row => {
        const icon = row.firstElementChild, symbol = scriptStates.get(row.dataset.name)?.active ? '●' : '▤';
        if (icon.textContent !== symbol) icon.textContent = symbol;
    });
    const name = selectedFile || currentName, state = scriptStates.get(name);
    $('detailFilename').textContent = name ? name.replace(/\.txt$/i,'') : '(null)';
    $('detailState').textContent = name ? (state ? (state.active ? 'Active' : 'Compiled') : '—') : '—';
    $('detailSize').textContent = fileContents.has(name) ? `${new TextEncoder().encode(fileContents.get(name)).length} B` : '—';
    $('activeCount').textContent = `${String([...scriptStates.values()].filter(value=>value.active).length).padStart(2,'0')} ACTIVE`;
}
function clock() { $('clock').textContent = new Date().toLocaleTimeString('zh-TW', {hour:'2-digit',minute:'2-digit',hour12:false}); }
clock(); setInterval(clock, 1000); updateTitle();
setInterval(() => { if (!player.hidden && !$('idleScreen')) refreshDiskUsage(); }, 60000);
