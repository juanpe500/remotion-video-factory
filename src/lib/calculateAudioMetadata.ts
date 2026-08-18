import { staticFile, type CalculateMetadataFunction } from "remotion";
import { getAudioDuration } from "./get-audio-duration";

export type AudioSyncedProps = {
  // Frame at which narration ends (before any outro tail). Injected by
  // calculateMetadata — components read it to know when to swap the last
  // caption for an outro card, place a progress bar, etc.
  narrationEndFrame?: number;
};

/**
 * Builds a calculateMetadata() that sizes the composition's duration to the
 * narration audio, so every style variant of a video auto-syncs to the same
 * source of truth (public/<slug>/audio.mp3) instead of a hardcoded frame count.
 *
 * `tailFrames` is held after narration ends — a small buffer by default so
 * the last caption doesn't cut off abruptly, or a longer one for a style
 * that wants to show an outro card in that time.
 */
export const makeCalculateAudioMetadata = (
  audioFile: string,
  options: { tailFrames?: number } = {},
): CalculateMetadataFunction<AudioSyncedProps> => {
  const tailFrames = options.tailFrames ?? 20;

  return async ({ props }) => {
    const durationInSeconds = await getAudioDuration(staticFile(audioFile));
    const fps = 30;
    const narrationEndFrame = Math.ceil(durationInSeconds * fps);

    return {
      fps,
      durationInFrames: narrationEndFrame + tailFrames,
      props: { ...props, narrationEndFrame },
    };
  };
};
