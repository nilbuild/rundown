import { SkeletonLines } from "~/components/ui/skeleton-lines";

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
