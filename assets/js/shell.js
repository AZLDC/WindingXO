'use strict';

const appFrame=document.getElementById('appFrame');
const methods=new Set(['list_files','read_file','save_file','delete_file','get_disk_usage','toggle_fullscreen','close_app']);
function hostAPI() {
    const host=window.getWindingAPI();
    if(host)return Promise.resolve(host);
    return new Promise((resolve,reject)=>{
        const ready=()=>{clearTimeout(timer);resolve(window.getWindingAPI());};
        const timer=setTimeout(()=>{window.removeEventListener('pywebviewready',ready);reject(new Error('本機服務尚未就緒。'));},10000);
        window.addEventListener('pywebviewready',ready,{once:true});
    });
}
window.addEventListener('message',async event=>{
    const data=event.data;
    if(event.source!==appFrame.contentWindow || data?.channel!=='winding-api' || !methods.has(data.method) || !Array.isArray(data.args))return;
    let result;
    try {
        const host=await hostAPI();
        result=await host[data.method](...data.args);
    } catch(error) {result={ok:false,error:error.message};}
    event.source.postMessage({channel:'winding-api-result',id:data.id,result},'*');
});
window.addEventListener('winding:power-off',()=>{appFrame.src='shutdown.html';});
