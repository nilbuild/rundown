import { SkeletonLines } from "~/components/ui/skeleton-lines";

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
