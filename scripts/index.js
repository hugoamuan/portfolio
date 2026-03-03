// ── Mobile menu toggle with animated bars ──
const menuBtn = document.getElementById('menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const bar1 = document.getElementById('bar1');
const bar2 = document.getElementById('bar2');
const bar3 = document.getElementById('bar3');
let menuOpen = false;

menuBtn.addEventListener('click', () => {
    menuOpen = !menuOpen;

    // Show/hide dropdown
    mobileMenu.classList.toggle('hidden', !menuOpen);

    // Hamburger to 'X'
    if (menuOpen) {
        // Rotate topbar clockwise + shift down 
        bar1.style.transform = 'translateY(8px) rotate(45deg)';
        // Hide middle bar
        bar2.style.opacity = '0';
        // Rotate topbar counter-clockwise + shift up
        bar3.style.transform = 'translateY(-8px) rotate(-45deg)';
    } else {
        bar1.style.transform = '';
        bar2.style.opacity = '1';
        bar3.style.transform = '';
    }
});

// ── Canvas setup ──
const video = document.getElementById('src-video');
const canvas = document.getElementById('video-canvas');
const ctx = canvas.getContext('2d');

// Browsers downt always apply object:fit:cover correctly, calculate size manually
function isMobile() { return window.innerWidth < 768; }

function coverVideo() {
    // Dimensions of the video
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return false;

    if (isMobile()) {
        // On mobile: inset 16px each side, maintain 16:9 ratio
        const targetW = window.innerWidth - 32;
        const targetH = targetW * (9 / 16);
        video.style.width = targetW + 'px';
        video.style.height = targetH + 'px';
        video.style.borderRadius = '18px';
    } else {
        // Desktop: full cover
        const sw = window.innerWidth;
        const sh = window.innerHeight;
        const scale = Math.max(sw / vw, sh / vh);
        video.style.width = Math.ceil(vw * scale) + 'px';
        video.style.height = Math.ceil(vh * scale) + 'px';
        video.style.borderRadius = '0';
    }
    return true;
}

function resizeAll() {
    // Match canvas pixel dimensions to screen
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    coverVideo();
}

// Video metadata may not be avail immediately, poll until success
const coverInterval = setInterval(() => {
    if (coverVideo()) clearInterval(coverInterval);
}, 100);

resizeAll();
window.addEventListener('resize', resizeAll);
window.addEventListener('orientationchange', () => setTimeout(resizeAll, 300));
video.addEventListener('loadedmetadata', resizeAll);
video.addEventListener('canplay', resizeAll);


// LENS IRIS MASK
// Draws a black overlay on the canvas with a circular
// transparent hole cut out of it. The hole grows as the
// user scrolls, revealing the full video underneath.
//
// Layer stack:
//   [ video ]        ← bottom: always playing
//   [ black canvas ] ← top: has a circle-shaped hole

function drawMask(progress) {
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2; // horizontal center
    const cy = H / 2; // vertical center

    // Pythagoras to get distance from center to corner + 5% buffer
    const maxR = Math.sqrt(cx * cx + cy * cy) * 1.05;

    // Start iris size
    const isMobile = W < 768;
    const minR = Math.min(W, H) * (isMobile ? 0.10 : 0.13);

    // Current iris radius:
    const irisR = minR + (maxR - minR) * progress;

    ctx.clearRect(0, 0, W, H);

    // Step 1: Black fill
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Step 2: Draw decorative concentric lens rings ──
    // These are faint white circles around the iris opening.
    // They fade out and get swallowed as the iris grows.
    const rings = [minR * 1.6, minR * 2.1, minR * 2.7];
    rings.forEach(r => {
        // Only draw rings that haven't been consumed yet
        if (irisR < r * 1.1) {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,255,255,${0.08 * (1 - progress)})`; // fades with scroll
            ctx.lineWidth = isMobile ? 1 : 1.5;
            ctx.stroke();
        }
    });

    // ── Step 3: Punch a transparent hole using destination-out ──
    // destination-out composite mode: anything drawn ERASES pixels
    // instead of painting them. So filling a circle erases the black,
    // revealing the video underneath.
    // We use a radial gradient so the edge of the hole is soft (vignette).
    const gradient = ctx.createRadialGradient(cx, cy, irisR * 0.75, cx, cy, irisR);
    gradient.addColorStop(0, 'rgba(0,0,0,1)'); // erase full in the center
    gradient.addColorStop(1, 'rgba(0,0,0,0)'); // fade out at the edge

    // Punch the iris hole
    ctx.globalCompositeOperation = 'destination-out'; // erase mode
    ctx.beginPath();
    ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill(); // this erases black pixels inside the circle

    // Reset to normal paint mode
    ctx.globalCompositeOperation = 'source-over';

    // Bright rim around iris - light reflection effect
    if (progress < 0.95) {
        ctx.beginPath();
        ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.15 * (1 - progress)})`;
        ctx.lineWidth = isMobile ? 1.5 : 2;
        ctx.stroke();
    }
}

// ── Scroll progress ──
// Maps how far the user has scrolled through the #scroll-driver element (o = top, 1 = bottom)
function getScrollProgress() {
    const driver = document.getElementById('scroll-driver');
    const rect = driver.getBoundingClientRect();
    // Total distance scrollable = element height minus one viewport height
    const total = driver.offsetHeight - window.innerHeight;
    const scrolled = -rect.top;
    return Math.min(Math.max(scrolled / total, 0), 1);
}

// Smooth ease-in-out curve so animation starts slow, speeds up, and slows back down.
function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

let currentProgress = 0; // what's currently drawn on the canvas
let targetProgress = 0; // where we want to get to based on scroll

window.addEventListener('scroll', () => {
    targetProgress = easeInOut(getScrollProgress());
}, { passive: true });

// Lerp - kinear interpolation, used to calculate a smooth, straight-line transition between two values A and B
// based on a percentage (t). Calculates the value at any point typically where t is fraction from 0.0 to 1.0

// ── Render loop ──
// Runs every animation frame
// Lerps currentProgress toward targetProgress for smooth animation
// Then redraws the mask.
function loop() {
    // Lerp: move 8% of remaining distance each frame
    currentProgress += (targetProgress - currentProgress) * 0.08;
    drawMask(currentProgress);
    requestAnimationFrame(loop); // schedule next frame
}

// VIDEO PLAYBACK
// iOS Safari blocks autoplay unless:
//   1. The video has no audio track (stripped with ffmpeg -an)
//   2. The video has muted + playsinline + autoplay attributes
//   3. A user gesture has occurred (touchstart fallback below)
video.addEventListener('canplay', () => {
    video.play().catch(() => { });
    loop();
});

window.addEventListener('load', () => {
    if (video.readyState < 2) loop();

    // iOS fallback: attempt play on first finger touch anywhere on screen.
    // iOS allows video.play() inside a touch event even without autoplay permission
    document.addEventListener('touchstart', () => {
        video.play().catch(() => { });
    }, { once: true }); // remove listener
});

// iOS pauses videos when the user switches tabs or locks their screen.
// Resume playback as soon as the page becomes visible again.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        video.play().catch(() => { });
    }
});