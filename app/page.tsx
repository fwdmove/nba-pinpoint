import { Suspense } from "react";
import Game from "@/components/Game";

export default function Page() {
  return (
    <Suspense>
      <Game />
    </Suspense>
  );
}
