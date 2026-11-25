/* 原生視窗負責全螢幕；網頁內切頁不會重設視窗模式。 */
window.windingNative = navigator.userAgent.includes('WindingXO-Native');
let frameAPI;
if(window!==window.top) {
    const calls=new Map();
    const methods=['list_files','read_file','save_file','delete_file','get_disk_usage','toggle_fullscreen','close_app'];
    frameAPI=Object.fromEntries(methods.map(method=>[method,(...args)=>new Promise(resolve=>{
        const id=crypto.randomUUID();
        const timer=setTimeout(()=>{calls.delete(id);resolve({ok:false,error:'本機服務回應逾時。'});},15000);
        calls.set(id,{resolve,timer});
        window.parent.postMessage({channel:'winding-api',id,method,args},'*');
    })]));
    window.addEventListener('message',event=>{
        if(event.source!==window.parent || event.data?.channel!=='winding-api-result')return;
        const call=calls.get(event.data.id);if(!call)return;
        calls.delete(event.data.id);clearTimeout(call.timer);call.resolve(event.data.result);
    });
}
window.getWindingAPI = () => frameAPI || window.pywebview?.api || window.windingBrowserAPI;
document.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('keydown', event => {
    const host = window.getWindingAPI();
    if (event.altKey && event.key === 'Enter' && host) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) host.toggle_fullscreen();
    }
}, true);
