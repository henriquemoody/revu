import type { DiffHunk } from "@/types/git";

export function canExpandTail(
  hunks: DiffHunk[],
  fileTotalLines: number | null,
): boolean {
  if (hunks.length === 0) return false;
  const lastHunk = hunks[hunks.length - 1];
  const tailStart = lastHunk.newStart + lastHunk.newLines;
  return fileTotalLines === null || tailStart <= fileTotalLines;
}

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
