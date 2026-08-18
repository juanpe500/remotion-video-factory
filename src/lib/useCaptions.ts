import { useCallback, useEffect, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import type { Caption } from "@remotion/captions";

/**
 * Fetches a captions.json (written by scripts/generate-captions.ts) and
 * holds render until it's loaded. Shared by every style variant of a video.
 */
export const useCaptions = (captionsFile: string): Caption[] | null => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`Loading ${captionsFile}`));

  const fetchCaptions = useCallback(async () => {
    try {
      const response = await fetch(staticFile(captionsFile));
      const data = (await response.json()) as Caption[];
      setCaptions(data);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [captionsFile, continueRender, cancelRender, handle]);

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  return captions;
};
