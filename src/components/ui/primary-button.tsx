import type { ButtonHTMLAttributes } from "react";
import { cn } from "~/utils/classname";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

export function PrimaryButton(props: Props & { small?: boolean }) {
  const { className, small, type, ...rest } = props;
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "rounded-lg bg-accent text-[13px] font-[550] text-white transition-[filter] duration-[120ms] not-disabled:hover:brightness-110 disabled:cursor-default disabled:opacity-40",
        small ? "rounded-[7px] px-3.5 py-[5px] text-[12.5px]" : "px-[15px] py-[7px]",
        className,
      )}
      {...rest}
    />
  );
}
