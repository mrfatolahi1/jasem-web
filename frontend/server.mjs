// The jasem-web frontend server: serves public/ and forwards /api/ to the
// Django backend, so the browser talks to one origin. No dependencies.
//
//   node server.mjs                        # http://127.0.0.1:3500
//   PORT=4000 JASEM_API=http://127.0.0.1:8001 node server.mjs

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3500);
const API = new URL(process.env.JASEM_API ?? "http://127.0.0.1:8000");
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "public");

const PAGES = new Set(["/", "/tasks", "/time", "/spending", "/help"]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
};
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

/** The jasem files are the user's own: only this machine, and only this page, may write them. */
function allowed(request) {
  const host = (request.headers.host ?? "").replace(/:\d+$/, "");
  if (!LOCAL_HOSTS.has(host)) return false;
  const origin = request.headers.origin;
  if (!origin || request.method === "GET" || request.method === "HEAD") return true;
  return origin === `http://${request.headers.host}`;
}

function proxy(request, response) {
  const upstream = http.request({
    hostname: API.hostname,
    port: API.port || 80,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: API.host },
  }, (answer) => {
    response.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(response);
  });
  upstream.on("error", () => sendJson(response, 502, {
    error: `the jasem-web API is not answering at ${API.origin}; start it with: cd backend && python manage.py runserver ${API.host}`,
  }));
  request.pipe(upstream);
}

async function serveFile(pathname, response) {
  const file = PAGES.has(pathname) ? join(PUBLIC, "index.html") : normalize(join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC + sep)) return sendJson(response, 404, { error: "not found" });
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    const cache = extname(file) === ".woff2" ? "public, max-age=31536000, immutable" : "no-cache";
    response.writeHead(200, { "Content-Type": type, "Content-Length": info.size, "Cache-Control": cache });
    createReadStream(file).pipe(response);
  } catch {
    sendJson(response, 404, { error: "not found" });
  }
}

const server = http.createServer((request, response) => {
  if (!allowed(request)) return sendJson(response, 403, { error: "jasem-web only answers its own pages on this machine" });
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    return sendJson(response, 400, { error: "bad path" });
  }
  if (pathname.startsWith("/api/")) return proxy(request, response);
  if (request.method !== "GET" && request.method !== "HEAD") return sendJson(response, 405, { error: "method not allowed" });
  serveFile(pathname, response);
});

server.listen(PORT, HOST, () => {
  console.log(`jasem-web on http://${HOST === "127.0.0.1" ? "localhost" : HOST}:${PORT}  (API: ${API.origin})`);
});
