/**
 * Offload the render to GitHub Actions instead of rendering in this container.
 *
 * Builds a throwaway `render/<slug>` branch off origin/main containing ONLY this
 * video's scaffold (content/<slug>/**, src/videos/<slug>/**), pushes it, and
 * triggers the `matrix-render.yml` workflow — which runs the pipeline (audio ->
 * captions -> images -> render) + upload-savagescroll on a dedicated GitHub
 * runner (~10x faster than this saturated, GPU-less host, and free on a public
 * repo). Root.tsx auto-discovers videos, so the branch needs no registration edit.
 *
 * Usage:
 *   npx tsx scripts/dispatch-render.ts <slug> [page_id] [subpage_id] [mode]
 * Env:
 *   GITHUB_TOKEN — fine-grained PAT with Contents:write + Actions:write on the repo.
 */
import "dotenv/config"; // load /app/.env → GITHUB_TOKEN
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { agentLog } from "./lib/agentlog";

const REPO = "juanpe500/remotion-video-factory";
const WT = "/app/.render-wt"; // linked worktree, off the 64MB /tmp tmpfs

function run(cmd: string): string {
  return execSync(cmd, { stdio: "pipe" }).toString().trim();
}

async function main() {
  const [slug, pageId = "", subpageId = "", mode = "schedule"] = process.argv.slice(2);
  if (!slug) {
    console.error("Usage: npx tsx scripts/dispatch-render.ts <slug> [page_id] [subpage_id] [mode]");
    process.exit(1);
  }
  const token = (process.env.GITHUB_TOKEN || "").trim();
  if (!token) throw new Error("GITHUB_TOKEN is not set (needs Contents:write + Actions:write).");

  for (const dir of [`content/${slug}`, `src/videos/${slug}`]) {
    if (!fs.existsSync(path.join("/app", dir))) {
      throw new Error(`Missing scaffold: /app/${dir}. Build the video before dispatching.`);
    }
  }

  const branch = `render/${slug}`;

  // 1. A clean worktree at origin/main — sidesteps this container's dirty tree
  //    (old video dirs, a modified Root.tsx from past runs). origin/main carries
  //    the auto-discovery Root, so nothing here needs a Root edit.
  run("git -C /app fetch origin main");
  try { run(`git -C /app worktree remove --force ${WT}`); } catch { /* none yet */ }
  fs.rmSync(WT, { recursive: true, force: true });
  run(`git -C /app worktree add --detach ${WT} origin/main`);

  // 2. Drop THIS video's scaffold onto the clean tree.
  for (const dir of [`content/${slug}`, `src/videos/${slug}`]) {
    const dst = path.join(WT, dir);
    fs.rmSync(dst, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(path.join("/app", dir), dst, { recursive: true });
  }

  // 3. Commit + force-push the throwaway branch (a re-dispatch replaces it).
  run(`git -C ${WT} config user.email "agent@video-factory.local"`);
  run(`git -C ${WT} config user.name "video-builder"`);
  run(`git -C ${WT} checkout -B ${branch}`);
  run(`git -C ${WT} add content/${slug} src/videos/${slug}`);
  run(`git -C ${WT} commit -m "render ${slug}" --no-verify`);
  const pushUrl = `https://x-access-token:${token}@github.com/${REPO}.git`;
  execSync(`git -C ${WT} push --force "${pushUrl}" ${branch}`, { stdio: "pipe" });
  agentLog(`[dispatch] pushed ${branch}`);
  try { run(`git -C /app worktree remove --force ${WT}`); } catch { /* best effort */ }

  // 4. Trigger the render workflow on that branch. composition id === slug.
  const inputs = { slug, composition_id: slug, page_id: pageId, subpage_id: subpageId, mode };
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/matrix-render.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: branch, inputs }),
    },
  );
  if (res.status !== 204) {
    throw new Error(`workflow_dispatch failed: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  }
  agentLog(`[dispatch] matrix-render.yml triggered for ${slug} (page=${pageId || "none"} subpage=${subpageId || "none"} mode=${mode})`);
  console.log(
    `\n✅ Dispatched GitHub Actions render for "${slug}".\n` +
      `   branch: ${branch} · workflow: matrix-render.yml (parallel)\n` +
      `   The render + upload run on GitHub now (this container did NOT render).\n` +
      `   Watch: https://github.com/${REPO}/actions\n`,
  );
}

main().catch((err) => {
  console.error(`\n❌ dispatch-render failed: ${err.message}\n`);
  process.exit(1);
});
