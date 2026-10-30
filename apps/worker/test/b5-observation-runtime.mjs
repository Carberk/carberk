import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

const cases = new AsyncLocalStorage();
const locales = ["tk", "ru", "en"];
const opened = new Set();
const outerNames = ["fixture-fonts", "issued-generation", "issued-read-parse", "backlog-erasure", "pending-locales", "maintenance", "replacement-preservation", "ordinary-drain"];
const innerNames = ["render-create", "render-fonts", "render-layout", "render-save", "parse-load", "parse-font-maps", "parse-content", "worker-current", "worker-cleanup"];
const successCounts = [10, 10, 10, 10, 4, 12, 12];

function bounded(state, value, limit) {
  if (!Number.isFinite(value) || value < 0 || value >= limit) {
    state.invalid = true;
    return Number.isFinite(value) ? Math.max(0, Math.min(limit, value)) : 0;
  }
  return value;
}
function increment(state, cell, key) {
  cell[key] = bounded(state, cell[key] + 1, 1024);
}
function finishSegment(frame, now, failed) {
  const cell = frame.state.inner[frame.name];
  increment(frame.state, cell, failed ? "failed" : "completed");
  if (!failed) cell.completedMs = bounded(frame.state, cell.completedMs + now - frame.startedAt, 60000);
}
function finishOuter(state, now) {
  state.outer[state.outerName] = bounded(state, state.outer[state.outerName] + now - state.outerStartedAt, 60000);
}

export function observeCase(locale, body) {
  // The pinned it.each has exactly these three entries and no retry option.
  if (!locales.includes(locale) || opened.has(locale)) throw new Error("B5_OBSERVATION_CASE_MISMATCH");
  opened.add(locale);
  const now = performance.now();
  const state = {
    locale, startedAt: now, outerStartedAt: now, outerName: "fixture-fonts",
    outer: Object.fromEntries(outerNames.map(name => [name, 0])),
    inner: Object.fromEntries(innerNames.map(name => [name, { started: 0, completed: 0, failed: 0, completedMs: 0 }])),
    active: new Set(), frozen: false, invalid: false,
  };
  // One success continuation only. Rejections retain their original reason.
  return cases.run(state, () => body(state)).then(value => {
    emitFrozen(state, "success");
    return value;
  });
}

export function observeOuter(next) {
  const state = cases.getStore();
  if (!state || state.frozen) return;
  if (!outerNames.includes(next)) { state.invalid = true; return; }
  const now = performance.now();
  finishOuter(state, now);
  state.outerName = next;
  state.outerStartedAt = now;
}

export function begin(name) {
  const state = cases.getStore();
  if (!state || state.frozen) return;
  if (!innerNames.includes(name) || state.active.size >= 32) { state.invalid = true; return; }
  const frame = { state, name, startedAt: performance.now() };
  increment(state, state.inner[name], "started");
  state.active.add(frame);
  return frame;
}

export function step(frame, name) {
  if (!frame || frame.state.frozen) return;
  const state = frame.state;
  if (!innerNames.includes(name) || !state.active.has(frame)) { state.invalid = true; return; }
  const now = performance.now();
  finishSegment(frame, now, false);
  frame.name = name;
  frame.startedAt = now;
  increment(state, state.inner[name], "started");
}

export function close(frame, failed) {
  if (!frame || frame.state.frozen) return;
  if (!frame.state.active.delete(frame)) { frame.state.invalid = true; return; }
  finishSegment(frame, performance.now(), failed);
}

export function emitFrozen(state, outcome) {
  if (!state || state.frozen) return;
  const now = performance.now();
  state.frozen = true;
  if (outcome !== "success" && outcome !== "failure") { state.invalid = true; return; }
  if (outcome === "success") {
    if (state.outerName !== "ordinary-drain" || state.active.size) state.invalid = true;
    finishOuter(state, now);
    for (const [index, name] of innerNames.entries()) {
      const cell = state.inner[name];
      if (cell.failed || cell.started !== cell.completed || (index < successCounts.length && cell.completed !== successCounts[index])) state.invalid = true;
    }
  }
  const ms = value => Math.round(bounded(state, value, 60000) * 10) / 10;
  const completedOuterMs = Object.fromEntries(outerNames.map(name => [name, ms(state.outer[name])]));
  const inner = Object.fromEntries(innerNames.map(name => [name, { ...state.inner[name], completedMs: ms(state.inner[name].completedMs) }]));
  const active = [...state.active].map(frame => ({ name: frame.name, elapsedMs: ms(now - frame.startedAt) }));
  const elapsedMs = ms(now - state.startedAt);
  const outerActiveMs = outcome === "success" ? 0 : ms(now - state.outerStartedAt);
  const record = {
    version: 1, locale: state.locale, outcome, invalid: state.invalid, elapsedMs,
    completedOuterMs, outerActiveName: outcome === "success" ? null : state.outerName,
    outerActiveMs, inner, active,
  };
  // Transport failure is missing evidence. Never replace a product exception.
  try { process.stderr.write(`[b5-hosted-observation] ${JSON.stringify(record)}\n`); } catch { /* No retry or fallback output. */ }
}
