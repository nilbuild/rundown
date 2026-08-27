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
