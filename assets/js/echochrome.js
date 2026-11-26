'use strict';

(() => {
    const byId=id=>document.getElementById(id);
    const win=byId('echochrome'),frame=byId('echoFrame'),address=byId('echoAddress'),task=byId('echoTask');
    const home='about:blank';
    let pages=[],index=-1,restore=null;
    const area=()=>({width:innerWidth,height:innerHeight-document.querySelector('.taskbar').offsetHeight});
    const rect=()=>({left:win.offsetLeft,top:win.offsetTop,width:win.offsetWidth,height:win.offsetHeight});
    const setRect=r=>Object.entries(r).forEach(([key,value])=>win.style[key]=`${value}px`);
    function fit() {
        if(win.hidden)return;
        const size=area();
        if(win.classList.contains('maximized')){setRect({left:0,top:0,...size});return;}
        const r=rect();
        r.width=Math.min(r.width,size.width);r.height=Math.min(r.height,size.height);
        r.left=Math.max(0,Math.min(r.left,size.width-r.width));r.top=Math.max(0,Math.min(r.top,size.height-r.height));setRect(r);
    }
    function display() {
        const atHome=pages[index]===home;
        address.value=atHome?'':pages[index];address.setCustomValidity('');
        byId('echoHome').hidden=!atHome;frame.hidden=atHome;
        frame.dataset.loaded='false';frame.src=pages[index];
        byId('echoBack').disabled=index<=0;byId('echoForward').disabled=index>=pages.length-1;
    }
    function navigate(value) {
        let url;
        try {
            const input=value.trim();
            if(!input||/\s/.test(input))throw new Error();
            url=new URL(/^[a-z][a-z\d+.-]*:/i.test(input)?input:`https://${input}`);
            if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error();
        } catch(_) {address.setCustomValidity('HTTP または HTTPS の URL を入力してください。');address.reportValidity();return;}
        if(pages[index]!==url.href){pages=pages.slice(0,index+1);pages.push(url.href);index=pages.length-1;}
        display();
    }
    function open() {
        closeMenu();window.hideContextMenu?.();
        if(!pages.length){pages=[home];index=0;byId('echoQuery').value='';display();}
        win.hidden=false;task.hidden=false;task.classList.add('active');fit();address.focus();
    }
    function minimize() {win.hidden=true;task.classList.remove('active');}
    function maximize() {
        if(win.classList.contains('maximized')){win.classList.remove('maximized');setRect(restore);}
        else{restore=rect();win.classList.add('maximized');}
        const maximized=win.classList.contains('maximized');
        byId('echoMaximize').textContent=maximized?'❐':'□';
        byId('echoMaximize').setAttribute('aria-label',maximized?'還原 Echochrome':'最大化 Echochrome');fit();
    }
    byId('openEchochrome').onclick=open;
    task.onclick=()=>win.hidden?open():minimize();
    byId('echoMinimize').onclick=minimize;
    byId('echoClose').onclick=()=>{minimize();task.hidden=true;frame.src='about:blank';pages=[];index=-1;};
    byId('echoMaximize').onclick=maximize;
    byId('echoBack').onclick=()=>{if(index>0){index--;display();}};
    byId('echoForward').onclick=()=>{if(index<pages.length-1){index++;display();}};
    byId('echoNavigation').onsubmit=event=>{event.preventDefault();navigate(address.value);};
    address.addEventListener('input',()=>address.setCustomValidity(''));
    frame.addEventListener('load',()=>{frame.dataset.loaded='true';});
    const title=byId('echoTitlebar');
    title.addEventListener('dblclick',event=>{if(!event.target.closest('button'))maximize();});
    title.addEventListener('pointerdown',event=>{
        if(event.button!==0||event.target.closest('button')||win.classList.contains('maximized'))return;
        event.preventDefault();const start=rect(),x=event.clientX,y=event.clientY;
        title.setPointerCapture(event.pointerId);win.classList.add('dragging');
        const move=next=>{setRect({...start,left:start.left+next.clientX-x,top:start.top+next.clientY-y});fit();};
        const stop=()=>{
            win.classList.remove('dragging');
            title.removeEventListener('pointermove',move);
            for(const type of ['pointerup','pointercancel','lostpointercapture'])title.removeEventListener(type,stop);
        };
        title.addEventListener('pointermove',move);
        for(const type of ['pointerup','pointercancel','lostpointercapture'])title.addEventListener(type,stop);
    });
    // Angel 全畫面開啟時禁止焦點進入後方瀏覽器；不接觸文件或原生視窗。
    const sync=()=>{win.inert=document.body.classList.contains('angel-open');};
    new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});sync();
    window.addEventListener('resize',fit);
})();
