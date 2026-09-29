import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;

// スマホでは下から出るシート、PCでは中央のダイアログ
export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-card shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8",
          "md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div>
            <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="-mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="閉じる">
            <X size={18} />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 safe-bottom">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
