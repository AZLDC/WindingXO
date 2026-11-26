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
            const request = indexedDB.open('windingxo-browser',2);
            request.onupgradeneeded = event => {
                const db = request.result;
                db.createObjectStore('catalog');
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
    const entry = file => ({name:file.name,size:new TextEncoder().encode(file.content).length,compiled:false,cost:null,region:null});
    function validateCatalog(data) {
        if(data?.version!==1 || !data.files || typeof data.files!=='object' || Array.isArray(data.files))throw new Error('文件索引格式錯誤。');
        const totals={head:0,torso:0,arms:0,legs:0};
        for(const [name,item] of Object.entries(data.files)) {
            if(!item || typeof item!=='object')throw new Error('文件索引項目損壞。');
            const validCost=Number.isInteger(item.cost)&&item.cost>=30&&item.cost<=40;
            if(item.name!==name || !Number.isInteger(item.size) || item.size<0 || typeof item.compiled!=='boolean'
                || (item.cost!==null&&!validCost) || (item.compiled&&!validCost)
                || (item.region!==null&&(!Object.hasOwn(totals,item.region)||!item.compiled)))throw new Error('文件索引項目損壞。');
            if(item.region!==null)totals[item.region]+=item.cost;
        }
        if(Object.values(totals).some(used=>used>100))throw new Error('文件索引的部位資源超過容量。');
        return data.files;
    }
    // 索引與文件使用同一交易，避免改名或刪除後留下舊資料。
    function catalogOperation(work) {
        return transaction(['files','catalog','trash'],'readwrite',(tx,done,fail) => {
            const index=tx.objectStore('catalog');
            const run=data=>{
                try {work(tx,data,result=>{
                    index.put(JSON.stringify({version:1,files:data}),'catalog.json');done(result);
                },fail);} catch(error) {fail(error);}
            };
            index.get('catalog.json').onsuccess=event=>{
                if(event.target.result) {
                    try {
                        run(validateCatalog(JSON.parse(event.target.result)));
                    } catch(error) {fail(error);}
                    return;
                }
                tx.objectStore('files').getAll().onsuccess=files=>run(Object.fromEntries(files.target.result.map(file=>[file.name,entry(file)])));
            };
        });
    }
    window.windingBrowserAPI = {
        list_files:call(() => catalogOperation((tx,data,done)=>done(Object.keys(data).sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()))))),
        list_catalog:call(() => catalogOperation((tx,data,done)=>done(Object.values(data).sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase()))))),
        compile_file:call(name=>catalogOperation((tx,data,done,fail)=>{
            name=filename(name);
            if(!data[name]) {fail(new Error('找不到此文件。'));return;}
            const item=data[name];item.compiled=true;item.cost??=30+Math.floor(Math.random()*11);item.region=null;
            done(item);
        })),
        invalidate_file:call(name=>catalogOperation((tx,data,done)=>{
            name=filename(name);
            if(data[name]) {data[name].compiled=false;data[name].region=null;}
            done(null);
        })),
        activate_file:call((name,region)=>catalogOperation((tx,data,done,fail)=>{
            name=filename(name);const item=data[name];
            if(!item?.compiled) {fail(new Error('請先編譯此能力。'));return;}
            if(region!==null) {
                if(!['head','torso','arms','legs'].includes(region)) {fail(new Error('無效的掛載部位。'));return;}
                const used=Object.values(data).filter(other=>other.name!==name&&other.region===region).reduce((sum,other)=>sum+other.cost,0);
                if(used+item.cost>100) {fail(new Error('此部位資源不足，請先解除其他能力。'));return;}
            }
            item.region=region;done(item);
        })),
        rename_file:call((name,newName)=>catalogOperation((tx,data,done,fail)=>{
            name=filename(name);newName=filename(newName);
            const files=tx.objectStore('files');
            files.get(name).onsuccess=event=>{
                const file=event.target.result;
                if(!file) {fail(new Error('找不到此文件。'));return;}
                if(name===newName) {done(newName);return;}
                if(data[newName]) {const error=new Error('已有同名文件，請使用其他名稱。');error.conflict=true;fail(error);return;}
                files.add({...file,name:newName});files.delete(name);
                data[newName]={...data[name],name:newName};delete data[name];done(newName);
            };
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
            return catalogOperation((tx,data,done,fail) => {
                const files = tx.objectStore('files');
                files.get(name).onsuccess = event => {
                    if (event.target.result && !overwrite) {
                        const error = new Error('已有同名文件，是否覆寫？');error.conflict=true;fail(error);
                    } else {
                        const item=data[name]??entry({name,content});
                        if(event.target.result?.content!==content) {item.compiled=false;item.region=null;}
                        item.size=new TextEncoder().encode(content).length;data[name]=item;
                        files.put({name,content});done(name);
                    }
                };
            });
        }),
        delete_file:call(name => catalogOperation((tx,data,done,fail) => {
            name = filename(name);
            const files = tx.objectStore('files');
            files.get(name).onsuccess = event => {
                if (!event.target.result) {fail(new Error('找不到此文件。'));return;}
                tx.objectStore('trash').put({...event.target.result,id:crypto.randomUUID(),deletedAt:Date.now()});
                files.delete(name);delete data[name];done(null);
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
