// PNL card renderer — matches the Kinesis-style mockup with Offivex branding.
//
// The card is 400×450 (close to the Kinesis ratio), drawn entirely in canvas
// so no design assets are required apart from the platform logo. The logo is
// loaded once at module import time and cached as an `Image` instance — each
// subsequent render reuses it (~5 ms per card on a typical box).
//
// Exports `generatePnlCard(event) → Promise<Buffer>` that the poller wraps
// in an `AttachmentBuilder`.

const path = require('node:path');
const { createCanvas, loadImage } = require('canvas');
// Palette comes from the single brand source (src/utils/brand.js) which
// itself mirrors frontend/src/app/globals.css. Don't redefine colors here.
const { COLOR } = require('./brand');

const WIDTH = 400;
const HEIGHT = 450;

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'offivex-logo.png');

// One-shot promise — re-used across renders. The logo PNG is 1520×1275; the
// canvas v3 decoder caches the bitmap so successive `drawImage` calls are
// effectively free.
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

/**
 * @param {Object} event PNL event from the Rust API.
 * @param {number} event.invested_sol
 * @param {number} event.sold_sol
 * @param {number} event.pnl_sol
 * @param {number} event.multiplier
 * @param {number|null} event.invested_usd
 * @param {number|null} event.sold_usd
 * @param {string} [siteUrl] Defaults to "offivex.gg".
 * @returns {Promise<Buffer>} PNG buffer ready for `AttachmentBuilder`.
 */
async function generatePnlCard(event, siteUrl = 'offivex.gg') {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // ── Background — purple-tinted radial glows over a deep navy base ─────
  ctx.fillStyle = COLOR.bgBase;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Top-left glow (matches the Kinesis vibe).
  const glow1 = ctx.createRadialGradient(60, 80, 0, 60, 80, 320);
  glow1.addColorStop(0, 'rgba(153,69,255,0.35)');
  glow1.addColorStop(0.4, 'rgba(153,69,255,0.10)');
  glow1.addColorStop(1, 'rgba(11,9,24,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Bottom-right accent so the card doesn't feel top-heavy.
  const glow2 = ctx.createRadialGradient(WIDTH - 40, HEIGHT - 60, 0, WIDTH - 40, HEIGHT - 60, 280);
  glow2.addColorStop(0, 'rgba(153,69,255,0.22)');
  glow2.addColorStop(1, 'rgba(11,9,24,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ── Header: logo + brand wordmark ──────────────────────────────────────
  try {
    const logo = await loadLogoOnce();
    ctx.drawImage(logo, 24, 22, 36, 36);
  } catch (err) {
    // Logo file missing? Draw a placeholder square so the layout doesn't
    // collapse silently. Visually obvious so it gets noticed and fixed.
    ctx.fillStyle = COLOR.purple;
    ctx.fillRect(24, 22, 36, 36);
  }
  ctx.fillStyle = COLOR.textPrimary;
  ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('Offivex', 70, 40);

  // ── "CALCULATED PNL" label + multiplier pill ──────────────────────────
  const labelY = 110;
  ctx.fillStyle = COLOR.textSecondary;
  ctx.font = '11px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('CALCULATED PNL', 24, labelY);

  // Measure the label so we can place the multiplier pill right after it.
  const labelWidth = ctx.measureText('CALCULATED PNL').width;
  const mult = formatMultiplier(event.multiplier);
  const pillText = `${mult}x`;
  ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
  const pillTextW = ctx.measureText(pillText).width;
  const pillW = pillTextW + 16;
  const pillH = 20;
  const pillX = 24 + labelWidth + 10;
  const pillY = labelY - pillH / 2;
  roundRect(ctx, pillX, pillY, pillW, pillH, 10);
  ctx.fillStyle = COLOR.bgElevated;
  ctx.fill();
  ctx.strokeStyle = COLOR.pillBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = COLOR.textPrimary;
  ctx.textAlign = 'center';
  ctx.fillText(pillText, pillX + pillW / 2, labelY);
  ctx.textAlign = 'left';

  // ── Big PNL value ─────────────────────────────────────────────────────
  const pnlSol = Number(event.pnl_sol) || 0;
  const pnlPrefix = pnlSol >= 0 ? '+' : '';
  const pnlText = `${pnlPrefix}${formatSol(pnlSol)} SOL`;
  ctx.fillStyle = COLOR.green;
  ctx.font = 'bold 38px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(pnlText, 24, 178);

  // ── INVESTED / SOLD columns ───────────────────────────────────────────
  const colY = 240;
  drawColumn(ctx, 24, colY, 'INVESTED', Number(event.invested_sol) || 0, event.invested_usd);
  drawColumn(ctx, WIDTH / 2 + 8, colY, 'SOLD', Number(event.sold_sol) || 0, event.sold_usd);

  // ── Subtle divider ────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(168,163,189,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, HEIGHT - 64);
  ctx.lineTo(WIDTH - 24, HEIGHT - 64);
  ctx.stroke();

  // ── Footer: link to the site ──────────────────────────────────────────
  const footerY = HEIGHT - 32;
  // Tiny chain-link glyph.
  ctx.strokeStyle = COLOR.purpleLight;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(28, footerY, 3, 0, Math.PI * 2);
  ctx.moveTo(32, footerY);
  ctx.lineTo(36, footerY);
  ctx.arc(40, footerY, 3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = COLOR.purpleLight;
  ctx.font = '12px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(siteUrl, 50, footerY);

  return canvas.toBuffer('image/png');
}

function drawColumn(ctx, x, y, label, sol, usd) {
  ctx.fillStyle = COLOR.textSecondary;
  ctx.font = '11px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x, y);

  // SOL line — "Σ 47.47" with the sigma in Offivex purple.
  const sigmaX = x;
  const sigmaY = y + 28;
  ctx.fillStyle = COLOR.purpleLight;
  ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Σ', sigmaX, sigmaY);
  const sigmaW = ctx.measureText('Σ').width;
  ctx.fillStyle = COLOR.textPrimary;
  ctx.fillText(formatSol(sol), sigmaX + sigmaW + 6, sigmaY);

  // USD sub-line.
  if (usd != null && Number.isFinite(usd)) {
    ctx.fillStyle = COLOR.textMuted;
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.fillText(formatUsd(usd), sigmaX, sigmaY + 18);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formatSol(n) {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUsd(n) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMultiplier(m) {
  const v = Number(m);
  if (!Number.isFinite(v) || v <= 0) return '1.00';
  return v.toFixed(2);
}

module.exports = { generatePnlCard };
