import { Suspense } from "react";
import { JoinScreen } from "@/components/JoinScreen";

export default function Home() {
  return (
    <Suspense>
      <JoinScreen />
    </Suspense>
  );
}
