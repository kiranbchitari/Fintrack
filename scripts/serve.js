// Tiny local web server for trying the app in a browser: node scripts/serve.js [port]
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "www"), port = +process.env.PORT || +process.argv[2] || 8766;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".css": "text/css" };
http.createServer((req, res) => {
  const file = path.join(root, path.normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[\/\\])+/, ""));
  const target = file.endsWith(path.sep) || file === root ? path.join(file, "index.html") : file;
  if (!target.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(port, "127.0.0.1", () => console.log(`Fintrack at http://localhost:${port}`));
