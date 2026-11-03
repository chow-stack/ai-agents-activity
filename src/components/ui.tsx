import { Handshake, Swords } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Choice } from "@/lib/supabase";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-crimson text-paper hover:bg-crimson-dark shadow-[0_8px_20px_-10px_rgb(152_27_37/0.7)]",
  secondary: "bg-paper text-ink ring-1 ring-line-strong hover:ring-ink-2",
  ghost: "text-ink-2 hover:bg-sand",
  danger: "text-crimson hover:bg-crimson-soft",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; children: ReactNode }) {
  const sizes = { sm: "rounded-lg px-3 py-1.5 text-[13px]", md: "rounded-xl px-5 py-2.5 text-[15px]", lg: "rounded-2xl px-7 py-3.5 text-[17px]" };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${sizes[size]} ${VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = { sm: "text-[16px]", md: "text-[19px]", lg: "text-[26px]" }[size];
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="" width={size === "lg" ? 34 : 26} height={size === "lg" ? 25 : 19} />
      <div className="leading-none">
        <div className="text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">Gen AI Club</div>
        <div className={`display mt-0.5 ${s}`}>
          Trust <span className="text-crimson">or</span> Betray
        </div>
      </div>
    </div>
  );
}

export const CHOICE = {
  share: { label: "Share", icon: Handshake, solid: "bg-share text-paper", soft: "bg-share-soft text-share", text: "text-share" },
  steal: { label: "Steal", icon: Swords, solid: "bg-steal text-paper", soft: "bg-steal-soft text-steal", text: "text-steal" },
} as const;

/** A revealed SHARE / STEAL card. */
export function ChoiceTag({ choice, size = "md", auto = false, className = "" }: { choice: Choice; size?: "sm" | "md" | "lg"; auto?: boolean; className?: string }) {
  const c = CHOICE[choice];
  const Icon = c.icon;
  const sizes = { sm: "gap-1 rounded-md px-2 py-0.5 text-[11.5px]", md: "gap-1.5 rounded-lg px-3 py-1 text-[13px]", lg: "gap-2 rounded-xl px-4 py-2 text-[20px]" };
  const icon = { sm: 12, md: 14, lg: 22 }[size];
  return (
    <span className={`animate-flip inline-flex items-center font-bold tracking-wide uppercase ${sizes[size]} ${c.solid} ${className}`} title={auto ? "Ran out of time" : undefined}>
      <Icon size={icon} strokeWidth={2.4} />
      {c.label}
      {auto && <span className="font-medium normal-case opacity-75">(timed out)</span>}
    </span>
  );
}

export function Typing({ className = "" }: { className?: string }) {
  return (
    <span className={`typing inline-flex items-center ${className}`} aria-label="Thinking">
      <span />
      <span />
      <span />
    </span>
  );
}

export function Chip({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: "neutral" | "crimson" | "share" | "warn"; className?: string }) {
  const tones = { neutral: "bg-sand text-ink-2", crimson: "bg-crimson-soft text-crimson", share: "bg-share-soft text-share", warn: "bg-warn-soft text-warn" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}
