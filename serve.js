/**
 * Zero-dependency static server for the HTML build.
 *   node serve.js        ->  http://localhost:4000/index.html
 *
 * Opening index.html by double-clicking works too; this exists so the page
 * can be previewed over http (video seeking and caching behave properly).
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = 4000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const rel = url === "/" ? "/index.html" : url;
    const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));

    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }

    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    const size = fs.statSync(file).size;
    const range = req.headers.range;

    // Range support so the browser can stream / scrub the hero video
    if (range && type === "video/mp4") {
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : size - 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": type,
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }

    res.writeHead(200, { "Content-Type": type, "Content-Length": size });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`Deerzign HTML -> http://localhost:${PORT}/index.html`);
  });
