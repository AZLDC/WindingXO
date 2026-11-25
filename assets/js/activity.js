'use strict';

/* 只處理App內輸入；不安裝系統鍵鼠監聽。 */
document.addEventListener('DOMContentLoaded', () => {
    const boot = location.pathname.endsWith('/Loading.html');
    const idleDelay = 5 * 60 * 1000;
    let lastInput = Date.now(), timer, blank = false, restarting = false;
    let lastMove = null, moved = 0, position = null, entered = false;
    let screen, previousFocus;

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
            if (event.type !== 'mousemove' || !changed || entered) return;
            const now = Date.now(), gap = lastMove === null ? null : now-lastMove;
            if (gap !== null && gap > 3000) moved = 0;
            // 稠密移動事件才累計；較長的事件空隙視為停頓，不算移動秒數。
            if (gap !== null && gap <= 250) moved += gap;
            lastMove = now;
            if (moved >= 5000) {
                entered = true;
                window.dispatchEvent(new Event('winding:boot-ready'));
            }
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
    if (!boot) armIdle();
    // 失去焦點不重置倒數；背景timer受節流時，回到App也立即補查。
    const checkIdle = () => { if (!boot && Date.now()-lastInput >= idleDelay) sleep(); };
    window.addEventListener('focus', checkIdle);
    document.addEventListener('visibilitychange', checkIdle);
});
