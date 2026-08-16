// Zero-dependency static file server for tests only — mirrors how GitHub Pages
// serves this repo (plain files, relative paths), so Playwright can drive the
// real page instead of a file:// URL.
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4173;

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function send(res, status, body, contentType){
  res.writeHead(status, { "Content-Type": contentType || "text/plain; charset=utf-8" });
  res.end(body);
}

var server = http.createServer(function(req, res){
  var urlPath = decodeURIComponent(req.url.split("?")[0]);
  var filePath = path.join(ROOT, urlPath);

  if (!filePath.startsWith(ROOT)) { send(res, 403, "Forbidden"); return; }

  fs.stat(filePath, function(err, stats){
    if (!err && stats.isDirectory()) filePath = path.join(filePath, "index.html");

    fs.readFile(filePath, function(err2, data){
      if (err2) { send(res, 404, "Not found: " + urlPath); return; }
      send(res, 200, data, MIME[path.extname(filePath)] || "application/octet-stream");
    });
  });
});

if (require.main === module) {
  server.listen(PORT, function(){
    console.log("Serving " + ROOT + " at http://localhost:" + PORT);
  });
}

module.exports = server;
