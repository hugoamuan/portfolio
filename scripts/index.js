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
    // We use a radial gradient so the edge of the hole is soft (vignette).
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
// Runs every animation frame (~60fps).
// Lerps currentProgress toward targetProgress for
// buttery smooth animation, then redraws the mask.
// ═══════════════════════════════════════════════════════

function loop() {
    // Lerp: move 8% of the remaining distance each frame
    // This creates the smooth deceleration effect
    currentProgress += (targetProgress - currentProgress) * 0.08;
    drawMask(currentProgress);
    requestAnimationFrame(loop); // schedule next frame
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
    // If video is somehow already ready before canplay fired
    if (video.readyState < 2) loop();

    // iOS fallback: attempt play on first finger touch anywhere on screen.
    // iOS allows video.play() inside a touch event even without autoplay permission.
    document.addEventListener('touchstart', () => {
        video.play().catch(() => {});
    }, { once: true }); // { once:true } removes the listener after first touch
});

// iOS pauses videos when the user switches tabs or locks their screen.
// Resume playback as soon as the page becomes visible again.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        video.play().catch(() => {});
    }
});


// ═══════════════════════════════════════════════════════
// PROJECTS — load from JSON, render vertically like makeshit.co
// Each project = category label + client/title + row of GIFs
// Clicking any project opens the Vimeo in a modal
// ═══════════════════════════════════════════════════════

const modal        = document.getElementById('vimeo-modal');
const modalIframe  = document.getElementById('modal-iframe');
const modalClose   = document.getElementById('modal-close');

function openModal(vimeoUrl) {
    // Convert vimeo.com/ID to player.vimeo.com/video/ID
    const id = vimeoUrl.split('/').pop();
    modalIframe.src = `https://player.vimeo.com/video/${id}?autoplay=1`;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // prevent background scroll
}

function closeModal() {
    modal.style.display = 'none';
    modalIframe.src = ''; // stop video playing in background
    document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);

// Close on backdrop click (not on the video itself)
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

function renderProjects(projects) {
    const list = document.getElementById('projects-list');

    projects.forEach((project, i) => {
        const row = document.createElement('div');
        row.style.cssText = `
            margin-bottom: 80px;
            cursor: pointer;
            opacity: 0;
            transform: translateY(24px);
            transition: opacity 0.5s ease, transform 0.5s ease;
        `;

        // GIF row — sized responsively via CSS .gif-row
        const gifRow = document.createElement('div');
        gifRow.className = 'gif-row';

        project.gifs.forEach(gifUrl => {
            const img = document.createElement('img');
            img.src = gifUrl;
            img.alt = project.title;
            gifRow.appendChild(img);
        });

        // Project info
        const info = document.createElement('div');
        info.style.cssText = 'display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px;';
        info.innerHTML = `
            <div>
                <span style="font-size:0.7rem; letter-spacing:0.25em; text-transform:uppercase; color:#6b7280;">${project.category}</span>
                <span style="color:#374151; margin:0 10px;">·</span>
                <span style="font-size:0.7rem; letter-spacing:0.15em; text-transform:uppercase; color:#6b7280;">${project.date}</span>
            </div>
            <div style="text-align:right;">
                <span style="font-size:1rem; font-weight:700; color:#F0F8E3; text-transform:uppercase; letter-spacing:0.05em;">${project.client}</span>
                <span style="color:#4b5563; margin:0 8px;">/</span>
                <span style="font-size:1rem; color:#9ca3af; font-style:italic;">${project.title}</span>
            </div>
        `;

        row.appendChild(gifRow);
        row.appendChild(info);

        // Hover effect
        row.addEventListener('mouseenter', () => {
            gifRow.querySelectorAll('img').forEach(img => img.style.opacity = '0.75');
        });
        row.addEventListener('mouseleave', () => {
            gifRow.querySelectorAll('img').forEach(img => img.style.opacity = '1');
        });

        // Click to open modal
        row.addEventListener('click', () => openModal(project.vimeoUrl));

        list.appendChild(row);

        // Staggered fade-in as rows enter viewport
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        observer.observe(row);
    });
}

// projects rendered via combined fetch below


// ═══════════════════════════════════════════════════════
// GALLERY CAROUSELS
// Each gallery = a title + horizontally scrollable image track
// Supports: drag to scroll, prev/next buttons, dot indicators
// ═══════════════════════════════════════════════════════

function renderGalleries(galleries) {
    const list = document.getElementById('galleries-list');

    galleries.forEach(gallery => {
        const block = document.createElement('div');
        block.className = 'gallery-block';

        // Title
        const title = document.createElement('p');
        title.className = 'gallery-title';
        title.textContent = gallery.title;
        block.appendChild(title);

        // Carousel wrapper (holds track + buttons)
        const wrapper = document.createElement('div');
        wrapper.className = 'carousel-wrapper';

        // Scrollable image track
        const track = document.createElement('div');
        track.className = 'carousel-track';

        gallery.images.forEach((src, idx) => {
            const img = document.createElement('img');
            img.src       = src;
            img.alt       = gallery.title;
            img.draggable = false;
            // Click to open lightbox at this image's index
            img.addEventListener('click', () => openLightbox(gallery.images, idx));
            track.appendChild(img);
        });

        // Prev button
        const prevBtn = document.createElement('button');
        const gap = 8;
        prevBtn.className = 'carousel-btn prev';
        prevBtn.innerHTML = '&#8592;';
        prevBtn.addEventListener('click', () => {
            const imgW = track.querySelector('img').offsetWidth + gap;
            track.scrollBy({ left: -imgW, behavior: 'smooth' });
        });

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'carousel-btn next';
        nextBtn.innerHTML = '&#8594;';
        nextBtn.addEventListener('click', () => {
            track.scrollBy({ left: 540, behavior: 'smooth' });
        });

        wrapper.appendChild(prevBtn);
        wrapper.appendChild(track);
        wrapper.appendChild(nextBtn);
        block.appendChild(wrapper);

        // Dot indicators
        const dotsRow = document.createElement('div');
        dotsRow.className = 'carousel-dots';
        const dots = gallery.images.map((_, i) => {
            const dot = document.createElement('div');
            dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
            dot.addEventListener('click', () => {
                const imgWidth = track.querySelector('img').offsetWidth + 8;
                track.scrollTo({ left: imgWidth * i, behavior: 'smooth' });
            });
            dotsRow.appendChild(dot);
            return dot;
        });
        block.appendChild(dotsRow);

        // Update active dot on scroll
        track.addEventListener('scroll', () => {
            const imgWidth = track.querySelector('img').offsetWidth + 8;
            const index    = Math.round(track.scrollLeft / imgWidth);
            dots.forEach((d, i) => d.classList.toggle('active', i === index));
        });

        // ── Drag to scroll (mouse) ──
        let isDragging = false, startX = 0, startScroll = 0;

        track.addEventListener('mousedown', e => {
            isDragging  = true;
            startX      = e.pageX;
            startScroll = track.scrollLeft;
            track.classList.add('grabbing');
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            track.scrollLeft = startScroll - (e.pageX - startX);
        });
        document.addEventListener('mouseup', () => {
            isDragging = false;
            track.classList.remove('grabbing');
        });

        list.appendChild(block);
    });
}

// Fetch and render — reuse the same projects.json fetch
fetch('projects.json')
    .then(res => res.json())
    .then(data => {
        if (data.galleries) renderGalleries(data.galleries);
        if (data.projects) renderProjects(data.projects);
    })
    .catch(err => console.error('Could not load projects.json:', err));


// ═══════════════════════════════════════════════════════
// IMAGE LIGHTBOX
// Click any carousel image to open it fullscreen.
// Navigate between images in the same album with arrows
// or left/right arrow keys.
// ═══════════════════════════════════════════════════════

const lightbox      = document.getElementById('img-lightbox');
const lightboxImg   = document.getElementById('img-lightbox-img');
const lightboxClose = document.getElementById('img-lightbox-close');
const lightboxPrev  = document.getElementById('img-lightbox-prev');
const lightboxNext  = document.getElementById('img-lightbox-next');

let currentImages = []; // all images in the current album
let currentIndex  = 0;  // which one is open

function openLightbox(images, index) {
    currentImages = images;
    currentIndex  = index;
    lightboxImg.src = images[index];
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    lightbox.classList.remove('open');
    lightboxImg.src = '';
    document.body.style.overflow = '';
}

function lightboxStep(dir) {
    currentIndex = (currentIndex + dir + currentImages.length) % currentImages.length;
    lightboxImg.src = currentImages[currentIndex];
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', (e) => { e.stopPropagation(); lightboxStep(-1); });
lightboxNext.addEventListener('click', (e) => { e.stopPropagation(); lightboxStep(1); });

// Close on backdrop click
lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'ArrowLeft')  lightboxStep(-1);
    if (e.key === 'ArrowRight') lightboxStep(1);
    if (e.key === 'Escape')     closeLightbox();
});