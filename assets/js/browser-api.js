'use strict';

/* HTML版使用虛擬文件；不接觸HTML旁的資料夾，也不執行內容。 */
(() => {
    if (window!==window.top || navigator.userAgent.includes('WindingXO-Native') || window.pywebview?.api) return;
    const defaults = [
        ['Hand Sonic','Materialize a blade from the forearm.'],
        ['Distortion','Deflect incoming projectiles.'],
        ['Delay','Create an afterimage to confuse an opponent.'],
        ['Harmonics','Create an independent duplicate.'],
        ['Absorb','Reintegrate duplicates created by Harmonics.'],
        ['Howling','Produce a powerful sound wave with crossed Hand Sonic blades.'],
        ['Overdrive','Passive enhancement of physical strength.']
    ];
    let connection;
    function database() {
        if (!connection) connection = new Promise((resolve,reject) => {
            const request = indexedDB.open('windingxo-browser',1);
            request.onupgradeneeded = event => {
                const db = request.result;
                if (event.oldVersion === 0) {
                    const files = db.createObjectStore('files',{keyPath:'name'});
                    db.createObjectStore('trash',{keyPath:'id'});
                    for (const [name,description] of defaults) files.add({
                        name:`${name}.txt`,
                        content:`GUARD SKILL: ${name}\nOWNER: Kanade Tachibana\n\n${description}\n\nEditable fan-made notes. Compile and Active are visual simulations only.\n`
                    });
                }
            };
            request.onsuccess = () => {
                request.result.onversionchange = () => {request.result.close();connection=null;};
                resolve(request.result);
            };
            request.onerror = () => {connection=null;reject(new Error('無法開啟瀏覽器本機儲存。'));};
        });
        return connection;
    }
    async function transaction(stores,mode,work) {
        const db = await database();
        return new Promise((resolve,reject) => {
            const tx = db.transaction(stores,mode);
            let value,failure;
            tx.oncomplete = () => resolve(value);
            tx.onabort = () => reject(failure || new Error('本機儲存失敗，請確認瀏覽器空間及權限。'));
            try {work(tx,result => {value=result;},error => {failure=error;tx.abort();});}
            catch (error) {failure=error;tx.abort();}
        });
    }
    function filename(name) {
        if (typeof name !== 'string' || !name || name.length>180 || name!==name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name) || name.startsWith('.') || name.endsWith('.')) {
            throw new Error('請輸入有效的文件名稱（1到180個字元）。');
        }
        if (!/\.[^.]+$/.test(name)) name += '.txt';
        if (!/\.(txt|js|py|md)$/i.test(name)) throw new Error('請使用 .txt、.js、.py 或 .md 副檔名。');
        return name;
    }
    const call = operation => async (...args) => {
        try {return {ok:true,value:await operation(...args)};}
        catch (error) {return {ok:false,error:error.message,conflict:Boolean(error.conflict)};}
    };
    window.windingBrowserAPI = {
        list_files:call(() => transaction(['files'],'readonly',(tx,done) => {
            tx.objectStore('files').getAllKeys().onsuccess = event => done(event.target.result.sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase())));
        })),
        read_file:call(name => transaction(['files'],'readonly',(tx,done,fail) => {
            tx.objectStore('files').get(filename(name)).onsuccess = event => {
                if (!event.target.result) fail(new Error('找不到此文件。'));
                else done(event.target.result.content);
            };
        })),
        save_file:call((name,content,overwrite=false) => {
            name = filename(name);
            if (typeof content !== 'string' || new TextEncoder().encode(content).length>2*1024*1024) throw new Error('單一文件不得超過2 MiB。');
            return transaction(['files'],'readwrite',(tx,done,fail) => {
                const files = tx.objectStore('files');
                files.get(name).onsuccess = event => {
                    if (event.target.result && !overwrite) {
                        const error = new Error('已有同名文件，是否覆寫？');error.conflict=true;fail(error);
                    } else {files.put({name,content});done(name);}
                };
            });
        }),
        delete_file:call(name => transaction(['files','trash'],'readwrite',(tx,done,fail) => {
            name = filename(name);
            const files = tx.objectStore('files');
            files.get(name).onsuccess = event => {
                if (!event.target.result) {fail(new Error('找不到此文件。'));return;}
                tx.objectStore('trash').put({...event.target.result,id:crypto.randomUUID(),deletedAt:Date.now()});
                files.delete(name);done(null);
            };
        })),
        get_disk_usage:call(async () => {
            try {
                const estimate=await navigator.storage?.estimate();
                return {kind:'browser',total:estimate?.quota??null,used:estimate?.usage??null};
            } catch (_) { return {kind:'browser',total:null,used:null}; }
        }),
        toggle_fullscreen:call(async () => {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen({navigationUI:'hide'});
        }),
        close_app:call(async () => {
            if (document.fullscreenElement) await document.exitFullscreen();
            if(document.getElementById('appFrame'))window.dispatchEvent(new Event('winding:power-off'));
            else location.replace(new URL('./shutdown.html',location.href).href);
        })
    };
})();
