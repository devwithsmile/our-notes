import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function safeEqual(a, b) {
  return timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
}
export async function hashPassword(
  password,
  salt = randomBytes(16).toString("hex"),
) {
  const hash = await scrypt(password, Buffer.from(salt, "hex"), 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  const salt = stored?.split(":")[0] || "00000000000000000000000000000000";
  return safeEqual(await hashPassword(password, salt), stored || "");
}
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function field(data, key, min, max, trim = true) {
  const raw = data[key];
  if (typeof raw !== "string") throw new ApiError(400, `Please enter ${key}.`);
  const value = trim ? raw.trim() : raw;
  if (value.length < min || value.length > max)
    throw new ApiError(
      400,
      `${key[0].toUpperCase() + key.slice(1)} must be ${min}–${max} characters.`,
    );
  return value;
}
export function noteFields(data) {
  const title = field(data, "title", 1, 160);
  const body = field(data, "body", 0, 100000);
  const category = field(data, "category", 1, 40);
  if (!["Everyday", "Ideas", "Plans", "Memories"].includes(category))
    throw new ApiError(400, "Choose a valid collection.");
  return { title, body, category };
}
export async function readJson(request) {
  if (
    request.headers.get("x-notes-request") !== "1" ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    throw new ApiError(403, "Please make changes through the notes app.");
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const protocol =
    process.env.VERCEL && request.headers.get("x-forwarded-proto") === "https"
      ? "https:"
      : url.protocol;
  // Next can bind to 0.0.0.0 internally while the browser uses localhost or a LAN IP.
  const requestOrigin = new URL(
    `${protocol}//${request.headers.get("host") || url.host}`,
  ).origin;
  const allowed = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : requestOrigin;
  if (origin && origin !== allowed)
    throw new ApiError(403, "This request came from another website.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "Cross-site requests are not allowed.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Request body is missing.");
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 450000) {
      await reader.cancel();
      throw new ApiError(413, "This note is too large.");
    }
    chunks.push(value);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    throw new ApiError(400, "Invalid request.");
  }
}
