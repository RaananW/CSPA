/** Avatar initials (anatomy page `avatar.md`), shared by the bindings: the first letters of the first and last words. */
export function avatarInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "", last = words.length > 1 ? words[words.length - 1]! : "";
  return [...first].slice(0, 1).concat([...last].slice(0, 1)).join("").toLocaleUpperCase();
}
