import { initLoop, updateLoop } from './loop.js';
import { glitchText, animateCounter, revealLine, cursorFollow, initScrollReveal } from './animations.js';

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function panelVisibility(progress, start, end) {
    const buffer = 0.05;
    const left = start - buffer;
    const right = end + buffer;

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

    const geometry = new THREE.TorusKnotGeometry(0.9, 0.28, 180, 32, 2, 3);
    const material = new THREE.MeshPhongMaterial({
        color: '#1a0000',
        emissive: '#8b0000',
        emissiveIntensity: 0.7,
        shininess: 120,
        specular: '#ff2200'
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
        panels.forEach(function (panel, index) {
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
