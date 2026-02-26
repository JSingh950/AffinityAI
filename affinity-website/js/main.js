import { initLoop, updateLoop } from './loop.js';
import { glitchText, animateCounter, revealLine, cursorFollow, initScrollReveal } from './animations.js';

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function panelVisibility(progress, start, end) {
    const buffer = 0.05;
    const left = start - buffer;
    const right = end + buffer;

    // For the first panel (Affinity AI hero), keep it fully visible
    // across its entire eased range so the main hero text can be
    // completely in before any fade-out begins.
    if (start === 0 && progress <= right) {
        return { opacity: 1, translateY: 0 };
    }

    if (progress <= left || progress >= right) {
        return { opacity: 0, translateY: 30 };
    }

    if (progress >= (start + buffer) && progress <= (end - buffer)) {
        return { opacity: 1, translateY: 0 };
    }

    if (progress < (start + buffer)) {
        const t = clamp((progress - left) / ((start + buffer) - left), 0, 1);
        return {
            opacity: t,
            translateY: 30 - (30 * t)
        };
    }

    const t = clamp((progress - (end - buffer)) / (right - (end - buffer)), 0, 1);
    return {
        opacity: 1 - t,
        translateY: -30 * t
    };
}

function isInternalNavigation(link) {
    if (!link || !link.href) {
        return false;
    }

    if (link.target && link.target !== '_self') {
        return false;
    }

    if (link.hasAttribute('download')) {
        return false;
    }

    const url = new URL(link.href, window.location.href);

    if (url.origin !== window.location.origin) {
        return false;
    }

    if (url.pathname === window.location.pathname && url.hash) {
        return false;
    }

    return true;
}

function initMiniKnot() {
    const canvas = document.getElementById('mini-knot-canvas');
    if (!canvas || !window.THREE) {
        return function noop() {};
    }

    const THREE = window.THREE;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.z = 3.8;

    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true
    });

    function resize() {
        const width = Math.max(canvas.clientWidth || 300, 1);
        const height = Math.max(canvas.clientHeight || 300, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }

    const segs = 220;
    const sts = 28;
    const radius = 0.9;
    const halfWidth = 0.26;

    const vertexCount = (segs + 1) * (sts + 1);
    const positions = new Float32Array(vertexCount * 3);
    const indices = [];
    let index = 0;

    for (let i = 0; i <= segs; i += 1) {
        const u = (i / segs) * Math.PI * 2;
        const cosU = Math.cos(u);
        const sinU = Math.sin(u);
        const cosHalfU = Math.cos(u / 2);
        const sinHalfU = Math.sin(u / 2);

        for (let j = 0; j <= sts; j += 1) {
            const v = ((j / sts) - 0.5) * 2;
            const w = halfWidth * v;

            const x = (radius + w * cosHalfU) * cosU;
            const y = (radius + w * cosHalfU) * sinU;
            const z = w * sinHalfU;

            positions[index] = x;
            positions[index + 1] = y;
            positions[index + 2] = z;
            index += 3;
        }
    }

    for (let i = 0; i < segs; i += 1) {
        for (let j = 0; j < sts; j += 1) {
            const a = (i * (sts + 1)) + j;
            const b = ((i + 1) * (sts + 1)) + j;
            const c = ((i + 1) * (sts + 1)) + (j + 1);
            const d = (i * (sts + 1)) + (j + 1);

            indices.push(a, b, d);
            indices.push(b, c, d);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        color: '#2a0000',
        roughness: 0.92,
        metalness: 0.0
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const lightA = new THREE.PointLight(0xff2200, 2.2, 8);
    lightA.position.set(2, 2, 2);
    scene.add(lightA);

    const lightB = new THREE.AmbientLight(0xffffff, 0.05);
    scene.add(lightB);

    resize();
    window.addEventListener('resize', resize);

    return function renderMini(progress) {
        mesh.rotation.x = progress * Math.PI * 2 * 0.16;
        mesh.rotation.y += 0.01;
        renderer.render(scene, camera);
    };
}

document.addEventListener('DOMContentLoaded', function () {
    const body = document.body;
    const canvas = document.getElementById('loop-canvas');
    const progressEl = document.getElementById('scroll-progress');
    const panels = Array.prototype.slice.call(document.querySelectorAll('[data-panel-index]'));
    const rules = Array.prototype.slice.call(document.querySelectorAll('.panel-rule'));
    const glitchTarget = document.querySelector('.glitch-target');
    const coverageCounter = document.getElementById('coverage-counter');
    const miniKnotRender = initMiniKnot();
    const heroIntro = document.querySelector('.hero-intro');
    const heroMainContent = document.querySelector('.hero-main-content');

    if (body) {
        body.classList.add('cursor-enhanced');
        window.requestAnimationFrame(function () {
            body.classList.add('page-ready');
        });
    }

    document.addEventListener('click', function (event) {
        const link = event.target.closest('a[href]');
        if (!link || !isInternalNavigation(link)) {
            return;
        }

        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }

        event.preventDefault();
        const nextUrl = link.href;
        body.classList.add('page-exit');
        window.setTimeout(function () {
            window.location.href = nextUrl;
        }, 400);
    });

    initLoop(canvas);
    cursorFollow();
    glitchText(glitchTarget);
    initScrollReveal();

    rules.forEach(function (rule) {
        revealLine(rule);
    });

    animateCounter(coverageCounter, 0, 72, 1600);

    const panelRanges = panels.map(function (_, index) {
        const size = 1 / 5;
        const start = index * size;
        const end = start + size;
        return { start: start, end: end };
    });

    function readScrollProgress() {
        const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 1);
        const raw = window.scrollY / maxScroll;
        return clamp(raw, 0, 1);
    }

    function updatePanels(progress) {
        const BLOCK_COUNT = 6; // 0: intro, 1: hero copy, 2-5: panels 1-4
        const heroProgress = clamp(progress * 4, 0, 1);

        function blockOpacity(blockIndex) {
            const step = 1 / BLOCK_COUNT;
            const center = (blockIndex + 0.5) * step;
            const halfWidth = step / 2;
            const dist = Math.abs(heroProgress - center);

            if (dist >= halfWidth) {
                return 0;
            }

            return 1 - (dist / halfWidth);
        }

        // Drive the hero intro and main hero copy from discrete, evenly
        // spaced blocks so each text state has a clear "hold" in the scroll.
        if (heroIntro && heroMainContent) {
            const introOpacity = blockOpacity(0);
            const mainOpacity = blockOpacity(1);

            heroIntro.style.opacity = introOpacity.toFixed(3);
            heroMainContent.style.opacity = mainOpacity.toFixed(3);
        }

        panels.forEach(function (panel, index) {
            // While within the hero sequence, keep the first panel's
            // container fully visible and drive subsequent panels from
            // the block timeline so they appear one at a time.
            if (heroProgress < 1 && index <= 4) {
                if (index === 0) {
                    panel.style.opacity = '1';
                    panel.style.transform = 'translate3d(-50%, -50%, 0)';
                    return;
                }

                const blockIndex = index + 1; // panel 1 -> block 2, etc.
                const opacity = blockOpacity(blockIndex);
                panel.style.opacity = opacity.toFixed(3);
                panel.style.transform = 'translate3d(-50%, -50%, 0)';
                return;
            }

            // After the hero sequence finishes, fall back to smooth
            // panel visibility for the remaining scroll.
            const range = panelRanges[index];
            const vis = panelVisibility(progress, range.start, range.end);
            panel.style.opacity = vis.opacity.toFixed(3);
            panel.style.transform = 'translate3d(-50%, calc(-50% + ' + vis.translateY.toFixed(2) + 'px), 0)';
        });
    }

    function updateProgressBar(progress) {
        if (!progressEl) {
            return;
        }
        progressEl.style.width = (progress * 100).toFixed(3) + '%';
    }

    function handleScroll() {
        const progress = readScrollProgress();
        updatePanels(progress);
        updateProgressBar(progress);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();

    function frame() {
        const progress = readScrollProgress();
        updateLoop(progress);
        miniKnotRender(progress);
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
});
