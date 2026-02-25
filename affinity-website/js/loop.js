const THREE = window.THREE;

let scene;
let camera;
let renderer;
let mainKnot;
let cageKnot;
let particles;
let particleGeometry;
let particleDirections;
let particleBaseRadius;
let bloomCanvas;
let bloomCtx;
let hostCanvas;
let pointLightA;
let pointLightB;
let ambientLight;
let directionalLight;
let initialized = false;

const PARTICLE_COUNT = 300;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function makeDirection() {
    let x = (Math.random() * 2) - 1;
    let y = (Math.random() * 2) - 1;
    let z = (Math.random() * 2) - 1;
    const length = Math.hypot(x, y, z) || 1;
    x /= length;
    y /= length;
    z /= length;
    return [x, y, z];
}

function createRoundParticleTexture() {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 64;
    textureCanvas.height = 64;
    const ctx = textureCanvas.getContext('2d');

    ctx.clearRect(0, 0, 64, 64);
    ctx.beginPath();
    ctx.arc(32, 32, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.needsUpdate = true;
    return texture;
}

function setupBloomCanvas() {
    if (!hostCanvas || !hostCanvas.parentElement) {
        return;
    }

    bloomCanvas = document.createElement('canvas');
    bloomCanvas.className = 'loop-canvas loop-canvas--bloom';
    hostCanvas.parentElement.insertBefore(bloomCanvas, hostCanvas);
    bloomCtx = bloomCanvas.getContext('2d');
}

function handleResize() {
    if (!renderer || !camera || !hostCanvas) {
        return;
    }

    const width = Math.max(hostCanvas.clientWidth || window.innerWidth, 1);
    const height = Math.max(hostCanvas.clientHeight || window.innerHeight, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    if (bloomCanvas) {
        bloomCanvas.width = Math.floor(width * dpr);
        bloomCanvas.height = Math.floor(height * dpr);
        bloomCanvas.style.width = width + 'px';
        bloomCanvas.style.height = height + 'px';
    }
}

function copyFrameToBloom() {
    if (!bloomCtx || !bloomCanvas || !renderer) {
        return;
    }

    bloomCtx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
    bloomCtx.drawImage(renderer.domElement, 0, 0, bloomCanvas.width, bloomCanvas.height);
}

function initParticles() {
    particleGeometry = new THREE.BufferGeometry();
    particleDirections = new Float32Array(PARTICLE_COUNT * 3);
    particleBaseRadius = new Float32Array(PARTICLE_COUNT);
    const positions = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const i3 = i * 3;
        const direction = makeDirection();
        const r = Math.cbrt(Math.random()) * 6;

        particleDirections[i3] = direction[0];
        particleDirections[i3 + 1] = direction[1];
        particleDirections[i3 + 2] = direction[2];
        particleBaseRadius[i] = r;

        positions[i3] = direction[0] * r;
        positions[i3 + 1] = direction[1] * r;
        positions[i3 + 2] = direction[2] * r;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const particleMaterial = new THREE.PointsMaterial({
        color: 0xff6633,
        size: 0.02,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        map: createRoundParticleTexture(),
        alphaTest: 0.35,
        blending: THREE.AdditiveBlending
    });

    particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
}

function setupLights() {
    pointLightA = new THREE.PointLight(0xff2200, 3, 8);
    pointLightA.position.set(3, 3, 3);
    scene.add(pointLightA);

    pointLightB = new THREE.PointLight(0x8b0000, 2, 6);
    pointLightB.position.set(-3, -2, 2);
    scene.add(pointLightB);

    ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xff4400, 1.5);
    directionalLight.position.set(0, 5, 5);
    scene.add(directionalLight);
}

export function initLoop(canvas) {
    if (!canvas || initialized) {
        return;
    }

    if (!THREE) {
        console.error('Three.js r128 CDN not loaded.');
        return;
    }

    hostCanvas = canvas;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
    camera.position.z = 4;

    renderer = new THREE.WebGLRenderer({
        canvas: hostCanvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });

    setupBloomCanvas();
    setupLights();

    const mainGeometry = new THREE.TorusKnotGeometry(1, 0.35, 220, 42, 2, 3);
    const mainMaterial = new THREE.MeshPhongMaterial({
        color: '#1a0000',
        emissive: '#8b0000',
        emissiveIntensity: 0.8,
        wireframe: false,
        shininess: 140,
        specular: '#ff2200'
    });

    mainKnot = new THREE.Mesh(mainGeometry, mainMaterial);
    scene.add(mainKnot);

    const cageGeometry = new THREE.TorusKnotGeometry(1.08, 0.33, 220, 42, 3, 2);
    const cageMaterial = new THREE.MeshBasicMaterial({
        color: '#cc2200',
        opacity: 0.15,
        transparent: true,
        wireframe: true
    });

    cageKnot = new THREE.Mesh(cageGeometry, cageMaterial);
    scene.add(cageKnot);

    initParticles();
    handleResize();

    window.addEventListener('resize', handleResize);
    initialized = true;
}

export function updateLoop(scrollProgress) {
    if (!initialized || !renderer || !mainKnot || !cageKnot || !particleGeometry || !particles) {
        return;
    }

    const progress = clamp(scrollProgress, 0, 1);

    mainKnot.rotation.x = progress * Math.PI * 2;
    mainKnot.rotation.y = progress * Math.PI * 2 * 0.7;

    cageKnot.rotation.x = mainKnot.rotation.x * 0.94;
    cageKnot.rotation.y = mainKnot.rotation.y * 1.08;

    particles.rotation.x = mainKnot.rotation.x * 0.3;
    particles.rotation.y = mainKnot.rotation.y * 0.3;

    const positions = particleGeometry.attributes.position.array;
    const expansion = 1 + (progress * 0.9);

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const i3 = i * 3;
        const radius = particleBaseRadius[i] * expansion;

        positions[i3] = particleDirections[i3] * radius;
        positions[i3 + 1] = particleDirections[i3 + 1] * radius;
        positions[i3 + 2] = particleDirections[i3 + 2] * radius;
    }

    particleGeometry.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
    copyFrameToBloom();
}
