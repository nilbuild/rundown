import { cn } from "~/utils/classname";

interface LinesProps {
  /// Width of each line as a percentage, so blocks do not look machine-even.
  widths: number[];
  height?: number;
  gap?: number;
  className?: string;
}

export function SkeletonLines(props: LinesProps) {
  const { widths, height, gap, className } = props;
  return (
    <div className={cn("flex flex-col", className)} style={{ gap: gap ?? 9 }}>
      {widths.map((width, index) => (
        <div
          key={index}
          className="skeleton"
          style={{ width: `${width}%`, height: height ?? 12 }}
        />
      ))}
    </div>
  );
}

export function StoryListSkeleton() {
  const rows = [92, 74, 88, 61, 96, 70, 84, 66, 90, 78];
  return (
    <div className="py-1" aria-label="Loading stories">
      {rows.map((width, index) => (
        <div className="flex flex-col gap-[7px] py-[11px] pr-[14px] pl-[30px]" key={index}>
          <div className="skeleton" style={{ width: `${width}%`, height: 12 }} />
          <div className="skeleton" style={{ width: "48%", height: 9 }} />
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
    <div className="flex flex-col gap-[26px] pt-[14px] pb-10" aria-label="Loading the thread">
      {rows.map((row, index) => (
        <div key={index} style={{ marginLeft: row.indent * 22 }}>
          <div className="mb-[10px] flex gap-2">
            <div className="skeleton" style={{ width: 74, height: 10 }} />
            <div className="skeleton" style={{ width: 34, height: 10 }} />
          </div>
          <SkeletonLines widths={row.widths} />
        </div>
      ))}
    </div>
  );
}

export function ArticleSkeleton() {
  return (
    <div className="flex flex-col gap-[26px] pt-2" aria-label="Loading the article">
      <div className="skeleton" style={{ width: "78%", height: 30 }} />
      <div className="-mt-[14px] flex gap-3">
        <div className="skeleton" style={{ width: 110, height: 10 }} />
        <div className="skeleton" style={{ width: 70, height: 10 }} />
        <div className="skeleton" style={{ width: 84, height: 10 }} />
      </div>
      <SkeletonLines widths={[98, 94, 99, 62]} height={14} gap={12} />
      <SkeletonLines widths={[96, 99, 90, 97, 48]} height={14} gap={12} />
      <SkeletonLines widths={[99, 88, 94, 71]} height={14} gap={12} />
    </div>
  );
}

export function OutputSkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-[6px]" aria-label="Generating">
      <div className="skeleton" style={{ width: "46%", height: 16 }} />
      <div className="my-1 border-l-2 border-line pl-4">
        <SkeletonLines widths={[97, 92, 58]} height={13} />
      </div>
      <SkeletonLines widths={[95, 99, 66]} height={12} />
      <div className="skeleton" style={{ width: "38%", height: 16, marginTop: 26 }} />
      <div className="my-1 border-l-2 border-line pl-4">
        <SkeletonLines widths={[94, 80]} height={13} />
      </div>
      <SkeletonLines widths={[98, 72]} height={12} />
    </div>
  );
}
