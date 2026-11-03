import { Suspense } from "react";
import { BoardScreen } from "@/components/BoardScreen";

export default function BoardPage() {
  return (
    <Suspense>
      <BoardScreen />
    </Suspense>
  );
}
