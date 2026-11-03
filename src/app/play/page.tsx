import { PlayScreen } from "@/components/play/PlayScreen";
import { ScreenGuard } from "@/components/ScreenGuard";

export default function PlayPage() {
  return (
    <ScreenGuard>
      <PlayScreen />
    </ScreenGuard>
  );
}
