// Runs the device benchmark (bench.js) off the page's thread and posts the result back.
import { benchmark } from './bench.js';

self.onmessage = (e) => {
  try { self.postMessage({ ok: true, result: benchmark(e.data ?? {}) }); } catch (err) { self.postMessage({ ok: false, error: String(err) }); }
};
