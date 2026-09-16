import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const SECRET    = process.env.ENCRYPTION_SECRET ?? "fallback-secret-key-32-chars-min";

function getKey() {
  return crypto.scryptSync(SECRET, "salt", 32);
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("hex"),
    encrypted.toString("hex"),
    tag.toString("hex"),
  ].join(":");
}

export function decrypt(encryptedText: string): string {
  const key = getKey();
  const [ivHex, encHex, tagHex] = encryptedText.split(":");

  if (!ivHex || !encHex || !tagHex) {
    throw new Error("Invalid encrypted format");
  }

  const iv        = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const tag       = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptKey(apiKey: string): { encrypted: string; hint: string } {
  return {
    encrypted: encrypt(apiKey),
    hint:      apiKey.slice(-4),
  };
}