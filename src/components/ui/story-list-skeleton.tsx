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
