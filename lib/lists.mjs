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
    ...(kind === "links" ? { url: entry.url } : {}),
    ...(kind === "sangeet" ? { song: entry.song } : {}),
  };
}
