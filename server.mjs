// Minimal always-on server so the Viclix docker container stays up and the
// rendered videos / assets are browsable.
//
// SECURITY: serves ONLY the out/ and public/ trees — never the repo root.
// Viclix restores the project's .env into /app/.env at deploy time, so serving
// the root would expose secrets. Everything outside the allowlist is 404,
// dotfiles are always denied, and path traversal can't escape the allowed dirs.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT) || 3000;
const ROOT = process.cwd();
const ALLOW = ["out", "public"]; // only these subtrees are public
const TYPES = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

// Resolve a request path to a real file ONLY if it lives under an allowed
// subtree and contains no dot-file segment. Returns null otherwise.
function resolveSafe(rel) {
  const segments = rel.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  if (!ALLOW.includes(segments[0])) return null; // must be out/ or public/
  if (segments.some((s) => s.startsWith("."))) return null; // no dotfiles / no ..
  const fp = path.normalize(path.join(ROOT, ...segments));
  const base = path.join(ROOT, segments[0]);
  if (fp !== base && !fp.startsWith(base + path.sep)) return null; // no escape
  return fp;
}

http
  .createServer((req, res) => {
    try {
      const rel = decodeURIComponent((req.url || "/").split("?")[0]);
      if (rel === "/" || rel === "/health") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(
          `<h1>remotion-video-factory</h1><p>container up.</p><ul><li><a href="/out/">/out/</a> — rendered videos</li><li><a href="/public/">/public/</a> — assets</li></ul>`,
        );
      }
      const fp = resolveSafe(rel);
      if (!fp || !fs.existsSync(fp)) {
        res.writeHead(404);
        return res.end("not found");
      }
      if (fs.statSync(fp).isDirectory()) {
        const items = fs
          .readdirSync(fp)
          .filter((f) => !f.startsWith("."))
          .sort()
          .map((f) => `<li><a href="${path.posix.join(rel, f)}">${f}</a></li>`)
          .join("");
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(`<h2>${rel}</h2><ul>${items}</ul>`);
      }
      res.writeHead(200, { "content-type": TYPES[path.extname(fp).toLowerCase()] || "application/octet-stream" });
      return fs.createReadStream(fp).pipe(res);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  })
  .listen(PORT, "0.0.0.0", () => console.log(`remotion-video-factory serving on :${PORT} (out/ + public/ only)`));
