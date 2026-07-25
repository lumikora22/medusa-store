export const PIN_LENGTH = 4;
const SALT_BYTES = 16;
const PIN_PATTERN = new RegExp(`^\\d{${PIN_LENGTH}}$`);

/** Platform-neutral crypto the lock depends on, so the rules stay testable off-device. */
export type CryptoPort = {
  randomBytes(count: number): Uint8Array;
  sha256Hex(input: string): Promise<string>;
};

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/**
 * Exhibition Mode PIN storage.
 *
 * The PIN is never stored in clear text: a random salt is generated per PIN and only
 * `salt:sha256(salt:pin)` is persisted. This guards against someone reading the local
 * database casually — a short numeric PIN is still brute-forceable by anyone holding the
 * file, so it protects a display device from customers, not from a determined attacker.
 */
export class ExhibitionLock {
  constructor(private readonly crypto: CryptoPort) {}

  async createRecord(pin: string): Promise<string> {
    if (!isValidPin(pin)) throw new Error(`El PIN debe tener ${PIN_LENGTH} dígitos.`);
    const salt = toHex(this.crypto.randomBytes(SALT_BYTES));
    return `${salt}:${await this.digest(salt, pin)}`;
  }

  async verify(record: string | null, pin: string): Promise<boolean> {
    if (!record || !isValidPin(pin)) return false;
    const separator = record.indexOf(":");
    if (separator <= 0) return false;
    const expected = record.slice(separator + 1);
    if (!expected) return false;
    return equalDigests(await this.digest(record.slice(0, separator), pin), expected);
  }

  private digest(salt: string, pin: string): Promise<string> {
    return this.crypto.sha256Hex(`${salt}:${pin}`);
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compares in constant time for the given length so a wrong PIN leaks no prefix information. */
function equalDigests(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
