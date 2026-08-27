import type { ButtonHTMLAttributes } from "react";
import { cn } from "~/utils/classname";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

export function IconButton(props: Props) {
  const { className, type, ...rest } = props;
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex size-[26px] shrink-0 items-center justify-center rounded-[7px] border border-line bg-line-soft text-xs leading-none text-muted transition-[background,border-color,color] duration-[120ms] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:bg-line hover:text-fg",
        className,
      )}
      {...rest}
    />
  );
}
