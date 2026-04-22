interface HunkExpandControlsProps {
  hunkIndex: number;
  canExpandUp: boolean;
  canExpandDown: boolean;
  onExpand: (hunkIndex: number, direction: "up" | "down" | "tail") => void;
}

export function ExpandDownButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
      title="Expand down"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

export function HunkExpandControls({ hunkIndex, canExpandUp, canExpandDown, onExpand }: HunkExpandControlsProps) {
  if (!canExpandUp && !canExpandDown) return null;

  // For the first hunk, canExpandDown means there are lines above it to prepend.
  // Show ↑ (not ↓) so the arrow matches the visual direction of where lines appear.
  // The store's expandHunkContext treats direction="down" as "prepend to this hunk".
  const showUpForFirstHunk = hunkIndex === 0 && canExpandDown;

  return (
    <span className="flex items-center gap-0.5 flex-shrink-0">
      {(canExpandUp || showUpForFirstHunk) && (
        <button
          onClick={() => onExpand(hunkIndex, showUpForFirstHunk ? "down" : "up")}
          className="p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
          title="Expand up"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
      {canExpandDown && !showUpForFirstHunk && (
        <ExpandDownButton onClick={() => onExpand(hunkIndex, "down")} />
      )}
    </span>
  );
}
