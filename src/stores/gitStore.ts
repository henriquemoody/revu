import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { CommitInfo, DiffHunk, DiffLine, FileEntry, FileDiff, RepositoryStatus, ReviewMode } from "@/types/git";
import { computeHunkGap } from "@/features/diff/diffUtils";

interface DemoState {
  status: RepositoryStatus;
  diffs: Record<string, FileDiff>;
}

interface GitState {
  repoPath: string | null;
  status: RepositoryStatus | null;
  selectedFilePath: string | null;
  scrollToSelectedFile: boolean;
  combinedDiffs: FileDiff[] | null;
  isLoading: boolean;
  error: string | null;
  isDemo: boolean;
  _demoState: DemoState | null;
  reviewMode: ReviewMode;
  commits: CommitInfo[];
  commitsPaginated: boolean;
  commitsPage: number;
  selectedCommits: CommitInfo[];
  commitFiles: FileEntry[];
  _fileContentCaches: Record<string, string[]>;
  _fileTotalLines: Record<string, number>;

  setRepoPath: (path: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  selectFile: (filePath: string | null) => void;
  clearScrollToSelectedFile: () => void;
  fetchDiffs: (fullContext: boolean, ignoreWhitespace: boolean) => Promise<void>;
  stageFile: (filePath: string) => Promise<void>;
  unstageFile: (filePath: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  commit: (message: string) => Promise<string>;
  discardFile: (filePath: string) => Promise<void>;
  discardAll: () => Promise<void>;
  clearError: () => void;
  setReviewMode: (mode: ReviewMode) => Promise<void>;
  fetchCommitLog: () => Promise<void>;
  loadMoreCommits: () => Promise<void>;
  selectCommit: (commit: CommitInfo | null) => Promise<void>;
  selectCommits: (commits: CommitInfo[]) => Promise<void>;
  toggleCommitSelection: (commit: CommitInfo) => Promise<void>;
  _fetchCommitFiles: (commits: CommitInfo[]) => Promise<void>;
  _fetchChangesDiff: (fullContext?: boolean, ignoreWhitespace?: boolean) => Promise<void>;
  _fetchCommitDiffs: (commits: CommitInfo[], fullContext?: boolean, ignoreWhitespace?: boolean) => Promise<void>;
  expandHunkContext: (filePath: string, hunkIndex: number, direction: "up" | "down" | "tail", count?: number) => Promise<void>;
  _orderBySidebar: (diffs: FileDiff[]) => FileDiff[];
  initDemoMode: (demoState: DemoState) => void;
}

export const useGitStore = create<GitState>()((set, get) => ({
  repoPath: null,
  status: null,
  selectedFilePath: null,
  scrollToSelectedFile: false,
  combinedDiffs: null,
  isLoading: false,
  error: null,
  isDemo: false,
  _demoState: null,
  reviewMode: "changes",
  commits: [],
  commitsPaginated: false,
  commitsPage: 0,
  selectedCommits: [],
  commitFiles: [],
  _fileContentCaches: {},
  _fileTotalLines: {},

  initDemoMode: (demoState: DemoState) => {
    const { status, diffs } = demoState;
    const firstFile = status.files.find((f) => !f.staged) || status.files[0];

    set({
      isDemo: true,
      _demoState: demoState,
      repoPath: status.path,
      status,
      selectedFilePath: firstFile?.path ?? null,
      combinedDiffs: Object.values(diffs),
      isLoading: false,
      error: null,
    });
  },

  setRepoPath: async (path: string) => {
    const { isDemo } = get();
    if (isDemo) return;

    set({ repoPath: path, isLoading: true, error: null, combinedDiffs: null });
    try {
      const status = await invoke<RepositoryStatus>("get_status", { repoPath: path });
      set({ status, isLoading: false });
      get()._fetchChangesDiff();
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  refreshStatus: async () => {
    const { repoPath, isDemo, reviewMode, selectedCommits } = get();
    if (!repoPath || isDemo) return;

    set({ isLoading: true, error: null, combinedDiffs: null });
    try {
      if (reviewMode === "changes") {
        const status = await invoke<RepositoryStatus>("get_status", { repoPath });
        set({ status, isLoading: false });
        get()._fetchChangesDiff();
      } else if (selectedCommits.length > 0) {
        set({ isLoading: false });
        get()._fetchCommitDiffs(selectedCommits);
      } else {
        set({ isLoading: false });
      }
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  selectFile: (filePath: string | null) => {
    set({ selectedFilePath: filePath, scrollToSelectedFile: true });
  },

  clearScrollToSelectedFile: () => {
    set({ scrollToSelectedFile: false });
  },

  _orderBySidebar: (diffs: FileDiff[]) => {
    const { reviewMode, status, commitFiles } = get();
    const sidebarFiles = reviewMode === "commits" ? commitFiles : (status?.files ?? []);
    const orderMap = new Map(sidebarFiles.map((f, i) => [f.path, i]));
    return [...diffs].sort((a, b) => {
      const aIdx = orderMap.get(a.path) ?? Infinity;
      const bIdx = orderMap.get(b.path) ?? Infinity;
      return aIdx - bIdx;
    });
  },

  fetchDiffs: async (fullContext: boolean, ignoreWhitespace: boolean) => {
    const { reviewMode, selectedCommits, repoPath } = get();
    if (!repoPath) return;

    if (reviewMode === "commits" && selectedCommits.length > 0) {
      get()._fetchCommitDiffs(selectedCommits, fullContext, ignoreWhitespace);
    } else {
      get()._fetchChangesDiff(fullContext, ignoreWhitespace);
    }
  },

  _fetchChangesDiff: async (fullContext?: boolean, ignoreWhitespace?: boolean) => {
    const { repoPath, isDemo, _demoState } = get();
    if (!repoPath) return;

    if (isDemo && _demoState) {
      set({ combinedDiffs: Object.values(_demoState.diffs) });
      return;
    }

    try {
      const diffs = await invoke<FileDiff[]>("get_combined_diff", {
        repoPath,
        contextLines: fullContext ? 999999 : null,
        ignoreWhitespace: ignoreWhitespace || null,
      });
      const ordered = get()._orderBySidebar(diffs);
      set({ combinedDiffs: ordered });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  _fetchCommitDiffs: async (commits: CommitInfo[], fullContext?: boolean, ignoreWhitespace?: boolean) => {
    const { repoPath } = get();
    if (!repoPath || commits.length === 0) return;

    try {
      const diffs = await invoke<FileDiff[]>("get_combined_commit_diff", {
        repoPath,
        oids: commits.map((c) => c.oid),
        contextLines: fullContext ? 999999 : null,
        ignoreWhitespace: ignoreWhitespace || null,
      });
      const ordered = get()._orderBySidebar(diffs);
      set({ combinedDiffs: ordered });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  stageFile: async (filePath: string) => {
    const { repoPath, refreshStatus, isDemo } = get();
    if (!repoPath || isDemo) return;

    try {
      await invoke("stage_file", { repoPath, filePath });
      await refreshStatus();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  unstageFile: async (filePath: string) => {
    const { repoPath, refreshStatus, isDemo } = get();
    if (!repoPath || isDemo) return;

    try {
      await invoke("unstage_file", { repoPath, filePath });
      await refreshStatus();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  stageAll: async () => {
    const { repoPath, refreshStatus, isDemo } = get();
    if (!repoPath || isDemo) return;

    try {
      await invoke("stage_all", { repoPath });
      await refreshStatus();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  unstageAll: async () => {
    const { repoPath, refreshStatus, isDemo } = get();
    if (!repoPath || isDemo) return;

    try {
      await invoke("unstage_all", { repoPath });
      await refreshStatus();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  commit: async (message: string) => {
    const { repoPath, refreshStatus, isDemo } = get();
    if (!repoPath) throw new Error("No repository");
    if (isDemo) return "demo-commit-oid";

    const oid = await invoke<string>("commit", { repoPath, message });
    await refreshStatus();
    set({ selectedFilePath: null });
    return oid;
  },

  discardFile: async (filePath: string) => {
    const { repoPath, refreshStatus, selectedFilePath, isDemo } = get();
    if (!repoPath || isDemo) return;

    try {
      await invoke("discard_file", { repoPath, filePath });
      await refreshStatus();
      if (selectedFilePath === filePath) {
        set({ selectedFilePath: null });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  discardAll: async () => {
    const { repoPath, refreshStatus, isDemo } = get();
    if (!repoPath || isDemo) return;

    try {
      await invoke("discard_all", { repoPath });
      await refreshStatus();
      set({ selectedFilePath: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearError: () => set({ error: null }),

  setReviewMode: async (mode: ReviewMode) => {
    const { repoPath, refreshStatus, fetchCommitLog } = get();
    if (!repoPath) return;

    set({
      reviewMode: mode,
      selectedFilePath: null,
      combinedDiffs: null,
      commits: [],
      selectedCommits: [],
      commitFiles: [],
      commitsPage: 0,
      commitsPaginated: false,
    });

    if (mode === "commits") {
      await fetchCommitLog();
    } else {
      await refreshStatus();
    }
  },

  fetchCommitLog: async () => {
    const { repoPath } = get();
    if (!repoPath) return;

    set({ isLoading: true, error: null });
    try {
      const branchCommits = await invoke<CommitInfo[]>("get_branch_log", { repoPath });
      if (branchCommits.length > 0) {
        set({ commits: branchCommits, commitsPaginated: false, commitsPage: 0, isLoading: false });
        return;
      }
      const commits = await invoke<CommitInfo[]>("get_commit_log", { repoPath, count: 25, skip: 0 });
      set({ commits, commitsPaginated: true, commitsPage: 0, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  loadMoreCommits: async () => {
    const { repoPath, commits, commitsPage, commitsPaginated } = get();
    if (!repoPath || !commitsPaginated) return;

    const nextPage = commitsPage + 1;
    try {
      const more = await invoke<CommitInfo[]>("get_commit_log", {
        repoPath,
        count: 25,
        skip: nextPage * 25,
      });
      set({ commits: [...commits, ...more], commitsPage: nextPage });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  _fetchCommitFiles: async (commits: CommitInfo[]) => {
    const { repoPath } = get();
    if (!repoPath || commits.length === 0) return;

    try {
      let commitFiles: FileEntry[];
      if (commits.length === 1) {
        commitFiles = await invoke<FileEntry[]>("get_commit_files", {
          repoPath,
          oid: commits[0].oid,
        });
      } else {
        commitFiles = await invoke<FileEntry[]>("get_multi_commit_files", {
          repoPath,
          oids: commits.map((c) => c.oid),
        });
      }
      set({ commitFiles });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  selectCommit: async (commit: CommitInfo | null) => {
    const { repoPath } = get();
    if (!repoPath) return;

    const selectedCommits = commit ? [commit] : [];
    set({ selectedCommits, selectedFilePath: null, combinedDiffs: null, commitFiles: [], _fileContentCaches: {}, _fileTotalLines: {} });
    await get()._fetchCommitFiles(selectedCommits);
    if (selectedCommits.length > 0) {
      get()._fetchCommitDiffs(selectedCommits);
    }
  },

  selectCommits: async (commits: CommitInfo[]) => {
    const { repoPath } = get();
    if (!repoPath) return;

    set({ selectedCommits: commits, selectedFilePath: null, combinedDiffs: null, commitFiles: [], _fileContentCaches: {}, _fileTotalLines: {} });
    await get()._fetchCommitFiles(commits);
    if (commits.length > 0) {
      get()._fetchCommitDiffs(commits);
    }
  },

  toggleCommitSelection: async (commit: CommitInfo) => {
    const { repoPath, selectedCommits } = get();
    if (!repoPath) return;

    const isSelected = selectedCommits.some((c) => c.oid === commit.oid);
    const newSelectedCommits = isSelected
      ? selectedCommits.filter((c) => c.oid !== commit.oid)
      : [...selectedCommits, commit];

    set({ selectedCommits: newSelectedCommits, selectedFilePath: null, combinedDiffs: null, commitFiles: [], _fileContentCaches: {}, _fileTotalLines: {} });
    await get()._fetchCommitFiles(newSelectedCommits);
    if (newSelectedCommits.length > 0) {
      get()._fetchCommitDiffs(newSelectedCommits);
    }
  },

  expandHunkContext: async (filePath: string, hunkIndex: number, direction: "up" | "down" | "tail", count = 20) => {
    const { repoPath, combinedDiffs, reviewMode, selectedCommits, _fileContentCaches } = get();
    if (!repoPath || !combinedDiffs) return;

    const diffIndex = combinedDiffs.findIndex((d) => d.path === filePath);
    if (diffIndex === -1) return;
    const currentDiff = combinedDiffs[diffIndex];

    let source: string;
    if (reviewMode === "commits" && selectedCommits.length > 0) {
      const sorted = [...selectedCommits].sort((a, b) => a.timestamp - b.timestamp);
      source = sorted[sorted.length - 1].oid;
    } else {
      const file = get().status?.files.find((f) => f.path === filePath);
      source = file?.staged ? "index" : "workdir";
    }

    let fileLines = _fileContentCaches[filePath];
    if (!fileLines) {
      try {
        fileLines = await invoke<string[]>("get_file_content", {
          repoPath,
          filePath,
          source,
        });
        set({
          _fileContentCaches: { ..._fileContentCaches, [filePath]: fileLines! },
          _fileTotalLines: { ...get()._fileTotalLines, [filePath]: fileLines!.length },
        });
      } catch {
        return;
      }
    }

    const hunks: DiffHunk[] = currentDiff.hunks.map((h) => ({
      ...h,
      lines: [...h.lines],
    }));

    if (direction === "tail") {
      const lastHunk = hunks[hunkIndex];
      const tailStart = lastHunk.newStart + lastHunk.newLines;
      const tailStartOld = lastHunk.oldStart + lastHunk.oldLines;
      const tailGapSize = fileLines.length - tailStart + 1;
      if (tailGapSize <= 0) return;

      const actual = Math.min(count, tailGapSize);
      const newLines: DiffLine[] = [];
      for (let i = 0; i < actual; i++) {
        newLines.push({
          lineType: "context",
          content: (fileLines[tailStart - 1 + i] ?? "") + "\n",
          oldLineNo: tailStartOld + i,
          newLineNo: tailStart + i,
        });
      }
      lastHunk.lines = [...lastHunk.lines, ...newLines];
      lastHunk.oldLines += actual;
      lastHunk.newLines += actual;
      lastHunk.header = `@@ -${lastHunk.oldStart},${lastHunk.oldLines} +${lastHunk.newStart},${lastHunk.newLines} @@`;

      const newDiffs = [...combinedDiffs];
      newDiffs[diffIndex] = { ...currentDiff, hunks };
      set({ combinedDiffs: newDiffs });
      return;
    }

    const hunk = hunks[hunkIndex];
    const { gapNewTop, gapOldTop, gapNewBottom, gapSize } = computeHunkGap(hunks, hunkIndex);

    if (gapSize <= 0) return;

    if (direction === "down") {
      const actual = Math.min(count, gapSize);
      const startNew = gapNewBottom - actual + 1;
      const startOld = hunk.oldStart - actual;

      const newLines: DiffLine[] = [];
      for (let i = 0; i < actual; i++) {
        const newLineNo = startNew + i;
        const oldLineNo = startOld + i;
        newLines.push({
          lineType: "context",
          content: (fileLines[newLineNo - 1] ?? "") + "\n",
          oldLineNo,
          newLineNo,
        });
      }

      hunk.lines = [...newLines, ...hunk.lines];
      hunk.oldStart -= actual;
      hunk.oldLines += actual;
      hunk.newStart -= actual;
      hunk.newLines += actual;
      hunk.header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    } else {
      if (hunkIndex === 0) return;

      const prevHunk = hunks[hunkIndex - 1];
      const actual = Math.min(count, gapSize);
      const startNew = gapNewTop;
      const startOld = gapOldTop;

      const newLines: DiffLine[] = [];
      for (let i = 0; i < actual; i++) {
        const newLineNo = startNew + i;
        const oldLineNo = startOld + i;
        newLines.push({
          lineType: "context",
          content: (fileLines[newLineNo - 1] ?? "") + "\n",
          oldLineNo,
          newLineNo,
        });
      }

      prevHunk.lines = [...prevHunk.lines, ...newLines];
      prevHunk.oldLines += actual;
      prevHunk.newLines += actual;
      prevHunk.header = `@@ -${prevHunk.oldStart},${prevHunk.oldLines} +${prevHunk.newStart},${prevHunk.newLines} @@`;
    }

    for (let i = hunks.length - 1; i > 0; i--) {
      const prev = hunks[i - 1];
      const curr = hunks[i];
      if (prev.newStart + prev.newLines >= curr.newStart) {
        const overlap = (prev.newStart + prev.newLines) - curr.newStart;
        if (overlap > 0) {
          curr.lines = curr.lines.slice(overlap);
        }
        prev.lines = [...prev.lines, ...curr.lines];
        prev.oldLines = (curr.oldStart + curr.oldLines) - prev.oldStart;
        prev.newLines = (curr.newStart + curr.newLines) - prev.newStart;
        prev.header = `@@ -${prev.oldStart},${prev.oldLines} +${prev.newStart},${prev.newLines} @@`;
        hunks.splice(i, 1);
      }
    }

    const newDiffs = [...combinedDiffs];
    newDiffs[diffIndex] = { ...currentDiff, hunks };
    set({ combinedDiffs: newDiffs });
  },
}));