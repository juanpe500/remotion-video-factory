import "./index.css";
import { Composition } from "remotion";
import { makeCalculateAudioMetadata } from "./lib/calculateAudioMetadata";

// Auto-discovered video registry. CONVENTION: every video lives at
// `src/videos/<slug>/styles/Terminal.tsx` and exports `Terminal` (the component)
// and `OUTRO_FRAMES`. The composition id IS the <slug>, and its audio is
// public/<slug>/audio.mp3. No manual registration per video — a checkout (or a
// throwaway render branch) registers exactly the videos it carries, which keeps
// the repo stateless for the GitHub-Actions render flow.
const ctx = (
  import.meta as unknown as {
    webpackContext: (
      dir: string,
      opts: { recursive: boolean; regExp: RegExp },
    ) => {
      keys(): string[];
      (id: string): { Terminal: React.FC; OUTRO_FRAMES?: number };
    };
  }
).webpackContext("./videos", { recursive: true, regExp: /\/styles\/Terminal\.tsx$/ });

const VIDEOS = ctx.keys().map((key) => {
  const slug = key.replace(/^\.\//, "").replace(/\/styles\/Terminal\.tsx$/, "");
  const mod = ctx(key);
  return { slug, component: mod.Terminal, outroFrames: mod.OUTRO_FRAMES ?? 90 };
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {VIDEOS.map(({ slug, component, outroFrames }) => (
        <Composition
          key={slug}
          id={slug}
          component={component}
          width={1080}
          height={1920}
          fps={30}
          durationInFrames={1800 + outroFrames}
          calculateMetadata={makeCalculateAudioMetadata(`${slug}/audio.mp3`, { tailFrames: outroFrames })}
        />
      ))}
    </>
  );
};
