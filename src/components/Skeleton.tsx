interface LinesProps {
  /// Width of each line as a percentage, so blocks do not look machine-even.
  widths: number[];
  height?: number;
  gap?: number;
}

export function SkeletonLines(props: LinesProps) {
  const { widths, height, gap } = props;
  return (
    <div className="sk-lines" style={{ gap: gap ?? 9 }}>
      {widths.map((width, index) => (
        <div
          key={index}
          className="sk"
          style={{ width: `${width}%`, height: height ?? 12 }}
        />
      ))}
    </div>
  );
}

export function StoryListSkeleton() {
  const rows = [92, 74, 88, 61, 96, 70, 84, 66, 90, 78];
  return (
    <div className="sk-stories" aria-label="Loading stories">
      {rows.map((width, index) => (
        <div className="sk-story" key={index}>
          <div className="sk" style={{ width: `${width}%`, height: 12 }} />
          <div className="sk" style={{ width: "48%", height: 9 }} />
        </div>
      ))}
    </div>
  );
}

export function CommentsSkeleton() {
  const rows = [
    { indent: 0, widths: [96, 88, 62] },
    { indent: 1, widths: [90, 54] },
    { indent: 2, widths: [84, 70, 40] },
    { indent: 0, widths: [93, 78] },
    { indent: 1, widths: [88, 66, 44] },
    { indent: 0, widths: [72] },
  ];
  return (
    <div className="sk-comments" aria-label="Loading the thread">
      {rows.map((row, index) => (
        <div key={index} style={{ marginLeft: row.indent * 22 }}>
          <div className="sk-comment-head">
            <div className="sk" style={{ width: 74, height: 10 }} />
            <div className="sk" style={{ width: 34, height: 10 }} />
          </div>
          <SkeletonLines widths={row.widths} />
        </div>
      ))}
    </div>
  );
}

export function ArticleSkeleton() {
  return (
    <div className="sk-article" aria-label="Loading the article">
      <div className="sk" style={{ width: "78%", height: 30 }} />
      <div className="sk-article-meta">
        <div className="sk" style={{ width: 110, height: 10 }} />
        <div className="sk" style={{ width: 70, height: 10 }} />
        <div className="sk" style={{ width: 84, height: 10 }} />
      </div>
      <SkeletonLines widths={[98, 94, 99, 62]} height={14} gap={12} />
      <SkeletonLines widths={[96, 99, 90, 97, 48]} height={14} gap={12} />
      <SkeletonLines widths={[99, 88, 94, 71]} height={14} gap={12} />
    </div>
  );
}

export function OutputSkeleton() {
  return (
    <div className="sk-output" aria-label="Generating">
      <div className="sk" style={{ width: "46%", height: 16 }} />
      <div className="sk-quote">
        <SkeletonLines widths={[97, 92, 58]} height={13} />
      </div>
      <SkeletonLines widths={[95, 99, 66]} height={12} />
      <div className="sk" style={{ width: "38%", height: 16, marginTop: 26 }} />
      <div className="sk-quote">
        <SkeletonLines widths={[94, 80]} height={13} />
      </div>
      <SkeletonLines widths={[98, 72]} height={12} />
    </div>
  );
}
