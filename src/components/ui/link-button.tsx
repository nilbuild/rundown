import type { ButtonHTMLAttributes } from "react";
import { cn } from "~/utils/classname";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

/// An accent-coloured text button. The underline is a border so it sits a
/// little clear of the descenders.
export function LinkButton(props: Props) {
  const { className, type, ...rest } = props;
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "border-b border-accent-soft text-accent no-underline hover:border-b-accent",
        className,
      )}
      {...rest}
    />
  );
}
