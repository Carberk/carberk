import assert from 'node:assert/strict';
import { test } from 'node:test';

import { iosDevices, pickSpare } from './spare-simulator.mjs';

const listing = {
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-26-2': [
      { name: 'iPhone 17', udid: 'held', state: 'Booted', deviceTypeIdentifier: 'iphone-17' },
      { name: 'iPhone 17', udid: 'plain', state: 'Shutdown', deviceTypeIdentifier: 'iphone-17' },
      { name: 'Carberk Agent 1', udid: 'agent', state: 'Shutdown', deviceTypeIdentifier: 'iphone-17' },
      { name: 'Carberk Empty', udid: 'empty', state: 'Shutdown', deviceTypeIdentifier: 'iphone-17' },
    ],
    'com.apple.CoreSimulator.SimRuntime.watchOS-11-0': [
      { name: 'Watch', udid: 'watch', state: 'Shutdown', deviceTypeIdentifier: 'watch' },
    ],
  },
};
const withBuild = new Set(['held', 'plain', 'agent']);

test('ignores non-iOS runtimes', () => {
  assert.deepEqual(iosDevices(listing).map((device) => device.udid), ['held', 'plain', 'agent', 'empty']);
});

test('prefers a shut-down Carberk Simulator that has the build', () => {
  assert.equal(pickSpare(iosDevices(listing), (udid) => withBuild.has(udid))?.udid, 'agent');
});

test('never picks a booted Simulator, which another session may hold', () => {
  const booted = iosDevices(listing).map((device) => ({ ...device, state: 'Booted' }));
  assert.equal(pickSpare(booted, () => true), undefined);
});

test('falls back to any shut-down Simulator with the build', () => {
  assert.equal(pickSpare(iosDevices(listing), (udid) => udid === 'plain')?.udid, 'plain');
});
