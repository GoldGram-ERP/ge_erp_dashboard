// Rough pixel diff of the desk's three-column area against the reference (from scripts/desk-d2b-shots.mjs): the smaller image is padded with magenta, so a size difference counts as different pixels.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const nm = process.env.NM ?? "../e2e-tests/node_modules";
const pm = require(`${nm}/pixelmatch`), pixelmatch = pm.default ?? pm, { PNG } = require(`${nm}/pngjs`);
const dir = new URL("../.shots/desk-d2b/", import.meta.url);
for (const size of ["desktop", "phone"]) for (const theme of ["light", "dark"]) {
  const A = PNG.sync.read(readFileSync(new URL(`cols-ref-${size}-${theme}.png`, dir))), B = PNG.sync.read(readFileSync(new URL(`cols-ours-${size}-${theme}.png`, dir)));
  const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
  const pad = (img) => { const o = new PNG({ width: w, height: h }); for (let i = 0; i < o.data.length; i += 4) o.data.set([255, 0, 255, 255], i); PNG.bitblt(img, o, 0, 0, img.width, img.height, 0, 0); return o; };
  const out = new PNG({ width: w, height: h });
  const n = pixelmatch(pad(A).data, pad(B).data, out.data, w, h, { threshold: 0.15 });
  writeFileSync(new URL(`diff-${size}-${theme}.png`, dir), PNG.sync.write(out));
  console.log(`${size} ${theme}: ref ${A.width}x${A.height}, ours ${B.width}x${B.height}, different ${(100 * n / (w * h)).toFixed(1)}%`);
}
