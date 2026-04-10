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
}

export interface FilmProps {
  [key: string]: unknown;
  scenes: FilmScene[];
  ambienceUrl?: string;          // Looped background ambience (replaces storyAudioUrl)
  storyAudioUrl?: string;        // V1 fallback: single story audio track
  backgroundMusicUrl?: string;
  musicVolume?: number;
  crossfadeDurationFrames?: number;
  title?: string;
  subtitle?: string;
}

// ── Crossfade Transition ───────────────────────────────────────────

const CrossfadeTransition: React.FC<{
  children: React.ReactNode;
  durationFrames: number;
  crossfadeDurationFrames: number;
  isFirst: boolean;
  isLast: boolean;
}> = ({ children, durationFrames, crossfadeDurationFrames, isFirst, isLast }) => {
  const frame = useCurrentFrame();

  // Fade in (unless first scene)
  const fadeIn = isFirst
    ? 1
    : interpolate(frame, [0, crossfadeDurationFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  // Fade out (unless last scene)
  const fadeOut = isLast
    ? 1
    : interpolate(
        frame,
        [durationFrames - crossfadeDurationFrames, durationFrames],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
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

// ── Main Film Component ────────────────────────────────────────────

const Film: React.FC<FilmProps> = ({
  scenes,
  ambienceUrl,
  storyAudioUrl,
  backgroundMusicUrl,
  musicVolume = 0.08,
  crossfadeDurationFrames = 30, // 1 second crossfade for smooth transitions
  title,
  subtitle,
}) => {
  const { fps } = useVideoConfig();

  // Determine if we have per-scene audio (V2) or single story audio (V1)
  const hasPerSceneAudio = scenes.some((s) => s.dialogAudioUrl || s.sfxAudioUrl);

  // Calculate scene start frames (accounting for crossfade overlap)
  let currentFrame = 0;
  const titleDurationFrames = title ? 3 * fps : 0; // 3s title card
  currentFrame += titleDurationFrames;

  const sceneStarts: number[] = [];
  for (let i = 0; i < scenes.length; i++) {
    sceneStarts.push(currentFrame);
    currentFrame += scenes[i].durationFrames;
    // Overlap with next scene for crossfade (except last)
    if (i < scenes.length - 1) {
      currentFrame -= crossfadeDurationFrames;
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a1a0a" }}>
      {/* Title card */}
      {title && (
        <Sequence from={0} durationInFrames={titleDurationFrames}>
          <TitleCard title={title} subtitle={subtitle} />
        </Sequence>
      )}

      {/* Scene clips with crossfade transitions + per-scene audio */}
      {scenes.map((scene, i) => (
        <Sequence
          key={i}
          from={sceneStarts[i]}
          durationInFrames={scene.durationFrames}
        >
          <CrossfadeTransition
            durationFrames={scene.durationFrames}
            crossfadeDurationFrames={crossfadeDurationFrames}
            isFirst={i === 0 && !title}
            isLast={i === scenes.length - 1}
          >
            {/* Video — mute dialog scenes (we overlay our own TTS), keep landscape native audio */}
            <Video
              src={scene.videoUrl}
              muted={scene.type === "dialog"}
              volume={scene.type === "dialog" ? 0 : 0.3}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </CrossfadeTransition>

          {/* Per-scene dialog audio (V2) */}
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
          crossfadeDurationFrames: 30,
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
          crossfadeDurationFrames: 30,
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
          crossfadeDurationFrames: 30,
        }}
      />
    </>
  );
};
