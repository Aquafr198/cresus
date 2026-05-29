// Canvas-rendered banner images for Discord embeds. The output PNG is meant
// to be sent as an attachment ABOVE an embed in the same `channel.send(...)`
// call — Discord renders attachments before embeds in the same message, so
// the banner appears as the visual header of the card (Wynlers-style).
//
// Aspect ratio mirrors what looks right inline in Discord at 1× / 2× DPI :
// 1024×320 = 3.2:1, roughly the same as the example screenshots.
//
// Buffer cache: rendering the same banner over and over is wasted work
// (the inputs are static — same /setup-tickets command yields the same
// banner forever). We memoise by stringified opts so the second call
// returns instantly. Memory cost is ~50-120 KB per unique banner — fine
// for a handful of distinct banners.

const path = require('node:path');
const { createCanvas, loadImage } = require('canvas');
const { COLOR, FONT, SITE_URL } = require('./brand');

const WIDTH = 1024;
const HEIGHT = 320;

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'offivex-logo.png');

let logoPromise = null;
function loadLogoOnce() {
  if (!logoPromise) {
    logoPromise = loadImage(LOGO_PATH).catch((err) => {
      // Reset so a retry on next call can recover from a transient FS error.
      logoPromise = null;
      throw err;
    });
  }
  return logoPromise;
}

const bannerCache = new Map();

/**
 * Generate a banner PNG for a Discord embed.
 *
 * @param {Object}  opts
 * @param {string}  opts.title       Big headline text (e.g. "TICKETS", "VERIFICATION").
 * @param {string} [opts.subtitle]   Optional smaller line below the title.
 * @param {"purple"|"green"|"gradient"} [opts.variant="purple"]
 *                                   Tints the diagonal background overlay.
 * @returns {Promise<Buffer>}        PNG buffer ready for AttachmentBuilder.
 */
async function generateBanner(opts = {}) {
  const key = JSON.stringify(opts);
  const cached = bannerCache.get(key);
  if (cached) return cached;

  const { title = '', subtitle = '', variant = 'purple' } = opts;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // ── 1. Base background — Kinesis-style deep navy ──────────────────────
  ctx.fillStyle = COLOR.bgBase;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ── 2. Diagonal rays (mirrors `.landing-rays` from globals.css) ────────
  // Purple stripe on the left half, green tint on the right half. Same
  // 110deg / 135deg layout, scaled to banner dimensions.
  if (variant === 'purple' || variant === 'gradient') {
    const ray1 = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    ray1.addColorStop(0.20, 'rgba(11,9,24,0)');
    ray1.addColorStop(0.30, 'rgba(153,69,255,0.08)');
    ray1.addColorStop(0.38, 'rgba(153,69,255,0.14)');
    ray1.addColorStop(0.42, 'rgba(176,112,255,0.10)');
    ray1.addColorStop(0.50, 'rgba(11,9,24,0)');
    ctx.fillStyle = ray1;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  if (variant === 'green' || variant === 'gradient') {
    const ray2 = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    ray2.addColorStop(0.55, 'rgba(11,9,24,0)');
    ray2.addColorStop(0.60, 'rgba(20,241,149,0.06)');
    ray2.addColorStop(0.66, 'rgba(20,241,149,0.10)');
    ray2.addColorStop(0.70, 'rgba(93,255,192,0.06)');
    ray2.addColorStop(0.78, 'rgba(11,9,24,0)');
    ctx.fillStyle = ray2;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // ── 3. Radial glow top-left (depth / focal point) ──────────────────────
  const glow = ctx.createRadialGradient(140, 100, 0, 140, 100, 520);
  glow.addColorStop(0, 'rgba(153,69,255,0.40)');
  glow.addColorStop(0.4, 'rgba(153,69,255,0.10)');
  glow.addColorStop(1, 'rgba(11,9,24,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ── 4. Brand mark (logo + wordmark) ────────────────────────────────────
  try {
    const logo = await loadLogoOnce();
    ctx.drawImage(logo, 48, 44, 64, 64);
  } catch {
    // Missing logo? Draw a visible placeholder so the breakage gets noticed.
    ctx.fillStyle = COLOR.purple;
    ctx.fillRect(48, 44, 64, 64);
  }
  ctx.fillStyle = COLOR.textPrimary;
  ctx.font = FONT.title;
  ctx.textBaseline = 'middle';
  ctx.fillText('Offivex', 128, 76);

  // ── 5. Headline title ──────────────────────────────────────────────────
  if (title) {
    ctx.fillStyle = COLOR.textPrimary;
    ctx.font = FONT.display;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const titleY = subtitle ? 210 : 230;
    ctx.fillText(title.toUpperCase(), 48, titleY);

    // Purple underline accent under the title (Wynlers-ish, but Offivex purple).
    const titleW = Math.min(ctx.measureText(title.toUpperCase()).width, 520);
    ctx.fillStyle = COLOR.purple;
    ctx.fillRect(48, titleY + 12, titleW, 3);
  }

  // ── 6. Subtitle (optional) ─────────────────────────────────────────────
  if (subtitle) {
    ctx.fillStyle = COLOR.textSecondary;
    ctx.font = FONT.subtitle;
    ctx.textAlign = 'left';
    ctx.fillText(subtitle, 48, 268);
  }

  // ── 7. Right-edge accent — thin Solana-green stroke ────────────────────
  ctx.strokeStyle = COLOR.green;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(WIDTH - 56, 64);
  ctx.lineTo(WIDTH - 56, HEIGHT - 64);
  ctx.stroke();

  // ── 8. Site URL bottom-right ───────────────────────────────────────────
  ctx.fillStyle = COLOR.purpleLight;
  ctx.font = FONT.body;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(SITE_URL, WIDTH - 76, HEIGHT - 32);

  const buffer = canvas.toBuffer('image/png');
  bannerCache.set(key, buffer);
  return buffer;
}

module.exports = { generateBanner };
