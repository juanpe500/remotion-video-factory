import React, { useCallback, useEffect, useState } from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";

/**
 * Timed "source/example" image cards for the bottom third of the frame.
 * Each beat's image is optional — if the file hasn't been dropped into
 * public/ yet, that beat silently renders nothing instead of breaking the
 * render, so this can be wired in ahead of having the actual assets.
 */
export type ImageBeat = {
  id: string;
  file: string; // path under public/
  atMs: number;
  toMs: number;
  label: string; // small caption under the image, e.g. "SOURCE: EUR-Lex, Article 50"
  width?: number; // card width in px (default 640) — bump for hero beats
  bottom?: number; // distance from the bottom edge in px (default 150)
};

const FADE_FRAMES = 12;

// HEAD-checks the file so a not-yet-provided image degrades to "don't show
// this beat" instead of a broken image or a failed render. Uses
// delayRender so the check is guaranteed to resolve before Remotion
// captures the frame, but always continueRender — never cancels — so a
// missing file can't fail the render.
const useImageAvailable = (file: string): boolean | null => {
  const [available, setAvailable] = useState<boolean | null>(null);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`Checking ${file}`));

  const check = useCallback(async () => {
    try {
      const res = await fetch(staticFile(file), { method: "HEAD" });
      setAvailable(res.ok);
    } catch {
      setAvailable(false);
    } finally {
      continueRender(handle);
    }
  }, [file, continueRender, handle]);

  useEffect(() => {
    check();
  }, [check]);

  return available;
};

const ImageCard: React.FC<{
  beat: ImageBeat;
  durationInFrames: number;
  accentColor: string;
  fontFamily: string;
}> = ({ beat, durationInFrames, accentColor, fontFamily }) => {
  const available = useImageAvailable(beat.file);
  const frame = useCurrentFrame();

  if (!available) return null;

  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const rise = interpolate(frame, [0, FADE_FRAMES], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const width = beat.width ?? 640;
  const bottom = beat.bottom ?? 150;
  // Scale the border/glow/label up with the card so a hero-sized beat doesn't
  // look like a small card that was merely stretched.
  const scale = width / 640;
  const borderWidth = Math.round(2 * Math.min(scale, 1.6));
  const labelSize = Math.round(20 * Math.min(scale, 1.4));

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: bottom }}>
      <div style={{ opacity, translate: `0 ${rise}px`, width }}>
        <div
          style={{
            border: `${borderWidth}px solid ${accentColor}`,
            borderRadius: Math.round(10 * Math.min(scale, 1.6)),
            overflow: "hidden",
            boxShadow: `0 0 ${Math.round(30 * scale)}px ${accentColor}26`,
            lineHeight: 0,
          }}
        >
          <Img src={staticFile(beat.file)} style={{ width: "100%", display: "block" }} />
        </div>
        <div
          style={{
            marginTop: Math.round(10 * scale),
            fontFamily,
            fontSize: labelSize,
            color: accentColor,
            opacity: 0.7,
            textAlign: "center",
            letterSpacing: 2,
          }}
        >
          {beat.label}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const ImageBeats: React.FC<{
  beats: ImageBeat[];
  accentColor: string;
  fontFamily: string;
}> = ({ beats, accentColor, fontFamily }) => {
  const { fps } = useVideoConfig();

  return (
    <>
      {beats.map((beat) => {
        const from = Math.round((beat.atMs / 1000) * fps);
        const durationInFrames = Math.round(((beat.toMs - beat.atMs) / 1000) * fps);
        if (durationInFrames <= 0) return null;

        return (
          <Sequence key={beat.id} from={from} durationInFrames={durationInFrames} layout="none">
            <ImageCard beat={beat} durationInFrames={durationInFrames} accentColor={accentColor} fontFamily={fontFamily} />
          </Sequence>
        );
      })}
    </>
  );
};
