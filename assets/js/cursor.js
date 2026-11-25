'use strict';

// 使用已儲存的PNG幀更新原生CSS游標，不在頁面上加跟隨滑鼠的覆蓋圖層。
(() => {
    const data=window.windingCursorFrames,root=document.documentElement;
    if(!data?.frames?.length)return;
    let timer=null,paused=false,previous=-1;
    function paint(){
        if(paused||document.hidden)return;
        const index=Math.floor(performance.now()/data.duration*data.frames.length)%data.frames.length;
        if(index!==previous){
            root.style.setProperty('--crystal-cursor',`url("${data.frames[index]}") ${data.hotspot[0]} ${data.hotspot[1]},default`);
            root.dataset.cursorFrame=index;previous=index;
        }
    }
    function stop(){clearInterval(timer);timer=null;}
    function start(){if(timer===null&&!paused&&!document.hidden){paint();timer=setInterval(paint,data.duration/data.frames.length);}}
    root.style.setProperty('--crystal-cursor',`url("${data.frames[0]}") ${data.hotspot[0]} ${data.hotspot[1]},default`);
    root.dataset.cursorFrame='0';start();
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start();});
    window.addEventListener('pagehide',stop);
    window.addEventListener('pageshow',start);
    window.addEventListener('winding:idle',()=>{paused=true;stop();});
    window.addEventListener('winding:resume',()=>{paused=false;start();});
})();
