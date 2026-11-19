#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUNDLE_ID = 'tm.auto.app';
const DEVICES_DIR = path.join(homedir(), 'Library/Developer/CoreSimulator/Devices');

const simctl = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' });

export function installedApp(udid, devicesDir = DEVICES_DIR) {
  const root = path.join(devicesDir, udid, 'data/Containers/Bundle/Application');
  if (!existsSync(root)) return undefined;
  for (const container of readdirSync(root)) {
    for (const entry of readdirSync(path.join(root, container))) {
      if (!entry.endsWith('.app')) continue;
      const app = path.join(root, container, entry);
      try {
        const id = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(app, 'Info.plist')], { encoding: 'utf8' }).trim();
        if (id === BUNDLE_ID) return app;
      } catch { }
    }
  }
  return undefined;
}

export function iosDevices(listing) {
  return Object.entries(listing.devices)
    .filter(([runtime]) => runtime.includes('.iOS-'))
    .flatMap(([runtime, devices]) => devices.map((device) => ({ ...device, runtime })));
}

export function pickSpare(devices, hasApp) {
  const free = devices.filter((device) => device.state === 'Shutdown' && hasApp(device.udid));
  return free.find((device) => device.name.startsWith('Carberk')) ?? free[0];
}

export const TEMPLATE_UDID = '38747B85-BB39-48A2-BF0D-4DD6A5ED1D13';

export function pickTemplate(devices) {
  return devices.find((device) => device.udid === TEMPLATE_UDID)
    ?? devices.find((device) => device.name === 'iPhone 17')
    ?? devices.find((device) => device.name.startsWith('iPhone'));
}

function main() {
  const devices = iosDevices(JSON.parse(simctl('list', 'devices', 'available', '-j')));
  const spare = pickSpare(devices, (udid) => installedApp(udid) !== undefined);
  if (spare) {
    console.log(`${spare.name} ${spare.udid}`);
    return;
  }
  const template = pickTemplate(devices);
  const source = devices.map((device) => installedApp(device.udid)).find(Boolean);
  if (!template || !source) {
    throw new Error('No iPhone Simulator or installed Carberk build to copy; build it once as in docs/agents/mobile-expo.md');
  }
  const taken = new Set(devices.map((device) => device.name));
  let n = 1;
  while (taken.has(`Carberk Agent ${n}`)) n += 1;
  const name = `Carberk Agent ${n}`;
  const udid = simctl('create', name, template.deviceTypeIdentifier, template.runtime).trim();
  simctl('boot', udid);
  try {
    simctl('install', udid, source);
  } finally {
    simctl('shutdown', udid);
  }
  console.log(`${name} ${udid}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
