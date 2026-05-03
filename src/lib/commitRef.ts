import type { CommitInfo } from "@/types/git";

export function buildCommitRef(commits: CommitInfo[]): string | undefined {
  if (commits.length === 0) return undefined;
  if (commits.length === 1) return commits[0].oid;
  const sorted = [...commits].sort((a, b) => a.timestamp - b.timestamp);
  return `${sorted[0].oid}..${sorted[sorted.length - 1].oid}`;
}
