import { useMemo } from "react";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokPage } from "@remotion/captions";

export const useCaptionPages = (
  captions: Caption[] | null,
  combineTokensWithinMilliseconds: number,
): TikTokPage[] => {
  return useMemo(() => {
    if (!captions) return [];
    return createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds }).pages;
  }, [captions, combineTokensWithinMilliseconds]);
};
