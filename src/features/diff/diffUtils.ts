import type { DiffHunk } from "@/types/git";

export function computeHunkGap(
  hunks: DiffHunk[],
  hunkIndex: number,
): { gapNewTop: number; gapOldTop: number; gapNewBottom: number; gapSize: number } {
  const gapNewTop = hunkIndex > 0
    ? hunks[hunkIndex - 1].newStart + hunks[hunkIndex - 1].newLines
    : 1;
  const gapOldTop = hunkIndex > 0
    ? hunks[hunkIndex - 1].oldStart + hunks[hunkIndex - 1].oldLines
    : 1;
  const gapNewBottom = hunks[hunkIndex].newStart - 1;
  const gapSize = gapNewBottom - gapNewTop + 1;
  return { gapNewTop, gapOldTop, gapNewBottom, gapSize };
}
