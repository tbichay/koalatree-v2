/**
 * KoalaTree Film Composition
 *
 * Remotion composition that assembles individual scene clips into
 * a complete film with:
 * - Per-scene dialog audio (TTS)
 * - Per-scene SFX audio
 * - Continuous ambience layer (looped)
 * - Background music layer
 * - Crossfade transitions between scenes
 * - Intro/outro cards
 */

import React from "react";
import {
  Composition,
  AbsoluteFill,
  Video,
  Audio,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ── Input Props ────────────────────────────────────────────────────

export interface FilmScene {
  videoUrl: string;
  dialogAudioUrl?: string;   // Per-scene TTS dialog audio
  sfxAudioUrl?: string;      // Per-scene sound effects
  durationFrames: number;
  characterId?: string;
  type: "dialog" | "landscape" | "transition" | "intro" | "outro";
  clipTransition?: "seamless" | "hard-cut" | "fade-to-black" | "match-cut";
}

export interface FilmProps {
  [key: string]: unknown;
  scenes: FilmScene[];
  ambienceUrl?: string;          // Looped background ambience (replaces storyAudioUrl)
  storyAudioUrl?: string;        // V1 fallback: single story audio track
  backgroundMusicUrl?: string;
  musicVolume?: number;
  title?: string;
  subtitle?: string;
  // Credits / Outro
  credits?: string[];            // Lines of credits text (e.g. ["Regie: Tom", "Musik: AI"])
  showCredits?: boolean;
}

// ── Fade-to-Black Transition ──────────────────────────────────────

const FADE_TO_BLACK_FRAMES = 30; // 1 second total (15 fade-out + 15 fade-in)
const FADE_HALF = 15; // 0.5s each direction

const FadeToBlackTransition: React.FC<{
  children: React.ReactNode;
  durationFrames: number;
  fadeType: "out" | "in" | "none";
}> = ({ children, durationFrames, fadeType }) => {
  const frame = useCurrentFrame();

  let opacity = 1;
  if (fadeType === "out") {
    // Fade out in the last FADE_HALF frames
    opacity = interpolate(
      frame,
      [durationFrames - FADE_HALF, durationFrames],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  } else if (fadeType === "in") {
    // Fade in during the first FADE_HALF frames
    opacity = interpolate(
      frame,
      [0, FADE_HALF],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  }

  return (
    <AbsoluteFill style={{ opacity }}>
      {children}
    </AbsoluteFill>
  );
};

// ── Title Card ─────────────────────────────────────────────────────

const TitleCard: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 75, 90], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1a2e1a",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            color: "#f5eed6",
            fontSize: 48,
            fontWeight: "bold",
            fontFamily: "system-ui, sans-serif",
            marginBottom: 12,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              color: "#a8d5b8",
              fontSize: 24,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ── Credits Card ──────────────────────────────────────────────────

const CreditsCard: React.FC<{ credits: string[]; title?: string }> = ({
  credits,
  title,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = 5 * fps; // 5 seconds for credits

  const opacity = interpolate(frame, [0, 15, totalFrames - 30, totalFrames], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });

  // Slow scroll effect
  const scrollY = interpolate(frame, [0, totalFrames], [20, -20], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div style={{ textAlign: "center", transform: `translateY(${scrollY}px)` }}>
        {title && (
          <div
            style={{
              color: "#C8A97E",
              fontSize: 28,
              fontWeight: "bold",
              fontFamily: "system-ui, sans-serif",
              marginBottom: 24,
            }}
          >
            {title}
          </div>
        )}
        {credits.map((line, i) => (
          <div
            key={i}
            style={{
              color: i % 2 === 0 ? "#888" : "#E8E8E8",
              fontSize: i % 2 === 0 ? 14 : 20,
              fontFamily: "system-ui, sans-serif",
              marginBottom: i % 2 === 0 ? 4 : 16,
              fontWeight: i % 2 === 0 ? "normal" : "600",
            }}
          >
            {line}
          </div>
        ))}
        <div
          style={{
            color: "#C8A97E",
            fontSize: 11,
            fontFamily: "system-ui, sans-serif",
            marginTop: 32,
            opacity: 0.5,
          }}
        >
          Made with KoalaTree Studio
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Main Film Component ────────────────────────────────────────────

const Film: React.FC<FilmProps> = ({
  scenes,
  ambienceUrl,
  storyAudioUrl,
  backgroundMusicUrl,
  musicVolume = 0.08,
  title,
  subtitle,
  credits,
  showCredits = true,
}) => {
  const { fps } = useVideoConfig();

  // Determine if we have per-scene audio (V2) or single story audio (V1)
  const hasPerSceneAudio = scenes.some((s) => s.dialogAudioUrl || s.sfxAudioUrl);

  // Calculate scene start frames — transition-aware (no overlap for most, gap for fade-to-black)
  let currentFrame = 0;
  const titleDurationFrames = title ? 3 * fps : 0; // 3s title card
  currentFrame += titleDurationFrames;

  const sceneStarts: number[] = [];
  for (let i = 0; i < scenes.length; i++) {
    sceneStarts.push(currentFrame);
    currentFrame += scenes[i].durationFrames;

    // Check if NEXT scene needs a fade-to-black gap
    if (i < scenes.length - 1) {
      const nextTransition = scenes[i + 1].clipTransition || "seamless";
      if (nextTransition === "fade-to-black") {
        currentFrame += FADE_TO_BLACK_FRAMES; // Add black gap between scenes
      }
      // seamless, hard-cut, match-cut: back-to-back, no overlap, no gap
    }
  }

  // Determine fade type for each scene based on its transition and the next scene's transition
  const getFadeType = (i: number): "out" | "in" | "none" => {
    const transition = scenes[i].clipTransition || "seamless";
    const nextTransition = i < scenes.length - 1 ? (scenes[i + 1].clipTransition || "seamless") : "none";

    // If the NEXT scene is fade-to-black, this scene fades OUT
    if (nextTransition === "fade-to-black") return "out";
    // If THIS scene is fade-to-black, it fades IN
    if (transition === "fade-to-black") return "in";
    return "none";
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a1a0a" }}>
      {/* Title card */}
      {title && (
        <Sequence from={0} durationInFrames={titleDurationFrames}>
          <TitleCard title={title} subtitle={subtitle} />
        </Sequence>
      )}

      {/* Scene clips with transition-aware rendering + per-scene audio */}
      {scenes.map((scene, i) => (
        <Sequence
          key={i}
          from={sceneStarts[i]}
          durationInFrames={scene.durationFrames}
        >
          <FadeToBlackTransition
            durationFrames={scene.durationFrames}
            fadeType={getFadeType(i)}
          >
            {/* Video — ALWAYS muted. Cropped to hide Kling-generated subtitles at bottom */}
            <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
              <Video
                src={scene.videoUrl}
                muted={true}
                volume={0}
                style={{ width: "100%", height: "110%", objectFit: "cover", marginTop: "-5%" }}
              />
            </div>
          </FadeToBlackTransition>

          {/* Per-scene dialog audio (V2) — NOT synced to Kling lip-sync.
              Kling generates lip movement independently. Our TTS audio plays
              from the start of each clip. Since Kling starts lip-sync with
              a small delay (~0.3-0.5s warmup), this is close enough.
              For perfect sync, would need Kling Lip-Sync API (post-processing). */}
          {hasPerSceneAudio && scene.dialogAudioUrl && (
            <Audio src={scene.dialogAudioUrl} volume={1.0} />
          )}

          {/* Per-scene SFX audio (V2) */}
          {hasPerSceneAudio && scene.sfxAudioUrl && (
            <Audio src={scene.sfxAudioUrl} volume={0.7} />
          )}
        </Sequence>
      ))}

      {/* V2: Ambience as continuous background loop */}
      {ambienceUrl && (
        <Sequence from={titleDurationFrames} durationInFrames={currentFrame - titleDurationFrames}>
          <Audio src={ambienceUrl} volume={0.12} loop />
        </Sequence>
      )}

      {/* V1 fallback: Story audio (full, continuous) */}
      {!hasPerSceneAudio && storyAudioUrl && (
        <Sequence from={titleDurationFrames} durationInFrames={currentFrame - titleDurationFrames}>
          <Audio src={storyAudioUrl} volume={1} />
        </Sequence>
      )}

      {/* Background music (low volume, continuous) */}
      {/* Credits card at the end */}
      {showCredits && credits && credits.length > 0 && (
        <Sequence from={currentFrame} durationInFrames={5 * fps}>
          <CreditsCard credits={credits} title={title} />
        </Sequence>
      )}

      {/* Background music (low volume, continuous) */}
      {backgroundMusicUrl && (
        <Audio src={backgroundMusicUrl} volume={musicVolume} loop />
      )}
    </AbsoluteFill>
  );
};

// ── Composition Registration ───────────────────────────────────────

export const FilmComposition: React.FC = () => {
  return (
    <>
      <Composition
        id="KoalaTreeFilm"
        component={Film}
        durationInFrames={900} // Placeholder — overridden at render time
        fps={30}
        width={720}
        height={1280} // 9:16 portrait
        defaultProps={{
          scenes: [],
          title: "KoalaTree",
          subtitle: "praesentiert",
          musicVolume: 0.08,
        }}
      />

      {/* 16:9 variant for YouTube/Desktop */}
      <Composition
        id="KoalaTreeFilmWide"
        component={Film}
        durationInFrames={900}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          scenes: [],
          title: "KoalaTree",
          subtitle: "praesentiert",
          musicVolume: 0.08,
        }}
      />

      {/* 2.39:1 Cinemascope variant */}
      <Composition
        id="KoalaTreeFilmCinema"
        component={Film}
        durationInFrames={900}
        fps={30}
        width={1280}
        height={536}
        defaultProps={{
          scenes: [],
          title: "KoalaTree",
          subtitle: "praesentiert",
          musicVolume: 0.08,
        }}
      />
    </>
  );
};
