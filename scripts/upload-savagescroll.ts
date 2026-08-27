/**
 * Upload a finished render to savagescroll.com and (by default) queue it into
 * the scheduler. Ported from D:\FastAPI\video-editor\app\savagescroll.py — same
 * v1 API, same direct-to-storage upload, adapted to this Node/TS pipeline.
 *
 * Usage:
 *   npx tsx scripts/upload-savagescroll.ts <path-to-mp4> \
 *     --page <pageId> [--subpage <subpageId>] [--caption "..."] \
 *     [--caption-file <path>] [--vault-only]
 *
 * Modes:
 *   default      upload to the page vault THEN create a post on <subpage> — the
 *                post enters savagescroll's scheduler (requires --subpage).
 *   --vault-only upload the asset only; do NOT queue a post.
 *
 * Env:
 *   SAVAGESCROLL_API_KEY   sk_...  (required; never printed)
 *   SAVAGESCROLL_BASE_URL  default https://app.savagescroll.com
 *                          MUST be the app. host and MUST NOT redirect — HTTP
 *                          clients drop the Authorization header across a host
 *                          change, so a 301 lands unauthenticated.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import "dotenv/config";
import { agentLog } from "./lib/agentlog";

const BASE_URL = (process.env.SAVAGESCROLL_BASE_URL || "https://app.savagescroll.com").replace(/\/+$/, "");

interface Args {
  file: string;
  page?: string;
  subpage?: string;
  caption?: string;
  captionFile?: string;
  vaultOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const [file, ...rest] = argv;
  if (!file) {
    console.error(
      "Usage: npx tsx scripts/upload-savagescroll.ts <mp4> --page <id> [--subpage <id>] [--caption \"...\"] [--caption-file <path>] [--vault-only]",
    );
    process.exit(1);
  }
  const out: Args = { file, vaultOnly: false };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--page") out.page = rest[++i];
    else if (a === "--subpage") out.subpage = rest[++i];
    else if (a === "--caption") out.caption = rest[++i];
    else if (a === "--caption-file") out.captionFile = rest[++i];
    else if (a === "--vault-only") out.vaultOnly = true;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

function apiKey(): string {
  const key = (process.env.SAVAGESCROLL_API_KEY || "").trim();
  if (!key) throw new Error("SAVAGESCROLL_API_KEY is not set in the environment.");
  if (!key.startsWith("sk_")) throw new Error("SAVAGESCROLL_API_KEY looks wrong — keys start with 'sk_'.");
  return key;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${apiKey()}`, Accept: "application/json" };
}

/** Read the JSON body, or throw with whatever detail the API gave us. */
async function unwrap(res: Response, what: string): Promise<any> {
  const text = await res.text();
  if (res.ok) {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${what}: savagescroll returned a non-JSON reply: ${text.slice(0, 200)}`);
    }
  }
  let detail = text.slice(0, 300);
  try {
    const body = JSON.parse(text);
    detail = body.detail || body.message || detail;
    if (Array.isArray(detail)) detail = detail.map((d: any) => d.msg ?? d).join("; ");
  } catch {
    /* not JSON — keep the raw text */
  }
  if (res.status === 401) detail = detail || "Invalid API key.";
  if (res.status === 429) detail = detail || "Rate limited by savagescroll — wait a minute and retry.";
  throw new Error(`${what} failed (HTTP ${res.status}): ${detail}`);
}

async function apiGet(p: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/v1${p}`, { headers: authHeaders() });
  return unwrap(res, `GET ${p}`);
}

async function apiPost(p: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/v1${p}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return unwrap(res, `POST ${p}`);
}

/** PUT a file's bytes straight to storage. Content-Length is implicit from the
 *  Buffer; the presigned URL is signed for a plain PUT, so no chunked encoding. */
async function putFile(url: string, bytes: Buffer, contentType: string, what: string): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(bytes.length) },
    body: bytes,
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`${what} rejected by storage (HTTP ${res.status}): ${body}`);
  }
}

function sha256(file: string): string {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(file));
  return h.digest("hex");
}

/**
 * Extract one JPEG frame at 30% of the video's duration (JP: not frame 1 — the
 * frame a third of the way in, which is representative of the content). Returns
 * null if ffmpeg/ffprobe can't produce one — a missing thumbnail never fails an
 * upload.
 */
function makeThumbnail(src: string): string | null {
  const ffprobe = process.env.FFPROBE_BIN || "ffprobe";
  const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
  const out = src.replace(/\.[^.]+$/, "") + ".thumb.jpg";
  try {
    const durStr = execFileSync(ffprobe, [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src,
    ]).toString().trim();
    const dur = parseFloat(durStr);
    const seek = Number.isFinite(dur) && dur > 0 ? (dur * 0.3).toFixed(3) : "0";
    execFileSync(ffmpeg, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", seek,                       // 30% in; before -i = fast seek
      "-i", src,
      "-frames:v", "1",
      "-vf", "scale='min(720,iw)':-2",
      out,
    ]);
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;
  } catch (e) {
    agentLog(`[upload] thumbnail extraction failed (non-fatal): ${(e as Error).message}`);
  }
  return null;
}

function resolveCaption(args: Args): string {
  if (args.caption != null) return args.caption;
  if (args.captionFile && fs.existsSync(args.captionFile)) {
    return fs.readFileSync(args.captionFile, "utf-8").trim();
  }
  return "";
}

/** Upload straight into storage via a presigned PUT, then register the object. */
async function uploadDirect(page: string, file: string, filename: string, grant: any): Promise<any> {
  const storedName: string = grant.filename;
  const uploadUrl: string = grant.upload_url;
  if (!storedName || !uploadUrl) throw new Error("savagescroll did not return an upload URL.");

  const bytes = fs.readFileSync(file);
  const checksum = sha256(file);

  agentLog(`[upload] PUT ${filename} (${(bytes.length / 1e6).toFixed(1)} MB) → storage`);
  await putFile(uploadUrl, bytes, "video/mp4", "Video upload");

  // Best effort: the asset is perfectly usable without a thumbnail.
  const thumb = makeThumbnail(file);
  if (thumb && grant.thumbnail_upload_url) {
    try {
      await putFile(grant.thumbnail_upload_url, fs.readFileSync(thumb), "image/jpeg", "Thumbnail upload");
      agentLog(`[upload] thumbnail (frame @30%) uploaded`);
    } catch (e) {
      agentLog(`[upload] thumbnail upload failed (non-fatal): ${(e as Error).message}`);
    } finally {
      fs.rmSync(thumb, { force: true });
    }
  } else if (thumb) {
    fs.rmSync(thumb, { force: true });
  }

  agentLog(`[upload] registering asset in vault of page ${page}`);
  return apiPost(`/vault/${page}/register`, { filename: storedName, checksum });
}

/** Multipart fallback for deployments without presigned uploads. */
async function uploadMultipart(page: string, file: string, filename: string): Promise<any> {
  agentLog(`[upload] presigned upload unavailable — falling back to multipart POST`);
  const form = new FormData();
  const blob = new Blob([fs.readFileSync(file)], { type: "video/mp4" });
  form.append("files", blob, filename);
  const res = await fetch(`${BASE_URL}/api/v1/vault/${page}/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  const body = await unwrap(res, "Multipart upload");
  const uploaded = body.uploaded || [];
  if (!uploaded.length) {
    const why = body.errors?.[0]?.error || "the vault returned no asset";
    throw new Error(`Upload rejected: ${why}`);
  }
  return uploaded[0];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = path.resolve(args.file);
  if (!fs.existsSync(file)) throw new Error(`${file} not found.`);
  if (!args.page) throw new Error("Missing --page <pageId>. List pages with GET /api/v1/pages.");
  if (!args.vaultOnly && !args.subpage) {
    throw new Error("Queuing a post needs --subpage <id>. Use --vault-only to skip the scheduler.");
  }

  const filename = path.basename(file);
  const size = fs.statSync(file).size;
  agentLog(`[upload] ${filename} (${(size / 1e6).toFixed(1)} MB) → savagescroll page ${args.page} (${BASE_URL})`);

  // Prefer the direct-to-storage path; fall back to multipart on 404.
  let asset: any;
  try {
    const grant = await apiPost(`/vault/${args.page}/upload-url`, {
      filename,
      content_type: "video/mp4",
      size,
    });
    asset = await uploadDirect(args.page, file, filename, grant);
  } catch (e) {
    if ((e as Error).message.includes("HTTP 404")) {
      asset = await uploadMultipart(args.page, file, filename);
    } else {
      throw e;
    }
  }

  const assetId = asset.id || asset.asset_id;
  if (!assetId) throw new Error(`Vault register returned no asset id: ${JSON.stringify(asset).slice(0, 200)}`);
  agentLog(`[upload] asset registered → id=${assetId}`);

  if (args.vaultOnly) {
    console.log(`\n✅ Uploaded to vault (not scheduled). asset_id=${assetId}\n`);
    return;
  }

  const caption = resolveCaption(args);
  const post = await apiPost(`/posts/${args.page}/${args.subpage}/create`, {
    media_type: "video",
    caption,
    asset_ids: [assetId],
  });
  const postId = post.id || post.post_id || "(unknown)";
  agentLog(`[upload] post queued to scheduler → post=${postId} subpage=${args.subpage}`);
  console.log(`\n✅ Uploaded + queued to scheduler. asset_id=${assetId} post_id=${postId}\n`);
}

main().catch((err) => {
  console.error(`\n❌ savagescroll upload failed: ${err.message}\n`);
  process.exit(1);
});
