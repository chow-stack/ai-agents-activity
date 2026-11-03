import { Laptop } from "lucide-react";
import type { ReactNode } from "react";

/** The team screen needs a laptop-sized screen. Below 1024px, ask for one instead. */
export function ScreenGuard({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="hidden min-[1024px]:contents">{children}</div>
      <div className="grid min-h-screen place-items-center p-8 text-center min-[1024px]:hidden">
        <div className="max-w-xs">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-crimson-soft text-crimson">
            <Laptop size={26} />
          </div>
          <h1 className="display text-2xl">Grab a laptop</h1>
          <p className="mt-2 text-[14.5px] text-muted">
            Trust or Betray needs a bigger screen. Open this page on a laptop.
          </p>
        </div>
      </div>
    </>
  );
}
