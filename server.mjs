// Minimal always-on server so the Viclix docker container stays up and the
// rendered videos / assets are browsable at the project URL. Rendering itself
// is done by agents running `npx remotion render ...` inside the container.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT) || 3000;
const ROOT = process.cwd();
const TYPES = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

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
      const fp = path.normalize(path.join(ROOT, rel));
      if (!fp.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end("forbidden");
      }
      if (!fs.existsSync(fp)) {
        res.writeHead(404);
        return res.end("not found");
      }
      if (fs.statSync(fp).isDirectory()) {
        const items = fs
          .readdirSync(fp)
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
  .listen(PORT, "0.0.0.0", () => console.log(`remotion-video-factory serving on :${PORT}`));
