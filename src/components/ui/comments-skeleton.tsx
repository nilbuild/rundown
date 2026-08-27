import { SkeletonLines } from "~/components/ui/skeleton-lines";

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
