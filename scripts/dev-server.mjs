import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 8765;
const API_TARGET = process.env.API_TARGET || "https://calorie-tracker-omega-ten.vercel.app";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};

function serveStatic(req, res) {
  const urlPath = req.url?.split("?")[0] || "/";
  const relativePath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.join(ROOT, path.normalize(relativePath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function proxyApi(req, res) {
  const target = new URL(req.url || "/", API_TARGET);
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;

  const proxyReq = https.request(
    target,
    { method: req.method, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API proxy failed" }));
    }
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if ((req.url || "").startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Calorie tracker dev server: http://127.0.0.1:${PORT}/`);
  console.log(`API proxied to ${API_TARGET}`);
});
