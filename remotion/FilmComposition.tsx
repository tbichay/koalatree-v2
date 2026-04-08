/**
 * KoalaTree Film Composition
 *
 * Remotion composition that assembles individual scene clips into
 * a complete film with:
 * - Crossfade transitions between scenes
 * - Background music layer
 * - Ambient audio continuity
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
  Img,
} from "remotion";

// ── Input Props ────────────────────────────────────────────────────

export interface FilmScene {
  videoUrl: string;
  durationFrames: number;
  characterId?: string;
  type: "dialog" | "landscape" | "transition" | "intro" | "outro";
}

export interface FilmProps {
  [key: string]: unknown;
  scenes: FilmScene[];
  storyAudioUrl?: string;
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
  storyAudioUrl,
  backgroundMusicUrl,
  musicVolume = 0.08,
  crossfadeDurationFrames = 30, // 1 second crossfade for smooth transitions
  title,
  subtitle,
}) => {
  const { fps } = useVideoConfig();

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

      {/* Scene clips with crossfade transitions */}
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
            <Video
              src={scene.videoUrl}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </CrossfadeTransition>
        </Sequence>
      ))}

      {/* Story audio (full, continuous) */}
      {storyAudioUrl && (
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
    </>
  );
};
