"use strict";
const fs = require("node:fs"), path = require("node:path");

// The other testkit requests are whole-file Playwright responses. Video seeking
// also needs the MIME type and partial responses supplied by a real static host.
async function serveOpeningFilms(page, game) {
  await page.route("**/assets/intro/performances/*.mp4", async route => {
    const name=path.basename(new URL(route.request().url()).pathname);
    const data=await fs.promises.readFile(path.join(game,"assets/intro/performances",name));
    const range=/^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || "");
    if (!range) return route.fulfill({contentType:"video/mp4",body:data});
    const start=Number(range[1]), end=range[2] ? Math.min(Number(range[2]),data.length-1) : data.length-1;
    return route.fulfill({status:206,contentType:"video/mp4",headers:{"accept-ranges":"bytes",
      "content-range":`bytes ${start}-${end}/${data.length}`},body:data.subarray(start,end+1)});
  });
}
module.exports = { serveOpeningFilms };
