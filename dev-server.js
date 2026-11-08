"use strict";

const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 49179);
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/config.js", ["config.js", "text/javascript; charset=utf-8"]],
  ["/world-model.js", ["world-model.js", "text/javascript; charset=utf-8"]],
  ["/multiplayer.js", ["multiplayer.js", "text/javascript; charset=utf-8"]],
  ["/vendor/qrcode.js", ["vendor/qrcode.js", "text/javascript; charset=utf-8"]],
  ["/game.js", ["game.js", "text/javascript; charset=utf-8"]],
  ["/avatar.html", ["avatar.html", "text/html; charset=utf-8"]],
  ["/avatar.css", ["avatar.css", "text/css; charset=utf-8"]],
  ["/avatar-model.js", ["avatar-model.js", "text/javascript; charset=utf-8"]],
  ["/avatar-editor.js", ["avatar-editor.js", "text/javascript; charset=utf-8"]],
  ["/mob.html", ["mob.html", "text/html; charset=utf-8"]],
  ["/mob.css", ["mob.css", "text/css; charset=utf-8"]],
  ["/mob-model.js", ["mob-model.js", "text/javascript; charset=utf-8"]],
  ["/boss-arena.js", ["boss-arena.js", "text/javascript; charset=utf-8"]],
  ["/mob-editor.js", ["mob-editor.js", "text/javascript; charset=utf-8"]],
  ["/silhouette-effect.js", ["silhouette-effect.js", "text/javascript; charset=utf-8"]],
  ["/model-effects.js", ["model-effects.js", "text/javascript; charset=utf-8"]],
  ["/motion-test.html", ["motion-test.html", "text/html; charset=utf-8"]],
  ["/motion-test.css", ["motion-test.css", "text/css; charset=utf-8"]],
  ["/motion-sensing.js", ["motion-sensing.js", "text/javascript; charset=utf-8"]],
  ["/motion-arm-swing.html", ["motion-arm-swing.html", "text/html; charset=utf-8"]],
  ["/motion-arm-swing.css", ["motion-arm-swing.css", "text/css; charset=utf-8"]],
  ["/motion-arm-swing.js", ["motion-arm-swing.js", "text/javascript; charset=utf-8"]],
  ["/motion-arm-swing-page.js", ["motion-arm-swing-page.js", "text/javascript; charset=utf-8"]],
  ["/motion-avatar.js", ["motion-avatar.js", "text/javascript; charset=utf-8"]],
  ["/motion-test.js", ["motion-test.js", "text/javascript; charset=utf-8"]],
  ["/motion-run.html", ["motion-run.html", "text/html; charset=utf-8"]],
  ["/motion-run.css", ["motion-run.css", "text/css; charset=utf-8"]],
  ["/motion-run-model.js", ["motion-run-model.js", "text/javascript; charset=utf-8"]],
  ["/motion-run-course.js", ["motion-run-course.js", "text/javascript; charset=utf-8"]],
  ["/motion-run-course-renderer.js", ["motion-run-course-renderer.js", "text/javascript; charset=utf-8"]],
  ["/motion-run.js", ["motion-run.js", "text/javascript; charset=utf-8"]],
]);

createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const entry = files.get(new URL(request.url, "http://localhost").pathname);
  if (!entry) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }

  try {
    const content = await readFile(path.join(root, entry[0]));
    response.writeHead(200, {
      "Content-Type": entry[1],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    console.error(`Could not serve ${entry[0]}.`, error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Could not serve this file");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Moneycraft development page: http://127.0.0.1:${port}`);
});
