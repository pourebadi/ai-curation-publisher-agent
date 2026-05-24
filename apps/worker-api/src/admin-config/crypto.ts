export type EncryptionStatus =
  | { ok: true; key: CryptoKey }
  | { ok: false; error: "missing_config_encryption_key" | "invalid_config_encryption_key"; message: string };

export type SecretEnvelope = {
  v: 1;
  alg: "AES-GCM";
  iv: string;
  ciphertext: string;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function importConfigEncryptionKey(rawKey: string | undefined): Promise<EncryptionStatus> {
  if (rawKey === undefined || rawKey.trim().length === 0) {
    return { ok: false, error: "missing_config_encryption_key", message: "CONFIG_ENCRYPTION_KEY is missing. Run: pnpm wrangler secret put CONFIG_ENCRYPTION_KEY" };
  }

  const bytes = decodeKey(rawKey.trim());
  if (bytes === undefined || ![16, 24, 32].includes(bytes.byteLength)) {
    return { ok: false, error: "invalid_config_encryption_key", message: "CONFIG_ENCRYPTION_KEY must be base64 or hex encoded 128, 192, or 256 bit key material." };
  }

  const key = await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return { ok: true, key };
}

export async function encryptSecretValue(rawKey: string | undefined, plaintext: string): Promise<{ ok: true; value: string } | EncryptionStatus> {
  const imported = await importConfigEncryptionKey(rawKey);
  if (!imported.ok) return imported;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, imported.key, textEncoder.encode(plaintext));
  const envelope: SecretEnvelope = {
    v: 1,
    alg: "AES-GCM",
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted))
  };
  return { ok: true, value: JSON.stringify(envelope) };
}

export async function decryptSecretValue(rawKey: string | undefined, storedValue: string): Promise<{ ok: true; value: string } | EncryptionStatus> {
  const imported = await importConfigEncryptionKey(rawKey);
  if (!imported.ok) return imported;

  try {
    const envelope = JSON.parse(storedValue) as Partial<SecretEnvelope>;
    if (envelope.v !== 1 || envelope.alg !== "AES-GCM" || typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") {
      return { ok: false, error: "invalid_config_encryption_key", message: "Stored secret envelope is invalid." };
    }
    const iv = fromBase64(envelope.iv);
    const ciphertext = fromBase64(envelope.ciphertext);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, imported.key, ciphertext);
    return { ok: true, value: textDecoder.decode(decrypted) };
  } catch {
    return { ok: false, error: "invalid_config_encryption_key", message: "Stored secret could not be decrypted with CONFIG_ENCRYPTION_KEY." };
  }
}

function decodeKey(value: string): Uint8Array | undefined {
  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }

  try {
    return fromBase64(value);
  } catch {
    return undefined;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
