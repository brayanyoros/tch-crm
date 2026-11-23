"use client";
import * as D from "@radix-ui/react-dialog";
import * as M from "@radix-ui/react-dropdown-menu";
import * as P from "@radix-ui/react-popover";
import * as T from "@radix-ui/react-tooltip";
import { useState, type ReactNode } from "react";
import { Check, ChevronDown, X, type LucideIcon } from "lucide-react";
import { Button, IconButton } from "./button";
import type { Option } from "./form";

const POP = "z-[70] rounded-card border bg-surface shadow-pop outline-none";

export function Dialog({ open, onClose, title, description, children, footer, width = 480 }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-scrim" />
        <D.Content {...(description ? {} : { "aria-describedby": undefined })} style={{ maxWidth: width }} className="rise fixed inset-x-3 top-[6vh] z-[60] mx-auto flex max-h-[88vh] flex-col rounded-card border bg-surface shadow-pop outline-none">
          <header className="flex items-start gap-3 border-b px-5 py-3.5">
            <div className="flex-1"><D.Title className="t-block">{title}</D.Title>{description && <D.Description className="t-sec">{description}</D.Description>}</div>
            <D.Close asChild><IconButton icon={X} label="Fechar" className="-mr-2 -mt-1" /></D.Close>
          </header>
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t px-5 py-3">{footer}</footer>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
/** Gaveta lateral com fundo escurecido. */
export function Drawer({ open, onClose, title, aside, children, width = 420 }: { open: boolean; onClose: () => void; title: string; aside?: ReactNode; children: ReactNode; width?: number }) {
  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-scrim" />
        <D.Content aria-describedby={undefined} style={{ maxWidth: width }} className="slide-in fixed inset-y-0 right-0 z-[60] flex w-full flex-col border-l bg-surface outline-none">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-5"><D.Title className="t-block flex-1 truncate">{title}</D.Title>{aside}<D.Close asChild><IconButton icon={X} label="Fechar" className="-mr-2" /></D.Close></header>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
export function Confirm({ open, onClose, title, text, action, onConfirm }: { open: boolean; onClose: () => void; title: string; text: string; action: string; onConfirm: () => void }) {
  return <Dialog open={open} onClose={onClose} title={title} width={420} footer={<><Button onClick={onClose}>Voltar</Button><Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>{action}</Button></>}><p className="t-body text-tx3">{text}</p></Dialog>;
}
export interface MenuItem { label: string; icon?: LucideIcon; run?: () => void; alert?: boolean; checked?: boolean; sub?: MenuItem[] }
const ITEM = "flex w-full cursor-pointer select-none items-center gap-2 rounded-tag px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-sel";
function Items({ items }: { items: MenuItem[] }) {
  return items.map((i) => i.sub ? (
    <M.Sub key={i.label}>
      <M.SubTrigger className={ITEM}>{i.icon && <i.icon size={15} strokeWidth={1.5} />}{i.label}<ChevronDown size={13} strokeWidth={1.5} className="ml-auto -rotate-90" /></M.SubTrigger>
      <M.Portal><M.SubContent className={`${POP} min-w-44 p-1`}><Items items={i.sub} /></M.SubContent></M.Portal>
    </M.Sub>
  ) : (
    <M.Item key={i.label} onSelect={i.run} className={`${ITEM} ${i.alert ? "text-alert" : ""}`}>{i.icon && <i.icon size={15} strokeWidth={1.5} />}<span className="flex-1">{i.label}</span>{i.checked && <Check size={14} strokeWidth={1.75} />}</M.Item>
  ));
}
export function Dropdown({ trigger, items, align = "end", side }: { trigger: ReactNode; items: MenuItem[]; align?: "start" | "end"; side?: "top" | "bottom" }) {
  return <M.Root modal={false}><M.Trigger asChild>{trigger}</M.Trigger><M.Portal><M.Content align={align} side={side} sideOffset={6} collisionPadding={8} className={`${POP} max-h-80 min-w-44 overflow-y-auto p-1`}><Items items={items} /></M.Content></M.Portal></M.Root>;
}
/** Filtro em dropdown; mostra o valor escolhido. */
export function FilterMenu({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  const cur = options.find((o) => o.value === value);
  return <Dropdown align="start" trigger={<button type="button" className={`inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-ctl border px-2.5 text-[12.5px] transition-colors hover:border-line2 ${cur ? "border-tx bg-surface text-tx" : "text-tx2"}`}>{label}{cur && <span className="max-w-36 truncate font-semibold">{cur.label}</span>}<ChevronDown size={13} strokeWidth={1.5} aria-hidden /></button>} items={[{ label: "Todos", run: () => onChange(""), checked: !cur }, ...options.map((o) => ({ label: o.label, run: () => onChange(o.value), checked: o.value === value }))]} />;
}
export function Popover({ trigger, children, width = 280, align = "start", open, onOpenChange }: { trigger: ReactNode; children: ReactNode | ((close: () => void) => ReactNode); width?: number; align?: "start" | "end"; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const [own, setOwn] = useState(false);
  const isOpen = open ?? own, set = onOpenChange ?? setOwn;
  return <P.Root open={isOpen} onOpenChange={set}><P.Trigger asChild>{trigger}</P.Trigger><P.Portal><P.Content align={align} sideOffset={6} collisionPadding={8} style={{ width }} className={`${POP} max-h-[70vh] max-w-[calc(100vw-16px)] overflow-y-auto`}>{typeof children === "function" ? children(() => set(false)) : children}</P.Content></P.Portal></P.Root>;
}
export function Tooltip({ text, children, side = "right" }: { text: string; children: ReactNode; side?: "right" | "top" | "bottom" }) {
  return <T.Root><T.Trigger asChild>{children}</T.Trigger><T.Portal><T.Content side={side} sideOffset={8} className="t-meta z-[80] rounded-tag bg-inv px-2 py-1 text-oninv">{text}</T.Content></T.Portal></T.Root>;
}
export const TooltipProvider = T.Provider;
