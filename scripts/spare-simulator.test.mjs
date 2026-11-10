import assert from 'node:assert/strict';
import { test } from 'node:test';

import { iosDevices, pickSpare, pickTemplate } from './spare-simulator.mjs';

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

test('prefers the documented iPhone 17 as the creation template', () => {
  const devices = [
    { name: 'iPhone 17', udid: 'ios27', state: 'Shutdown', deviceTypeIdentifier: 'iphone-17', runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-27-0' },
    { name: 'iPhone 17', udid: '38747B85-BB39-48A2-BF0D-4DD6A5ED1D13', state: 'Shutdown', deviceTypeIdentifier: 'iphone-17', runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-26-2' },
  ];
  assert.equal(pickTemplate(devices)?.udid, '38747B85-BB39-48A2-BF0D-4DD6A5ED1D13');
});

test('falls back to the first iPhone 17, then any iPhone, as the creation template', () => {
  const named = [
    { name: 'iPhone 16', udid: 'older', state: 'Shutdown', deviceTypeIdentifier: 'iphone-16', runtime: 'r1' },
    { name: 'iPhone 17', udid: 'first17', state: 'Shutdown', deviceTypeIdentifier: 'iphone-17', runtime: 'r2' },
  ];
  assert.equal(pickTemplate(named)?.udid, 'first17');
  assert.equal(pickTemplate(named.slice(0, 1))?.udid, 'older');
});
