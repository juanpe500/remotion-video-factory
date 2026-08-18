import "./index.css";
import { Composition } from "remotion";
import { makeCalculateAudioMetadata } from "./lib/calculateAudioMetadata";
import { AUDIO_FILE } from "./videos/eu-ai-act-sgi/config";
import { EuAiActBoldImpact } from "./videos/eu-ai-act-sgi/styles/BoldImpact";
import { EuAiActTerminal, OUTRO_FRAMES } from "./videos/eu-ai-act-sgi/styles/Terminal";
import { EuAiActRegulatory } from "./videos/eu-ai-act-sgi/styles/Regulatory";
import { EuAiActBreakingNews } from "./videos/eu-ai-act-sgi/styles/BreakingNews";

// Vertical, social-first. Duration is derived from public/eu-ai-act-sgi/audio.mp3
// via calculateMetadata, so it stays in sync whenever the audio is regenerated
// (new TTS provider, re-recorded voiceover, trimmed script, etc.).
const calculateMetadata = makeCalculateAudioMetadata(AUDIO_FILE);

// Terminal gets an outro CTA, so it holds the frame a few seconds longer
// than the other (still exactly-narration-length) styles.
const calculateTerminalMetadata = makeCalculateAudioMetadata(AUDIO_FILE, { tailFrames: OUTRO_FRAMES });

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="EuAiAct-BoldImpact"
        component={EuAiActBoldImpact}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={1800}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="EuAiAct-Terminal"
        component={EuAiActTerminal}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={1800 + OUTRO_FRAMES}
        calculateMetadata={calculateTerminalMetadata}
      />
      <Composition
        id="EuAiAct-Regulatory"
        component={EuAiActRegulatory}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={1800}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="EuAiAct-BreakingNews"
        component={EuAiActBreakingNews}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={1800}
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};
