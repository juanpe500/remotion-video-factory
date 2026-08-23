/**
 * Generate the bottom-third "source/example" images for a video from a
 * manifest, so the manual round-trip of hunting screenshots is reproducible.
 *
 * Each job in content/<slug>/images/sources.json is either:
 *   - type "url"  : screenshot a live web page (real source/example)
 *   - type "html" : screenshot a local HTML mockup (built to match the video)
 *
 * Output lands at public/<slug>/images/<out>, exactly where ImageBeats in
 * the styles look for it. Landscape JPGs, ~1280px+ wide, @2x for crispness.
 *
 * Usage:
 *   npx tsx scripts/generate-images.ts <slug> [out1.jpg out2.jpg ...]
 * With no filter args, renders every job in the manifest.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer, { type Page } from "puppeteer";

type Job = {
  out: string;
  type: "url" | "html";
  url?: string;
  html?: string;
  viewport?: { width: number; height: number };
  hide?: string[];
  waitFor?: string | number;
  scrollTo?: string;
  scrollOffset?: number;
  selector?: string;
  clip?: { x: number; y: number; width: number; height: number };
  note?: string;
};

async function hideElements(page: Page, selectors: string[]) {
  await page.evaluate((sels: string[]) => {
    for (const sel of sels) {
      document.querySelectorAll(sel).forEach((el) => {
        (el as HTMLElement).style.setProperty("display", "none", "important");
      });
    }
    // Belt-and-suspenders: cookie/consent banners often inject late and use
    // unpredictable class names, so also nuke any fixed/sticky element whose
    // text looks like a consent prompt. We never click "Accept" — just hide it.
    const rx = /(manage consent|cookie|consent|gdpr|we use cookies)/i;
    document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
      const pos = getComputedStyle(el).position;
      if ((pos === "fixed" || pos === "sticky") && rx.test(el.textContent ?? "") && el.offsetHeight < 700) {
        el.style.setProperty("display", "none", "important");
      }
    });
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
  }, selectors);
}

async function shoot(page: Page, job: Job, outPath: string) {
  const el = job.selector ? await page.$(job.selector) : null;
  if (el) {
    await el.screenshot({ path: outPath as `${string}.jpg`, type: "jpeg", quality: 92 });
    return;
  }
  await page.screenshot({
    path: outPath as `${string}.jpg`,
    type: "jpeg",
    quality: 92,
    fullPage: false,
    ...(job.clip ? { clip: job.clip } : {}),
  });
}

async function main() {
  const [slug, ...only] = process.argv.slice(2);
  if (!slug) {
    console.error("Usage: npx tsx scripts/generate-images.ts <slug> [out.jpg ...]");
    process.exit(1);
  }

  const imagesDir = path.join("content", slug, "images");
  const manifest = JSON.parse(await fs.readFile(path.join(imagesDir, "sources.json"), "utf-8"));
  const outDir = path.join("public", slug, "images");
  await fs.mkdir(outDir, { recursive: true });

  const jobs: Job[] = manifest.jobs.filter((j: Job) => only.length === 0 || only.includes(j.out));

  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      // Containers mount a tiny 64MB /dev/shm; Chromium uses it for its render
      // surfaces and the SECOND screenshot onward fails with "Unable to capture
      // screenshot" once it fills. Route that scratch space to /tmp instead.
      "--disable-dev-shm-usage",
      // No GPU in the container — force the software path explicitly so Chromium
      // doesn't spin up (and leak) GPU-process helpers on every shot.
      "--disable-gpu",
    ],
  });
  try {
    for (const job of jobs) {
      const page = await browser.newPage();
      const vp = job.viewport ?? { width: 1280, height: 720 };
      await page.setViewport({ ...vp, deviceScaleFactor: 2 });

      const src =
        job.type === "html"
          ? pathToFileURL(path.resolve(imagesDir, job.html!)).href
          : job.url!;

      console.log(`\n→ ${job.out}  (${job.type})  ${job.note ?? ""}`);
      await page.goto(src, { waitUntil: job.type === "url" ? "networkidle2" : "networkidle0", timeout: 60000 });

      if (typeof job.waitFor === "number") await new Promise((r) => setTimeout(r, job.waitFor as number));
      else if (typeof job.waitFor === "string") await page.waitForSelector(job.waitFor, { timeout: 15000 }).catch(() => {});
      if (job.scrollTo) {
        await page.evaluate(
          (sel: string, off: number) => {
            document.querySelector(sel)?.scrollIntoView({ block: "start" });
            if (off) window.scrollBy(0, off);
          },
          job.scrollTo,
          job.scrollOffset ?? 0,
        );
        await new Promise((r) => setTimeout(r, 500));
      }
      // Hide banners LAST — consent modals inject asynchronously after load,
      // so an early hide misses them. Run it after wait+scroll settle.
      if (job.hide?.length) await hideElements(page, job.hide);
      // let web fonts settle
      await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);

      const outPath = path.join(outDir, job.out);
      await shoot(page, job, outPath);
      const { size } = await fs.stat(outPath);
      console.log(`  wrote ${outPath}  (${Math.round(size / 1024)} KB)`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
