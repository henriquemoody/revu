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
  selectedFile: FileEntry | null;
  currentDiff: FileDiff | null;
  isLoading: boolean;
  error: string | null;
  isDemo: boolean;
  _demoState: DemoState | null;
  reviewMode: ReviewMode;
  commits: CommitInfo[];
  commitsPaginated: boolean; // true when showing paginated log (not branch-scoped)
  commitsPage: number; // current page in paginated mode
  selectedCommit: CommitInfo | null;
  commitFiles: FileEntry[];
  _fileContentCache: string[] | null;
  fileTotalLines: number | null;

  setRepoPath: (path: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  selectFile: (
    file: FileEntry | null,
    fullContext?: boolean,
    ignoreWhitespace?: boolean,
  ) => Promise<void>;
  fetchDiff: (fullContext: boolean, ignoreWhitespace: boolean) => Promise<void>;
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
  _fetchDiff: (file: FileEntry, fullContext: boolean, ignoreWhitespace: boolean) => Promise<void>;
  expandHunkContext: (hunkIndex: number, direction: "up" | "down" | "tail", count?: number) => Promise<void>;
  // Demo mode - accepts pre-built demo state
  initDemoMode: (demoState: DemoState) => void;
}

export const useGitStore = create<GitState>()((set, get) => ({
  repoPath: null,
  status: null,
  selectedFile: null,
  currentDiff: null,
  isLoading: false,
  error: null,
  isDemo: false,
  _demoState: null,
  reviewMode: "changes",
  commits: [],
  commitsPaginated: false,
  commitsPage: 0,
  selectedCommit: null,
  commitFiles: [],
  _fileContentCache: null,
  fileTotalLines: null,

  initDemoMode: (demoState: DemoState) => {
    const { status, diffs } = demoState;
    const firstFile = status.files.find((f) => !f.staged) || status.files[0];
    const diff = firstFile ? diffs[firstFile.path] || null : null;

    set({
      isDemo: true,
      _demoState: demoState,
      repoPath: status.path,
      status,
      selectedFile: firstFile || null,
      currentDiff: diff,
      isLoading: false,
      error: null,
    });
  },

  setRepoPath: async (path: string) => {
    const { isDemo } = get();
    if (isDemo) return; // Ignore in demo mode

    set({ repoPath: path, isLoading: true, error: null });
    try {
      const status = await invoke<RepositoryStatus>("get_status", {
        repoPath: path,
      });
      set({ status, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  refreshStatus: async () => {
    const { repoPath, isDemo } = get();
    if (!repoPath || isDemo) return; // Ignore in demo mode

    set({ isLoading: true, error: null });
    try {
      const status = await invoke<RepositoryStatus>("get_status", { repoPath });
      set({ status, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  selectFile: async (
    file: FileEntry | null,
    fullContext = false,
    ignoreWhitespace = false,
  ) => {
    const { repoPath, isDemo, _demoState } = get();
    if (!repoPath) return;

    set({ selectedFile: file, currentDiff: null, _fileContentCache: null, fileTotalLines: null });

    if (file) {
      if (isDemo && _demoState) {
        set({ currentDiff: _demoState.diffs[file.path] || null });
        return;
      }
      await get()._fetchDiff(file, fullContext, ignoreWhitespace);
    }
  },

  fetchDiff: async (fullContext: boolean, ignoreWhitespace: boolean) => {
    const { repoPath, selectedFile, isDemo, _demoState } = get();
    if (!repoPath || !selectedFile) return;

    if (isDemo && _demoState) {
      set({ currentDiff: _demoState.diffs[selectedFile.path] || null, _fileContentCache: null, fileTotalLines: null });
      return;
    }

    set({ _fileContentCache: null, fileTotalLines: null });
    await get()._fetchDiff(selectedFile, fullContext, ignoreWhitespace);
  },

  _fetchDiff: async (file: FileEntry, fullContext: boolean, ignoreWhitespace: boolean) => {
    const { repoPath, reviewMode, selectedCommit } = get();
    if (!repoPath) return;

    try {
      if (reviewMode === "commits" && selectedCommit) {
        const diff = await invoke<FileDiff>("get_commit_file_diff", {
          repoPath,
          oid: selectedCommit.oid,
          filePath: file.path,
          contextLines: fullContext ? 999999 : null,
          ignoreWhitespace: ignoreWhitespace || null,
        });
        set({ currentDiff: diff });
      } else {
        const diff = await invoke<FileDiff>("get_file_diff", {
          repoPath,
          filePath: file.path,
          staged: file.staged,
          contextLines: fullContext ? 999999 : null,
          ignoreWhitespace: ignoreWhitespace || null,
        });
        set({ currentDiff: diff });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  expandHunkContext: async (hunkIndex: number, direction: "up" | "down" | "tail", count = 20) => {
    const { repoPath, currentDiff, selectedFile, reviewMode, selectedCommit, _fileContentCache } = get();
    if (!repoPath || !currentDiff || !selectedFile) return;

    // Determine source for file content
    let source: string;
    if (reviewMode === "commits" && selectedCommit) {
      source = selectedCommit.oid;
    } else if (selectedFile.staged) {
      source = "index";
    } else {
      source = "workdir";
    }

    // Fetch file content if not cached
    let fileLines = _fileContentCache;
    if (!fileLines) {
      try {
        fileLines = await invoke<string[]>("get_file_content", {
          repoPath,
          filePath: currentDiff.path,
          source,
        });
        set({ _fileContentCache: fileLines, fileTotalLines: fileLines.length });
      } catch {
        return;
      }
    }

    // Deep clone hunks
    const hunks: DiffHunk[] = currentDiff.hunks.map((h) => ({
      ...h,
      lines: [...h.lines],
    }));

    if (direction === "tail") {
      // Append context lines after the last hunk
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

      set({ currentDiff: { ...currentDiff, hunks } });
      return;
    }

    const hunk = hunks[hunkIndex];

    // Compute gap above this hunk
    const { gapNewTop, gapOldTop, gapNewBottom, gapSize } = computeHunkGap(hunks, hunkIndex);

    if (gapSize <= 0) return;

    if (direction === "down") {
      // Prepend context lines to this hunk from bottom of gap
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
      // Note: any trailing function context git appends (e.g. "@@ ... @@ function foo()") is
      // intentionally omitted — we regenerate the header from line numbers alone after expansion.
      hunk.header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    } else {
      // Append context lines to previous hunk from top of gap
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

    // Merge adjacent/overlapping hunks
    for (let i = hunks.length - 1; i > 0; i--) {
      const prev = hunks[i - 1];
      const curr = hunks[i];
      if (prev.newStart + prev.newLines >= curr.newStart) {
        // Remove overlapping context lines from curr
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

    set({ currentDiff: { ...currentDiff, hunks } });
  },

  stageFile: async (filePath: string) => {
    const { repoPath, refreshStatus, selectFile, selectedFile, isDemo } = get();
    if (!repoPath || isDemo) return; // Disabled in demo mode

    try {
      await invoke("stage_file", { repoPath, filePath });
      await refreshStatus();
      if (selectedFile?.path === filePath) {
        const newStatus = get().status;
        const newFile = newStatus?.files.find(
          (f) => f.path === filePath && f.staged,
        );
        if (newFile) await selectFile(newFile);
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  unstageFile: async (filePath: string) => {
    const { repoPath, refreshStatus, selectFile, selectedFile, isDemo } = get();
    if (!repoPath || isDemo) return; // Disabled in demo mode

    try {
      await invoke("unstage_file", { repoPath, filePath });
      await refreshStatus();
      if (selectedFile?.path === filePath) {
        const newStatus = get().status;
        const newFile = newStatus?.files.find(
          (f) => f.path === filePath && !f.staged,
        );
        if (newFile) await selectFile(newFile);
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  stageAll: async () => {
    const { repoPath, refreshStatus, isDemo } = get();
    if (!repoPath || isDemo) return; // Disabled in demo mode

    try {
      await invoke("stage_all", { repoPath });
      await refreshStatus();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  unstageAll: async () => {
    const { repoPath, refreshStatus, isDemo } = get();
    if (!repoPath || isDemo) return; // Disabled in demo mode

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
    if (isDemo) return "demo-commit-oid"; // Mock in demo mode

    const oid = await invoke<string>("commit", { repoPath, message });
    await refreshStatus();
    set({ selectedFile: null, currentDiff: null });
    return oid;
  },

  discardFile: async (filePath: string) => {
    const { repoPath, refreshStatus, selectedFile, isDemo } = get();
    if (!repoPath || isDemo) return; // Disabled in demo mode

    try {
      await invoke("discard_file", { repoPath, filePath });
      await refreshStatus();
      if (selectedFile?.path === filePath) {
        set({ selectedFile: null, currentDiff: null });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  discardAll: async () => {
    const { repoPath, refreshStatus, isDemo } = get();
    if (!repoPath || isDemo) return; // Disabled in demo mode

    try {
      await invoke("discard_all", { repoPath });
      await refreshStatus();
      set({ selectedFile: null, currentDiff: null });
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
      selectedFile: null,
      currentDiff: null,
      commits: [],
      selectedCommit: null,
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
      // Try branch-scoped log first (commits not in main/master/develop/dev)
      const branchCommits = await invoke<CommitInfo[]>("get_branch_log", { repoPath });
      if (branchCommits.length > 0) {
        set({ commits: branchCommits, commitsPaginated: false, commitsPage: 0, isLoading: false });
        return;
      }
      // Fall back to paginated log
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

  selectCommit: async (commit: CommitInfo | null) => {
    const { repoPath } = get();
    if (!repoPath) return;

    set({ selectedCommit: commit, selectedFile: null, currentDiff: null, commitFiles: [], _fileContentCache: null, fileTotalLines: null });

    if (commit) {
      try {
        const commitFiles = await invoke<FileEntry[]>("get_commit_files", {
          repoPath,
          oid: commit.oid,
        });
        set({ commitFiles });
      } catch (e) {
        set({ error: String(e) });
      }
    }
  },
}));
