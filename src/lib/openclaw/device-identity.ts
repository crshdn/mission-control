// Device Identity Management for OpenClaw Gateway Pairing
// Generates and persists Ed25519 device identity for secure pairing with OpenClaw gateway

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

const IDENTITY_DIR = path.join(os.homedir(), '.mission-control', 'identity');
const IDENTITY_FILE = path.join(IDENTITY_DIR, 'device.json');
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

// Base64url encoding (RFC 4648)
function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

// Derive raw 32-byte public key from PEM
function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const spki = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  if (spki.length === ED25519_SPKI_PREFIX.length + 32 &&
      spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

// SHA-256 fingerprint of public key = deviceId
function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Get base64url-encoded raw public key (for wire format)
export function publicKeyRawBase64Url(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

// Generate a new Ed25519 identity
function generateIdentity(): DeviceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };
}

// Load existing identity or create a new one
export function loadOrCreateDeviceIdentity(): DeviceIdentity {
  const identityPath = IDENTITY_FILE;
  try {
    if (fs.existsSync(identityPath)) {
      const raw = fs.readFileSync(identityPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && parsed.deviceId && parsed.publicKeyPem && parsed.privateKeyPem) {
        // Verify deviceId matches public key
        const derivedId = fingerprintPublicKey(parsed.publicKeyPem);
        return {
          deviceId: derivedId,
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem,
        };
      }
    }
  } catch {
    // If loading fails, generate new
  }

  const identity = generateIdentity();
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  const stored = {
    version: 1,
    deviceId: identity.deviceId,
    publicKeyPem: identity.publicKeyPem,
    privateKeyPem: identity.privateKeyPem,
    createdAtMs: Date.now(),
  };
  fs.writeFileSync(identityPath, JSON.stringify(stored, null, 2) + '\n', { mode: 0o600 });
  return identity;
}

// Sign a payload with the device's private key (Ed25519)
export function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
}

function normalizeDeviceMetadataForAuth(value?: string | null): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : '';
}

// Build the canonical payload string for signing
export function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce?: string;
}): string {
  const version = params.nonce ? 'v2' : 'v1';
  const scopeStr = params.scopes.join(',');
  const token = params.token ?? '';
  const base = [version, params.deviceId, params.clientId, params.clientMode, params.role, scopeStr, String(params.signedAtMs), token];
  if (version === 'v2') base.push(params.nonce ?? '');
  return base.join('|');
}

export function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce: string;
  platform?: string | null;
  deviceFamily?: string | null;
}): string {
  const scopeStr = params.scopes.join(',');
  const token = params.token ?? '';
  const platform = normalizeDeviceMetadataForAuth(params.platform);
  const deviceFamily = normalizeDeviceMetadataForAuth(params.deviceFamily);

  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopeStr,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily,
  ].join('|');
}
