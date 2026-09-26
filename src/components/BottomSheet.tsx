import { type PropsWithChildren, useRef, useId } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";

type BottomSheetProps = PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
}>;

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: BottomSheetProps) {
  const descriptionId = useId();
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" data-testid="sheet-overlay" />
        <Dialog.Content
          className="bottom-sheet"
          data-testid="bottom-sheet"
          aria-describedby={description ? descriptionId : undefined}
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            if (opener.current?.matches("input, textarea")) opener.current.blur();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
          }}
        >
          <div className="sheet-header">
            <Dialog.Title className="sheet-title">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description id={descriptionId} className="sheet-description">
                {description}
              </Dialog.Description>
            ) : null}
            <Dialog.Close className="sheet-close" aria-label="Dismiss dialog">
              <Cross2Icon width={20} height={20} />
            </Dialog.Close>
          </div>
          <div className="sheet-content">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
