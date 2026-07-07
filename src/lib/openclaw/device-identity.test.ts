import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDeviceAuthPayloadV3 } from './device-identity';

test('buildDeviceAuthPayloadV3 normalizes platform and deviceFamily for protocol v4 device auth', () => {
  const payload = buildDeviceAuthPayloadV3({
    deviceId: 'device-1',
    clientId: 'cli',
    clientMode: 'ui',
    role: 'operator',
    scopes: ['operator.admin'],
    signedAtMs: 1737264000000,
    token: 'secret-token',
    nonce: 'nonce-123',
    platform: 'Win32 ',
    deviceFamily: ' Desktop',
  });

  assert.equal(
    payload,
    'v3|device-1|cli|ui|operator|operator.admin|1737264000000|secret-token|nonce-123|win32|desktop'
  );
});

test('buildDeviceAuthPayloadV3 serializes nullish and whitespace device metadata as empty fields', () => {
  const cases = [
    { platform: null, deviceFamily: undefined },
    { platform: undefined, deviceFamily: null },
    { platform: '   ', deviceFamily: '\t  ' },
  ];

  for (const input of cases) {
    const payload = buildDeviceAuthPayloadV3({
      deviceId: 'device-1',
      clientId: 'cli',
      clientMode: 'ui',
      role: 'operator',
      scopes: ['operator.admin'],
      signedAtMs: 1737264000000,
      token: 'secret-token',
      nonce: 'nonce-123',
      platform: input.platform,
      deviceFamily: input.deviceFamily,
    });

    assert.equal(
      payload,
      'v3|device-1|cli|ui|operator|operator.admin|1737264000000|secret-token|nonce-123||'
    );
  }
});

test('buildDeviceAuthPayloadV3 serializes a null token as an empty token field', () => {
  const payload = buildDeviceAuthPayloadV3({
    deviceId: 'device-1',
    clientId: 'cli',
    clientMode: 'ui',
    role: 'operator',
    scopes: ['operator.admin'],
    signedAtMs: 1737264000000,
    token: null,
    nonce: 'nonce-123',
    platform: 'win32',
    deviceFamily: 'desktop',
  });

  assert.equal(
    payload,
    'v3|device-1|cli|ui|operator|operator.admin|1737264000000||nonce-123|win32|desktop'
  );
});
