"use strict";

async function asyncPool(concurrency, items, fn) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const safe = Math.max(1, Number(concurrency) || 1);
  const out = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const i = index;
      if (i >= items.length) return;
      index += 1;
      out[i] = await fn(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(safe, items.length) }, () => worker()),
  );
  return out;
}

function chunkArray(items, size) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const out = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

function nowMs() {
  return Date.now();
}
function hrSeconds(ms) {
  return ((Date.now() - ms) / 1000).toFixed(1);
}

module.exports = {
  asyncPool,
  chunkArray,
  nowMs,
  hrSeconds,
};
