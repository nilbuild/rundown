import type { ReactNode } from "react";
import { Dialog as Base } from "@base-ui-components/react/dialog";
import { X } from "lucide-react";
import { cn } from "~/utils/classname";
import { IconButton } from "~/components/ui/icon-button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  /// Widths differ per dialog; everything else about the shell does not.
  className?: string;
  children: ReactNode;
}

export function Dialog(props: Props) {
  const { open, onOpenChange, title, subtitle, className, children } = props;

  return (
    <Base.Root open={open} onOpenChange={onOpenChange}>
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 z-[260] bg-black/30 backdrop-blur-[2px] transition-opacity duration-[160ms] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Base.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-[270] max-h-[80vh] w-[560px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-panel px-6 pt-5 pb-6 shadow-panel outline-none transition-[opacity,transform] duration-[160ms]",
            "data-[ending-style]:scale-97 data-[ending-style]:opacity-0 data-[starting-style]:scale-97 data-[starting-style]:opacity-0",
            className,
          )}
        >
          <header className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Base.Title className="mb-1 text-base font-[620]">{title}</Base.Title>
              {subtitle ? (
                <p className="m-0 text-xs leading-[1.5] text-muted">{subtitle}</p>
              ) : null}
            </div>
            <Base.Close render={<IconButton aria-label="Close" />}>
              <X size={13} strokeWidth={2.2} />
            </Base.Close>
          </header>
          {children}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
