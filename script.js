(() => {
    "use strict";

    const EYE_COLOR = [0x59, 0x36, 0x12]; // #593612
    const canvas = document.getElementById("ascii-canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const TAU = Math.PI * 2;
    const ramp = " .':;!ilI/rtfLCYUXzcvunxjJQO0Zmwqpdbkhao*#MW&8%B@$";
    const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
    const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const gaussian = (x, spread) => Math.exp(-(x * x) / spread);

    // Quantized palettes keep individual characters sharp at phone resolutions.
    const palettes = [
        [224, 162, 123], // peach skin tones from the reference, separate from iris
        [226, 230, 216], // sclera and reflections
        EYE_COLOR,
        [218, 102, 151], // the reference's pink heart
        [218, 228, 234]  // stars
    ].map((rgb, family) => Array.from({ length: 48 }, (_, level) => {
        const light = level / 47;
        const channels = rgb.map((value) => {
            if (family === 2) {
                // The supplied brown is the midtone; illumination reveals its fibers.
                return light < 0.5 ? value * light * 2 : mix(value, Math.min(255, value * 2.15), (light - 0.5) * 2);
            }
            return value * light;
        });
        return `rgb(${channels.map(Math.round).join(",")})`;
    }));

    const stars = Array.from({ length: 165 }, (_, i) => ({
        x: hash(i * 7 + 1), y: hash(i * 7 + 2),
        size: hash(i * 7 + 3), phase: hash(i * 7 + 4) * TAU,
        depth: hash(i * 7 + 5)
    }));

    let width = 0, height = 0, columns = 0, rows = 0;
    let cellX = 0, cellY = 0;
    let time = 0, lastTime = null, lastPaint = 0, frame = 0;

    function glyph(character, x, y, light, family, alpha = 1) {
        if (light < 0.025 || alpha < 0.015) return;
        ctx.fillStyle = palettes[family][Math.round(clamp(light) * 47)];
        ctx.globalAlpha = clamp(alpha);
        ctx.fillText(character, x, y);
    }

    function resize() {
        const bounds = canvas.getBoundingClientRect();
        width = bounds.width;
        height = bounds.height;
        if (!width || !height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        columns = Math.round(clamp(width / 5.2, 96, 160));
        cellX = width / columns;
        rows = Math.round(height / (cellX * 1.85));
        cellY = height / rows;
        ctx.font = `${cellX / 0.6}px "Courier New", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        render(motion.matches ? 3 : time);
        requestFrame();
    }

    function drawEye(t, zoom, alpha) {
        if (alpha < 0.01) return;
        const opening = smooth(t / 1.25);
        const irisRadius = 0.51;
        const pupilRadius = 0.17 + Math.sin(t * 1.3) * 0.003;
        const unit = width / 3.45;
        const cellSeed = Math.floor(t * 4);

        for (let row = 0; row < rows; row++) {
            const py = (row + 0.5) * cellY;
            for (let column = 0; column < columns; column++) {
                const px = (column + 0.5) * cellX;
                const x = (px - width * 0.5) / (unit * zoom);
                const y = (py - height * 0.51) / (unit * zoom);
                const u = x / 1.43;
                const arc = Math.pow(Math.max(0, 1 - u * u), 0.72);
                const cornerLift = -x * 0.045;
                const upper = -0.46 * arc * opening + cornerLift;
                const lower = 0.40 * arc * opening + cornerLift;
                const inside = Math.abs(u) < 1 && y > upper && y < lower;
                const topDistance = y - upper;
                const lowerDistance = y - lower;
                const seed = row * 191 + column;
                const grain = hash(seed);
                const texture = Math.sin(x * 71 + y * 53) * Math.sin(y * 113 - x * 19);
                let light, family = 0;

                // The dense skin, folds and shadow belong to the reference image.
                light = 0.53 + texture * 0.025 + grain * 0.06;
                // Upper-lid shading, not a separate eyebrow. The reference has
                // a dark upper eye area and softly lit peach skin below it.
                light *= 0.48 + 0.52 * smooth((y + 0.85) / 1.0);
                const crease = upper - 0.13 - 0.035 * arc;
                const lidExtent = smooth((1.52 - Math.abs(x)) / 0.25);
                light *= 1 - gaussian(y - crease, 0.0024) * 0.58 * lidExtent;
                light += gaussian(y - (crease - 0.065), 0.004) * 0.06 * lidExtent;
                light *= 1 - gaussian(topDistance + 0.035, 0.0045) * 0.48 * lidExtent;
                light *= 1 - gaussian(lowerDistance - 0.075, 0.002) * 0.24 * lidExtent;
                light += gaussian(lowerDistance - 0.17, 0.018) * 0.16 * lidExtent;
                light += gaussian(y - 0.83, 0.15) * 0.14;

                if (inside) {
                    const irisX = x * 1.28;
                    const irisY = y * 0.88;
                    const r = Math.hypot(irisX, irisY);
                    if (r >= irisRadius) {
                        family = 1;
                        const edge = smooth(Math.min(topDistance, -lowerDistance) / 0.15);
                        const side = 1 - 0.52 * Math.pow(clamp(Math.abs(u)), 2);
                        light = (0.84 + texture * 0.06 + grain * 0.1) * (0.5 + edge * 0.5) * side;
                        light *= 1 - gaussian(topDistance, 0.013) * 0.35;
                    } else if (r >= pupilRadius) {
                        family = 2;
                        const a = Math.atan2(irisY, irisX);
                        const radial = (r - pupilRadius) / (irisRadius - pupilRadius);
                        const fibers = Math.sin(a * 93 + Math.sin(a * 31) * 2 + r * 41);
                        const fibers2 = Math.sin(a * 163 - r * 57) * Math.sin(a * 61 + r * 17);
                        light = 0.66 + fibers * 0.2 + fibers2 * 0.13 + grain * 0.13;
                        light += gaussian(radial - 0.23, 0.016) * 0.2;
                        light *= 0.45 + smooth((irisRadius - r) / 0.055) * 0.55;
                        light *= 0.65 + 0.35 * smooth((y + 0.39) / 0.65);
                        light *= 0.62 + 0.38 * smooth(topDistance / 0.13);
                    } else {
                        light = 0;
                    }

                    const glint = ((x + 0.075) / 0.085) ** 2 + ((y + 0.175) / 0.03) ** 2;
                    if (glint < 1 || Math.hypot(x - 0.09, y - 0.13) < 0.024) {
                        light = 0.92; family = 1;
                    }
                }

                if (Math.abs(u) < 1 && Math.abs(topDistance) < 0.035) {
                    family = 0; light = 0.055 + grain * 0.07;
                }
                if (Math.abs(u) < 1 && Math.abs(lowerDistance) < 0.017) {
                    family = 0; light = 0.47 + grain * 0.1;
                }

                const glyphLight = family === 2 ? light * 0.62 : light;
                let index = Math.floor(clamp(glyphLight) * (ramp.length - 1));
                if (index > 0) index = Math.max(1, Math.min(ramp.length - 1, index + Math.floor(grain * 5) - 2));
                const character = grain > 0.93 ? ramp[Math.max(1, (index + cellSeed) % ramp.length)] : ramp[index];
                glyph(character, px, py, light, family, alpha);
            }
        }
    }

    function drawStars(t, amount, zoom) {
        if (amount < 0.01) return;
        for (const star of stars) {
            const scale = 1 + zoom * (0.08 + star.depth * 0.13);
            const x = width * (0.5 + (star.x - 0.5) * scale);
            const y = height * (0.5 + (star.y - 0.5) * scale);
            if (x < 1 || x >= width || y < 1 || y >= height) continue;
            const light = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.7 + star.phase));
            glyph(star.size > 0.8 ? "+" : ".", x, y, light, 4, amount);
            if (star.size > 0.91) {
                const arm = cellX * (1.2 + star.size * 0.8);
                glyph("-", x - arm, y, light * 0.45, 4, amount);
                glyph("-", x + arm, y, light * 0.45, 4, amount);
                glyph("|", x, y - cellY, light * 0.45, 4, amount);
                glyph("|", x, y + cellY, light * 0.45, 4, amount);
            }
        }
    }

    function drawHeart(t, amount) {
        if (amount < 0.01) return;
        const growth = 0.3 + 0.7 * smooth(amount);
        const beat = motion.matches ? 1 : 1 + 0.025 * Math.sin(t * 2.6);
        const unit = width * 0.162 * growth * beat;
        for (let row = 0; row < rows; row++) {
            const py = (row + 0.5) * cellY;
            for (let column = 0; column < columns; column++) {
                const px = (column + 0.5) * cellX;
                const x = (px - width * 0.5) / unit;
                const y = -(py - height * 0.5) / unit;
                const a = x * x + y * y - 1;
                if (a * a * a - x * x * y * y * y > 0) continue;
                const bulge = Math.sqrt(Math.max(0, 1 - x * x * 0.5 - y * y * 0.4));
                const light = 0.34 + bulge * 0.45 + Math.sin(y * 9 - x * 2) * 0.08;
                const seed = row * 197 + column;
                const character = ramp[Math.floor(clamp(light + hash(seed) * 0.16) * (ramp.length - 1))];
                glyph(character, px, py, light, 3, smooth(amount * 2));
            }
        }
    }

    function render(t) {
        if (!width || !height) return;
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
        const travel = smooth((t - 6.2) / 5.8);
        const zoom = Math.exp(travel * 2.35);
        const heart = smooth((t - 10.2) / 3.3);
        const starsVisible = smooth((t - 8.4) / 2.8);
        const eyeOpacity = 1 - smooth((t - 10.8) / 1.9);
        const loopFade = 1 - smooth((t - 18) / 1.2);
        drawEye(t, zoom, eyeOpacity * loopFade);
        drawStars(t, starsVisible * loopFade, travel);
        drawHeart(t, heart * loopFade);
        ctx.globalAlpha = 1;
    }

    function requestFrame() {
        if (!frame && !document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
    }

    function tick(timestamp) {
        frame = 0;
        if (document.hidden || motion.matches) { lastTime = null; return; }
        if (lastTime !== null) time = (time + Math.min((timestamp - lastTime) / 1000, 0.1)) % 19.5;
        lastTime = timestamp;
        if (timestamp - lastPaint >= 1000 / 30) {
            render(time);
            lastPaint = timestamp;
        }
        requestFrame();
    }

    function suspend() {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = null;
        if (motion.matches) render(3);
        requestFrame();
    }

    document.addEventListener("visibilitychange", suspend);
    if (motion.addEventListener) motion.addEventListener("change", suspend);
    else motion.addListener(suspend);
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener("resize", resize, { passive: true });
    resize();
})();
