(function(){
  'use strict';

  const appEl = document.getElementById('app');
  const overlayEl = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const statusEl = document.getElementById('status');

  if (!window.THREE) {
    if (statusEl) {
      statusEl.textContent = 'Three.js failed to load. Please ensure you are online and refresh the page.';
      statusEl.style.display = 'block';
    }
    if (startBtn) startBtn.disabled = true;
    return;
  }

  // Settings (declare early so renderer init can use them)
  const settings = {
    moveSpeed: 7.0,            // target speed (m/s)
    acceleration: 12.0,        // approach desired speed (1/s)
    damping: 6.0,              // velocity decay when no input (1/s)
airAcceleration: 4.0,      // slower acceleration while airborne (1/s)
airDamping: 1.5,           // less damping in air (1/s)
    mouseSensitivity: 0.0025,  // radians per pixel
    lookSmoothing: 18.0,       // higher = snappier look
    pitchLimit: Math.PI / 2 - 0.05,
    gravity: 26.0,             // m/s^2 downward (slightly stronger)
    jumpSpeed: 8.0,            // initial jump velocity
    sprintMultiplier: 2.5,     // sprint speed multiplier
sprintDoubleTapWindow: 350,// ms to detect double-tap (more forgiving)
    bobIntensity: 0.03,        // meters (vertical camera bob)
    bobFrequency: 10.0,        // Hz at base speed
    bounceRestitution: 0.65,   // how bouncy the landing is (0..1)
    bounceThreshold: 0.5,      // minimum downward speed to trigger a bounce (m/s)
    // Low-latency feel toggles
lowLatencyAim: true,       // apply aim instantly (no smoothing)
crispMovement: true,       // apply velocity instantly when input is pressed
    jumpBufferTime: 0.12,      // seconds to buffer a jump press before landing
forcePixelRatio1: false,   // start below native DPR to improve FPS
    // FOV feel
    baseFov: 75,               // default FOV
    sprintFov: 94,             // widened FOV while sprinting
    fovSmoothing: 8.0,         // easing toward target FOV (1/s)
    // Performance optimizations
reducedAnisotropy: 2,      // cap anisotropy for better GPU performance
    maxFrameTime: 0.033,       // cap delta time to ~30fps minimum
    // Dynamic resolution (adaptive pixel ratio)
    dynamicResolution: true,   // enable adaptive pixel ratio
minPixelRatio: 0.45,       // avoid going too blurry
maxPixelRatio: 1.0,        // allow native DPR when fast enough
    targetFPS: 60,             // aim for 60 FPS
resolutionAdjustStep: 0.06,// moderate steps for smoother quality ramp
    resolutionAdjustInterval: 0.25, // seconds between adjustments
// Q/E alternation sprint boost
qeBoostEnabled: true,
qeMaxMultiplier: 3.0,      // cap at 3x walking speed
qeWindowSec: 1.0,          // sliding window to measure cadence
qeTargetRate: 6.0,         // alternations per second to reach max boost
qeMinIntervalSec: 0.06,    // ignore faster than this (debounce)
qeMaxIntervalSec: 0.45,    // ignore slower than this (out of cadence)
// Terrain parameters
terrainSegments: 96,      // grid resolution of the terrain (reduced for perf)
terrainScale: 0.003,      // noise frequency (world units -> noise space)
terrainHeight: 18.0,      // max height variation (meters)
terrainOctaves: 5,
terrainPersistence: 0.5,
terrainLacunarity: 2.0,
terrainSeed: 4242,
treeCount: 120,           // number of trees to scatter (reduced for perf)
treeMaxTries: 2000,       // placement attempts to find stable ground
treeSlopeMaxY: 0.9        // require normal.y >= this (flatter ground)
  };

// Player collision size (horizontal cylinder radius)
// Used for tree collision push-out to prevent walking through trunks
settings.playerRadius = 0.35;

  // Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f16);
scene.fog = new THREE.Fog(0x0b0f16, 40, 180);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
// Pixel ratio can be reduced to improve FPS and reduce perceived input lag
// This is configurable via settings.forcePixelRatio1
// Initialize pixel ratio
let currentPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
if (settings.forcePixelRatio1) currentPixelRatio = 1; else currentPixelRatio *= 0.95; // start closer to native
currentPixelRatio = Math.max(settings.minPixelRatio || 0.5, Math.min(settings.maxPixelRatio || 1, currentPixelRatio));
renderer.setPixelRatio(currentPixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
appEl.appendChild(renderer.domElement);
// Make canvas focusable for pointer lock reliability
renderer.domElement.tabIndex = -1;
// Dynamic resolution state
let fpsAccumulator = 0;
let fpsFrames = 0;
let timeSinceAdjust = 0;

  // Camera + first-person rig (yaw -> pitch -> camera)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 180);
  const yaw = new THREE.Object3D();
  const pitch = new THREE.Object3D();
yaw.position.set(0, 1.6 + 0.001, 5); // start slightly above the ground
  yaw.add(pitch);
  pitch.add(camera);
  scene.add(yaw);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x224422, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 10, 2);
  scene.add(dir);

// Controls state
const keys = { w:false, a:false, s:false, d:false, space:false, shift:false };
let isLocked = false;
let yawAngle = 0;   // current yaw (radians)
let pitchAngle = 0; // current pitch (radians), clamped
let yawAngleTarget = 0;   // smoothed target yaw
let pitchAngleTarget = 0; // smoothed target pitch

// (settings already declared earlier)

// Reusable vectors for movement math (avoid allocations in animation loop)
const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();
const fwdVec = new THREE.Vector3();
const rightVec = new THREE.Vector3();
const desiredVel = new THREE.Vector3();
const velocity = new THREE.Vector3();
const tmpVec = new THREE.Vector3(); // additional temp vector for calculations
let sprinting = false;
// Robust double-tap W state (requires release between taps)
let wTapAwaiting = false;
let wFirstReleased = false;
let wLastTapTime = 0;
const sprintCooldown = 0.15; // seconds to suppress retrigger after sprint ends
let sprintCooldownTimer = 0;
// Q/E alternation boost state
let lastHandKey = '';
let lastHandTime = 0; // ms
// Ring buffer for Q/E alternation events to avoid shift() overhead
const qeBufSize = 256;
const qeTimes = new Float64Array(qeBufSize);
let qeHead = 0, qeTail = 0; // [tail, head)
let bobPhase = 0;
const cameraBaseY = 0; // local Y offset on pitch node
let jumpBuffer = 0;    // seconds of buffered jump input

// Helper: make a repeating checker texture for the ground
  function makeCheckerTexture({ size = 512, cells = 8, c1 = '#2f8f2f', c2 = '#3faa3f' } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cell = size / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const even = ((x + y) % 2) === 0;
        ctx.fillStyle = even ? c1 : c2;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // Optional: subtle grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i <= cells; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = Math.min(settings.reducedAnisotropy, renderer.capabilities.getMaxAnisotropy());
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }

  // Helper: make a procedural grass-like texture using simple Perlin-style fBm
  function makeGrassTexture({ size = 1024, scale = 8, octaves = 5, persistence = 0.5, lacunarity = 2.0, seed = 1337 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;

    // Seeded PRNG (Mulberry32)
    function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967295;}}
    const rand = mulberry32(seed >>> 0);

    // Build permutation for Perlin
    const p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i=0;i<256;i++) perm[i]=i;
    // Fisher-Yates shuffle with rand
    for (let i=255;i>0;i--){const j=(rand()* (i+1))|0; const tmp=perm[i]; perm[i]=perm[j]; perm[j]=tmp;}
    for (let i=0;i<512;i++) p[i]=perm[i & 255];

    function fade(t){return t*t*t*(t*(t*6-15)+10);} // 6t^5-15t^4+10t^3
    function lerp(a,b,t){return a+(b-a)*t;}
    function grad(hash,x,y){
      const h = hash & 3; // 4 gradients
      const u = h < 2 ? x : y;
      const v = h < 2 ? y : x;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2*v : 2*v);
    }
    function perlin2(x,y){
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = fade(xf), v = fade(yf);
      const aa = p[X + p[Y]], ab = p[X + p[Y+1]];
      const ba = p[X+1 + p[Y]], bb = p[X+1 + p[Y+1]];
      const x1 = lerp(grad(aa, xf,   yf),   grad(ba, xf-1, yf),   u);
      const x2 = lerp(grad(ab, xf,   yf-1), grad(bb, xf-1, yf-1), u);
      return lerp(x1, x2, v) * 0.5 + 0.5; // [0,1]
    }

    // Fractal Brownian Motion
    function fbm(x,y){
      let amp = 1.0;
      let freq = 1.0;
      let sum = 0.0;
      let norm = 0.0;
      for (let o=0;o<octaves;o++){
        sum += amp * perlin2(x*freq, y*freq);
        norm += amp;
        amp *= persistence;
        freq *= lacunarity;
      }
      return sum / norm; // [0,1]
    }

    // Generate pixels
    const base1 = [26, 94, 32];   // darker green
    const base2 = [38, 122, 44];  // lighter green
    const highlight = [78, 168, 80]; // highlights for brighter blades

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Two layers: main fBm and a very low-frequency variation for patches
        const nx = (x / size) * scale;
        const ny = (y / size) * scale;
        const v = fbm(nx, ny); // [0,1]
        const patch = fbm(nx * 0.15, ny * 0.15); // big patches

        // Blend base greens by v, then add subtle patch-based variation
        const t = v;
        let r = base1[0] + (base2[0] - base1[0]) * t;
        let g = base1[1] + (base2[1] - base1[1]) * t;
        let b = base1[2] + (base2[2] - base1[2]) * t;

        // Add highlights sparingly where noise is highest
        const h = Math.max(0, v - 0.75) / 0.25; // 0..1 when v in [0.75,1]
        r = r + (highlight[0] - r) * h * 0.6;
        g = g + (highlight[1] - g) * h * 0.6;
        b = b + (highlight[2] - b) * h * 0.6;

        // Patch tinting (slightly desaturate in patches)
        const patchAmt = (patch - 0.5) * 0.2; // -0.1..0.1
        r *= (1.0 - 0.06 + patchAmt);
        g *= (1.0 + 0.04 + patchAmt);
        b *= (1.0 - 0.06 + patchAmt);

        const idx = (y * size + x) * 4;
        data[idx + 0] = Math.max(0, Math.min(255, r));
        data[idx + 1] = Math.max(0, Math.min(255, g));
        data[idx + 2] = Math.max(0, Math.min(255, b));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = Math.min(settings.reducedAnisotropy, renderer.capabilities.getMaxAnisotropy());
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }

  // Terrain height function (Perlin fBm) separate from texture
  // Seeded PRNG (Mulberry32)
  function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967295;}}
  const terrainRand = mulberry32(settings.terrainSeed >>> 0);
  // Build permutation for Perlin
  const tPerm = new Uint8Array(512);
  const tBase = new Uint8Array(256);
  for (let i=0;i<256;i++) tBase[i]=i;
  for (let i=255;i>0;i--){const j=(terrainRand()* (i+1))|0; const tmp=tBase[i]; tBase[i]=tBase[j]; tBase[j]=tmp;}
  for (let i=0;i<512;i++) tPerm[i]=tBase[i & 255];
  function tfade(t){return t*t*t*(t*(t*6-15)+10);} // 6t^5-15t^4+10t^3
  function tgrad(hash,x,y){const h=hash&3;const u=h<2?x:y;const v=h<2?y:x;return ((h&1)?-u:u)+((h&2)?-2*v:2*v);}
  function tperlin2(x,y){const X=Math.floor(x)&255;const Y=Math.floor(y)&255;const xf=x-Math.floor(x);const yf=y-Math.floor(y);const u=tfade(xf),v=tfade(yf);const aa=tPerm[X+tPerm[Y]],ab=tPerm[X+tPerm[Y+1]];const ba=tPerm[X+1+tPerm[Y]],bb=tPerm[X+1+tPerm[Y+1]];const x1=THREE.MathUtils.lerp(tgrad(aa,xf,yf),tgrad(ba,xf-1,yf),u);const x2=THREE.MathUtils.lerp(tgrad(ab,xf,yf-1),tgrad(bb,xf-1,yf-1),u);return THREE.MathUtils.lerp(x1,x2,v)*0.5+0.5;}
  function tfbm(x,y){let amp=1.0,freq=1.0,sum=0.0,norm=0.0;for(let o=0;o<(settings.terrainOctaves||5);o++){sum+=amp*tperlin2(x*freq,y*freq);norm+=amp;amp*=(settings.terrainPersistence||0.5);freq*=(settings.terrainLacunarity||2.0);}return sum/norm;}
  function terrainHeightAt(x,z){ const s=settings.terrainScale||0.003; const h=settings.terrainHeight||18.0; return (tfbm(x*s,z*s)-0.5)*2*h; }
  function terrainNormalAt(x,z){ const e=1.0; const hL=terrainHeightAt(x-e,z), hR=terrainHeightAt(x+e,z), hD=terrainHeightAt(x,z-e), hU=terrainHeightAt(x,z+e); const n = new THREE.Vector3(hL-hR, 2*e, hD-hU); n.normalize(); return n; }

  // Cache terrain height queries at integer meters to reduce noise evals
  const heightCache = new Map();
  function terrainHeightCached(x,z){
    const xi = Math.round(x), zi = Math.round(z);
    const key = xi + ',' + zi;
    const hit = heightCache.get(key);
    if (hit !== undefined) return hit;
    const val = terrainHeightAt(xi, zi);
    if (heightCache.size > 2048) { heightCache.clear(); }
    heightCache.set(key, val);
    return val;
  }

  // Procedural terrain mesh
  const groundSize = 1000;
  const segments = settings.terrainSegments || 128;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, segments, segments);
  groundGeo.rotateX(-Math.PI / 2);
  const posAttr = groundGeo.getAttribute('position');
  for (let i=0;i<posAttr.count;i++){
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = terrainHeightAt(x, z);
    posAttr.setY(i, y);
  }
  posAttr.needsUpdate = true;
  groundGeo.computeVertexNormals();

const groundTex = makeGrassTexture({ size: 256, scale: 6, octaves: 5, persistence: 0.5, lacunarity: 2.0, seed: 1337 });
  const tiles = groundSize / 10; // number of repeats across the ground
  groundTex.repeat.set(tiles, tiles);
const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = false;
  scene.add(ground);

  // Tree trunk colliders for simple cylindrical collisions
  const treeColliders = [];

      // Bark texture generator: subtle vertical lines to suggest bark
      function makeBarkTexture(opts={}){
        const w = opts.w || 64, h = opts.h || 256;
        const base = opts.base || '#8B4513';
        const dark = opts.dark || '#6f3612';
        const light = opts.light || '#A0522D';
        const lines = opts.lines || 18;
        let s = (opts.seed == null ? 1234 : opts.seed) | 0; // mutable seed
        function rnd() {
          // LCG PRNG for stable, fast pseudo-randoms
          s = (s * 1664525 + 1013904223) >>> 0;
          return s / 4294967296;
        }
        const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d');
        // base fill
        ctx.fillStyle = base; ctx.fillRect(0,0,w,h);
        // subtle vertical lines
        for (let i=0;i<lines;i++){
          const x = Math.floor(rnd()*w);
          const width = 1 + Math.floor(rnd()*1);
          ctx.globalAlpha = 0.15 + rnd()*0.15;
          ctx.fillStyle = dark;
          ctx.fillRect(x, 0, width, h);
        }
        // light streaks
        for (let i=0;i<Math.floor(lines*0.5);i++){
          const x = Math.floor(rnd()*w);
          ctx.globalAlpha = 0.08 + rnd()*0.08;
          ctx.fillStyle = light;
          ctx.fillRect(x, 0, 1, h);
        }
        ctx.globalAlpha = 1;
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = settings.reducedAnisotropy ? 2 : 4;
        tex.needsUpdate = true;
        return tex;
      }

      // Instanced trees with trunks, branches, roots, cloud-like leaves, and occasional swings
      (function addTrees(){
        const count = settings.treeCount || 120;
        const tries = settings.treeMaxTries || 2000;
        const minX = -groundSize*0.49, maxX = groundSize*0.49;
        const minZ = -groundSize*0.49, maxZ = groundSize*0.49;

        // Geometries
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.32, 1, 10);
  const branchGeo = new THREE.CylinderGeometry(0.03, 0.1, 1, 8);
  const rootGeo = new THREE.CylinderGeometry(0.008, 0.06, 0.5, 6);
  const leafGeo = new THREE.IcosahedronGeometry(1.2, 1);
  const leafHiGeo = new THREE.IcosahedronGeometry(0.8, 1);

        // Materials
        const barkTex = makeBarkTexture({ seed: 5678 });
        barkTex.repeat.set(1, 4);
        const trunkMat = new THREE.MeshLambertMaterial({ map: barkTex });
        const branchMat = new THREE.MeshLambertMaterial({ color: 0xA0522D });
        const rootMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const leavesMat = new THREE.MeshLambertMaterial({ color: 0x228B22, flatShading: true });
        const leavesHiMat = new THREE.MeshLambertMaterial({ color: 0x42d66a, flatShading: true });
        const ropeMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
        const seatMat = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });
  const ropeGeo = new THREE.CylinderGeometry(0.01, 0.01, 1.2, 6);
  const seatGeo = new THREE.BoxGeometry(0.7, 0.06, 0.32);

        // Accumulators of transforms
        const trunkMs = [], branchMs = [], rootMs = [], leafMs = [], leafHiMs = [], ropeMs = [], seatMs = [];
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const v = new THREE.Vector3();

        let placed = 0, attempts = 0;
        while (placed < count && attempts < tries) {
          attempts++;
          const x = THREE.MathUtils.lerp(minX, maxX, Math.random());
          const z = THREE.MathUtils.lerp(minZ, maxZ, Math.random());
          const y = terrainHeightAt(x,z);
          const n = terrainNormalAt(x,z);
          if (n.y < (settings.treeSlopeMaxY || 0.9)) continue; // too steep

          // Trunk params
          const trunkH = THREE.MathUtils.lerp(4.0, 6.8, Math.random());
          const trunkRBot = THREE.MathUtils.lerp(0.28, 0.4, Math.random());
          const trunkRTop = THREE.MathUtils.lerp(0.12, 0.2, Math.random());
          const yaw = Math.random()*Math.PI*2;

          // Trunk matrix (note: base trunkGeo radii are 0.12 top, 0.32 bottom)
          m.makeRotationY(yaw);
          m.multiply(new THREE.Matrix4().makeScale(trunkRTop/0.12, trunkH, trunkRBot/0.32));
          m.setPosition(x, y + trunkH*0.5, z);
          trunkMs.push(m.clone());
          // Add a cylindrical collider centered at trunk base (XZ)
          treeColliders.push({ x, z, r: trunkRBot * 1.05 });

          // Roots (3-4 small flares)
          const rootCount = 4 + Math.floor(Math.random()*2);
          for (let r=0; r<rootCount; r++){
            const ang = yaw + r*(Math.PI*2/rootCount) + Math.random()*0.5;
            const tilt = 0.8 + Math.random()*0.2; // lean outward
            const rx = Math.sin(ang)*0.3, rz = Math.cos(ang)*0.3;
            q.setFromEuler(new THREE.Euler(-Math.cos(ang)*0.35*tilt, ang, Math.sin(ang)*0.35*tilt));
            v.set(x + rx, y + 0.03, z + rz);
            m.compose(v, q, new THREE.Vector3(1, 1, 1));
            rootMs.push(m.clone());
          }

          // Branches (2-3 large near top, angled upward/outward)
          const branchNum = 2 + Math.floor(Math.random()*2);
          const branchLen = THREE.MathUtils.lerp(0.9, 1.4, Math.random());
          const baseY = y + trunkH * THREE.MathUtils.lerp(0.75, 0.9, Math.random());
          const branchDirs = [];
          for (let b=0; b<branchNum; b++){
            const byaw = yaw + (b===0?0: (b===1?Math.PI*0.6: -Math.PI*0.6)) + (Math.random()-0.5)*0.5;
            const tilt = THREE.MathUtils.degToRad(25 + Math.random()*20);
            // Build rotation
            q.setFromEuler(new THREE.Euler(tilt, byaw, 0));
            // Scale: Y is length
            const scale = new THREE.Vector3(1, branchLen, 1);
            // Position: near trunk top plus offset along branch direction half-length
            const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(q); // up in branch local becomes world dir
            const pos = new THREE.Vector3(x, baseY, z).addScaledVector(dir, (branchLen*0.5));
            m.compose(pos, q, scale);
            branchMs.push(m.clone());
            branchDirs.push({ pos: new THREE.Vector3(x, baseY, z), dir: dir.clone(), len: branchLen });
          }

          // Leaf canopy: clusters around top and branch tips
          const canopyCenter = new THREE.Vector3(x, y + trunkH*1.05, z);
          const clusterCount = 5 + Math.floor(Math.random()*2); // 5-6 clusters (more mass)
          for (let cIdx=0; cIdx<clusterCount; cIdx++){
            // Choose a base position: either around canopy center or near a branch tip
            let center;
            if (branchDirs.length && Math.random() < 0.6){
              const bd = branchDirs[Math.floor(Math.random()*branchDirs.length)];
              center = bd.pos.clone().addScaledVector(bd.dir, bd.len*0.9 + Math.random()*0.2);
            } else {
              const offAng = Math.random()*Math.PI*2;
              const offRad = THREE.MathUtils.lerp(0.4, 1.2, Math.random());
              center = canopyCenter.clone().add(new THREE.Vector3(Math.cos(offAng)*offRad, THREE.MathUtils.lerp(0.1, 0.5, Math.random()), Math.sin(offAng)*offRad));
            }
            const scale = THREE.MathUtils.lerp(1.6, 2.5, Math.random());
            q.set(0,0,0,1);
            m.compose(center, q, new THREE.Vector3(scale, scale, scale));
            leafMs.push(m.clone());
            // 40% chance to add a smaller highlight cluster slightly above
            if (Math.random() < 0.4){
              const hCenter = center.clone().add(new THREE.Vector3(0, 0.3 + Math.random()*0.2, 0));
              const hScale = scale * THREE.MathUtils.lerp(0.6, 0.9, Math.random());
              m.compose(hCenter, q, new THREE.Vector3(hScale, hScale, hScale));
              leafHiMs.push(m.clone());
            }
          }

          // Optional swing on ~12% of trees: attach under first branch or canopy center
          if (Math.random() < 0.12){
            const pivot = (branchDirs[0]) ? branchDirs[0].pos.clone().addScaledVector(branchDirs[0].dir, branchDirs[0].len) : canopyCenter.clone();
            // Two ropes spaced sideways
            const side = new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
            const ropeOff = 0.3;
            const ropeLen = 1.2;
            const ropeTopLeft = pivot.clone().addScaledVector(side, -ropeOff);
            const ropeTopRight = pivot.clone().addScaledVector(side, ropeOff);
            q.setFromEuler(new THREE.Euler(0, 0, 0));
            // Left rope
            m.compose(ropeTopLeft.clone().add(new THREE.Vector3(0,-ropeLen*0.5,0)), q, new THREE.Vector3(1, ropeLen, 1));
            ropeMs.push(m.clone());
            // Right rope
            m.compose(ropeTopRight.clone().add(new THREE.Vector3(0,-ropeLen*0.5,0)), q, new THREE.Vector3(1, ropeLen, 1));
            ropeMs.push(m.clone());
            // Seat
            const seatPos = pivot.clone().add(new THREE.Vector3(0,-ropeLen,0));
            m.compose(seatPos, q, new THREE.Vector3(1,1,1));
            seatMs.push(m.clone());
          }

          placed++;
        }

        // Create and fill instanced meshes
        if (trunkMs.length){
          const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trunkMs.length);
          for (let i=0;i<trunkMs.length;i++) trunks.setMatrixAt(i, trunkMs[i]);
          trunks.instanceMatrix.needsUpdate = true;
          scene.add(trunks);
        }
        if (branchMs.length){
          const branches = new THREE.InstancedMesh(branchGeo, branchMat, branchMs.length);
          for (let i=0;i<branchMs.length;i++) branches.setMatrixAt(i, branchMs[i]);
          branches.instanceMatrix.needsUpdate = true;
          scene.add(branches);
        }
        if (rootMs.length){
          const roots = new THREE.InstancedMesh(rootGeo, rootMat, rootMs.length);
          for (let i=0;i<rootMs.length;i++) roots.setMatrixAt(i, rootMs[i]);
          roots.instanceMatrix.needsUpdate = true;
          scene.add(roots);
        }
        if (leafMs.length){
          const leaves = new THREE.InstancedMesh(leafGeo, leavesMat, leafMs.length);
          for (let i=0;i<leafMs.length;i++) leaves.setMatrixAt(i, leafMs[i]);
          leaves.instanceMatrix.needsUpdate = true;
          scene.add(leaves);
        }
        if (leafHiMs.length){
          const leavesHi = new THREE.InstancedMesh(leafHiGeo, leavesHiMat, leafHiMs.length);
          for (let i=0;i<leafHiMs.length;i++) leavesHi.setMatrixAt(i, leafHiMs[i]);
          leavesHi.instanceMatrix.needsUpdate = true;
          scene.add(leavesHi);
        }
        if (ropeMs.length){
          const ropes = new THREE.InstancedMesh(ropeGeo, ropeMat, ropeMs.length);
          for (let i=0;i<ropeMs.length;i++) ropes.setMatrixAt(i, ropeMs[i]);
          ropes.instanceMatrix.needsUpdate = true;
          scene.add(ropes);
        }
        if (seatMs.length){
          const seats = new THREE.InstancedMesh(seatGeo, seatMat, seatMs.length);
          for (let i=0;i<seatMs.length;i++) seats.setMatrixAt(i, seatMs[i]);
          seats.instanceMatrix.needsUpdate = true;
          scene.add(seats);
        }
      })();

// Simple first-person hands (box placeholders)
const hands = {
left: {
  mesh: null,
  basePos: new THREE.Vector3(-0.25, -0.2, -0.5),
  targetPos: new THREE.Vector3(-0.4, -0.1, -0.2),
  state: 'idle', // idle|extending|hold|retracting
  timer: 0,
  baseQ: null,
  targetQ: null,
},
right: {
  mesh: null,
  basePos: new THREE.Vector3(0.25, -0.2, -0.5),
  targetPos: new THREE.Vector3(0.4, -0.1, -0.2),
  state: 'idle',
  timer: 0,
  baseQ: null,
  targetQ: null,
},
};

// Apply initial pixel ratio preference now that settings exists
if (settings.forcePixelRatio1) {
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
}
// Initialize camera FOV from settings
camera.fov = settings.baseFov;
camera.updateProjectionMatrix();
(function createHands(){
const geo = new THREE.BoxGeometry(0.16, 0.1, 0.25);
const matL = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
const matR = new THREE.MeshLambertMaterial({ color: 0xcbd5e1 });
hands.left.mesh = new THREE.Mesh(geo, matL);
hands.right.mesh = new THREE.Mesh(geo, matR);
hands.left.mesh.castShadow = false; hands.right.mesh.castShadow = false;
pitch.add(hands.left.mesh); pitch.add(hands.right.mesh);
hands.left.mesh.position.copy(hands.left.basePos);
hands.right.mesh.position.copy(hands.right.basePos);
// Initial rotations and visibility (hidden until used)
const baseRotL = new THREE.Euler(0, 0.15, 0);
const baseRotR = new THREE.Euler(0, -0.15, 0);
const grabRotL = new THREE.Euler(-0.6, 0.25, 0);
const grabRotR = new THREE.Euler(-0.6, -0.25, 0);
hands.left.baseQ = new THREE.Quaternion().setFromEuler(baseRotL);
hands.right.baseQ = new THREE.Quaternion().setFromEuler(baseRotR);
hands.left.targetQ = new THREE.Quaternion().setFromEuler(grabRotL);
hands.right.targetQ = new THREE.Quaternion().setFromEuler(grabRotR);
hands.left.mesh.quaternion.copy(hands.left.baseQ);
hands.right.mesh.quaternion.copy(hands.right.baseQ);
hands.left.mesh.visible = false;
hands.right.mesh.visible = false;
})();

  // Pointer lock handlers
  function lockPointer() {
    const el = renderer.domElement;
    console.log('Attempting pointer lock...');

    // Focusing the canvas can improve pointer lock reliability
    try {
      el.focus();
      console.log('Canvas focused');
    } catch (e) {
      console.log('Focus failed:', e);
    }

    if (el.requestPointerLock) {
      console.log('Requesting pointer lock...');
      el.requestPointerLock();
    } else {
      console.log('Pointer lock not supported');
      statusEl.textContent = 'Pointer lock not supported in this browser.';
      statusEl.style.display = 'block';
    }
  }
  function onPointerLockChange() {
    const el = document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement;
    isLocked = (el === renderer.domElement);
    console.log('Pointer lock change:', isLocked ? 'LOCKED' : 'UNLOCKED');
    overlayEl.classList.toggle('hidden', isLocked);

    if (isLocked) {
      console.log('Successfully entered pointer lock mode');
    } else {
      console.log('Exited pointer lock mode');
    }
  }
  function onPointerLockError() {
    console.log('Pointer lock error occurred');
    if (statusEl) {
      statusEl.textContent = 'Pointer lock failed. Try clicking directly on the canvas area, then click Start again.';
      statusEl.style.display = 'block';
    }
  }

  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mozpointerlockchange', onPointerLockChange);
  document.addEventListener('webkitpointerlockchange', onPointerLockChange);
  document.addEventListener('pointerlockerror', onPointerLockError);

  startBtn.addEventListener('click', () => {
    console.log('Start button clicked!');
    if (statusEl) {
      statusEl.style.display = 'none';
      statusEl.textContent = '';
    }

    // Add user activation requirement for some browsers
    if (document.body.requestFullscreen) {
      document.body.requestFullscreen().catch(() => {
        console.log('Fullscreen failed, proceeding with pointer lock only');
      });
    }

    // Small delay to ensure user gesture is processed
    setTimeout(() => {
      lockPointer();
    }, 100);
  });

  // Mouse look
  window.addEventListener('mousemove', (e) => {
    if (!isLocked) return;
    yawAngleTarget -= e.movementX * settings.mouseSensitivity;
    pitchAngleTarget -= e.movementY * settings.mouseSensitivity;
    if (pitchAngleTarget > settings.pitchLimit) pitchAngleTarget = settings.pitchLimit;
    if (pitchAngleTarget < -settings.pitchLimit) pitchAngleTarget = -settings.pitchLimit;
  });

  // Key handling
  window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w') {
      if (!e.repeat) { // ignore auto-repeat
        keys.w = true;
        const now = performance.now();
        // Double-tap detection with suppression window and release requirement
        if (sprintCooldownTimer <= 0) {
          if (wTapAwaiting && wFirstReleased && (now - wLastTapTime <= settings.sprintDoubleTapWindow)) {
            sprinting = true;
            wTapAwaiting = false;
            wFirstReleased = false;
          } else {
            wTapAwaiting = true;
            wFirstReleased = false;
            wLastTapTime = now;
          }
        }
      }
      }
      else if (k === 'a') keys.a = true;
      else if (k === 's') keys.s = true;
      else if (k === 'd') keys.d = true;
      else if (k === ' ') { keys.space = true; jumpBuffer = settings.jumpBufferTime; }
      else if (k === 'shift') { keys.shift = true; }
      else if (k === 'q') {
        triggerHand('left');
        // Track Q/E alternation cadence
        const nowMs = performance.now();
        const dtMs = nowMs - lastHandTime;
        // Only count alternation if switching from E to Q within allowed interval
        if (settings.qeBoostEnabled && (lastHandKey === 'e') && dtMs >= settings.qeMinIntervalSec*1000 && dtMs <= settings.qeMaxIntervalSec*1000) {
          qeTimes[qeHead] = nowMs; qeHead = (qeHead + 1) % qeBufSize; if (qeHead === qeTail) qeTail = (qeTail + 1) % qeBufSize;
        }
        lastHandKey = 'q';
        lastHandTime = nowMs;
      }
      else if (k === 'e') {
        triggerHand('right');
        const nowMs = performance.now();
        const dtMs = nowMs - lastHandTime;
        if (settings.qeBoostEnabled && (lastHandKey === 'q') && dtMs >= settings.qeMinIntervalSec*1000 && dtMs <= settings.qeMaxIntervalSec*1000) {
          qeTimes[qeHead] = nowMs; qeHead = (qeHead + 1) % qeBufSize; if (qeHead === qeTail) qeTail = (qeTail + 1) % qeBufSize;
        }
        lastHandKey = 'e';
        lastHandTime = nowMs;
      }
  });
  window.addEventListener('keyup', (e) => {
const k = e.key.toLowerCase();
if (k === 'w') {
keys.w = false;
if (sprinting) { sprintCooldownTimer = sprintCooldown; }
sprinting = false;
// Mark release of first tap to allow second tap recognition
if (wTapAwaiting) { wFirstReleased = true; }
// Clear QE cadence on stop
qeHead = qeTail;
lastHandKey = '';
}
    else if (k === 'a') keys.a = false;
    else if (k === 's') keys.s = false;
    else if (k === 'd') keys.d = false;
else if (k === ' ') keys.space = false;
else if (k === 'shift') keys.shift = false;
  });

  // Movement update
let last = performance.now();
let vy = 0; // vertical velocity
let grounded = true;
let canJump = true;     // jump cooldown: true only when allowed
let wasGrounded = true; // track landing transitions
// Speed meter HUD state
const speedEl = document.getElementById('speedMeter');
let hudAccum = 0;
const hudInterval = 0.1; // seconds, ~10 Hz updates

function animate(now) {
const dt = Math.min(settings.maxFrameTime, (now - last) / 1000);
last = now;
let jumpedThisFrame = false;

// Decay jump buffer
if (jumpBuffer > 0) jumpBuffer = Math.max(0, jumpBuffer - dt);  // Smooth or instant look towards target yaw/pitch
if (settings.lowLatencyAim) {
yawAngle = yawAngleTarget;
pitchAngle = pitchAngleTarget;
} else {
const lookAlpha = 1 - Math.exp(-settings.lookSmoothing * dt);
yawAngle += (yawAngleTarget - yawAngle) * lookAlpha;
pitchAngle += (pitchAngleTarget - pitchAngle) * lookAlpha;
}
yaw.rotation.y = yawAngle;
pitch.rotation.x = pitchAngle;

// Cheap path: when tab is hidden or not in control, skip heavy updates
if (document.hidden || !isLocked) {
renderer.render(scene, camera);
requestAnimationFrame(animate);
return;
}

    // Compute input
    let forward = 0, strafe = 0;
    if (keys.w) forward += 1;
    if (keys.s) forward -= 1;
    if (keys.d) strafe += 1;
    if (keys.a) strafe -= 1;
    // Normalize if diagonal
    if (forward !== 0 || strafe !== 0) {
      const length = Math.hypot(forward, strafe);
      forward /= length; strafe /= length;
    }

// Forward/right based on yaw heading (fast, avoids matrix ops)
fwdVec.set(-Math.sin(yawAngle), 0, -Math.cos(yawAngle));
    rightVec.crossVectors(fwdVec, UP).normalize(); // right = forward x up

    // Desired velocity from input with sprint and Q/E cadence boost
    let speedMul = ((keys.shift || sprinting) && keys.w) ? settings.sprintMultiplier : 1.0;
    // Q/E alternation cadence boost: active only while sprinting intent and moving forward
    if (settings.qeBoostEnabled && ((keys.shift || sprinting) && keys.w)) {
      const nowMs = performance.now();
      const windowMs = settings.qeWindowSec * 1000;
      // Drop old events from ring buffer
      while (qeTail !== qeHead && (nowMs - qeTimes[qeTail]) > windowMs) { qeTail = (qeTail + 1) % qeBufSize; }
      const alternations = (qeHead >= qeTail) ? (qeHead - qeTail) : (qeBufSize - (qeTail - qeHead));
      const rate = alternations / settings.qeWindowSec; // alternations per second
      const t = Math.max(0, Math.min(1, rate / settings.qeTargetRate));
      // Interpolate total multiplier between base sprint and max cap
      const baseMul = settings.sprintMultiplier;
      const targetMul = baseMul + (settings.qeMaxMultiplier - baseMul) * t; // base..max
      speedMul = Math.max(speedMul, targetMul);
    }
    desiredVel.set(0, 0, 0)
      .addScaledVector(fwdVec, forward * settings.moveSpeed * speedMul)
      .addScaledVector(rightVec, strafe * settings.moveSpeed * speedMul);

    // Smoothly approach desired velocity with ground/air separation
    if (desiredVel.lengthSq() > 0) {
      if (grounded && settings.crispMovement) {
        // Instant pickup on ground for snappy feel
        velocity.copy(desiredVel);
      } else {
        // Lerp toward desired velocity with separate gains for ground vs air
        const accel = grounded ? settings.acceleration : settings.airAcceleration;
        const accelAlpha = 1 - Math.exp(-(accel) * dt);
        velocity.x += (desiredVel.x - velocity.x) * accelAlpha;
        velocity.y += (desiredVel.y - velocity.y) * accelAlpha;
        velocity.z += (desiredVel.z - velocity.z) * accelAlpha;
      }
    } else {
      const damp = grounded ? settings.damping : settings.airDamping;
      const dampAlpha = 1 - Math.exp(-damp * dt);
      velocity.multiplyScalar(1 - dampAlpha);
      if (velocity.lengthSq() < 1e-6) velocity.set(0, 0, 0);
    }

    // Integrate horizontal position
    // Minor anti-drift: if airborne and very low horizontal speed with no input, damp extra
    if (!grounded && desiredVel.lengthSq() === 0 && velocity.lengthSq() < 1e-4) {
      velocity.set(0,0,0);
    }
    yaw.position.addScaledVector(velocity, dt);
    // Resolve collisions against tree trunks (cylindrical XZ)
    if (treeColliders.length) {
      const px = yaw.position.x, pz = yaw.position.z;
      const pr = settings.playerRadius;
      for (let i=0;i<treeColliders.length;i++){
        const c = treeColliders[i];
        const dx = px - c.x; const dz = pz - c.z;
        const minR = pr + c.r;
        const d2 = dx*dx + dz*dz;
        if (d2 < minR*minR) {
          const d = Math.sqrt(d2) || 0.0001;
          const nx = dx / d, nz = dz / d;
          const push = (minR - d);
          yaw.position.x += nx * push;
          yaw.position.z += nz * push;
          // Slide: remove velocity component into the normal
          const vn = velocity.x*nx + velocity.z*nz;
          if (vn < 0) {
            velocity.x -= vn * nx;
            velocity.z -= vn * nz;
          }
        }
      }
    }

    // Vertical physics (gravity + jump)
// Terrain collision: desired ground Y is terrain height at (x,z) + eye height offset
const terrainY = terrainHeightCached(yaw.position.x, yaw.position.z);
const groundY = terrainY + 1.6; // eye height over terrain
    // Jump: only once per airborne phase (cooldown resets on landing)
    if ((keys.space || jumpBuffer > 0) && grounded && canJump) {
      vy = settings.jumpSpeed;
      grounded = false;
      canJump = false; // lock until we land again
      jumpBuffer = 0;  // consume buffer
      jumpedThisFrame = true;
    }
    // gravity
    vy -= settings.gravity * dt;
    yaw.position.y += vy * dt;
    // collision with ground + bounce
if (yaw.position.y <= groundY) {
      yaw.position.y = groundY;
      // If jump is pressed/buffered right at contact, jump immediately
      if ((keys.space || jumpBuffer > 0) && !jumpedThisFrame) {
        vy = settings.jumpSpeed;
        grounded = false;
        canJump = false;
        jumpBuffer = 0;
        jumpedThisFrame = true;
      } else if (vy < -settings.bounceThreshold) {
        // Bounce only if we didn't convert to a jump
        vy = -vy * settings.bounceRestitution; // bounce up
        grounded = false; // still airborne due to bounce
      } else {
        vy = 0;
        grounded = true;
      }
    }

// Eye height now handled by vertical physics

    // If we just landed this frame, reset jump cooldown
    if (grounded && !wasGrounded) {
      canJump = true;
      // If jump is pressed/buffered on landing, jump immediately (guard to avoid double-trigger)
      if (!jumpedThisFrame && (keys.space || jumpBuffer > 0)) {
        vy = settings.jumpSpeed;
        grounded = false;
        canJump = false;
        jumpBuffer = 0;
        jumpedThisFrame = true;
      }
    }
    wasGrounded = grounded;

// Camera bobbing when moving and grounded (optimized)
const horizontalSpeed = Math.hypot(velocity.x, velocity.z);

// Update sprint state: active when either Shift is held or double-tap W triggered, while holding W
const sprintActive = ((keys.shift || sprinting) && keys.w && horizontalSpeed > 0.1);
// If W released or neither Shift nor double-tap active, stop sprint; start a short cooldown to avoid instant retrigger
if (!keys.w || (!keys.shift && !sprinting)) {
if (sprinting) { sprintCooldownTimer = sprintCooldown; }
sprinting = false;
// Reset Q/E boost history when leaving sprint intent
qeHead = qeTail;
lastHandKey = '';
}
const targetFov = sprintActive ? settings.sprintFov : settings.baseFov;
const fovAlpha = 1 - Math.exp(-settings.fovSmoothing * dt);
const newFov = camera.fov + (targetFov - camera.fov) * fovAlpha;
if (Math.abs(newFov - camera.fov) > 0.01) {
camera.fov = newFov;
camera.updateProjectionMatrix();
}
    if (grounded && horizontalSpeed > 0.1) {
      const speedRatio = Math.max(0.25, horizontalSpeed / settings.moveSpeed);
      const bobFreq = settings.bobFrequency * speedRatio; // faster when moving faster
      bobPhase += bobFreq * dt * Math.PI * 2;
      const bobOffset = Math.sin(bobPhase) * settings.bobIntensity;
      pitch.position.y = cameraBaseY + bobOffset;
    } else {
      // return to base smoothly (cached calculation)
      const returnSpeed = Math.min(1, dt * 10);
      pitch.position.y += (cameraBaseY - pitch.position.y) * returnSpeed;
    }

    // Update hands animation
    updateHands(dt);

    // Update sprint timers: expire double-tap window and cooldown
    {
      const nowMs2 = performance.now();
      if (wTapAwaiting && (nowMs2 - wLastTapTime > settings.sprintDoubleTapWindow)) {
        wTapAwaiting = false;
        wFirstReleased = false;
      }
    }
    if (sprintCooldownTimer > 0) { sprintCooldownTimer = Math.max(0, sprintCooldownTimer - dt); }
    // Dynamic resolution: adjust pixel ratio to approach target FPS
    if (settings.dynamicResolution) {
      fpsAccumulator += dt;
      fpsFrames++;
      timeSinceAdjust += dt;
      if (timeSinceAdjust >= (settings.resolutionAdjustInterval || 0.25) && fpsAccumulator > 0) {
        const avgFrameTime = fpsAccumulator / fpsFrames; // seconds
        const avgFPS = 1 / avgFrameTime;
        const target = settings.targetFPS || 60;
        const step = settings.resolutionAdjustStep || 0.05;
        let newPR = currentPixelRatio;
        if (avgFPS < target * 0.92) {
          // Too slow: scale down resolution slightly
          newPR = Math.max(settings.minPixelRatio || 0.5, currentPixelRatio - step);
        } else if (avgFPS > target * 1.08) {
          // Plenty fast: scale up resolution slightly
          newPR = Math.min(settings.maxPixelRatio || 1.0, currentPixelRatio + step);
        }
        if (Math.abs(newPR - currentPixelRatio) >= 0.01) {
          currentPixelRatio = newPR;
          renderer.setPixelRatio(currentPixelRatio);
          renderer.setSize(window.innerWidth, window.innerHeight);
        }
        // reset window
        fpsAccumulator = 0;
        fpsFrames = 0;
        timeSinceAdjust = 0;
      }
    }

    // Update speed HUD at ~10 Hz using horizontal speed
    hudAccum += dt;
    if (hudAccum >= hudInterval) {
      const horizSpeed = Math.hypot(velocity.x, velocity.z);
      if (speedEl) speedEl.textContent = `Speed: ${horizSpeed.toFixed(2)} m/s`;
      hudAccum = 0;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // Resize handling
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();
renderer.setPixelRatio(currentPixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Hand animation logic
  function triggerHand(which) {
    const h = hands[which];
    if (!h || !h.mesh) return;
    if (h.state === 'idle' || h.state === 'retracting') {
      h.state = 'extending';
      h.timer = 0;
      h.mesh.visible = true;
    }
  }
  function updateHands(dt) {
    const extendTime = 0.12; // s
    const holdTime = 0.08;   // s
    const retractTime = 0.16;// s
    for (const key of ['left','right']) {
      const h = hands[key];
      if (!h.mesh) continue;

      // Skip unnecessary calculations if hand is idle
      if (h.state === 'idle') {
        h.mesh.visible = false;
        continue;
      }

      if (h.state === 'extending') {
        h.timer += dt;
        const t = Math.min(1, h.timer / extendTime);
        const ease = t*t*(3-2*t); // smoothstep
        h.mesh.position.lerpVectors(h.basePos, h.targetPos, ease);
        if (h.baseQ && h.targetQ) {
          h.mesh.quaternion.copy(h.baseQ).slerp(h.targetQ, ease);
        }
        if (t >= 1) { h.state = 'hold'; h.timer = 0; }
      } else if (h.state === 'hold') {
        h.timer += dt;
        // No need to recalculate position during hold
        if (h.timer >= holdTime) { h.state = 'retracting'; h.timer = 0; }
      } else if (h.state === 'retracting') {
        h.timer += dt;
        const t = Math.min(1, h.timer / retractTime);
        const ease = t*t*(3-2*t);
        h.mesh.position.lerpVectors(h.targetPos, h.basePos, ease);
        if (h.baseQ && h.targetQ) {
          h.mesh.quaternion.copy(h.targetQ).slerp(h.baseQ, ease);
        }
        if (t >= 1) {
          h.state = 'idle';
          h.timer = 0;
          h.mesh.visible = false;
          // Reset position to avoid drift
          h.mesh.position.copy(h.basePos);
          if (h.baseQ) h.mesh.quaternion.copy(h.baseQ);
        }
      }
    }
  }

})();
