/**
 * Render an MDGraph (https://github.com/juanpe500/mdgraphs) diagram to a
 * static SVG using the library's own auto-layout, WITHOUT using its
 * timers/animation engine (those run on real wall-clock time and can't be
 * made frame-deterministic for Remotion). Every node/edge lands in the SVG
 * as its own `<g data-id="...">`, initially hidden — Remotion drives the
 * reveal from there, synced to narration timing.
 *
 * Usage:
 *   npx tsx scripts/generate-diagram.ts <slug> <name>
 *
 * Reads content/<slug>/diagrams/<name>.mdgraph and writes
 * public/<slug>/diagrams/<name>.svg
 */
import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { agentLog } from "./lib/agentlog";

// Must match the Terminal style's BG constant (src/videos/.../styles/Terminal.tsx) —
// MDGraph uses `bg` both as the SVG's own background AND as the "knockout"
// color for badge icon glyphs (a colored circle with the icon punched out
// in the background color), so it can't just be "transparent" or icons
// render invisible. We strip the background back out below instead.
const TERMINAL_BG = "#04070A";

const THEME_OVERRIDES = {
  bg: TERMINAL_BG,
  node: "#04140D",
  nodeStroke: "#39FF88",
  edge: "#2A5C46",
  edgeLabel: "#39FF88",
  text: "#39FF88",
  accent: "#4DE8FF",
  flow: "#4DE8FF",
  glow: "#4DE8FF",
  palette: ["#39FF88", "#4DE8FF"],
};

async function main() {
  const [slug, name] = process.argv.slice(2);
  if (!slug || !name) {
    console.error("Usage: npx tsx scripts/generate-diagram.ts <slug> <name>");
    process.exit(1);
  }

  const sourcePath = path.join("content", slug, "diagrams", `${name}.mdgraph`);
  const source = await fs.readFile(sourcePath, "utf-8");
  const mdgraphJs = await fs.readFile(path.join("scripts", "vendor", "mdgraph.js"), "utf-8");

  agentLog(`[${slug}] diagram: rendering ${name}.mdgraph → svg…`);
  // Container-safe flags: 64MB /dev/shm and no GPU otherwise crash the render
  // (see generate-images.ts for the same reasoning).
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(
      "<!DOCTYPE html><html><body><div id='chart' style='width:1080px;height:1200px'></div></body></html>",
    );
    await page.addScriptTag({ content: mdgraphJs });

    const svg = await page.evaluate(
      (src: string, themeOverrides: Record<string, unknown>) => {
        // @ts-expect-error MDGraph is a global injected by the vendored script tag.
        window.MDGraph.render("#chart", src, {
          theme: "dark",
          autoplay: false,
          controls: false,
          exportButtons: false,
          zoom: false,
          grid: false,
          themeOverrides,
        });
        const svgEl = document.querySelector("#chart svg");
        return svgEl ? svgEl.outerHTML : null;
      },
      source,
      THEME_OVERRIDES,
    );

    if (!svg) {
      throw new Error("MDGraph did not produce an <svg> element.");
    }

    // Icon glyphs needed a real bg color to render (see comment above);
    // now swap the SVG's own background back to transparent so it composites
    // over whatever Remotion draws behind it. The browser normalizes the hex
    // color to rgb(...) when serializing outerHTML, so match generically —
    // `background` is always the first declaration in this inline style.
    const transparentSvg = svg.replace(/style="background:\s*[^;]+;/, 'style="background: transparent;');

    const outFile = path.join("public", slug, "diagrams", `${name}.svg`);
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, transparentSvg);
    agentLog(`[${slug}] diagram: done → ${outFile}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
