'use strict';

const context=$('contextMenu');
let contextReturnFocus;
function hideContextMenu(restoreFocus=false) {
    const wasOpen=!context.hidden;context.hidden=true;
    if(restoreFocus && wasOpen)contextReturnFocus?.focus();
}
function showContextMenu(event,items,angel=false) {
    contextReturnFocus=event.target===text ? text : document.activeElement;
    closeMenu();hideActions();
    context.replaceChildren();context.classList.toggle('angel-context',angel);
    for(const item of items) {
        if(!item) {context.append(document.createElement('hr'));continue;}
        const button=document.createElement('button');
        button.type='button';button.textContent=item.label;button.disabled=Boolean(item.disabled);
        button.setAttribute('role','menuitem');
        button.onclick=()=>{hideContextMenu(true);item.run();};
        context.append(button);
    }
    context.hidden=false;
    context.style.left=`${Math.max(0,Math.min(event.clientX,innerWidth-context.offsetWidth-2))}px`;
    context.style.top=`${Math.max(0,Math.min(event.clientY,innerHeight-context.offsetHeight-2))}px`;
    context.querySelector('button:not(:disabled)')?.focus();
}
async function copySelection() {
    const content=text.value.slice(text.selectionStart,text.selectionEnd);
    if(navigator.clipboard?.writeText) {await navigator.clipboard.writeText(content);return;}
    text.focus();
    if(!document.execCommand('copy'))throw new Error('無法複製，請使用Ctrl+C。');
}
function replaceSelection(content) {
    editHistory.select(text.selectionStart,text.selectionEnd);
    text.setRangeText(content,text.selectionStart,text.selectionEnd,'end');edited();text.focus();
}
document.addEventListener('contextmenu',event=>{
    event.preventDefault();hideContextMenu();hideActions();
    if(busy || !$('modal').hidden || !$('compileScreen').hidden || $('idleScreen'))return;
    const target=event.target;
    if(!player.hidden) {
        if(target===text) {
            const selected=text.selectionStart!==text.selectionEnd;
            showContextMenu(event,[
                {label:'Undo',disabled:!editHistory.canUndo,run:()=>applyHistory()},
                {label:'Redo',disabled:!editHistory.canRedo,run:()=>applyHistory(true)},null,
                {label:'Cut',disabled:!selected,run:()=>action(async()=>{await copySelection();replaceSelection('');})},
                {label:'Copy',disabled:!selected,run:()=>action(copySelection)},
                {label:'Paste',run:()=>action(async()=>{
                    if(!navigator.clipboard?.readText)throw new Error('請使用Ctrl+V貼上。');
                    replaceSelection(await navigator.clipboard.readText());
                })},
                {label:'Delete',disabled:!selected,run:()=>action(()=>replaceSelection(''))},
                {label:'Select All',run:()=>{text.focus();text.select();}},null,
                {label:'Save',run:()=>action(()=>save())},
                {label:'Save As',run:()=>action(()=>save(true))}
            ],true);
        } else if(target.closest('#editor .titlebar')) {
            showContextMenu(event,[
                {label:'Restore',disabled:!editor.classList.contains('maximized'),run:()=>maximize(editor)},
                {label:'Maximize',disabled:editor.classList.contains('maximized'),run:()=>maximize(editor)},
                {label:'Close',run:()=>setEditorVisible(false)}
            ],true);
        } else if(target.closest('.angel-header')) {
            showContextMenu(event,[
                {label:'Minimize',run:hideAngel},
                {label:'Close',run:()=>$('closeAngel').click()}
            ],true);
        }
        return;
    }
    if(target.closest('#workspace,.taskbar'))showContextMenu(event,[
        {label:'Angel Player を開く',run:()=>showAngel()},
        {label:'最新の情報に更新',run:clock},null,
        {label:'ログオフ',run:()=>$('logout').click()},
        {label:'終了オプション',run:()=>$('shutdown').click()}
    ]);
});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#contextMenu'))hideContextMenu();});
window.addEventListener('resize',()=>hideContextMenu());
window.addEventListener('winding:idle',()=>hideContextMenu());

const saveDialog=$('modal').querySelector('.dialog');
function moveDialog(left,top) {
    const rect=saveDialog.getBoundingClientRect();
    Object.assign(saveDialog.style,{
        position:'fixed',
        left:`${Math.max(0,Math.min(left,innerWidth-rect.width))}px`,
        top:`${Math.max(0,Math.min(top,innerHeight-rect.height))}px`
    });
}
$('dialogTitle').addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();
    const header=event.currentTarget,rect=saveDialog.getBoundingClientRect(),x=event.clientX,y=event.clientY;
    header.setPointerCapture(event.pointerId);
    const move=next=>moveDialog(rect.left+next.clientX-x,rect.top+next.clientY-y);
    const stop=()=>{
        header.removeEventListener('pointermove',move);
        header.removeEventListener('pointerup',stop);
        header.removeEventListener('pointercancel',stop);
    };
    header.addEventListener('pointermove',move);header.addEventListener('pointerup',stop);header.addEventListener('pointercancel',stop);
});
window.addEventListener('resize',()=>{
    if(!$('modal').hidden && saveDialog.style.position==='fixed') {
        const rect=saveDialog.getBoundingClientRect();moveDialog(rect.left,rect.top);
    }
});
