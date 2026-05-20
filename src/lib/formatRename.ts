/**
 * Formats a file rename in Git's compact style.
 *
 * Plain string examples:
 *   ("src/foo/bar.ts", "src/baz/qux.ts") → "src/{foo => baz}/qux.ts" (if suffix matches)
 *   ("docker/.env.dev", "content-checker/.env.dev") → "{docker => content-checker}/.env.dev"
 *   ("docker/up-ext.sh", "up-ext.sh") → "{docker => }/up-ext.sh"
 *   ("dir/file.ts", "other/file.ts") → "{dir => other}/file.ts"
 *
 * Mirrors the logic of ~/bin/pdiff.
 */
export interface RenameSegment {
  text: string;
  type: "prefix" | "old" | "arrow" | "new" | "suffix";
}

export interface FormattedRename {
  plain: string;
  segments: RenameSegment[];
}

export function formatRename(oldPath: string, newPath: string): FormattedRename {
  const oldParts = oldPath.split("/");
  const newParts = newPath.split("/");

  let firstDiff = -1;
  for (let i = 0; i < Math.min(oldParts.length, newParts.length); i++) {
    if (oldParts[i] !== newParts[i]) {
      firstDiff = i;
      break;
    }
  }

  if (firstDiff === -1) {
    firstDiff = Math.min(oldParts.length, newParts.length);
  }

  const oldSuffix = oldParts.slice(firstDiff);
  const newSuffix = newParts.slice(firstDiff);

  let sharedSuffixCount = 0;
  while (
    sharedSuffixCount < Math.min(oldSuffix.length, newSuffix.length) &&
    oldParts[oldParts.length - 1 - sharedSuffixCount] ===
      newParts[newParts.length - 1 - sharedSuffixCount]
  ) {
    sharedSuffixCount++;
  }

  const prefix = oldParts.slice(0, firstDiff);
  const oldDiff = oldSuffix.slice(0, oldSuffix.length - sharedSuffixCount);
  const newDiff = newSuffix.slice(0, newSuffix.length - sharedSuffixCount);
  const suffix = newParts.slice(newParts.length - sharedSuffixCount);

  const prefixStr = prefix.length > 0 ? prefix.join("/") + "/" : "";
  const suffixStr = suffix.length > 0 ? "/" + suffix.join("/") : "";

  const oldDiffStr = oldDiff.join("/");
  const newDiffStr = newDiff.join("/");

  const plain =
    oldDiffStr === "" && newDiffStr === ""
      ? newPath
      : `${prefixStr}{${oldDiffStr} => ${newDiffStr}}${suffixStr}`;

  const segments: RenameSegment[] = [];

  if (prefix.length > 0) {
    segments.push({ text: prefixStr, type: "prefix" });
  }

  if (oldDiffStr === "" && newDiffStr === "") {
    segments.push({ text: newDiffStr || suffix.join("/"), type: "new" });
  } else {
    segments.push({ text: oldDiffStr, type: "old" });
    segments.push({ text: " → ", type: "arrow" });
    segments.push({ text: newDiffStr, type: "new" });
  }

  if (suffix.length > 0) {
    segments.push({ text: suffixStr, type: "suffix" });
  }

  return { plain, segments };
}