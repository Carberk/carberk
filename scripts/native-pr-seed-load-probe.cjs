'use strict';


const Module = require('node:module');
const { writeSync } = require('node:fs');

const GUARD = /(^|\/)native-pr-seed-guard(\.cjs)?$/;
const CLIENTS = [/^pg$/, /^@prisma\/adapter-pg$/, /^@prisma\/client(\/|$)/, /^@aws-sdk\/client-s3$/, /^sharp$/, /generated\/prisma\/client\//];

function trace(line) {
  writeSync(2, `LOAD-PROBE ${line}\n`);
}

const load = Module._load;
Module._load = function probedLoad(request, ...rest) {
  if (CLIENTS.some(pattern => pattern.test(request))) trace(`client ${request}`);
  const loaded = load.call(this, request, ...rest);
  if (!GUARD.test(request)) return loaded;
  const wrapped = { ...loaded };
  for (const [name, value] of Object.entries(loaded)) {
    if (typeof value !== 'function') continue;
    wrapped[name] = function probedGuard(...args) {
      trace(`guard ${name}`);
      return value.apply(this, args);
    };
  }
  return wrapped;
};
