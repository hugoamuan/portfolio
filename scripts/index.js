// ═══════════════════════════════════════════════════════
// MOBILE NAV — hamburger menu toggle with X animation
// ═══════════════════════════════════════════════════════

const menuBtn    = document.getElementById('menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const bar1       = document.getElementById('bar1');
const bar2       = document.getElementById('bar2');
const bar3       = document.getElementById('bar3');
let menuOpen = false;

menuBtn.addEventListener('click', () => {
    menuOpen = !menuOpen;
    // Show/hide the dropdown
    mobileMenu.classList.toggle('hidden', !menuOpen);

    if (menuOpen) {
        // Rotate top bar clockwise + shift down → forms top of X
        bar1.style.transform = 'translateY(8px) rotate(45deg)';
        // Hide middle bar
        bar2.style.opacity = '0';
        // Rotate bottom bar counter-clockwise + shift up → forms bottom of X
        bar3.style.transform = 'translateY(-8px) rotate(-45deg)';
    } else {
        // Reset all bars back to hamburger
        bar1.style.transform = '';
        bar2.style.opacity   = '1';
        bar3.style.transform = '';
    }
});


// ═══════════════════════════════════════════════════════
// CANVAS + VIDEO REFERENCES
// ═══════════════════════════════════════════════════════

const video  = document.getElementById('src-video');
const canvas = document.getElementById('video-canvas');
const ctx    = canvas.getContext('2d'); // 2D drawing context


// ═══════════════════════════════════════════════════════
// VIDEO COVER SIZING
// Browsers don't always apply object-fit:cover correctly
// on mobile, so we calculate and set the video size manually
// based on the actual video pixel dimensions vs screen size.
// ═══════════════════════════════════════════════════════

function isMobile() { return window.innerWidth < 768; }

function coverVideo() {
    const vw = video.videoWidth;   // actual pixel width of the video file
    const vh = video.videoHeight;  // actual pixel height of the video file

    // Video dimensions aren't known until metadata loads — bail and retry
    if (!vw || !vh) return false;

    if (isMobile()) {
        // On mobile: show video as an inset card (16px padding each side)
        // with rounded corners rather than full bleed
        const targetW = window.innerWidth - 32;
        const targetH = targetW * (9 / 16); // force 16:9 aspect ratio
        video.style.width        = targetW + 'px';
        video.style.height       = targetH + 'px';
        video.style.borderRadius = '18px';
    } else {
        // On desktop: scale video up until it covers the full screen
        // Math.max picks whichever scale factor is larger so BOTH dimensions are covered
        const sw    = window.innerWidth;
        const sh    = window.innerHeight;
        const scale = Math.max(sw / vw, sh / vh);
        video.style.width        = Math.ceil(vw * scale) + 'px';
        video.style.height       = Math.ceil(vh * scale) + 'px';
        video.style.borderRadius = '0';
    }
    return true; // signal that sizing was applied successfully
}

function resizeAll() {
    // Match canvas pixel dimensions to the screen
    // (canvas defaults to 300x150 if not set explicitly)
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    coverVideo();
}

// Video metadata (dimensions) may not be available immediately on load.
// Poll every 100ms until coverVideo() succeeds, then stop.
const coverInterval = setInterval(() => {
    if (coverVideo()) clearInterval(coverInterval);
}, 100);

resizeAll();
window.addEventListener('resize', resizeAll);
// orientationchange fires before the new dimensions are available,
// so we wait 300ms for the browser to reflow first
window.addEventListener('orientationchange', () => setTimeout(resizeAll, 300));
video.addEventListener('loadedmetadata', resizeAll); // fires when dimensions are first known
video.addEventListener('canplay', resizeAll);        // fires when enough data is loaded to play


// ═══════════════════════════════════════════════════════
// LENS IRIS MASK
// Draws a black overlay on the canvas with a circular
// transparent hole cut out of it. The hole grows as the
// user scrolls, revealing the full video underneath.
//
// Layer stack:
//   [ video ]        ← bottom: always playing
//   [ black canvas ] ← top: has a circle-shaped hole
// ═══════════════════════════════════════════════════════

function drawMask(progress) {
    const W  = canvas.width;
    const H  = canvas.height;
    const cx = W / 2; // horizontal center
    const cy = H / 2; // vertical center

    // Maximum radius needed to completely cover the screen from the center.
    // We use Pythagoras to get the distance from center to corner + 5% buffer.
    const maxR = Math.sqrt(cx * cx + cy * cy) * 1.05;

    // Starting iris size — slightly smaller on mobile so it reads clearly
    const mobile = W < 768;
    const minR   = Math.min(W, H) * (mobile ? 0.10 : 0.13);

    // Current iris radius: lerps from minR (progress=0) to maxR (progress=1)
    const irisR = minR + (maxR - minR) * progress;

    // Clear previous frame
    ctx.clearRect(0, 0, W, H);

    // ── Step 1: Fill entire canvas black ──
    ctx.globalCompositeOperation = 'source-over'; // normal paint mode
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // ── Step 2: Draw decorative concentric lens rings ──
    // These are faint white circles around the iris opening.
    // They fade out and get swallowed as the iris grows.
    const rings = [minR * 1.6, minR * 2.1, minR * 2.7];
    rings.forEach(r => {
        if (irisR < r * 1.1) { // only draw rings that haven't been consumed yet
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,255,255,${0.08 * (1 - progress)})`; // fades with scroll
            ctx.lineWidth   = mobile ? 1 : 1.5;
            ctx.stroke();
        }
    });

    // ── Step 3: Punch a transparent hole using destination-out ──
    // destination-out composite mode: anything drawn ERASES pixels
    // instead of painting them. So filling a circle erases the black,
    // revealing the video underneath.
    const gradient = ctx.createRadialGradient(
        cx, cy, irisR * 0.75, // inner circle: fully transparent (erased)
        cx, cy, irisR         // outer edge: fully opaque (not erased)
    );
    gradient.addColorStop(0, 'rgba(0,0,0,1)'); // erase fully in the center
    gradient.addColorStop(1, 'rgba(0,0,0,0)'); // fade out at the edge

    ctx.globalCompositeOperation = 'destination-out'; // switch to erase mode
    ctx.beginPath();
    ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill(); // this erases the black pixels inside the circle

    // Reset to normal paint mode
    ctx.globalCompositeOperation = 'source-over';

    // ── Step 4: Draw a thin bright rim around the iris ──
    // Simulates light reflecting off a camera lens edge.
    // Fades out as the iris expands.
    if (progress < 0.95) {
        ctx.beginPath();
        ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.15 * (1 - progress)})`;
        ctx.lineWidth   = mobile ? 1.5 : 2;
        ctx.stroke();
    }
}


// ═══════════════════════════════════════════════════════
// SCROLL PROGRESS
// Maps how far the user has scrolled through the
// #scroll-driver element (0 = top, 1 = bottom).
// ═══════════════════════════════════════════════════════

function getScrollProgress() {
    const driver   = document.getElementById('scroll-driver');
    const rect     = driver.getBoundingClientRect();
    // Total scrollable distance = element height minus one viewport height
    const total    = driver.offsetHeight - window.innerHeight;
    // How far we've scrolled into the element (rect.top goes negative as we scroll)
    const scrolled = -rect.top;
    return Math.min(Math.max(scrolled / total, 0), 1); // clamp between 0 and 1
}

// Smooth ease-in-out curve so the animation
// starts slow, speeds up in the middle, and slows at the end
function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

let currentProgress = 0; // what's currently drawn on canvas
let targetProgress  = 0; // where we want to get to based on scroll

window.addEventListener('scroll', () => {
    targetProgress = easeInOut(getScrollProgress());
}, { passive: true }); // passive:true tells browser we won't call preventDefault, allowing scroll optimisations


// ═══════════════════════════════════════════════════════
// RENDER LOOP
// Renders when there is a change (scroll)
// ═══════════════════════════════════════════════════════

function loop() {
    const diff = targetProgress - currentProgress;
    if (Math.abs(diff) > 0.0001) {
        currentProgress += diff * 0.08;
        drawMask(currentProgress);
    }
    requestAnimationFrame(loop);
}


// ═══════════════════════════════════════════════════════
// VIDEO PLAYBACK
// iOS Safari blocks autoplay unless:
//   1. The video has no audio track (stripped with ffmpeg -an)
//   2. The video has muted + playsinline + autoplay attributes
//   3. A user gesture has occurred (touchstart fallback below)
// ═══════════════════════════════════════════════════════

video.addEventListener('canplay', () => {
    // Enough data is loaded — attempt to play and start the render loop
    video.play().catch(() => {});
    loop();
});

window.addEventListener('load', () => {
    drawMask(0);
    // If video is somehow already ready before canplay fired
    if (video.readyState < 2) loop();

    // iOS fallback: attempt play on first finger touch anywhere on screen.
    // iOS allows video.play() inside a touch event even without autoplay permission.
    document.addEventListener('touchstart', () => {
        video.play().catch(() => {});
    }, { once: true }); // { once:true } removes the listener after first touch
});

document.querySelectorAll('.project-media video').forEach(vid => {
    vid.muted = true;
    vid.load();
    const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                vid.play().catch(() => {});
            } else {
                vid.pause();
            }
        });
    }, { threshold: 0.1 });
    observer.observe(vid);
});