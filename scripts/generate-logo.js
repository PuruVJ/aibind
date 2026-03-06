/**
 * Generates docs/public/logo.svg with JetBrains Mono Bold embedded as base64.
 * Then renders docs/public/logo.png via Puppeteer at 2x resolution.
 *
 * JetBrains Mono metrics (per 1000-unit em):
 *   advance width per char = 600  →  charW = fontSize * 0.6
 *   x-height ratio          ≈ 0.52
 *   descender ratio         ≈ 0.21
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const FONT_PATH = `${process.env.HOME}/Library/Fonts/JetBrainsMono-Bold.ttf`;
const SVG_OUT = "/Users/puruvijay/Projects/svai/docs/public/logo.svg";
const PNG_OUT = "/Users/puruvijay/Projects/svai/docs/public/logo.png";

const SIZE = 512;
const RX = 112; // rounded corner radius

// Typography
const FONT_SIZE = 295;
const CHAR_W = FONT_SIZE * 0.6; // 138 px per char (monospace)
const TEXT_W = CHAR_W * 2; // 276 px for "ai"
const X_START = (SIZE - TEXT_W) / 2; // left edge of "ai"

// Vertical: optically center the mark (text + arc) in the 512px square
const X_HEIGHT = FONT_SIZE * 0.52; // above baseline
const ARC_GAP = 25; // px gap between baseline and arc start
// Large radius = flat/gentle arc with nearly straight ends
const DX = CHAR_W; // px between char centers
const R = DX * 0.75; // smaller radius → rounder arc
const ARC_SAG = R - Math.sqrt(R * R - (DX / 2) ** 2); // ≈ 15 px
const MARK_H = X_HEIGHT + ARC_GAP + ARC_SAG; // total visual height ≈ 144 px
const BASELINE = Math.round((SIZE + MARK_H) / 2 - ARC_SAG - ARC_GAP) + 20; // center the whole mark

// Arc anchor points
const CENTER_A = X_START + CHAR_W * 0.5;
const CENTER_I = X_START + CHAR_W * 1.5;
const ARC_Y = BASELINE + ARC_GAP;

function buildSVG(fontBase64) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>
    <style>
      @font-face {
        font-family: 'JetBrains Mono';
        font-weight: 700;
        src: url('data:font/ttf;base64,${fontBase64}') format('truetype');
      }
    </style>

    <!-- Text gradient: diagonal, dark-amber → light-amber -->
    <linearGradient id="tg"
      x1="${X_START}" y1="${BASELINE - X_HEIGHT}"
      x2="${X_START + TEXT_W}" y2="${BASELINE}"
      gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#92400e"/>
      <stop offset="30%"  stop-color="#d97706"/>
      <stop offset="65%"  stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#fcd34d"/>
    </linearGradient>

    <!-- Arc gradient: same colour range, left→right -->
    <linearGradient id="ag"
      x1="${CENTER_A}" y1="0" x2="${CENTER_I}" y2="0"
      gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="#92400e"/>
      <stop offset="100%" stop-color="#fcd34d"/>
    </linearGradient>

    <!-- Ambient glow -->
    <radialGradient id="gl" cx="50%" cy="54%" r="48%">
      <stop offset="0%"   stop-color="#d97706" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#d97706" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="${SIZE}" height="${SIZE}" rx="${RX}" fill="#0f0c07"/>

  <!-- Ambient glow -->
  <rect width="${SIZE}" height="${SIZE}" rx="${RX}" fill="url(#gl)"/>

  <!-- Subtle inner rim -->
  <rect width="${SIZE}" height="${SIZE}" rx="${RX}" fill="none"
        stroke="rgba(251,191,36,0.09)" stroke-width="1.5"/>

  <!-- "ai" in JetBrains Mono Bold -->
  <text
    x="${X_START}"
    y="${BASELINE}"
    font-family="'JetBrains Mono', monospace"
    font-weight="700"
    font-size="${FONT_SIZE}"
    fill="url(#tg)"
  >ai</text>

  <!-- Connecting arc — binds 'a' to 'i' -->
  <path
    d="M ${CENTER_A.toFixed(2)} ${ARC_Y} A ${R.toFixed(2)} ${R.toFixed(2)} 0 0 0 ${CENTER_I.toFixed(2)} ${ARC_Y}"
    stroke="url(#ag)"
    stroke-width="17"
    stroke-linecap="butt"
    fill="none"
  />
</svg>`;
}

(async () => {
  // 1. Read and embed font
  const fontBuf = fs.readFileSync(FONT_PATH);
  const fontBase64 = fontBuf.toString("base64");
  const svg = buildSVG(fontBase64);

  fs.writeFileSync(SVG_OUT, svg, "utf8");
  console.log(`SVG saved: ${SVG_OUT}  (${(svg.length / 1024).toFixed(0)} KB)`);

  // 2. Render PNG via Puppeteer
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 2 });

  const fileUrl = `file://${SVG_OUT}`;
  await page.goto(fileUrl, { waitUntil: "networkidle0" });

  await page.screenshot({
    path: PNG_OUT,
    type: "png",
    clip: { x: 0, y: 0, width: SIZE, height: SIZE },
    omitBackground: true,
  });

  await browser.close();
  console.log(`PNG saved: ${PNG_OUT}  (1024×1024 physical pixels)`);
})();
