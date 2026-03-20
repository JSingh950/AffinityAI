function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function easeOutCubic(t) {
    const inv = 1 - t;
    return 1 - (inv * inv * inv);
}

let glitchStyleInjected = false;

function injectGlitchStyles() {
    if (glitchStyleInjected) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'affinity-glitch-style';
    style.textContent = `
@keyframes affinity-glitch-pulse {
    0% { transform: translate(0, 0); }
    20% { transform: translate(calc(var(--glitch-x, 0px) * -1), var(--glitch-y, 0px)); }
    40% { transform: translate(var(--glitch-x, 0px), calc(var(--glitch-y, 0px) * -1)); }
    60% { transform: translate(calc(var(--glitch-x, 0px) * -0.5), calc(var(--glitch-y, 0px) * -0.5)); }
    100% { transform: translate(0, 0); }
}
.affinity-glitch-active {
    animation: affinity-glitch-pulse 200ms steps(2, end) both;
    text-shadow:
        var(--glitch-rx, 0px) 0 0 rgba(159, 25, 25, 0.9),
        var(--glitch-cx, 0px) 0 0 rgba(198, 167, 94, 0.92);
}
`;
    document.head.appendChild(style);
    glitchStyleInjected = true;
}

export function glitchText(element) {
    if (!element) {
        return function noop() {};
    }

    injectGlitchStyles();

    function burst() {
        const x = ((Math.random() * 4) - 2).toFixed(2) + 'px';
        const y = ((Math.random() * 3) - 1.5).toFixed(2) + 'px';
        const rx = ((Math.random() * 3) - 1.5).toFixed(2) + 'px';
        const cx = ((Math.random() * 3) - 1.5).toFixed(2) + 'px';

        element.style.setProperty('--glitch-x', x);
        element.style.setProperty('--glitch-y', y);
        element.style.setProperty('--glitch-rx', rx);
        element.style.setProperty('--glitch-cx', cx);
        element.classList.add('affinity-glitch-active');

        window.setTimeout(function () {
            element.classList.remove('affinity-glitch-active');
        }, 200);
    }

    burst();
    const intervalId = window.setInterval(burst, 3000);

    return function stopGlitch() {
        window.clearInterval(intervalId);
        element.classList.remove('affinity-glitch-active');
    };
}

export function animateCounter(element, from, to, duration) {
    if (!element) {
        return function noop() {};
    }

    const startValue = Number(from);
    const endValue = Number(to);
    const runDuration = Math.max(Number(duration) || 0, 1);
    let rafId = 0;
    const start = performance.now();

    function frame(now) {
        const t = clamp((now - start) / runDuration, 0, 1);
        const eased = easeOutCubic(t);
        const value = Math.round(startValue + ((endValue - startValue) * eased));
        element.textContent = String(value);

        if (t < 1) {
            rafId = window.requestAnimationFrame(frame);
        }
    }

    rafId = window.requestAnimationFrame(frame);

    return function stopCounter() {
        if (rafId) {
            window.cancelAnimationFrame(rafId);
        }
    };
}

export function revealLine(element) {
    if (!element) {
        return function noop() {};
    }

    let rafId = 0;
    const duration = 600;
    const start = performance.now();

    element.style.transformOrigin = 'left center';
    element.style.transform = 'scaleX(0)';

    function frame(now) {
        const t = clamp((now - start) / duration, 0, 1);
        const eased = easeOutCubic(t);
        element.style.transform = 'scaleX(' + eased.toFixed(4) + ')';

        if (t < 1) {
            rafId = window.requestAnimationFrame(frame);
        }
    }

    rafId = window.requestAnimationFrame(frame);

    return function stopReveal() {
        if (rafId) {
            window.cancelAnimationFrame(rafId);
        }
    };
}

export function cursorFollow() {
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    document.body.appendChild(cursor);

    const state = {
        x: -100,
        y: -100,
        tx: -100,
        ty: -100,
        lastTime: performance.now()
    };

    let active = true;
    let rafId = 0;

    function onMove(event) {
        state.tx = event.clientX;
        state.ty = event.clientY;
    }

    function onLeave() {
        state.tx = -100;
        state.ty = -100;
    }

    function frame(now) {
        if (!active) {
            return;
        }

        const dt = Math.max(now - state.lastTime, 1);
        state.lastTime = now;

        const alpha = 1 - Math.exp(-dt / 80);
        state.x += (state.tx - state.x) * alpha;
        state.y += (state.ty - state.y) * alpha;

        cursor.style.transform = 'translate3d(' + (state.x - 6).toFixed(2) + 'px,' + (state.y - 6).toFixed(2) + 'px,0)';
        rafId = window.requestAnimationFrame(frame);
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', onLeave, { passive: true });
    rafId = window.requestAnimationFrame(frame);

    return function stopCursor() {
        active = false;
        if (rafId) {
            window.cancelAnimationFrame(rafId);
        }
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseleave', onLeave);
        if (cursor.parentElement) {
            cursor.parentElement.removeChild(cursor);
        }
    };
}

export function initScrollReveal() {
    const revealItems = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!revealItems.length) {
        return;
    }

    if (typeof IntersectionObserver === 'undefined') {
        revealItems.forEach(function (item) {
            item.classList.add('visible');
        });
        return;
    }

    const observer = new IntersectionObserver(function (entries, io) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) {
                return;
            }
            entry.target.classList.add('visible');
            io.unobserve(entry.target);
        });
    }, {
        threshold: 0.05
    });

    revealItems.forEach(function (item) {
        observer.observe(item);
    });
}
