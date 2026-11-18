"use strict";

// DOM and graphics interfaces used by the simulation-only VM checks.
// An image remains pending here. Decoded assets and pixels are tested in Chrome.
function prepareBrowser({document, nodes, canvas, createNode}) {
  const prepare = node => {
    node.style ??= {};
    node.style.setProperty ??= function(key, value) { this[key] = value; };
    node.parentElement ??= { querySelector() { return null; } };
    if (!node.classList) {
      const classes = new Set();
      node.classList = {
        contains: value => classes.has(value),
        add: value => classes.add(value),
        remove: value => classes.delete(value),
        toggle(value, enabled = !classes.has(value)) {
          if (enabled) classes.add(value);
          else classes.delete(value);
          return enabled;
        }
      };
    }
    return node;
  };
  for (const node of nodes.values()) prepare(node);
  document.getElementById ??= id => document.querySelector("#"+id) ?? null;
  const originalContext = canvas.getContext;
  canvas.getContext = function (...args) {
    const ctx = originalContext.apply(this,args);
    ctx.createImageData = (width,height) => ({width,height,data:new Uint8ClampedArray(width*height*4)});
    ctx.getTransform = () => ({a:1,b:0,c:0,d:1,e:0,f:0});
    return ctx;
  };
  document.createElement = tag => {
    const node = prepare(createNode());
    if(tag === "canvas") node.getContext = () => canvas.getContext("2d");
    return node;
  };
  class PendingImage {
    complete = false;
    naturalWidth = 0;
    naturalHeight = 0;
    addEventListener() {}
  }
  class MockPath2D {
    constructor() { return canvas.getContext("2d"); }
  }
  return {Image:PendingImage, Path2D:MockPath2D, performance};
}
module.exports = {prepareBrowser};
