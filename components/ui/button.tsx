import type { ButtonHTMLAttributes, Ref } from "react";
import { X, type LucideIcon } from "lucide-react";

const VARIANT = {
  primary: "bg-inv text-oninv border-inv hover:bg-invh hover:border-invh disabled:bg-sel disabled:border-sel disabled:text-tx2",
  outline: "bg-bg text-tx border-line hover:border-line2 disabled:text-tx2",
  ghost: "border-transparent text-tx3 hover:bg-sel disabled:text-tx2",
  danger: "bg-bg text-alert border-line hover:border-alert",
};
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: keyof typeof VARIANT; size?: "sm" | "md"; icon?: LucideIcon; ref?: Ref<HTMLButtonElement> }
export function Button({ variant = "outline", size = "md", icon: Icon, className = "", children, type = "button", ...p }: ButtonProps) {
  return (
    <button type={type} className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl border font-medium transition-colors ${size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-[34px] px-3.5 text-[13px]"} ${VARIANT[variant]} ${className}`} {...p}>
      {Icon && <Icon size={size === "sm" ? 14 : 15} strokeWidth={1.5} aria-hidden />}
      {children}
    </button>
  );
}
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { icon: LucideIcon; label: string; size?: number; ref?: Ref<HTMLButtonElement> }
export function IconButton({ icon: Icon, label, size = 16, className = "", type = "button", ...p }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} title={label} className={`inline-flex size-8 shrink-0 items-center justify-center rounded-ctl text-tx3 transition-colors hover:bg-sel hover:text-tx ${className}`} {...p}>
      <Icon size={size} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
export const CloseButton = (p: { onClick?: () => void; label?: string }) => <IconButton icon={X} label={p.label ?? "Fechar"} onClick={p.onClick} />;
