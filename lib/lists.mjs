export const MAX_PLUS_ONES = 999;
export const guestTotal = (entries) =>
  entries.reduce((total, entry) => total + 1 + (entry.plusOnes ?? 0), 0);
export const songCategories = ["Hindi", "Marathi", "Bhojpuri"];
export const linkCategories = ["Mehndi", "Haldi", "Sangeet", "Wedding"];
export function safeLink(value) {
  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function listEntry(kind, entry) {
  const { id, name, version } = entry;
  return {
    id,
    name,
    version,
    ...(kind === "songs" || kind === "links"
      ? { category: entry.category }
      : {}),
    ...(kind === "guests" ? { plusOnes: entry.plusOnes ?? 0 } : {}),
    ...(kind === "links" ? { url: entry.url } : {}),
    ...(kind === "sangeet" ? { song: entry.song } : {}),
  };
}
