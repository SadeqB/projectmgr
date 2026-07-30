const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 8000);
const root = __dirname;
const dataPath = path.join(root, "data.json");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const server = http.createServer((request, response) => {
  const requestedPath = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname);

  if (requestedPath === "/api/data") {
    handleDataRequest(request, response);
    return;
  }

  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const headers = { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" };
    if (path.basename(filePath) === "service-worker.js") {
      headers["Cache-Control"] = "no-cache";
      headers["Service-Worker-Allowed"] = "/";
    }
    response.writeHead(200, headers);
    response.end(data);
  });
});

function handleDataRequest(request, response) {
  if (request.method === "GET") {
    fs.readFile(dataPath, "utf8", (error, data) => {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(error ? "{}" : data);
    });
    return;
  }

  if (request.method === "PUT") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) request.destroy();
    });
    request.on("end", () => {
      try {
        JSON.parse(body);
        fs.writeFile(dataPath, body, "utf8", (error) => {
          if (error) {
            response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ ok: false }));
            return;
          }
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          response.end(JSON.stringify({ ok: true }));
        });
      } catch {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }

  response.writeHead(405, { "Allow": "GET, PUT" });
  response.end("Method not allowed");
}

server.listen(port, () => {
  console.log(`Project Time Manager is running at http://localhost:${port}`);
});
