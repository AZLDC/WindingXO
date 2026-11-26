'use strict';

/* 只處理App內輸入；不安裝系統鍵鼠監聽。 */
document.addEventListener('DOMContentLoaded', () => {
    const boot = location.pathname.endsWith('/Loading.html');
    const touchBootDelay = 5000, mouseBootDelay = 2000;
    const idleDelay = 5 * 60 * 1000;
    let lastInput = Date.now(), timer, blank = false, restarting = false;
    let lastMove = null, moved = 0, position = null, entered = false;
    let screen, previousFocus;
    let hold = null;
    let moveTimer, bootFocused = true;

    function resetMovement() {
        clearTimeout(moveTimer);
        lastMove = null; moved = 0; position = null;
    }

    function cancelHold() {
        if (hold) clearInterval(hold.timer);
        hold = null;
    }

    function finishBoot() {
        if (entered) return;
        entered = true;
        cancelHold();
        resetMovement();
        window.dispatchEvent(new Event('winding:boot-finishing'));
    }

    function blackBackground(x, y) {
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
        // 標誌文字不接收pointer事件，須用座標排除，不能依event.target判斷。
        const blocked = [...document.querySelectorAll('.logo,.logo .xo,.logo .brand,.progress,#missingLogin')].some(element => {
            const r = element.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        });
        if (blocked) return false;
        if (window.isWindingBootBackground) return window.isWindingBootBackground(x, y);
        return Boolean(document.elementFromPoint(x, y));
    }

    function checkHold() {
        if (!hold) return;
        if (!blackBackground(hold.x, hold.y)) { hold.started = null; return; }
        if (hold.started === null) hold.started = Date.now();
        if (Date.now() - hold.started >= touchBootDelay) finishBoot();
    }

    function startHold(id, x, y) {
        if (entered || hold || !bootFocused || document.hidden) return false;
        resetMovement();
        hold = {id, x, y, started:blackBackground(x,y)?Date.now():null, timer:setInterval(checkHold, 50)};
        return true;
    }

    function moveHold(id, x, y) {
        if (hold?.id !== id) return;
        hold.x = x; hold.y = y;
        checkHold();
    }

    function armIdle() {
        clearTimeout(timer);
        timer = setTimeout(sleep, Math.max(0, idleDelay - (Date.now() - lastInput)));
    }

    function sleep() {
        if (blank) return;
        if (Date.now() - lastInput < idleDelay) { armIdle(); return; }
        blank = true;
        previousFocus = document.activeElement;
        screen = document.createElement('div');
        screen.id = 'idleScreen';
        screen.tabIndex = -1;
        screen.setAttribute('role', 'dialog');
        screen.setAttribute('aria-modal', 'true');
        screen.setAttribute('aria-label', '閒置黑屏');
        document.body.append(screen);
        for (const child of document.body.children) {
            if (child !== screen && !child.inert) {
                child.inert = true;
                child.dataset.idleInert = 'true';
            }
        }
        screen.focus();
        window.dispatchEvent(new Event('winding:idle'));
    }

    async function wake() {
        if (restarting) return;
        restarting = true;
        const restart = new Event('winding:restart', {cancelable:true});
        const operations=[];
        restart.waitUntil = promise => operations.push(Promise.resolve(promise));
        const accepted=window.dispatchEvent(restart);
        let failed=!accepted;
        try {await Promise.all(operations);} catch (_) {failed=true;}
        if (failed) {
            screen.remove();
            document.querySelectorAll('[data-idle-inert]').forEach(child => {
                child.inert = false;
                delete child.dataset.idleInert;
            });
            blank = false; restarting = false; lastInput = Date.now();
            previousFocus?.focus();
            window.dispatchEvent(new Event('winding:resume'));
            armIdle();
            return;
        }
        location.replace(new URL('./Loading.html', location.href).href);
    }

    function input(event) {
        let changed = true;
        if (event.type === 'mousemove') {
            const next = [event.clientX,event.clientY];
            changed = !position || next.some((value,i) => value !== position[i]);
            position = next;
        }
        if (boot) {
            if (event.type !== 'mousemove' || !changed || entered || hold || !bootFocused || document.hidden) return;
            const now = Date.now(), gap = lastMove === null ? null : now-lastMove;
            if (gap !== null && gap >= 250) moved = 0;
            if (gap !== null && gap < 250) moved += gap;
            lastMove = now;
            clearTimeout(moveTimer);
            moveTimer = setTimeout(resetMovement, 250);
            if (moved >= mouseBootDelay) finishBoot();
            return;
        }
        if (!changed) return;
        if (!blank && Date.now()-lastInput >= idleDelay) sleep();
        if (blank) {
            event.preventDefault();
            event.stopImmediatePropagation();
            wake();
            return;
        }
        lastInput = Date.now();
        armIdle();
    }

    for (const type of ['mousemove','pointerdown','mousedown','mouseup','pointerup','click','dblclick','contextmenu','keydown','keyup','wheel']) {
        window.addEventListener(type, input, {capture:true,passive:false});
    }
    if (boot) {
        if (window.PointerEvent) {
            window.addEventListener('pointerdown', event => {
                if (event.pointerType !== 'touch') return;
                if (!event.isPrimary) { cancelHold(); return; }
                if (startHold(event.pointerId,event.clientX,event.clientY)) event.preventDefault();
            }, {capture:true,passive:false});
            window.addEventListener('pointermove', event => moveHold(event.pointerId,event.clientX,event.clientY), true);
            for (const type of ['pointerup','pointercancel','lostpointercapture']) {
                window.addEventListener(type, event => { if (hold?.id === event.pointerId) cancelHold(); }, true);
            }
        } else {
            window.addEventListener('touchstart', event => {
                if (event.touches.length !== 1) { cancelHold(); return; }
                const touch = event.touches[0];
                if (startHold(touch.identifier,touch.clientX,touch.clientY)) event.preventDefault();
            }, {capture:true,passive:false});
            window.addEventListener('touchmove', event => {
                const touch = [...event.touches].find(t => t.identifier === hold?.id);
                if (touch) { moveHold(touch.identifier,touch.clientX,touch.clientY); event.preventDefault(); }
            }, {capture:true,passive:false});
            for (const type of ['touchend','touchcancel']) window.addEventListener(type,cancelHold,true);
        }
        window.addEventListener('blur',()=>{ bootFocused=false; cancelHold(); resetMovement(); });
        window.addEventListener('focus',()=>{ bootFocused=true; });
        document.addEventListener('visibilitychange',()=>{ if (document.hidden) { cancelHold(); resetMovement(); } });
    }
    if (!boot) armIdle();
    // 失去焦點不重置倒數；背景timer受節流時，回到App也立即補查。
    const checkIdle = () => { if (!boot && Date.now()-lastInput >= idleDelay) sleep(); };
    window.addEventListener('focus', checkIdle);
    document.addEventListener('visibilitychange', checkIdle);
});
