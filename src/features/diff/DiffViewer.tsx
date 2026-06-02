import { useCallback, useEffect, useRef, useState } from "react";
import { useGitStore } from "@/stores/gitStore";
import { useCommentStore } from "@/stores/commentStore";
import { useUiStore } from "@/stores/uiStore";
import { UnifiedDiffView } from "./UnifiedDiffView";
import { SplitDiffView } from "./SplitDiffView";
import { formatRename } from "@/lib/formatRename";
import type { Comment } from "@/types/comment";
import type { FileDiff, FileStatus } from "@/types/git";

const statusBadge: Record<FileStatus, { label: string; color: string }> = {
  modified: { label: "M", color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300" },
  added: { label: "A", color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" },
  deleted: { label: "D", color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" },
  renamed: { label: "R", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
  copied: { label: "C", color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" },
  untracked: { label: "U", color: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400" },
  ignored: { label: "I", color: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500" },
  conflicted: { label: "!", color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" },
};

function FileDiffSection({
  diff,
  diffViewMode,
  onLineClick,
  onContentClick,
  onLineHover,
  rangeStart,
  hoveredLine,
  fileTotalLines,
  headerRef,
}: {
  diff: FileDiff;
  diffViewMode: "unified" | "split";
  onLineClick: (lineNo: number, isOld: boolean, content: string, shiftKey: boolean, filePath: string) => void;
  onContentClick: (comment: Comment) => void;
  onLineHover: (lineNo: number | null) => void;
  rangeStart: { lineNo: number; content: string; isOld: boolean } | null;
  hoveredLine: number | null;
  fileTotalLines: number | null;
  headerRef?: (node: HTMLDivElement | null) => void;
}) {
  const { getFileComments } = useCommentStore();
  const comments = getFileComments(diff.path);
  const badge = statusBadge[diff.status];
  const expandHunkContext = useGitStore((s) => s.expandHunkContext);

  const handleLineClick = useCallback(
    (lineNo: number, isOld: boolean, content: string, shiftKey: boolean) => {
      onLineClick(lineNo, isOld, content, shiftKey, diff.path);
    },
    [onLineClick, diff.path],
  );

  const handleExpand = useCallback(
    (hunkIndex: number, direction: "up" | "down" | "tail") => {
      expandHunkContext(diff.path, hunkIndex, direction);
    },
    [expandHunkContext, diff.path],
  );

  if (diff.isBinary) {
    return (
      <>
        <div ref={headerRef} className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${badge.color}`}>
            {badge.label}
          </span>
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{diff.path}</span>
        </div>
        <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">Binary file</div>
      </>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <>
        <div ref={headerRef} className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${badge.color}`}>
            {badge.label}
          </span>
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{diff.path}</span>
        </div>
        <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">No changes</div>
      </>
    );
  }

  return (
    <>
      <div ref={headerRef} className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${badge.color}`}>
          {badge.label}
        </span>
        {diff.oldPath && diff.status === "renamed" ? (
          <span className="font-medium text-xs">
            {formatRename(diff.oldPath, diff.path).segments.map((seg, i) => (
              <span
                key={i}
                className={
                  seg.type === "old"
                    ? "text-red-500 dark:text-red-400"
                    : seg.type === "new"
                      ? "text-green-600 dark:text-green-400"
                      : seg.type === "arrow"
                        ? "text-gray-400 dark:text-gray-500"
                        : "text-gray-900 dark:text-gray-100"
                }
              >
                {seg.text}
              </span>
            ))}
          </span>
        ) : (
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{diff.path}</span>
        )}
      </div>
      <div className="border-b border-gray-200 dark:border-gray-700">
        {diffViewMode === "unified" ? (
          <UnifiedDiffView
            diff={diff}
            comments={comments}
            onLineClick={handleLineClick}
            onContentClick={onContentClick}
            onLineHover={onLineHover}
            onExpand={handleExpand}
            fileTotalLines={fileTotalLines}
            rangeSelectionStart={rangeStart?.lineNo ?? null}
            rangeSelectionIsOld={rangeStart?.isOld ?? null}
            hoveredLine={rangeStart ? hoveredLine : null}
            scrollToLine={null}
            onScrollComplete={() => {}}
          />
        ) : (
          <SplitDiffView
            diff={diff}
            comments={comments}
            onLineClick={handleLineClick}
            onContentClick={onContentClick}
            onLineHover={onLineHover}
            onExpand={handleExpand}
            fileTotalLines={fileTotalLines}
            rangeSelectionStart={rangeStart?.lineNo ?? null}
            rangeSelectionIsOld={rangeStart?.isOld ?? null}
            hoveredLine={rangeStart ? hoveredLine : null}
            scrollToLine={null}
            onScrollComplete={() => {}}
          />
        )}
      </div>
    </>
  );
}

export function DiffViewer() {
  const { combinedDiffs, selectedFilePath, scrollToSelectedFile, selectFile, clearScrollToSelectedFile } = useGitStore();
  const { setDraft } = useCommentStore();
  const _fileTotalLines = useGitStore((s) => s._fileTotalLines);
  const {
    diffViewMode,
    setDiffViewMode,
    showFullFileContext,
    setShowFullFileContext,
    ignoreWhitespace,
    setIgnoreWhitespace,
  } = useUiStore();
  const [rangeStart, setRangeStart] = useState<{
    lineNo: number;
    content: string;
    isOld: boolean;
  } | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isScrollingToRef = useRef(false);

  useEffect(() => {
    if (!scrollToSelectedFile || !selectedFilePath || !scrollContainerRef.current) return;

    const node = headerRefs.current.get(selectedFilePath);
    if (node) {
      isScrollingToRef.current = true;
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => {
        isScrollingToRef.current = false;
        clearScrollToSelectedFile();
      }, 500);
    } else {
      clearScrollToSelectedFile();
    }
  }, [scrollToSelectedFile, selectedFilePath, clearScrollToSelectedFile]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !combinedDiffs || combinedDiffs.length === 0) return;

    const nodeToPath = new Map<Element, string>();

    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingToRef.current) return;

        let topPath: string | null = null;
        let topOffset = Infinity;

        for (const entry of entries) {
          if (entry.isIntersecting) {
            const path = nodeToPath.get(entry.target);
            if (path) {
              const rect = entry.boundingClientRect;
              if (rect.top < topOffset) {
                topOffset = rect.top;
                topPath = path;
              }
            }
          }
        }

        if (topPath) {
          selectFile(topPath);
        }
      },
      {
        root: container,
        rootMargin: "0px 0px -90% 0px",
        threshold: 0,
      },
    );

    for (const [path, node] of headerRefs.current) {
      if (combinedDiffs.some((d) => d.path === path)) {
        nodeToPath.set(node, path);
        observer.observe(node);
      }
    }

    return () => observer.disconnect();
  }, [combinedDiffs, selectFile]);

  useEffect(() => {
    const { fetchDiffs, repoPath } = useGitStore.getState();
    if (!repoPath) return;
    fetchDiffs(showFullFileContext, ignoreWhitespace);
  }, [showFullFileContext, ignoreWhitespace]);

  const handleLineClick = useCallback(
    (lineNo: number, isOld: boolean, content: string, shiftKey: boolean, filePath: string) => {
      if (!combinedDiffs) return;
      const diffForFile = combinedDiffs.find((d) => d.path === filePath);
      if (!diffForFile) return;

      if (shiftKey) {
        if (rangeStart) {
          const startLine = Math.min(rangeStart.lineNo, lineNo);
          const endLine = Math.max(rangeStart.lineNo, lineNo);

          const snippetLines: string[] = [];
          for (const hunk of diffForFile.hunks) {
            for (const line of hunk.lines) {
              if (rangeStart.isOld) {
                if (
                  line.oldLineNo !== undefined &&
                  line.oldLineNo >= startLine &&
                  line.oldLineNo <= endLine &&
                  (line.lineType === "deletion" || line.lineType === "context")
                ) {
                  snippetLines.push(line.content);
                }
              } else {
                if (
                  line.newLineNo !== undefined &&
                  line.newLineNo >= startLine &&
                  line.newLineNo <= endLine &&
                  (line.lineType === "addition" || line.lineType === "context")
                ) {
                  snippetLines.push(line.content);
                }
              }
            }
          }

          setDraft({
            filePath,
            startLine,
            endLine,
            codeSnippet: snippetLines.join("\n"),
            isOld: rangeStart.isOld,
          });
          setRangeStart(null);
        } else {
          setRangeStart({ lineNo, content, isOld });
        }
      } else {
        setRangeStart(null);
        setDraft({
          filePath,
          startLine: lineNo,
          endLine: lineNo,
          codeSnippet: content,
          isOld,
        });
      }
    },
    [combinedDiffs, setDraft, rangeStart],
  );

  const handleLineHover = useCallback((lineNo: number | null) => {
    setHoveredLine(lineNo);
  }, []);

  const handleContentClick = useCallback(
    (comment: Comment) => {
      setDraft({
        filePath: comment.filePath,
        startLine: comment.startLine,
        endLine: comment.endLine,
        codeSnippet: comment.codeSnippet,
        isOld: comment.isOld,
        editingId: comment.id,
        existingContent: comment.content,
        existingCategory: comment.category,
      });
    },
    [setDraft],
  );

  const setHeaderRef = useCallback((path: string) => (node: HTMLDivElement | null) => {
    if (node) {
      headerRefs.current.set(path, node);
    } else {
      headerRefs.current.delete(path);
    }
  }, []);

  if (!combinedDiffs || combinedDiffs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900">
        <p className="text-sm">No changes</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="font-medium text-sm text-gray-500 dark:text-gray-400">
          {combinedDiffs.length} file{combinedDiffs.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          {rangeStart && (
            <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded">
              Range: {rangeStart.isOld ? "old" : "new"} line {rangeStart.lineNo}{" "}
              → Shift+click to end
            </span>
          )}
          <div className="flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
            <button
              onClick={() => setDiffViewMode("unified")}
              className={`px-2 py-1 text-xs ${
                diffViewMode === "unified"
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              Unified
            </button>
            <button
              onClick={() => setDiffViewMode("split")}
              className={`px-2 py-1 text-xs ${
                diffViewMode === "split"
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              Split
            </button>
          </div>
          <div className="border-l border-gray-300 dark:border-gray-600 h-4 mx-1" />
          <button
            onClick={() => setShowFullFileContext(!showFullFileContext)}
            className={`p-1.5 rounded ${
              showFullFileContext
                ? "bg-blue-600 text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            title="Show full file context"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          </button>
          <button
            onClick={() => setIgnoreWhitespace(!ignoreWhitespace)}
            className={`p-1.5 rounded ${
              ignoreWhitespace
                ? "bg-blue-600 text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            title="Ignore whitespace changes"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h7"
              />
              <path
                strokeLinecap="round"
                strokeWidth={2}
                d="M5 21l14-14"
                className="text-current"
              />
            </svg>
          </button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto">
        {combinedDiffs.map((diff) => (
          <FileDiffSection
            key={diff.path}
            diff={diff}
            diffViewMode={diffViewMode}
            onLineClick={handleLineClick}
            onContentClick={handleContentClick}
            onLineHover={handleLineHover}
            rangeStart={rangeStart}
            hoveredLine={hoveredLine}
            fileTotalLines={_fileTotalLines[diff.path] ?? null}
            headerRef={setHeaderRef(diff.path)}
          />
        ))}
      </div>
    </div>
  );
}