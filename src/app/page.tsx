"use client";

import { useDuoTheme } from "@/app/providers/DuoThemeProvider";

import { ActiveChatPanel } from "@/components/chat/ActiveChatPanel";
import { MessageReactionDetailsModal, MessageReactionItem } from "@/components/chat/MessageReactionDetailsModal";
import { UniversalEmojiPickerModal } from "@/components/chat/UniversalEmojiPickerModal";
import { QUICK_DOCK_REACTIONS } from "@/lib/emojiData";
import { MessageStatusTicks } from "@/components/MessageStatusTicks";
import { QuantumUserProfileView } from "@/components/profile/QuantumUserProfileView";
import { EditProfileModal } from "@/components/profile/EditProfileModal";

import { cleanHandle, areHandlesEqual, formatDisplayHandle } from "@/lib/handle-utils";
import {
  loadAndSanitizeUnreadMessages,
  saveUnreadMessages,
  markHandleAsRead,
  addUnreadMessage,
  isHandleUnread,
} from "@/lib/unread-tracker";

import React from "react";
import {
  useEffect,
  useState,
  useRef,
  useCallback,
  FormEvent,
  ChangeEvent,
  KeyboardEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import AuraHelpModal from "@/components/AuraHelpModal";
import SimpleModal from "@/components/SimpleModal";
import PortalModal from "@/components/PortalModal";
import { createPortal } from "react-dom";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";
import Cropper from "react-easy-crop";
import { usePassiveTouchEvents, useAndroidScrollOptimization } from "@/hooks/usePassiveTouchEvents";
import { ThemeToggle } from "@/components/ThemeToggle";
import { quantumAudio } from "@/lib/quantumAudio";
import { EmergencyBeaconModal } from "@/components/EmergencyBeaconModal";
import NotificationCenterModal from "@/components/NotificationCenterModal";
import { countries } from "@/utils/countries";
import dynamic from "next/dynamic";
import { NetworkStatusBar } from "@/components/NetworkStatusBar";
import { UndoSnackbar } from "@/components/UndoSnackbar";
import { outboxQueue, OutboxItem } from "@/lib/outboxQueue";
import { fetchWithRetry, createAdaptivePoller } from "@/lib/backoff";
import { offlineCache, CACHE_KEYS, CACHE_TTL } from "@/lib/offlineCache";
import { FeedVideoManagerProvider } from "@/context/FeedVideoManager";
import { PerformanceProvider, usePerformance } from "@/app/providers/PerformanceProvider";
import { ChatInputConsole } from "@/components/ChatInputConsole";
import { YouTubeInlinePreview } from "@/components/YouTubeInlinePreview";
import QuantumOnboardingTour from "@/components/QuantumOnboardingTour";
import {
  OpticalAllFeedIcon,
  OpticalShortsIcon,
  OpticalPostsIcon,
  OpticalTweetsIcon,
} from "@/components/OpticalMediaIcons";

import {
  pushNavState,
  replaceNavState,
  parseCurrentNavState,
  popOrCloseNav,
  armRootNavigationGuard,
  QNavState,
} from "@/lib/navigationRouter";

const StoreModal = dynamic(() => import("@/components/StoreModal"), {
  ssr: false,
});

const DiamondGlassCanvas = dynamic(() => import("@/components/DiamondGlassCanvas"), {
  ssr: false,
});
const SapphireGlassCanvas = dynamic(() => import("@/components/SapphireGlassCanvas"), {
  ssr: false,
});

function useInView<T extends Element>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const [ratio, setRatio] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    const obs = new IntersectionObserver(
      (entries) => {
        if (cancelled) return;
        const entry = entries[0];
        const nextRatio = typeof entry?.intersectionRatio === "number" ? entry.intersectionRatio : 0;
        setRatio(nextRatio);
        setInView(!!entry?.isIntersecting);
      },
      {
        root: null,
        rootMargin: "200px 0px",
        threshold: [0, 0.25, 0.6, 1],
        ...(options || {}),
      },
    );

    obs.observe(el);
    return () => {
      cancelled = true;
      obs.disconnect();
    };
  }, [options]);

  return { ref, inView, ratio };
}

function FormattedPostText({ text }: { text: string }) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const mentionRegex = /(@[a-zA-Z0-9_]+)/g;
  const hashtagRegex = /(#[a-zA-Z0-9_]+)/g;
  const parts = text.split(/(https?:\/\/[^\s]+|@[a-zA-Z0-9_]+|#[a-zA-Z0-9_]+)/g);

  return (
    <p className="whitespace-pre-wrap text-[13px] sm:text-[13.5px] leading-[1.5] text-slate-100 font-normal break-words selection:bg-cyan-500/30 font-sans tracking-[0.01em] my-2 px-0.5">
      {parts.map((part, idx) => {
        if (part.match(urlRegex)) {
          return (
            <a
              key={idx}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-cyan-400 hover:text-cyan-300 hover:underline break-all transition font-medium"
            >
              {part}
            </a>
          );
        }
        if (part.match(mentionRegex)) {
          return (
            <span key={idx} className="text-cyan-400 font-semibold hover:underline">
              {part}
            </span>
          );
        }
        if (part.match(hashtagRegex)) {
          return (
            <span key={idx} className="text-sky-400 font-semibold hover:underline">
              {part}
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </p>
  );
}

function StableImage(props: {
  src: string;
  alt: string;
  className?: string;
  onError?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Safety timeout: if image neither loads nor errors in 6s, treat as unavailable and hide
  useEffect(() => {
    if (loaded || hasError || !props.src) return;
    const timer = setTimeout(() => {
      if (!loaded) {
        setHasError(true);
        props.onError?.();
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [loaded, hasError, props.src, props.onError]);

  if (!props.src || hasError) {
    return null;
  }

  return (
    <div className="relative w-full min-h-[140px] sm:min-h-[180px] overflow-hidden rounded-2xl bg-black/40 flex items-center justify-center">
      {/* Skeleton Loading State */}
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 transition-opacity duration-200">
          <div className="relative w-full h-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900/60 via-slate-800/40 to-slate-900/60 animate-pulse" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" />
            </div>
            <p className="text-[10px] font-medium text-cyan-200/80 tracking-wide">Loading media...</p>
          </div>
        </div>
      )}
      <img
        src={props.src}
        alt={props.alt}
        className={
          "block w-full h-auto max-h-[520px] object-cover sm:object-contain rounded-2xl mx-auto transition-all duration-300 " +
          (loaded ? "opacity-100 scale-100" : "opacity-0 scale-[0.99]") +
          (props.className ? ` ${props.className}` : "")
        }
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setHasError(true);
          setLoaded(false);
          props.onError?.();
        }}
      />
    </div>
  );
}

function PostImageAttachment(props: {
  src?: string | null;
  alt: string;
  containerClassName?: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  if (!props.src || hasError) return null;

  return (
    <div className={props.containerClassName || "my-2.5 overflow-hidden rounded-2xl border border-slate-800/90 bg-black/50 w-full relative shadow-lg"}>
      <StableImage
        src={props.src}
        alt={props.alt}
        className={props.className}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

import QuantumVideoPlayerComponent from "@/components/QuantumVideoPlayer";
import SettingsModal from "@/components/SettingsModal";
import QAIAssistantModal from "@/components/QAIAssistantModal";
import { qaiActionBus, QAIToolAction } from "@/lib/qai-tools";
import GhostCursor, { ghostCursorEngine } from "@/components/GhostCursor";

function SmartVideo(props: {
  src: string;
  className?: string;
  preload?: "none" | "metadata" | "auto";
  autoplayMuted?: boolean;
}) {
  return (
    <QuantumVideoPlayerComponent
      src={props.src}
      className={props.className}
      preload={props.preload || "metadata"}
      autoPlayMuted={props.autoplayMuted}
    />
  );
}

function QuantumVideoPlayer(props: {
  src: string;
  className?: string;
  autoPlayMuted?: boolean;
}) {
  return (
    <QuantumVideoPlayerComponent
      src={props.src}
      className={props.className}
      autoPlayMuted={props.autoPlayMuted}
    />
  );
}




function getHighResProfilePic(url: string | null | undefined): string {
  if (!url) return "";
  let highResUrl = url;
  if (highResUrl.includes("googleusercontent.com")) {
    // Dynamically request high-res profile pictures from Google
    highResUrl = highResUrl.replace(/=s\d+(-[a-zA-Z0-9_-]+)?$/, "=s512-c");
    highResUrl = highResUrl.replace(/\/s\d+(-[a-zA-Z0-9_-]+)?\//, "/s512-c/");
  }
  return highResUrl;
}

function isValidImageUrl(url: any): boolean {
  return !!(
    url &&
    typeof url === 'string' &&
    url !== 'null' &&
    url !== 'undefined' &&
    url.trim() !== ''
  );
}

function CustomAudioPlayer(props: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("durationchange", handleDurationChange);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("durationchange", handleDurationChange);
    };
  }, []);

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      const allAudios = document.querySelectorAll("audio");
      allAudios.forEach((a) => {
        if (a !== audio) {
          a.pause();
        }
      });
      audio.play().catch((err) => console.error("Error playing audio:", err));
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const value = parseFloat(e.target.value);
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="flex flex-col gap-1 w-full relative overflow-hidden select-none"
      draggable="false"
      onDragStart={(e) => e.preventDefault()}
    >
      <audio ref={audioRef} src={props.src} preload="metadata" />

      <div className="flex items-center gap-2.5 w-full py-0.5 select-none" draggable="false">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-400 to-sky-500 text-slate-950 font-bold hover:scale-105 active:scale-95 transition-all shadow-[0_0_8px_rgba(34,211,238,0.5)]"
        >
          {isPlaying ? (
            <svg className="h-4 w-4 text-slate-950" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4 text-slate-950 translate-x-[1px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Custom Progress Timeline Slider */}
        <div
          className="flex-1 relative flex items-center h-4 group select-none"
          draggable="false"
          onDragStart={(e) => e.preventDefault()}
        >
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSliderChange}
            draggable="false"
            onDragStart={(e) => e.preventDefault()}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 select-none"
          />
          {/* Custom Track Background */}
          <div className="absolute left-0 right-0 h-1 bg-slate-800 rounded-full z-0 overflow-hidden">
            {/* Custom Glowing Fill Progress bar */}
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-sky-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] rounded-full transition-all duration-75"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          {/* Custom Slider Handle/Thumb */}
          <div
            className="absolute w-2.5 h-2.5 bg-cyan-300 rounded-full border border-white/80 shadow-[0_0_6px_rgba(34,211,238,0.9)] z-10 -translate-x-1/2 group-hover:scale-125 transition-transform"
            style={{ left: `${progressPercentage}%` }}
          />
        </div>

        {/* Audio Duration Indicators */}
        <div className="text-[10px] font-mono text-cyan-300 shrink-0 select-none">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  );
}


/* ==========================================================================
   QUANTUM SKELETON LOADING SUITE (GLOBAL DIRECTORY, MEDIA & COMMENTS)
   Production-ready, GPU-accelerated, zero-CLS skeleton system beating
   traditional tech giant gray block animations.
   ========================================================================== */

/* ==========================================================================
   QUANTUM SKELETON LOADING SUITE (TECH GIANT STANDARD: X / META / YOUTUBE)
   Pixel-perfect, zero-CLS, lightweight GPU-accelerated skeletons with zero
   fake text, exactly matching the real cards word-to-word.
   ========================================================================== */

function QuantumDirectoryGlassShimmer() {
  return (
    <div className="space-y-1.5 pt-1.5 animate-in fade-in duration-300">
      {[1, 2].map((idx) => (
        <div
          key={idx}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 sm:p-4 shadow-lg backdrop-blur-md"
        >
          {/* Optical Shimmer Light Sweep */}
          <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent" />

          <div className="flex items-start gap-3 min-w-0">
            {/* Avatar Ghost */}
            <div className="relative shrink-0 pt-0.5">
              <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-slate-800/80 border border-white/10 animate-pulse" />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-cyan-500/40 border-2 border-slate-950" />
            </div>

            {/* Content Ghost */}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="h-3.5 w-28 sm:w-36 rounded-full bg-slate-800/90 animate-pulse" />
                  <div className="h-2.5 w-20 rounded-full bg-slate-800/60" />
                </div>
                <div className="h-7 w-16 sm:w-18 rounded-full border border-white/15 bg-white/10 shrink-0" />
              </div>

              {/* Bio line ghost */}
              <div className="space-y-1 pt-0.5">
                <div className="h-2.5 w-full max-w-[280px] rounded-full bg-slate-800/70" />
                <div className="h-2 w-3/4 max-w-[200px] rounded-full bg-slate-800/50" />
              </div>

              {/* Footer Ghost */}
              <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/60 pt-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-16 rounded-full bg-amber-500/20" />
                  <div className="h-2 w-12 rounded-full bg-slate-800/50" />
                </div>
                <div className="h-2.5 w-14 rounded-full bg-cyan-400/20" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function GlobalDirectoryIdsSkeleton() {
  return (
    <div className="space-y-3.5 animate-in fade-in duration-200">
      {/* 1. Elite Founder ID Skeleton (Exact match to Image 4 Top Card) */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-red-400/80 animate-pulse" />
          <div className="h-2.5 w-28 rounded-full bg-red-950/60 border border-red-500/30" />
        </div>
        <div className="quantum-skeleton-card quantum-skeleton-founder rounded-2xl border border-red-500/50 bg-slate-950/90 p-2.5 overflow-hidden shadow-[0_0_25px_rgba(239,68,68,0.15)] relative">
          <div className="quantum-skeleton-shimmer quantum-skeleton-shimmer-founder" />
          <div className="rounded-2xl bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-slate-950/90 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 rounded-full bg-red-500/40 border border-red-400/80 flex items-center justify-center">
                  <span className="text-[8px] text-red-200 font-bold">✓</span>
                </div>
                <div className="space-y-1">
                  <div className="h-3 w-24 rounded-full bg-slate-800" />
                  <div className="h-2 w-36 rounded-full bg-slate-800/60" />
                </div>
              </div>
              <div className="h-5 w-20 rounded-full border border-red-400/50 bg-red-500/20" />
            </div>
            <div className="h-2 w-3/4 rounded-full bg-slate-800/50" />
          </div>
        </div>
      </div>

      {/* 2. Controls Row Skeleton (Exact match to Image 4: ALL QUANTUM IDS + Buttons) */}
      <div className="pt-1 space-y-2">
        <div className="h-2.5 w-28 rounded-full bg-slate-800/70" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-28 rounded-2xl border border-cyan-500/30 bg-cyan-950/30" />
          <div className="h-8 flex-1 rounded-2xl border border-fuchsia-500/30 bg-fuchsia-950/20" />
          <div className="h-8 w-10 rounded-2xl border border-blue-500/30 bg-blue-950/30 flex-none" />
        </div>
      </div>

      {/* 3. User ID Card #1 (Exact match to Rohit with 2 nested mini posts) */}
      <div className="quantum-skeleton-card rounded-2xl border border-slate-700/70 bg-slate-900/80 p-3 space-y-2.5 relative overflow-hidden">
        <div className="quantum-skeleton-shimmer" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-5 w-7 rounded-full bg-slate-800/90 border border-slate-700/50 flex-shrink-0" />
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-24 rounded-full bg-slate-800" />
                <div className="h-3 w-3 rounded-full bg-red-500/40 border border-red-400/60" />
              </div>
              <div className="h-2 w-16 rounded-full bg-slate-800/60" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-14 rounded-full bg-slate-800/80 border border-slate-700/40" />
            <div className="h-6 w-20 rounded-full bg-cyan-950/40 border border-cyan-500/30" />
          </div>
        </div>
        {/* Streamlined post 1 */}
        <div className="pt-2.5 mt-2.5 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-slate-800" />
            <div className="h-2.5 w-20 rounded-full bg-slate-800" />
            <div className="h-2 w-6 rounded-full bg-slate-800/60" />
          </div>
          <div className="h-2.5 w-28 rounded-full bg-slate-800/70" />
          <div className="flex items-center gap-2 pt-1.5">
            <div className="h-6 w-16 rounded-full bg-slate-800/70" />
            <div className="h-6 w-8 rounded-full bg-slate-800/50" />
            <div className="h-6 w-8 rounded-full bg-slate-800/50" />
            <div className="h-6 w-20 rounded-full bg-slate-800/50" />
          </div>
        </div>
        {/* Streamlined post 2 */}
        <div className="pt-2.5 mt-2.5 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-slate-800" />
            <div className="h-2.5 w-20 rounded-full bg-slate-800" />
            <div className="h-2 w-6 rounded-full bg-slate-800/60" />
          </div>
          <div className="h-2.5 w-36 rounded-full bg-slate-800/70" />
          <div className="flex items-center gap-2 pt-1.5">
            <div className="h-6 w-16 rounded-full bg-slate-800/70" />
            <div className="h-6 w-8 rounded-full bg-slate-800/50" />
            <div className="h-6 w-8 rounded-full bg-slate-800/50" />
            <div className="h-6 w-20 rounded-full bg-slate-800/50" />
          </div>
        </div>
      </div>

      {/* 4. User ID Card #2 (Exact match to User #2 with photo post) */}
      <div className="quantum-skeleton-card rounded-2xl border border-slate-700/70 bg-slate-900/80 p-3 space-y-2.5 relative overflow-hidden">
        <div className="quantum-skeleton-shimmer" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-5 w-7 rounded-full bg-slate-800/90 border border-slate-700/50 flex-shrink-0" />
            <div className="min-w-0 space-y-1">
              <div className="h-3 w-28 rounded-full bg-slate-800" />
              <div className="h-2 w-14 rounded-full bg-slate-800/60" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-14 rounded-full bg-slate-800/80 border border-slate-700/40" />
            <div className="h-6 w-20 rounded-full bg-cyan-950/40 border border-cyan-500/30" />
          </div>
        </div>
        {/* Streamlined post with photo */}
        <div className="pt-2.5 mt-2.5 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-slate-800" />
            <div className="h-2.5 w-24 rounded-full bg-slate-800" />
            <div className="h-2 w-6 rounded-full bg-slate-800/60" />
          </div>
          <div className="h-2.5 w-48 rounded-full bg-slate-800/70" />
          <div className="h-36 sm:h-44 w-full rounded-xl bg-slate-800/40 border border-slate-700/40" />
          <div className="flex items-center gap-2 pt-1.5">
            <div className="h-6 w-16 rounded-full bg-slate-800/70" />
            <div className="h-6 w-8 rounded-full bg-slate-800/50" />
            <div className="h-6 w-8 rounded-full bg-slate-800/50" />
            <div className="h-6 w-20 rounded-full bg-slate-800/50" />
          </div>
        </div>
      </div>
    </div>
  );
}

function GlobalDirectoryMediaSkeleton() {
  return (
    <div className="space-y-3.5 animate-in fade-in duration-200">
      {/* 1. Shorts / Video Post Skeleton (Clean tech-giant standard, NO fake text) */}
      <div className="quantum-skeleton-card rounded-3xl border border-amber-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-4 shadow-xl relative overflow-hidden">
        <div className="quantum-skeleton-shimmer" />
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80 mb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-6.5 w-6.5 rounded-full bg-slate-800 border border-slate-700 flex-shrink-0" />
            <div className="space-y-1 min-w-0">
              <div className="h-3 w-24 rounded-full bg-slate-800" />
              <div className="h-2 w-32 rounded-full bg-slate-800/60" />
            </div>
          </div>
          <div className="h-5 w-18 rounded-full border border-amber-500/40 bg-amber-500/10" />
        </div>
        <div className="space-y-1.5 mb-3">
          <div className="h-3 w-4/5 rounded-full bg-slate-800/80" />
          <div className="h-3 w-2/3 rounded-full bg-slate-800/60" />
        </div>
        {/* Video preview container (neutral clean aspect ratio, no fake buffering text) */}
        <div className="h-52 sm:h-64 w-full rounded-2xl border border-slate-800/90 bg-slate-950/90 relative overflow-hidden mb-3" />
        <div className="flex items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-16 rounded-full bg-slate-800/70 border border-slate-700/60" />
            <div className="h-6 w-8 rounded-full bg-slate-800/70 border border-slate-700/60" />
            <div className="h-6 w-8 rounded-full bg-slate-800/70 border border-slate-700/60" />
            <div className="h-6 w-14 rounded-full bg-slate-800/70 border border-slate-700/60" />
          </div>
          <div className="h-4 w-12 rounded-full bg-slate-800/50" />
        </div>
      </div>

      {/* 2. Image Post Skeleton (Clean tech-giant standard, NO fake text) */}
      <div className="quantum-skeleton-card rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-4 shadow-xl relative overflow-hidden">
        <div className="quantum-skeleton-shimmer" />
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80 mb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-6.5 w-6.5 rounded-full bg-slate-800 border border-slate-700 flex-shrink-0" />
            <div className="space-y-1 min-w-0">
              <div className="h-3 w-28 rounded-full bg-slate-800" />
              <div className="h-2 w-28 rounded-full bg-slate-800/60" />
            </div>
          </div>
          <div className="h-5 w-16 rounded-full border border-cyan-500/40 bg-cyan-500/10" />
        </div>
        <div className="space-y-1.5 mb-3">
          <div className="h-3 w-3/4 rounded-full bg-slate-800/80" />
          <div className="h-3 w-1/2 rounded-full bg-slate-800/60" />
        </div>
        {/* Clean neutral image preview box */}
        <div className="h-44 sm:h-52 w-full rounded-2xl border border-slate-800/90 bg-slate-950/90 relative overflow-hidden mb-3" />
        <div className="flex items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-16 rounded-full bg-slate-800/70 border border-slate-700/60" />
            <div className="h-6 w-8 rounded-full bg-slate-800/70 border border-slate-700/60" />
            <div className="h-6 w-8 rounded-full bg-slate-800/70 border border-slate-700/60" />
            <div className="h-6 w-14 rounded-full bg-slate-800/70 border border-slate-700/60" />
          </div>
          <div className="h-4 w-12 rounded-full bg-slate-800/50" />
        </div>
      </div>

      {/* 3. Tweet / Text Post Skeleton */}
      <div className="quantum-skeleton-card rounded-3xl border border-indigo-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-4 shadow-xl relative overflow-hidden">
        <div className="quantum-skeleton-shimmer" />
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80 mb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-6.5 w-6.5 rounded-full bg-slate-800 border border-slate-700 flex-shrink-0" />
            <div className="space-y-1 min-w-0">
              <div className="h-3 w-22 rounded-full bg-slate-800" />
              <div className="h-2 w-24 rounded-full bg-slate-800/60" />
            </div>
          </div>
          <div className="h-5 w-16 rounded-full border border-indigo-500/40 bg-indigo-500/10" />
        </div>
        <div className="space-y-2 py-2 mb-3">
          <div className="h-3.5 w-11/12 rounded-full bg-slate-800/80" />
          <div className="h-3.5 w-4/5 rounded-full bg-slate-800/70" />
          <div className="h-3.5 w-3/5 rounded-full bg-slate-800/50" />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-16 rounded-full bg-slate-800/70 border border-slate-700/60" />
            <div className="h-6 w-8 rounded-full bg-slate-800/70 border border-slate-700/60" />
            <div className="h-6 w-8 rounded-full bg-slate-800/70 border border-slate-700/60" />
            <div className="h-6 w-14 rounded-full bg-slate-800/70 border border-slate-700/60" />
          </div>
          <div className="h-4 w-12 rounded-full bg-slate-800/50" />
        </div>
      </div>
    </div>
  );
}

/* Dedicated Quantum ID Console Posts Skeleton (Exact match to Image 2: compact social cards) */
function QuantumIdConsolePostsSkeleton() {
  return (
    <div className="mt-3 space-y-3 animate-in fade-in duration-200">
      {[1, 2].map((idx) => (
        <div
          key={idx}
          className="quantum-skeleton-card rounded-2xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-2.5 relative overflow-hidden"
        >
          <div className="quantum-skeleton-shimmer" />
          {/* Header matching real card: Avatar, @Handle, GLOBAL tag, timestamp */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700/60 flex-shrink-0" />
              <div className="h-3 w-24 rounded-full bg-slate-800" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-12 rounded-full bg-slate-800/60" />
              <div className="h-3 w-6 rounded-full bg-slate-800/40" />
            </div>
          </div>
          {/* Text line matching 'hi everyone!' */}
          <div className="py-0.5">
            <div className={`h-3 rounded-full bg-slate-800/80 ${idx === 1 ? 'w-28' : 'w-36'}`} />
          </div>
          {/* Footer action buttons matching 👍 0, 👎 0, 💬 0, 👁️ 0 views */}
          <div className="flex items-center justify-between border-t border-slate-800/80 pt-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-10 rounded-full bg-slate-800/60 border border-slate-700/40" />
              <div className="h-5 w-10 rounded-full bg-slate-800/60 border border-slate-700/40" />
              <div className="h-5 w-10 rounded-full bg-slate-800/60 border border-slate-700/40" />
            </div>
            <div className="h-2.5 w-12 rounded-full bg-slate-800/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

function QuantumFollowersSkeleton() {
  return (
    <div className="space-y-1.5 animate-in fade-in duration-200 max-h-40 overflow-hidden">
      {[1, 2, 3].map((idx) => (
        <div
          key={idx}
          className="quantum-skeleton-card flex items-center gap-2.5 rounded-lg border border-slate-700/50 bg-slate-900/40 p-2 relative overflow-hidden"
        >
          <div className="quantum-skeleton-shimmer" />
          <div className="h-6 w-6 rounded-full bg-slate-800 border border-slate-700/60 flex-shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="h-2.5 w-20 rounded-full bg-slate-800" />
            <div className="h-2 w-28 rounded-full bg-slate-800/60" />
          </div>
          <div className="flex items-center gap-1">
            <div className="h-4 w-14 rounded-full bg-cyan-950/60 border border-cyan-500/30" />
            <div className="h-4 w-10 rounded-full bg-slate-800/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PostCommentsSkeleton() {
  return (
    <div className="space-y-2 animate-in fade-in duration-200">
      {[1, 2, 3].map((idx) => (
        <div
          key={idx}
          className="quantum-skeleton-card rounded-xl border border-slate-700/50 bg-slate-900/60 p-2.5 relative overflow-hidden"
        >
          <div className="quantum-skeleton-shimmer" />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-4.5 w-4.5 rounded-full bg-slate-800 border border-slate-700/60 flex-shrink-0" />
              <div className="h-2.5 w-20 rounded-full bg-slate-800" />
            </div>
            <div className="h-2 w-10 rounded-full bg-slate-800/60" />
          </div>
          <div className="mt-2 space-y-1.5">
            <div
              className={`h-2 rounded-full bg-slate-800/70 ${
                idx === 1 ? "w-11/12" : idx === 2 ? "w-4/5" : "w-3/4"
              }`}
            />
            {idx !== 3 && (
              <div
                className={`h-2 rounded-full bg-slate-800/50 ${
                  idx === 1 ? "w-2/3" : "w-1/2"
                }`}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

type ViewMode = "home" | "connect" | "profile";

type OutgoingRequest = {
  id: string;
  status: string;
  categories: string[];
  message?: string | null;
  createdAt: string;
  updatedAt?: string;
  lastInteractionAt?: string;
  isUnread?: boolean;
  unreadCount?: number;
  latestMessage?: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    status?: string;
    isEdited?: boolean;
    editedAt?: string | null;
  } | null;
  toUser: {
    id: string;
    handle: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

type ChatMessage = {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  isEncrypted?: boolean;
  status?: "SENT" | "DELIVERED" | "READ" | string;
  deliveredAt?: string | null;
  readAt?: string | null;
  isEdited?: boolean;
  editedAt?: string | null;
  reactions?: MessageReactionItem[];
};

type IncomingRequest = {
  id: string;
  status: string;
  categories: string[];
  message?: string | null;
  createdAt: string;
  updatedAt?: string;
  lastInteractionAt?: string;
  isUnread?: boolean;
  unreadCount?: number;
  latestMessage?: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    status?: string;
    isEdited?: boolean;
    editedAt?: string | null;
  } | null;
  fromUser: {
    id: string;
    handle: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

type FoundUser = {
  id: string;
  handle: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  blue_tick_status?: string | null;
};

type DirectoryItem = {
  id: string;
  handle: string | null;
  name: string | null;
  image?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  banner?: string | null;
  rank: number;
  isRedTick: boolean;
  auraPercentage: number;
  blueTickStatus: string;
  points: number;
  posts?: any[];
};

interface UnreadItem {
  id: string;
  sender: string;
}

/**
 * Advanced Dynamic Ranking Algorithm for Friend Conversations & IDs:
 *
 * 1. Actionable Tier: PENDING incoming requests always rise to top.
 * 2. Unread Tier: Contacts with unread incoming messages jump immediately to the top with high priority.
 * 3. Active Conversation Tier: Currently open/active chat peer stays pinned at the top.
 * 4. Exact Recency Timestamp: Most recent message interaction (or connection date) ranks highest.
 * 5. Deterministic Tie-Breaker: Stable locale sort by user handle (guarantees consistency across all devices & accounts).
 */
function rankFriendRequests<T extends {
  id: string;
  status: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
  lastInteractionAt?: string | Date;
  latestMessage?: { createdAt: string; id: string } | null;
  toUser?: { handle?: string | null };
  fromUser?: { handle?: string | null };
  isUnread?: boolean;
}>(
  requests: T[],
  unreadMsgs: any[],
  activePeer: string | null,
  isIncomingList: boolean = false
): T[] {
  if (!Array.isArray(requests) || requests.length <= 1) return requests;

  return [...requests].sort((a, b) => {
    const handleA = ((isIncomingList ? a.fromUser?.handle : a.toUser?.handle) || a.fromUser?.handle || a.toUser?.handle || "").toLowerCase();
    const handleB = ((isIncomingList ? b.fromUser?.handle : b.toUser?.handle) || b.fromUser?.handle || b.toUser?.handle || "").toLowerCase();

    // 1. Status tiering
    if (isIncomingList) {
      const getIncomingTier = (status: string) => {
        if (status === "PENDING") return 1;
        if (status === "ACCEPTED") return 2;
        return 3;
      };
      const tierA = getIncomingTier(a.status);
      const tierB = getIncomingTier(b.status);
      if (tierA !== tierB) return tierA - tierB;
    } else {
      const getOutgoingTier = (status: string) => {
        if (status === "ACCEPTED") return 1;
        if (status === "PENDING") return 2;
        return 3;
      };
      const tierA = getOutgoingTier(a.status);
      const tierB = getOutgoingTier(b.status);
      if (tierA !== tierB) return tierA - tierB;
    }

    // 2. Unread Message Priority Boost (Checked from both server authoritative isUnread and local state)
    const isUnreadA = Boolean(a.isUnread || (handleA && isHandleUnread(unreadMsgs, handleA)));
    const isUnreadB = Boolean(b.isUnread || (handleB && isHandleUnread(unreadMsgs, handleB)));
    if (isUnreadA !== isUnreadB) return isUnreadA ? -1 : 1;

    // 3. Active Chat Peer Priority Boost
    const isActiveA = activePeer && handleA ? areHandlesEqual(activePeer, handleA) : false;
    const isActiveB = activePeer && handleB ? areHandlesEqual(activePeer, handleB) : false;
    if (isActiveA !== isActiveB) return isActiveA ? -1 : 1;

    // 4. Exact Interaction Recency (Latest message createdAt > lastInteractionAt > updatedAt > createdAt)
    const getTime = (req: T) => {
      const msgTime = req.latestMessage?.createdAt ? new Date(req.latestMessage.createdAt).getTime() : 0;
      const interactTime = req.lastInteractionAt ? new Date(req.lastInteractionAt).getTime() : 0;
      const updatedTime = req.updatedAt ? new Date(req.updatedAt).getTime() : 0;
      const createdTime = req.createdAt ? new Date(req.createdAt).getTime() : 0;
      return Math.max(msgTime, interactTime, updatedTime, createdTime);
    };

    const timeA = getTime(a);
    const timeB = getTime(b);
    if (timeA !== timeB) return timeB - timeA;

    // 5. Deterministic fallback tie-breaker
    return handleA.localeCompare(handleB);
  });
}


function extractYouTubeInfo(text: string): { videoId: string; isShort: boolean } | null {
  if (!text) return null;
  const isShort = /youtube\.com\/shorts\//i.test(text);
  const regExp = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  const match = text.match(regExp);
  if (!match) return null;
  return { videoId: match[1], isShort };
}

function extractYouTubeVideoId(text: string): string | null {
  const info = extractYouTubeInfo(text);
  return info ? info.videoId : null;
}

function parseUrlDetails(urlStr: string) {
  try {
    const parsed = new URL(urlStr);
    let domain = parsed.hostname.replace(/^(?:www\.|m\.|mobile\.)/i, "");

    // Normalize platform domains for clean human-readable branding
    if (domain === "youtu.be" || domain.endsWith(".youtube.com") || domain === "youtube.com") {
      domain = "youtube.com";
    } else if (domain === "twitter.com" || domain === "x.com" || domain.endsWith(".twitter.com")) {
      domain = "x.com";
    } else if (domain === "instagr.am" || domain.endsWith(".instagram.com") || domain === "instagram.com") {
      domain = "instagram.com";
    } else if (domain === "fb.watch" || domain.endsWith(".facebook.com") || domain === "facebook.com") {
      domain = "facebook.com";
    }

    // Clean pathname
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname;

    let cleanPath = "";
    if (domain === "youtube.com") {
      cleanPath = pathname.toLowerCase().includes("shorts") ? "shorts" : "";
    } else if (domain === "x.com") {
      const userMatch = pathname.match(/^\/([a-zA-Z0-9_]+)/);
      cleanPath = userMatch && !["i", "intent", "status"].includes(userMatch[1]) ? `@${userMatch[1]}` : "";
    } else if (domain === "instagram.com") {
      cleanPath = pathname.toLowerCase().includes("reel") ? "reel" : "";
    } else {
      // General web links: display clean path segments without tracking queries
      if (pathname && pathname !== "/") {
        const segments = pathname.split("/").filter(Boolean);
        if (segments.length > 0) {
          cleanPath = segments.slice(0, 2).join("/");
          if (segments.length > 2) cleanPath += "/…";
        }
      }
    }

    return {
      domain,
      path: cleanPath,
      isValid: true,
    };
  } catch {
    return {
      domain: urlStr.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] || urlStr,
      path: "",
      isValid: false,
    };
  }
}

function renderMessageText(text: string, isMe: boolean) {
  if (!text) return null;
  const URL_REGEX = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(URL_REGEX);
  return parts.map((part, index) => {
    if (part.match(URL_REGEX)) {
      const { domain, path, isValid } = parseUrlDetails(part);
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={part}
          className={`group/link inline-flex items-center gap-1.5 align-middle my-0.5 px-2.5 py-0.5 rounded-full text-[12px] font-sans font-medium no-underline overflow-hidden backdrop-blur-xl border transition-all duration-200 ease-out select-text active:scale-95 ${
            isMe
              ? "bg-white/15 hover:bg-white/25 text-white border-white/20 hover:border-white/35 shadow-sm"
              : "bg-white/[0.08] hover:bg-white/[0.14] text-white/90 hover:text-white border-white/15 hover:border-white/30 shadow-sm"
          }`}
        >
          {/* Hairline subtle external link icon */}
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-white/60 transition-transform duration-200 group-hover/link:text-white group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5">
            <svg
              className="h-3 w-3 stroke-[2]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
          </span>

          {/* Structured Domain & Path Highlight */}
          {isValid ? (
            <span className="inline-flex items-center gap-1 truncate max-w-[80vw] sm:max-w-[420px]">
              <span className="font-semibold text-white tracking-tight">
                {domain}
              </span>
              {path ? (
                <>
                  <span className="text-white/30 text-[10px] select-none">•</span>
                  <span className="text-[11px] text-white/70 group-hover/link:text-white/90 truncate tracking-tight">
                    {path}
                  </span>
                </>
              ) : null}
            </span>
          ) : (
            <span className="font-mono text-[11.5px] text-white/80 truncate max-w-[80vw] sm:max-w-[420px]">
              {part}
            </span>
          )}
        </a>
      );
    }
    return part;
  });
}

export default function Home() {
  // Initialize hooks at component top level
  // DISABLED: Scroll optimization hooks causing scroll issues
  // const passiveTouchRef = usePassiveTouchEvents();
  // const androidScrollRef = useAndroidScrollOptimization();

  return (
    <SessionProvider
      refetchInterval={5 * 60} // Refetch session every 5 minutes
      refetchOnWindowFocus={true} // Refetch when window gains focus
    >
      <PerformanceProvider>
        <FeedVideoManagerProvider>
          <NetworkStatusBar />
          <HomeInner
            passiveTouchRef={null}
            androidScrollRef={null}
          />
        </FeedVideoManagerProvider>
      </PerformanceProvider>
    </SessionProvider>
  );
}

const decryptMessageList = async (
  messages: ChatMessage[],
  peerPublicKey: string | null
): Promise<ChatMessage[]> => {
  try {
    const { decryptMessage } = await import("@/lib/e2e-crypto");
    return await Promise.all(
      messages.map(async (m) => {
        const isEncrypted = m.content.trim().startsWith('{"__e2e"');
        if (isEncrypted) {
          if (peerPublicKey) {
            const decrypted = await decryptMessage(m.content, peerPublicKey);
            return { ...m, content: decrypted, isEncrypted: true };
          }
          return { ...m, content: "🔒 [Encrypted Message - Key Unavailable]", isEncrypted: true };
        }
        return m;
      })
    );
  } catch (e) {
    console.error("[E2E] Batch decryption failed:", e);
    return messages;
  }
};

const playSciFiSound = (action: "on" | "off") => {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (action === "on") {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "triangle";

      osc1.frequency.setValueAtTime(220, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15);

      osc2.frequency.setValueAtTime(220, now);
      osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.15);

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.25);
      osc2.stop(now + 0.25);
    } else {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";

      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(400, now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {
    console.debug("[Audio] Failed to play sci-fi sound:", e);
  }
};

const compressImage = (file: File): Promise<File> => {
  return new Promise((resolve) => {
    // Skip if not an image or is an animated gif
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = document.createElement("img");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        // Limit dimensions to a max of 1600px to ensure file stays well under 4MB
        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 1600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG with a quality of 0.8 to optimize size with low distortion
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const name = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
            const compressedFile = new File([blob], `${name}.jpg`, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/jpeg",
          0.8
        );
      };
      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

function PerformanceSettingsCard({ isQuantum = true }: { isQuantum?: boolean }) {
  const { perfMode, resolvedPerfMode, setPerfMode } = usePerformance();

  const handleSelect = (mode: "high" | "low" | "auto") => {
    try {
      playSciFiSound("on");
    } catch { }
    setPerfMode(mode);
  };

  return (
    <div className={`space-y-3 rounded-2xl p-4 transition-all duration-300 ${
      isQuantum
        ? "border border-cyan-500/25 bg-gradient-to-b from-cyan-950/25 via-slate-900/40 to-slate-950/60 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.2),inset_0_0_20px_rgba(6,182,212,0.06)] hover:border-cyan-400/50 hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]"
        : "border border-white/[0.15] bg-gradient-to-b from-white/[0.09] to-white/[0.03] backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.3)] hover:border-white/30 hover:from-white/[0.12]"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-6 w-6 items-center justify-center rounded-full border ${
            isQuantum
              ? "bg-cyan-400/15 border-cyan-400/40 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
              : "bg-white/10 border-white/25"
          }`}>
            <svg className={`h-3.5 w-3.5 ${isQuantum ? "text-cyan-300" : "text-white"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-[12px] font-bold tracking-wide text-slate-100">Hardware & GPU Tier</span>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase border backdrop-blur-xl ${resolvedPerfMode === "low"
            ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
            : (isQuantum
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-400/50 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                : "bg-white/15 text-white border-white/30 shadow-[0_0_10px_rgba(255,255,255,0.2)]")
          }`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${resolvedPerfMode === "low" ? "bg-amber-400" : (isQuantum ? "bg-cyan-400" : "bg-white")} animate-pulse`} />
          {resolvedPerfMode === "low" ? "4GB Low Spec" : "8GB+ Ultra"}
        </span>
      </div>

      <p className={`text-[11px] leading-relaxed ${isQuantum ? "text-cyan-100/60" : "text-white/55"}`}>
        Tune animation shaders & GPU frame rendering for your device RAM.
      </p>

      {/* Segmented Control */}
      <div className={`grid grid-cols-3 gap-1.5 rounded-xl p-1.5 shadow-inner ${
        isQuantum
          ? "border border-cyan-500/30 bg-black/50 backdrop-blur-2xl shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]"
          : "border border-white/[0.12] bg-black/30 backdrop-blur-xl"
      }`}>
        <button
          type="button"
          onClick={() => handleSelect("high")}
          className={`flex flex-col items-center justify-center rounded-lg py-2 px-1 text-[11px] font-bold transition-all duration-300 ${perfMode === "high"
              ? (isQuantum
                  ? "bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 text-slate-950 shadow-[0_0_18px_rgba(6,182,212,0.6)] scale-[1.03]"
                  : "bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 shadow-[0_2px_12px_rgba(34,211,238,0.45)] font-semibold scale-[1.02]")
              : (isQuantum
                  ? "text-slate-400 hover:text-cyan-200 hover:bg-cyan-500/10"
                  : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]")
            }`}
        >
          <span className="flex items-center gap-1">🚀 8GB+</span>
          <span className="text-[9px] opacity-90 font-medium">High FPS</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelect("low")}
          className={`flex flex-col items-center justify-center rounded-lg py-2 px-1 text-[11px] font-bold transition-all duration-300 ${perfMode === "low"
              ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.6)] scale-[1.03]"
              : (isQuantum
                  ? "text-slate-400 hover:text-amber-200 hover:bg-amber-500/10"
                  : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]")
            }`}
        >
          <span className="flex items-center gap-1">⚡ 4GB</span>
          <span className="text-[9px] opacity-90 font-medium">Zero Lag</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelect("auto")}
          className={`flex flex-col items-center justify-center rounded-lg py-2 px-1 text-[11px] font-bold transition-all duration-300 ${perfMode === "auto"
              ? (isQuantum
                  ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 text-white shadow-[0_0_18px_rgba(139,92,246,0.6)] border border-violet-400/40 scale-[1.03]"
                  : "bg-white/25 text-white border border-white/25 shadow-[0_2px_12px_rgba(0,0,0,0.3)] backdrop-blur-xl font-semibold scale-[1.02]")
              : (isQuantum
                  ? "text-slate-400 hover:text-violet-200 hover:bg-violet-500/10"
                  : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]")
            }`}
        >
          <span className="flex items-center gap-1">🤖 Auto</span>
          <span className="text-[9px] opacity-90 font-medium">Smart RAM</span>
        </button>
      </div>
    </div>
  );
}

function HomeInner({ passiveTouchRef, androidScrollRef }: {
  passiveTouchRef?: React.Ref<HTMLDivElement>;
  androidScrollRef?: React.Ref<HTMLDivElement>;
}) {
  const { isDefaultTheme } = useDuoTheme();
  const { data: session, status, update: updateSession } = useSession();

  // Production-Grade Offline-Resilient Session Cache
  const [cachedSessionUser, setCachedSessionUser] = useState<any>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("qc_session_signature");
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return null;
  });

  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => {
    return typeof window !== "undefined" ? navigator.onLine : true;
  });

  // Keep session signature up-to-date whenever live session is authenticated
  useEffect(() => {
    if (session?.user && (session.user as any)?.id) {
      const userPayload = {
        id: (session.user as any).id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        handle: (session.user as any).handle,
        role: (session.user as any).role,
        lastVerified: Date.now(),
      };
      setCachedSessionUser(userPayload);
      try {
        localStorage.setItem("qc_session_signature", JSON.stringify(userPayload));
      } catch {}
    }
  }, [session]);

  // Network online/offline listener with automatic silent session recovery
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsNetworkOnline(true);
      try {
        updateSession?.();
      } catch {}
    };

    const handleOffline = () => {
      setIsNetworkOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [updateSession]);

  // Effective authenticated identity (Live session prioritized, fallback to cached signature on network drop)
  const effectiveUser = session?.user || cachedSessionUser;
  const isAuthenticated = Boolean(
    (status === "authenticated" && session?.user && (session.user as any)?.id) ||
    (cachedSessionUser && cachedSessionUser.id && (status === "loading" || !isNetworkOnline || status === "unauthenticated"))
  );
  const myId = (effectiveUser as any)?.id;
  const [mode, setMode] = useState<ViewMode>("home");
  const [viewingProfileHandle, setViewingProfileHandle] = useState<string | null>(null);
  const [connectionsTab, setConnectionsTab] = useState<"friends" | "requests">("friends");

  // Predictive Smart Skeleton: Dynamically memorizes exact friend count per user ID
  const [predictedFriendsCount, setPredictedFriendsCount] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("qc_friends_count");
        if (saved !== null) {
          const parsed = parseInt(saved, 10);
          if (!isNaN(parsed) && parsed > 0) return Math.min(parsed, 6);
        }
      } catch {}
    }
    return 1; // Default to 1 exact card, never arbitrary 3
  });

  const [predictedRequestsCount, setPredictedRequestsCount] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("qc_requests_count");
        if (saved !== null) {
          const parsed = parseInt(saved, 10);
          if (!isNaN(parsed) && parsed > 0) return Math.min(parsed, 6);
        }
      } catch {}
    }
    return 1;
  });

  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>([]);
  const [isLoadingOutgoing, setIsLoadingOutgoing] = useState(true);
  const outgoingFetchedRef = useRef(false);

  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [isLoadingIncoming, setIsLoadingIncoming] = useState(true);
  const incomingFetchedRef = useRef(false);
  const [incomingError, setIncomingError] = useState<string | null>(null);

  const [activePeerHandle, setActivePeerHandle] = useState<string | null>(null);
  const [activePeerPublicKey, setActivePeerPublicKey] = useState<string | null>(null);
  const [chatRoomId, setChatRoomId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const currentPeerFetchRef = useRef<string | null>(null);
  const peerMessagesCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const chatEtagsRef = useRef<Map<string, string>>(new Map());
  const presenceEtagsRef = useRef<Map<string, string>>(new Map());
  const idConsolePostsEtagRef = useRef<string | null>(null);
  const dirPostsEtagRef = useRef<string | null>(null);
  const incomingFriendsEtagRef = useRef<string | null>(null);
  const outgoingFriendsEtagRef = useRef<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    messageId: string;
    message: ChatMessage;
    timerId: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [showMobileChatMore, setShowMobileChatMore] = useState(false);
  const [isChatFull, setIsChatFull] = useState(false);
  const [isGlowActive, setIsGlowActive] = useState(false);
  const [isPushEnabled, setIsPushEnabled] = useState(false);

  const [isElectron] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !!(window as any).electronAPI;
  });

  useEffect(() => {
    if (typeof document !== "undefined" && isElectron) {
      document.documentElement.classList.add("is-electron");
      document.body.classList.add("is-electron");
    }
  }, [isElectron]);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("qlink_desktop_notifications_enabled");
        return stored === "true";
      } catch {
        return false;
      }
    }
    return false;
  });
  const [isE2EEnabled, setIsE2EEnabled] = useState(false);
  const [isGlitching, setIsGlitching] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // States for the Secure Message Sharing feature
  const [shareToastText, setShareToastText] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // States & Refs for Android PWA Hardware Back & Exit Protection
  const [exitToastVisible, setExitToastVisible] = useState(false);
  const lastBackPressTimeRef = useRef<number>(0);
  const exitToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [oauthLaunchingProvider, setOauthLaunchingProvider] = useState<string | null>(null);

  const handleOAuthSignIn = async (provider: string) => {
    if (oauthLaunchingProvider) return;
    setOauthLaunchingProvider(provider);
    try {
      // Use redirect: false to get the OAuth URL directly from NextAuth without appending a history entry
      const res = await signIn(provider, { redirect: false, callbackUrl: "/" });
      if (res?.url) {
        // window.location.replace completely replaces the login page in the browser history stack.
        // This ensures the login screen does NOT sit in the browser history behind the authenticated session!
        window.location.replace(res.url);
        return;
      }
    } catch (err) {
      console.warn(`[Auth] handleOAuthSignIn redirect:false failed for ${provider}:`, err);
    }
    // Fallback if needed
    signIn(provider, { callbackUrl: "/" });
  };

  // States for Q-BEACON Priority Emergency Protocol
  const [activeBeacon, setActiveBeacon] = useState<{
    senderHandle: string;
    senderName?: string;
    senderImage?: string | null;
    voiceUrl?: string | null;
    noteText?: string | null;
  } | null>(null);
  const [isSendingBeacon, setIsSendingBeacon] = useState(false);
  const [beaconStatusMsg, setBeaconStatusMsg] = useState<string | null>(null);

  // Listen for Service Worker background push events (when app is open or backgrounded)
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "EMERGENCY_BEACON_RECEIVED") {
        const { senderHandle, noteText, voiceUrl } = event.data;
        if (senderHandle) {
          setActiveBeacon({
            senderHandle: senderHandle,
            noteText: noteText || "⚡ Urgent Priority Emergency Flash!",
            voiceUrl: voiceUrl || null,
          });
          quantumAudio.warmup();
          quantumAudio.playEmergencyChime();

          // Elevate window if running inside Electron desktop client
          if (typeof window !== "undefined") {
            const win = window as any;
            if (win.electronAPI?.triggerEmergencyBeacon) {
              win.electronAPI.triggerEmergencyBeacon({
                senderHandle,
                noteText: noteText || "⚡ Urgent Priority Emergency Flash!",
                voiceUrl: voiceUrl || null,
              });
            }
          }
        }
      } else if (event.data?.type === "CHAT_MESSAGE_RECEIVED") {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("qlink:sync-messages"));
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, []);

  // Listen for ?beacon=1&peer=handle in URL search params or Electron main process emergency trigger
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("beacon") === "1") {
        const peer = params.get("peer");
        if (peer) {
          setActivePeerHandle(peer);
          setActiveBeacon({
            senderHandle: peer,
            noteText: "⚡ Urgent Priority Emergency Flash!",
          });
          quantumAudio.warmup();
          quantumAudio.playEmergencyChime();
        }
      }
    } catch {
      // ignore
    }

    const win = window as any;
    if (win.electronAPI?.onEmergencyBeaconTriggered) {
      const unsub = win.electronAPI.onEmergencyBeaconTriggered((payload: any) => {
        if (payload?.senderHandle) {
          setActivePeerHandle(payload.senderHandle);
        }
        setActiveBeacon({
          senderHandle: payload?.senderHandle || "Emergency",
          senderName: payload?.senderName,
          senderImage: payload?.senderImage,
          voiceUrl: payload?.voiceUrl,
          noteText: payload?.noteText || "⚡ Urgent Priority Emergency Flash!",
        });
        quantumAudio.warmup();
        quantumAudio.playEmergencyChime();
      });
      return unsub;
    }
  }, []);

  // Auto-subscribe WebPush on login so devices (Android Tablet / PC) receive background VAPID beacons automatically
  useEffect(() => {
    if (status !== "authenticated" || typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return;

    const autoSyncPush = async () => {
      try {
        if (Notification.permission === "default") {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") return;
        }

        if (Notification.permission !== "granted") return;

        const registration = await navigator.serviceWorker.ready;
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BMQemcbop-dfZ7bLlwyL083mRANSiRsNbggorApxFfg5U-M_KKMVpwoUdZGM4mbG5rpav7w-vZbcNhiWtW4hvQE";

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }

        if (subscription) {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(subscription),
          });
        }
      } catch (err) {
        console.error("[Auto-Push-Sync] Error auto-subscribing:", err);
      }
    };

    autoSyncPush();
  }, [status]);

  // Unread message tracking (Array of { id, sender } objects to prevent duplicates and race conditions)
  interface UnreadMessage {
    id: string;
    sender: string;
  }

  const [unreadMessages, setUnreadMessages] = useState<UnreadMessage[]>(() => {
    return loadAndSanitizeUnreadMessages();
  });

  useEffect(() => {
    saveUnreadMessages(unreadMessages);
  }, [unreadMessages]);

  // Derived state to keep compatibility with existing UI includes check
  const unreadSenders = React.useMemo(() => {
    return Array.from(new Set(unreadMessages.map((m) => cleanHandle(m.sender)).filter(Boolean)));
  }, [unreadMessages]);

  // Clear unread state for the active chat peer (using canonical handle comparison)
  useEffect(() => {
    const bar = connectionsTabBarRef.current;
    if (!bar) return;
    const isFriends = connectionsTab === "friends";
    const pillWidth = (bar.offsetWidth - 8) / 2;
    const targetX = isFriends ? 0 : pillWidth;
    bar.style.setProperty("--pill-x", `${targetX}px`);
    bar.style.setProperty("--pill-transition", "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)");
  }, [connectionsTab]);

  useEffect(() => {
    if (activePeerHandle) {
      setUnreadMessages((prev) => markHandleAsRead(prev, activePeerHandle));
      setIncoming((prev) =>
        prev.map((r) =>
          areHandlesEqual(r.fromUser?.handle, activePeerHandle)
            ? { ...r, isUnread: false, unreadCount: 0 }
            : r
        )
      );
      setOutgoing((prev) =>
        prev.map((r) =>
          areHandlesEqual(r.toUser?.handle, activePeerHandle)
            ? { ...r, isUnread: false, unreadCount: 0 }
            : r
        )
      );
    }
  }, [activePeerHandle]);

  // Send Read Receipt ACK verification when opening room OR receiving new messages while room is open
  useEffect(() => {
    if (activePeerHandle && status === "authenticated") {
      fetch("/api/chat/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerHandle: activePeerHandle, status: "READ" }),
      }).catch(() => {});
    }
  }, [activePeerHandle, status, chatMessages.length]);

  // Dynamic App Badge & Electron taskbar overlay syncing
  useEffect(() => {
    if (typeof window === "undefined") return;
    const count = unreadMessages.length;

    // 1. Web/PWA App Badge Support (Skip in Electron to prevent overwriting custom blue badge)
    if ("setAppBadge" in navigator && !isElectron) {
      if (count > 0) {
        navigator.setAppBadge(count).catch((err) => console.warn("[Badge] setAppBadge error:", err));
      } else {
        navigator.clearAppBadge().catch((err) => console.warn("[Badge] clearAppBadge error:", err));
      }
    }

    // 2. Electron-specific Taskbar Overlay Icon Badge
    const win = window as any;
    if (win.electronAPI && typeof win.electronAPI.updateBadgeCount === "function") {
      if (count > 0) {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            // Draw medium blue circular background
            ctx.fillStyle = "#2563eb"; // Medium blue color
            ctx.beginPath();
            ctx.arc(16, 16, 15, 0, 2 * Math.PI);
            ctx.fill();

            // Draw white count text
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            if (count > 99) {
              ctx.font = "bold 11px Arial, sans-serif";
              ctx.fillText("99+", 16, 16);
            } else if (count > 9) {
              ctx.font = "bold 13px Arial, sans-serif";
              ctx.fillText(count.toString(), 16, 16);
            } else {
              ctx.font = "bold 17px Arial, sans-serif";
              ctx.fillText(count.toString(), 16, 16);
            }

            const dataUrl = canvas.toDataURL("image/png");
            win.electronAPI.updateBadgeCount(count, dataUrl);
          } else {
            win.electronAPI.updateBadgeCount(count, null);
          }
        } catch (e) {
          console.error("Failed to generate taskbar badge canvas:", e);
          win.electronAPI.updateBadgeCount(count, null);
        }
      } else {
        win.electronAPI.updateBadgeCount(0, null);
      }
    }
  }, [unreadMessages, isElectron]);

  const toggleDesktopNotifications = async (enable: boolean) => {
    if (!enable) {
      setDesktopNotificationsEnabled(false);
      localStorage.setItem("qlink_desktop_notifications_enabled", "false");
      return;
    }

    if (typeof window !== "undefined" && "Notification" in window) {
      let permission = Notification.permission;
      if (permission === "default" || permission === "denied") {
        try {
          permission = await Notification.requestPermission();
        } catch (err) {
          console.warn("[Desktop Toggle] requestPermission error:", err);
        }
      }
    }

    setDesktopNotificationsEnabled(true);
    localStorage.setItem("qlink_desktop_notifications_enabled", "true");

    // Trigger a native test notification to verify OS alerts work
    const win = window as any;
    if (win.electronAPI && typeof win.electronAPI.showNotification === "function") {
      try {
        win.electronAPI.showNotification(
          "Q-Link Notifications Enabled",
          "You will now receive desktop alerts for incoming messages."
        );
      } catch (e) {
        console.error("Failed to show native test notification:", e);
      }
    }
  };

  const triggerDesktopNotification = (peerHandle: string) => {
    if (isElectron && desktopNotificationsEnabled) {
      const win = window as any;
      if (win.electronAPI && typeof win.electronAPI.showNotification === "function") {
        try {
          win.electronAPI.showNotification("Q-Link", `New message from ${peerHandle}`, peerHandle);
          return;
        } catch (e) {
          console.error("Failed to show Electron native notification:", e);
        }
      }
    }

    if (
      !isElectron &&
      desktopNotificationsEnabled &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        const notif = new Notification("Q-Link", {
          body: `New message from ${peerHandle}`,
          icon: "/logo-256.png"
        });
        notif.onclick = () => {
          setActivePeerHandle(peerHandle);
          setIsChatFull(true);
        };
      } catch (e) {
        console.error("Error showing fallback HTML5 notification:", e);
      }
    }
  };


  const togglePushNotifications = async (enable: boolean) => {
    // No-op inside Electron — desktop notifications are always-on natively
    if (typeof window !== "undefined" && !!(window as any).electronAPI) return;

    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Push notifications are not supported on this browser.");
      return;
    }

    try {
      if (enable) {
        // 1. Request Permission FIRST, before any service worker code!
        // This guarantees that the native browser prompt is triggered immediately
        // and doesn't get blocked by a hanging service worker registration promise.
        let permission = Notification.permission;

        try {
          permission = await Notification.requestPermission();
          if (permission === "granted") {
            setIsPushEnabled(true);
          }
        } catch (err) {
          console.warn("[Push Toggle] requestPermission error:", err);
        }

        if (permission !== "granted") {
          setIsPushEnabled(false);
          if (permission === "denied") {
            alert(
              "Notifications are currently blocked by your browser settings.\n\n" +
              "To receive push notifications, please click the site settings icon on the left of the URL bar (next to q-link-v3-0.vercel.app) and set 'Notifications' to 'Allow'.\n\n" +
              "Once you do, Chrome will display a banner asking you to reload the page to apply the settings."
            );
          }
          return;
        }

        // 2. Only after permission is granted, obtain the service worker registration
        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          registration = await navigator.serviceWorker.ready;
        }

        // 3. Subscribe
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BMQemcbop-dfZ7bLlwyL083mRANSiRsNbggorApxFfg5U-M_KKMVpwoUdZGM4mbG5rpav7w-vZbcNhiWtW4hvQE";

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
          try {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            });
          } catch (err) {
            console.error("[Push Toggle] Failed to subscribe locally:", err);
            setIsPushEnabled(false);
            return;
          }
        }

        // Ensure state is true
        setIsPushEnabled(true);

        // 4. Save to backend asynchronously without blocking UI response
        try {
          const res = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(subscription),
          });

          if (!res.ok) {
            console.error("[Push Toggle] Backend registration failed status:", res.status);
          } else {
            console.log("[Push Toggle] Successfully synchronized subscription with backend!");
          }
        } catch (backendErr) {
          console.error("[Push Toggle] Backend network error:", backendErr);
        }
      } else {
        // Optimistically set to false immediately for instantaneous UI response!
        setIsPushEnabled(false);

        // Unsubscribe asynchronously in the background
        try {
          let registration = await navigator.serviceWorker.getRegistration();
          if (!registration) {
            registration = await navigator.serviceWorker.ready;
          }

          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            // 1. Unsubscribe locally
            await subscription.unsubscribe();

            // 2. Delete on backend
            await fetch("/api/push/subscribe", {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ endpoint: subscription.endpoint }),
            });
          }
          console.log("[Push Toggle] Successfully unsubscribed in background!");
        } catch (unsubErr) {
          console.error("[Push Toggle] Error during unsubscribe background cleanup:", unsubErr);
        }
      }
    } catch (error) {
      console.error("[Push Toggle] Error toggling push notifications:", error);
      // Revert state on unexpected core error
      setIsPushEnabled(false);
    }
  };

  // High-Fidelity Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingTimer, setRecordingTimer] = useState<any>(null);

  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatPanelRef = useRef<HTMLElement | null>(null);
  const pendingImageRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  // Disabled manual global wheel listener: It was manually updating scrollTop on every wheel event,
  // causing double-scrolling and layout jitter/scrollbar jumping. The browser now handles scroll
  // naturally on #main-scroll-container.


  // Helper to convert VAPID public key from Base64 URL to Uint8Array required by pushManager
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Register PWA Service Worker & Subscribe to Web Push Notifications
  useEffect(() => {
    // Skip Web Push entirely inside the Electron desktop app — native notifications handle this
    if (typeof window !== "undefined" && !!(window as any).electronAPI) return;

    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("PWA Service Worker or Web Push is not supported by this browser.");
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BMQemcbop-dfZ7bLlwyL083mRANSiRsNbggorApxFfg5U-M_KKMVpwoUdZGM4mbG5rpav7w-vZbcNhiWtW4hvQE";

    const registerAndSubscribe = async () => {
      try {
        // 1. Register sw.js
        const registration = await navigator.serviceWorker.register("/sw.js");
        console.log("Service Worker registered successfully with scope:", registration.scope);

        // 2. Wait until user is fully logged in before subscribing
        if (status !== "authenticated" || !session?.user?.id) {
          return;
        }

        // 3. Check for existing permission - NEVER request permission on page load without user gesture
        const permission = Notification.permission;
        if (permission !== "granted") {
          console.log("[PWA Push] Notification permission not granted yet. Waiting for manual user toggle in Settings.");
          setIsPushEnabled(false);
          return;
        }

        // 4. Check for existing subscription or create new one silently since permission is already granted
        let subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          setIsPushEnabled(true);
        } else {
          setIsPushEnabled(false);
          const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
          try {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            });
            if (subscription) {
              setIsPushEnabled(true);
            }
          } catch (subErr) {
            console.error("[PWA Push] Silent subscription failed:", subErr);
            return;
          }
        }

        if (subscription) {
          // 5. Send subscription to Prisma backend
          const res = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(subscription),
          });

          if (res.ok) {
            console.log("Registered Push Subscription successfully on backend!");
          } else {
            console.error("Failed to save push subscription on backend:", await res.text());
          }
        }
      } catch (error) {
        console.error("Error setting up Web Push Notifications:", error);
      }
    };

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "NAVIGATE") {
        const targetUrl = event.data.url;
        console.log("Received NAVIGATE message from Service Worker:", targetUrl);
        try {
          const urlObj = new URL(targetUrl, window.location.origin);
          const chatHandle = urlObj.searchParams.get("chat");
          const tabName = urlObj.searchParams.get("tab");
          if (chatHandle) {
            setActivePeerHandle(chatHandle);
            setIsChatFull(true);
          } else if (tabName === "requests") {
            setMode("connect");
          }
        } catch (e) {
          console.error("Error parsing targetUrl:", e);
        }
      } else if (event.data && event.data.type === "NEW_MESSAGE_RECEIVED") {
        const from = event.data.fromHandle;
        if (from && !areHandlesEqual(from, activePeerHandle)) {
          setUnreadMessages((prev) => addUnreadMessage(prev, event.data.messageId || `sw-${Date.now()}`, from));
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
    void registerAndSubscribe();

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, [status, session?.user?.id]);

  // Dynamically clear PWA App Badges, capture unread sender IDs, and close active push notifications
  useEffect(() => {
    const clearBadgesAndSyncUnread = async () => {
      if (typeof window !== "undefined") {
        if ("clearAppBadge" in navigator) {
          navigator.clearAppBadge().catch((err) => console.warn("[Badge] Error clearing badge:", err));
        }

        if ("serviceWorker" in navigator) {
          try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
              const notifications = await reg.getNotifications();
              const handlesToAdd: string[] = [];
              notifications.forEach((n) => {
                const targetUrl = n.data?.url;
                if (targetUrl) {
                  try {
                    const urlObj = new URL(targetUrl, window.location.origin);
                    const h = urlObj.searchParams.get("chat");
                    if (h && h !== activePeerHandle) {
                      handlesToAdd.push(h);
                    }
                  } catch {
                    // ignore
                  }
                }
                n.close(); // Close the notification
              });

              if (handlesToAdd.length > 0) {
                setUnreadMessages((prev) => {
                  const filtered = prev.filter((m) => !handlesToAdd.includes(m.sender));
                  const newMsgs = handlesToAdd.map((h, idx) => ({ id: `notif-${h}-${idx}-${Date.now()}`, sender: h }));
                  return [...filtered, ...newMsgs];
                });
              }
            }
          } catch (err) {
            console.warn("[Badge] Error syncing notifications:", err);
          }
        }
      }
    };

    void clearBadgesAndSyncUnread();

    const handleFocus = () => {
      clearBadgesAndSyncUnread();
      if (activePeerHandle) {
        setUnreadMessages((prev) => prev.filter((m) => m.sender !== activePeerHandle));
      }
      const win = window as any;
      if (win.electronAPI && typeof win.electronAPI.focusWindow === "function") {
        win.electronAPI.focusWindow();
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [activePeerHandle]);

  useEffect(() => {
    const win = window as any;
    if (win.electronAPI && typeof win.electronAPI.onNotificationClicked === "function") {
      const unsubscribe = win.electronAPI.onNotificationClicked((data: { peerHandle: string }) => {
        if (data && data.peerHandle) {
          setActivePeerHandle(data.peerHandle);
          setIsChatFull(true);
        }
      });
      return () => {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      };
    }
  }, []);

  // Lightbox for viewing attachments fullscreen inside the app
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [lightboxImageName, setLightboxImageName] = useState<string | null>(null);
  const [lightboxVideoUrl, setLightboxVideoUrl] = useState<string | null>(null);
  const [lightboxVideoName, setLightboxVideoName] = useState<string | null>(null);

  // Logo viewer state
  const [showLogoViewer, setShowLogoViewer] = useState(false);
  const [logoViewerImage, setLogoViewerImage] = useState<string>("/logo-square.png");

  // Welcome screen logo viewer state (right top corner)
  const [showWelcomeLogoViewer, setShowWelcomeLogoViewer] = useState(false);
  const [welcomeLogoViewerImage, setWelcomeLogoViewerImage] = useState<string>("/logo-square.png");

  // Focus Mode (Zen Mode) state
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Meta/X Strategic Systems State:
  const [isNotifCenterOpen, setIsNotifCenterOpen] = useState<boolean>(false);
  const [activeFeedTab, setActiveFeedTab] = useState<'foryou' | 'latest' | 'network'>('foryou');
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [activePostMenuId, setActivePostMenuId] = useState<string | null>(null);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Record<string, boolean>>({});

  // Meta/X Grade Post Deletion
  const handleDeletePost = async (postId: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      setDirectoryGlobalPosts((prev) => prev.filter((p) => p.id !== postId));
      setDirectoryLatestPostsByAuthorId((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          next[k] = next[k].filter((p) => p.id !== postId);
        }
        return next;
      });

      const res = await fetch(`/api/posts?id=${postId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete post");
      }
    } catch (err) {
      console.error("Delete post error", err);
    }
  };


  // Settings animation state & Glass Theme switcher
  const [isSettingsAnimating, setIsSettingsAnimating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsScreen, setSettingsScreen] = useState("main");
  const [settingsGlassTheme, setSettingsGlassTheme] = useState<"quantum" | "crystal">("quantum");
  const settingsClickTimeRef = useRef<number>(0);

  const openSettingsDirect = () => {
    const now = Date.now();
    settingsClickTimeRef.current = now;
    setIsSettingsAnimating(true);
    setShowSettings(true);
    setSettingsScreen("main");
    pushNavState({ screen: "settings" });
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("qlink_settings_glass_theme");
      if (saved === "crystal" || saved === "quantum") {
        setSettingsGlassTheme(saved);
      }
    }
  }, []);

  const toggleSettingsGlassTheme = () => {
    const next = settingsGlassTheme === "quantum" ? "crystal" : "quantum";
    setSettingsGlassTheme(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("qlink_settings_glass_theme", next);
    }
  };

  // Synchronize Push Notifications button state dynamically whenever settings modal is opened
  useEffect(() => {
    if (showSettings) {
      const syncPushEnabledState = async () => {
        if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
          setIsPushEnabled(false);
          return;
        }

        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration && Notification.permission === "granted") {
            const subscription = await registration.pushManager.getSubscription();
            setIsPushEnabled(!!subscription);
          } else {
            setIsPushEnabled(false);
          }
        } catch (err) {
          console.warn("[Push Sync] Error checking subscription status:", err);
          setIsPushEnabled(false);
        }
      };

      void syncPushEnabledState();
    }
  }, [showSettings]);

  // Privacy visibility states
  const [emailVisibility, setEmailVisibility] = useState<"public" | "private">("private");
  const [ageVisibility, setAgeVisibility] = useState<"public" | "private">("private");
  const [genderVisibility, setGenderVisibility] = useState<"public" | "private">("private");
  const [bioVisibility, setBioVisibility] = useState<"public" | "private">("private");
  const [interestsVisibility, setInterestsVisibility] = useState<"public" | "private">("private");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Console animation state
  const [isConsoleAnimating, setIsConsoleAnimating] = useState(false);

  // Full chat animation state
  const [isChatAnimating, setIsChatAnimating] = useState(false);
  const [chatAnimMode, setChatAnimMode] = useState<'idle' | 'opening' | 'closing'>('idle');

  // Smooth chat toggle with spotlight animations
  const toggleChatFull = () => {
    if (chatAnimMode !== 'idle') return;
    if (!isChatFull) {
      setIsChatFull(true);
      setChatAnimMode('opening');
      setIsChatAnimating(true);
      setTimeout(() => {
        setChatAnimMode('idle');
        setIsChatAnimating(false);
      }, 500);
    } else {
      setChatAnimMode('closing');
      setIsChatAnimating(true);
      setTimeout(() => {
        setIsChatFull(false);
        setChatAnimMode('idle');
        setIsChatAnimating(false);
        if (typeof window !== "undefined") {
          window.scrollTo({ left: 0 });
          const main = document.getElementById("main-scroll-container");
          if (main) main.scrollLeft = 0;
          if (window.innerWidth < 1024) {
            setActivePeerHandle(null);
            replaceNavState({ screen: "home" });
          }
        }
      }, 450);
    }
  };

  const isChatExpanded = isChatFull || chatAnimMode === 'closing';

  const quantumIdRef = useRef<HTMLDivElement | null>(null);
  const connectRef = useRef<HTMLDivElement | null>(null);
  const requestsRef = useRef<HTMLDivElement | null>(null);
  const connectionsTabBarRef = useRef<HTMLDivElement | null>(null);

  const handleTabBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = connectionsTabBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const pillWidth = (rect.width - 8) / 2;
    const maxShift = pillWidth;
    const shift = Math.max(0, Math.min(maxShift, mouseX - pillWidth / 2));

    // Calculate relative mouse position inside the moving pill (0% to 100%)
    const mouseInPillX = Math.max(0, Math.min(pillWidth, mouseX - shift));
    const mouseInPillPercent = (mouseInPillX / pillWidth) * 100;

    bar.style.setProperty("--pill-x", `${shift}px`);
    bar.style.setProperty("--mouse-in-pill", `${mouseInPillPercent}%`);
    bar.style.setProperty("--pill-transition", "transform 0.08s ease-out");
  };

  const handleTabBarMouseLeave = () => {
    const bar = connectionsTabBarRef.current;
    if (!bar) return;
    const isFriends = connectionsTab === "friends";
    const pillWidth = (bar.offsetWidth - 8) / 2;
    const targetX = isFriends ? 0 : pillWidth;
    bar.style.setProperty("--pill-x", `${targetX}px`);
    bar.style.setProperty("--mouse-in-pill", "50%");
    bar.style.setProperty("--pill-transition", "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)");
  };

  // Typing debounce timer + state (optimize calls to presence/typing)
  const typingTimeoutRef = useRef<any | null>(null);
  const isTypingRef = useRef<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const imageVideoInputRef = useRef<HTMLInputElement | null>(null);
  const profilePicInputRef = useRef<HTMLInputElement | null>(null);

  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [avatarViewerImageUrl, setAvatarViewerImageUrl] = useState<string | null>(null);
  const [isAvatarHovered, setIsAvatarHovered] = useState(false);

  // Avatar image load error state
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  // Reset avatar load error state when user image changes
  useEffect(() => {
    setAvatarLoadError(false);
  }, [session?.user?.image, profilePicUrl]);

  const [currentHandle, setCurrentHandle] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSaving, setHandleSaving] = useState(false);
  const [showVipTerms, setShowVipTerms] = useState(false);
  const [isVipTermsAnimating, setIsVipTermsAnimating] = useState(false);
  const [showAuraHelp, setShowAuraHelp] = useState(false);
  const [showAIHelpButton, setShowAIHelpButton] = useState(false);
  const [isQAIOpen, setIsQAIOpen] = useState(false);
  // Full App Control Q-AI Swarm Action Bus Subscription
  // Full App Control Q-AI ReAct Action Bus Subscription (Self-Healing & Multi-Tool Chaining)
  useEffect(() => {
    const executeSingleAction = (action: QAIToolAction) => {
      try {
        if (action.tool === "open_quantum_console") {
          const steps: any[] = [];
          if (isQAIOpen) {
            steps.push({
              targetId: "qai-sidecar-close-btn",
              actionName: "Closing Q-AI Panel",
              delayBefore: 120,
              duration: 750,
              onReach: () => setIsQAIOpen(false),
            });
          }
          if (isChatFull) {
            steps.push({
              targetId: "chat-toggle-full-btn",
              actionName: "Exiting Chat Screen",
              delayBefore: 200,
              duration: 800,
              onReach: () => {
                setIsChatFull(false);
                setChatAnimMode('idle');
                setIsChatAnimating(false);
                if (typeof window !== "undefined") {
                  window.scrollTo({ left: 0 });
                  const main = document.getElementById("main-scroll-container");
                  if (main) main.scrollLeft = 0;
                }
              },
            });
          }
          steps.push({
            targetId: "quantum-link-console-btn",
            actionName: "Opening Quantum Link Console",
            delayBefore: isChatFull ? 520 : 260,
            duration: 950,
            onReach: () => {
              setIsChatFull(false);
              openDirectory();
            },
          });
          ghostCursorEngine.runSequence(steps);
        } else if (action.tool === "navigate_tab" && action.params?.tab === "settings") {
          const steps: any[] = [];
          if (isQAIOpen) {
            steps.push({
              targetId: "qai-sidecar-close-btn",
              actionName: "Closing Q-AI Panel",
              delayBefore: 120,
              duration: 750,
              onReach: () => setIsQAIOpen(false),
            });
          }
          if (isChatFull) {
            steps.push({
              targetId: "chat-toggle-full-btn",
              actionName: "Exiting Chat Screen",
              delayBefore: 200,
              duration: 800,
              onReach: () => {
                setIsChatFull(false);
                setChatAnimMode('idle');
                setIsChatAnimating(false);
                if (typeof window !== "undefined") {
                  window.scrollTo({ left: 0 });
                  const main = document.getElementById("main-scroll-container");
                  if (main) main.scrollLeft = 0;
                }
              },
            });
          }
          steps.push({
            targetId: "settings-btn",
            actionName: "Opening Platform Settings",
            delayBefore: isChatFull ? 520 : 260,
            duration: 950,
            onReach: () => {
              openSettingsDirect();
            },
          });
          ghostCursorEngine.runSequence(steps);
        } else if (action.tool === "navigate_tab" && action.params?.tab === "chats") {
          ghostCursorEngine.runSequence([
            {
              targetId: "chat-toggle-full-btn",
              actionName: "Collapsing Chat Fullscreen",
              delayBefore: 150,
              duration: 450,
              onReach: () => setIsChatFull(false),
            },
          ]);
        } else if (action.tool === "trigger_beacon") {
          ghostCursorEngine.runSequence([
            {
              targetId: "beacon-sos-btn",
              actionName: "Triggering Emergency SOS Beacon",
              delayBefore: 150,
              duration: 450,
              onReach: () => handleTriggerEmergencyBeacon(),
            },
          ]);
        } else if (action.tool === "toggle_voice_record") {
          ghostCursorEngine.runSequence([
            {
              targetId: "mic-record-btn",
              actionName: !isRecording ? "Starting Audio Recording" : "Stopping Voice Recording",
              delayBefore: 150,
              duration: 450,
              onReach: () => {
                if (!isRecording) {
                  startRecording();
                } else {
                  stopRecording(true);
                }
              },
            },
          ]);
        } else if (action.tool === "open_attachment_picker") {
          ghostCursorEngine.runSequence([
            {
              targetId: "attachment-btn",
              actionName: "Opening Media Attachment Tray",
              delayBefore: 150,
              duration: 450,
              onReach: () => handleAttachButtonClick(),
            },
          ]);
        } else if (action.tool === "show_aura_guide") {
          ghostCursorEngine.runSequence([
            {
              targetId: "quantum-link-console-btn",
              actionName: "Opening Aura Points Guide",
              delayBefore: 150,
              duration: 450,
              onReach: () => setShowAuraHelp(true),
            },
          ]);
        } else if (action.tool === "open_chat" && action.params?.target) {
          const cleanHandle = String(action.params.target).replace(/^@/, "").trim();
          setActivePeerHandle(cleanHandle);
          setIsChatFull(true);
        } else if (action.tool === "edit_last_message") {
          const currentUserId = (session?.user as any)?.id;
          const myLastMsg = [...chatMessages].reverse().find((m) => m.senderId === currentUserId);
          if (myLastMsg) {
            setEditingMessage({ id: myLastMsg.id, content: myLastMsg.content });
          }
        } else if (action.tool === "insert_draft" && action.params?.text) {
          setChatInput(action.params.text);
          if (chatInputRef.current) {
            chatInputRef.current.value = action.params.text;
            chatInputRef.current.style.height = "auto";
          }
        } else if (action.tool === "switch_theme" && action.params?.theme) {
          setSettingsGlassTheme(action.params.theme === "crystal" ? "crystal" : "quantum");
        }
      } catch (err) {
        console.error("Q-AI Action execution error:", err);
      }
    };

    if (typeof window !== "undefined") {
      (window as any).__qaiActionBus = qaiActionBus;
    }
    const unsubscribe = qaiActionBus.subscribe((payload: QAIToolAction | QAIToolAction[]) => {
      if (Array.isArray(payload)) {
        payload.forEach((act, idx) => {
          setTimeout(() => executeSingleAction(act), idx * 800);
        });
      } else {
        executeSingleAction(payload);
      }
    });

    return () => unsubscribe();
  }, [isRecording, isQAIOpen, isChatFull, chatMessages, session]);
  // Auto-process due scheduled messages in the background (only run when tab is visible, at most every 3 minutes)
  useEffect(() => {
    let lastProcessed = 0;
    const processScheduledQueue = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastProcessed < 180_000) return; // 3 min throttle
      lastProcessed = now;
      try {
        await fetch("/api/chat/schedule/process", { method: "POST" });
      } catch {}
    };
    processScheduledQueue();
    const interval = setInterval(processScheduledQueue, 180_000);
    return () => clearInterval(interval);
  }, []);
  const [isAIArrowButtonVisible, setIsAIArrowButtonVisible] = useState(true);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [manualStopAnimation, setManualStopAnimation] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("qlink_manual_stop_ai_animation") === "true";
    }
    return false;
  });

  // Phone/No account modal states
  const [showNoAccountModal, setShowNoAccountModal] = useState(false);
  const [phoneSignInStep, setPhoneSignInStep] = useState<"menu" | "phone" | "otp" | "success">("menu");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState({ name: "India", code: "IN", dial: "+91", flag: "🇮🇳" });
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState("");

  // Dynamically filter 190+ countries in real-time
  const filteredCountries = countries.filter((c) =>
    c.name.toLowerCase().includes(countrySearchQuery.toLowerCase()) ||
    c.dial.includes(countrySearchQuery) ||
    c.code.toLowerCase().includes(countrySearchQuery.toLowerCase())
  );

  // Debug: Track modal state changes
  useEffect(() => {
    console.log('Aura help modal state changed:', showAuraHelp);
  }, [showAuraHelp]);

  // AI Help Button & Circular Chevron Trigger Animation Logic:
  // Visible for 5 seconds (5000ms), Hidden for 4 seconds (4000ms) in an automatic infinite loop
  useEffect(() => {
    if (manualStopAnimation) {
      setIsAIArrowButtonVisible(false);
      setShowAIHelpButton(false);
      return;
    }

    let isMounted = true;
    let arrowTimerId: NodeJS.Timeout;

    const executeArrowCycle = (isVisible: boolean) => {
      if (!isMounted || manualStopAnimation) return;
      setIsAIArrowButtonVisible(isVisible);
      // If showing: visible for 5000ms (5s)
      // If hiding: hidden for 4000ms (4s)
      const delay = isVisible ? 5000 : 4000;
      arrowTimerId = setTimeout(() => {
        executeArrowCycle(!isVisible);
      }, delay);
    };

    // Start cycle with 5 seconds visible
    executeArrowCycle(true);

    return () => {
      isMounted = false;
      clearTimeout(arrowTimerId);
    };
  }, [manualStopAnimation]);

  // Install Prompt Handler
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const prompt = (e as any);
      setDeferredPrompt(prompt);
      setShowInstallButton(true);
      console.log('beforeinstallprompt event captured - install button available');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Install button click handler
  const handleInstallClick = () => {
    const promptEvent = installPromptEvent || deferredPrompt;
    if (promptEvent) {
      promptEvent.prompt();
      promptEvent.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted install prompt');
        } else {
          console.log('User dismissed install prompt');
        }
        setInstallPromptEvent(null);
        setDeferredPrompt(null);
        setShowInstallButton(false);
      });
    }
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("qc_pwa_install_seen_v1", "dismissed");
      }
    } catch {
      // ignore
    }
    setShowInstallPrompt(false);
    // User selected install on shortcut screen: now start tour guide
    startTourGuideIfEligible();
  };

  // Onboarding state for new users
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isFirstAutoOnboarding, setIsFirstAutoOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [bioDraft, setBioDraft] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<"male" | "female" | "other" | null>(null);

  // Interests categories for onboarding
  const interestsCategories = [
    "Technology", "Artificial Intelligence", "Machine Learning", "Deep Learning",
    "Robotics", "Automation", "Software Development", "Web Development", "App Development",
    "Game Development", "Cybersecurity", "Ethical Hacking", "Blockchain", "Web3",
    "Cryptocurrency", "Cloud Computing", "DevOps", "Data Science", "Big Data", "Quantum Computing",
    "Edge Computing", "Internet of Things (IoT)", "Electronics", "Embedded Systems", "Hardware Engineering",
    "Open Source", "Startups", "Entrepreneurship", "Business Strategy", "Finance", "Investing",
    "Stock Market", "Crypto Trading", "Economics", "Banking", "Venture Capital", "Personal Finance",
    "Space Technology", "Astronomy", "Physics", "Chemistry", "Biotechnology", "Neuroscience",
    "Psychology", "Philosophy", "Self Improvement", "Productivity", "Leadership", "Marketing",
    "Digital Marketing", "Content Creation", "Writing", "Graphic Design", "UI/UX Design", "Fashion",
    "Art", "Music", "Gaming", "Virtual Reality (VR)", "Augmented Reality (AR)", "Sports",
    "Fitness", "Nutrition", "Medicine", "Travel", "Engineering", "Real Estate",
    "History", "Politics", "Law", "Education", "Research", "DIY Projects", "Sustainability"
  ];

  // Helper to start the tour guide only when all onboarding & shortcut modals are dismissed
  const startTourGuideIfEligible = () => {
    if (typeof window === "undefined") return;
    try {
      const hasSeenGuide = window.localStorage.getItem("qc_seen_guide_v1");
      if (!hasSeenGuide) {
        // Small delay for smooth exit transition of preceding modal
        setTimeout(() => {
          setShowGuide(true);
          setGuideStep(0);
        }, 350);
      }
    } catch {
      // ignore
    }
  };

  // Onboarding handlers
  const handleSkipOnboarding = () => {
    setShowOnboarding(false);
    setIsFirstAutoOnboarding(false);
    // Mark onboarding as completed so it doesn't auto-open again
    if (typeof window !== "undefined") {
      localStorage.setItem("qc_onboarding_completed", "true");
      const installedOrSkipped = localStorage.getItem("qc_pwa_install_seen_v1");
      if (!installedOrSkipped) {
        // Step 2: Show shortcut prompt (second reference screen)
        setTimeout(() => {
          setShowInstallPrompt(true);
        }, 250);
      } else {
        // Shortcut prompt already completed previously, start tour guide
        startTourGuideIfEligible();
      }
    }
  };

  const handleNextOnboarding = () => {
    if (onboardingStep === 1) {
      setOnboardingStep(2);
      return;
    }
    if (onboardingStep === 2) {
      setOnboardingStep(3);
      return;
    }
    if (onboardingStep === 3) {
      if (!bioDraft.trim()) {
        alert("Please add a short bio about yourself.");
        return;
      }
      setOnboardingStep(4);
      return;
    }
    if (onboardingStep === 4) {
      if (!age) {
        alert("Please select your age.");
        return;
      }
      setOnboardingStep(5);
    }
  };

  const handleFinishOnboarding = () => {
    if (!gender) {
      alert("Please select your gender.");
      return;
    }

    setShowOnboarding(false);
    setIsFirstAutoOnboarding(false);

    // Mark onboarding as completed so it doesn't auto-open again
    if (typeof window !== "undefined") {
      window.localStorage.setItem("qc_onboarding_completed", "true");
    }

    // Step 2: When onboarding steps complete, show shortcut prompt (second reference screen)
    if (typeof window !== "undefined") {
      const installedOrSkipped = window.localStorage.getItem("qc_pwa_install_seen_v1");
      if (!installedOrSkipped) {
        setTimeout(() => {
          setShowInstallPrompt(true);
        }, 250);
      } else {
        // Shortcut already completed in past, launch tour guide
        startTourGuideIfEligible();
      }
    }

    // Save selected bio and profile details to backend
    if (bioDraft && bioDraft.trim()) {
      fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: bioDraft.trim() }),
      }).catch((err) => console.warn("[onboarding] Failed to save bio:", err));
    }
  };

  const handleAutoGenerate = () => {
    // Use the system-generated ID and name from the user's session
    if (session?.user) {
      const userHandle = (session.user as any).handle;
      const userName = session.user.name || session.user.email?.split('@')[0];

      if (userHandle) {
        setHandleDraft(userHandle);
      }
      if (userName) {
        setNameDraft(userName);
      }
    }
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  useEffect(() => {
    const checkUserOnboarding = async () => {
      if (status === "authenticated" && session && canUseDom) {
        setDisplayName(session.user?.name || null);
        setCurrentHandle((session.user as any)?.handle || null);
        if (session.user?.image) {
          setProfilePicUrl(getHighResProfilePic(session.user.image));
        }

        // Fetch authoritative profile directly from database API on every authenticated mount
        fetch("/api/user/profile")
          .then((res) => res.json())
          .then((data) => {
            if (data?.success && data?.user) {
              setCurrentUserProfile(data.user);
              if (data.user.name) setDisplayName(data.user.name);
              if (data.user.handle) setCurrentHandle(data.user.handle);
              if (data.user.image) setProfilePicUrl(getHighResProfilePic(data.user.image));
            }
          })
          .catch(() => {});

        // Check if user has completed onboarding (you can store this in localStorage or backend)
        const hasCompletedOnboarding = localStorage.getItem("qc_onboarding_completed");
        const hasSeenGuide = localStorage.getItem("qc_seen_guide_v1");

        // Check if user exists in database (this is a simplified check - in production, you'd want to verify with your backend)
        const checkExistingUser = async () => {
          try {
            // For now, we'll use localStorage to track existing users
            // In production, you'd make an API call to check if user exists in your database
            const userHandle = (session.user as any)?.handle;
            if (userHandle) {
              const existingUserKey = `qc_existing_user_${userHandle}`;
              const isExistingUser = localStorage.getItem(existingUserKey);

              if (isExistingUser) {
                // User exists in database - mark onboarding and guide as completed
                localStorage.setItem("qc_onboarding_completed", "true");
                localStorage.setItem("qc_seen_guide_v1", "1");
                return true;
              } else {
                // New user - mark as existing for future logins
                localStorage.setItem(existingUserKey, "true");
                return false;
              }
            }
          } catch (error) {
            console.error("Error checking existing user:", error);
            return false;
          }
        };

        const isExistingUser = await checkExistingUser();

        if (!hasCompletedOnboarding && !isExistingUser) {
          // First time user: show Welcome screen ONLY.
          // Tour guide & shortcut modal are strictly held back until onboarding is done.
          setShowOnboarding(true);
          setIsFirstAutoOnboarding(true);
        } else {
          // Returning user who completed or skipped onboarding previously
          const hasSeenInstallPrompt = localStorage.getItem("qc_pwa_install_seen_v1");
          if (!hasSeenInstallPrompt && !isExistingUser) {
            // Show shortcut prompt if not seen yet
            setTimeout(() => {
              setShowInstallPrompt(true);
            }, 300);
          } else if (!hasSeenGuide && !isExistingUser) {
            // Both onboarding and shortcut are done, launch tour guide smoothly
            setTimeout(() => {
              setShowGuide(true);
              setGuideStep(0);
            }, 500);
          }
        }
      }
    };

    checkUserOnboarding();
  }, [status, session]);

  // Load followers when authenticated
  useEffect(() => {
    if (status === "authenticated" && (session?.user as any)?.id) {
      fetchFollowers();
    }
  }, [status, session]);

  // Animation state for Q-Link logo
  const [logoAnimationStep, setLogoAnimationStep] = useState(0);

  // Q-Link animation cycle every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLogoAnimationStep(prev => (prev + 1) % 10); // 0-9 for complete cycle
    }, 400); // 400ms per step = 4 seconds total

    return () => clearInterval(interval);
  }, []);

  const [showDirectory, setShowDirectory] = useState(false);
  const [showDirectoryMediaOnly, setShowDirectoryMediaOnly] = useState(false);
  const [directoryProfileHandle, setDirectoryProfileHandle] = useState<string | null>(null);
  const [directoryProfileInitialData, setDirectoryProfileInitialData] = useState<any>(null);
  const [mediaFilterTab, setMediaFilterTab] = useState<'all' | 'shorts' | 'posts' | 'tweets'>('all');
  const [directoryItems, setDirectoryItems] = useState<DirectoryItem[] | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("qlink_cached_directory");
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });
  // Auto-persist connections & directory data for instant 0ms cached rendering on next launch
  useEffect(() => {
    if (typeof window !== "undefined" && outgoing && outgoing.length > 0) {
      try {
        localStorage.setItem("qlink_cached_outgoing", JSON.stringify(outgoing));
      } catch {}
    }
  }, [outgoing]);

  useEffect(() => {
    if (typeof window !== "undefined" && incoming && incoming.length > 0) {
      try {
        localStorage.setItem("qlink_cached_incoming", JSON.stringify(incoming));
      } catch {}
    }
  }, [incoming]);

  useEffect(() => {
    if (typeof window !== "undefined" && directoryItems && directoryItems.length > 0) {
      try {
        localStorage.setItem("qlink_cached_directory", JSON.stringify(directoryItems));
      } catch {}
    }
  }, [directoryItems]);

  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryLatestPostsByAuthorId, setDirectoryLatestPostsByAuthorId] =
    useState<Record<string, any[]>>({});
  const [directoryGlobalPosts, setDirectoryGlobalPosts] = useState<any[]>([]);
  const [directoryPostsLoading, setDirectoryPostsLoading] = useState(false);
  const [directoryPostsError, setDirectoryPostsError] = useState<string | null>(null);
  const [directoryOpenCommentsPostId, setDirectoryOpenCommentsPostId] =
    useState<string | null>(null);

  // Directory scroll preservation & X-style floating Scroll-to-Top button
  const directoryScrollRef = useRef<HTMLDivElement | null>(null);
  const directoryScrollTopRef = useRef<number>(0);
  const [showDirectoryScrollToTop, setShowDirectoryScrollToTop] = useState(false);

  const [directoryFastScrolling, setDirectoryFastScrolling] = useState(false);
  const directoryFastScrollTimer = useRef<any>(null);
  const directoryLastScrollTime = useRef<number>(0);
  const directoryLastScrollPos = useRef<number>(0);

  const handleDirectoryScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    const scrollHeight = e.currentTarget.scrollHeight;
    const clientHeight = e.currentTarget.clientHeight;
    directoryScrollTopRef.current = top;
    try {
      sessionStorage.setItem("qc_directory_scroll", String(top));
    } catch {}

    const now = Date.now();
    const timeDiff = now - (directoryLastScrollTime.current || now);
    const posDiff = top - (directoryLastScrollPos.current || top);

    // Detect fast downward scrolling or near bottom
    if (posDiff > 40 && timeDiff > 0 && timeDiff < 180) {
      const velocity = posDiff / timeDiff; // px per ms
      if (velocity > 0.7 && scrollHeight - (top + clientHeight) < 750) {
        setDirectoryFastScrolling(true);
        if (directoryFastScrollTimer.current) clearTimeout(directoryFastScrollTimer.current);
        directoryFastScrollTimer.current = setTimeout(() => {
          setDirectoryFastScrolling(false);
        }, 800);
      }
    }

    directoryLastScrollTime.current = now;
    directoryLastScrollPos.current = top;

    if (top > 160) {
      if (!showDirectoryScrollToTop) setShowDirectoryScrollToTop(true);
    } else {
      if (showDirectoryScrollToTop) setShowDirectoryScrollToTop(false);
    }
  };

  const scrollToDirectoryTop = () => {
    if (directoryScrollRef.current) {
      directoryScrollRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
    directoryScrollTopRef.current = 0;
    setShowDirectoryScrollToTop(false);
    try {
      sessionStorage.setItem("qc_directory_scroll", "0");
    } catch {}
  };

  // Restore scroll position when Global Directory opens or when returning to user list
  useEffect(() => {
    if (!showDirectory || directoryProfileHandle) return;
    const savedTop = directoryScrollTopRef.current || (typeof window !== "undefined" ? Number(sessionStorage.getItem("qc_directory_scroll") || 0) : 0);
    if (!savedTop || savedTop <= 0) return;

    let cancelled = false;
    const restore = () => {
      if (cancelled) return;
      if (directoryScrollRef.current) {
        if (Math.abs(directoryScrollRef.current.scrollTop - savedTop) > 5) {
          directoryScrollRef.current.scrollTop = savedTop;
        }
      }
    };

    restore();
    const raf1 = requestAnimationFrame(restore);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(restore));
    const t1 = setTimeout(restore, 40);
    const t2 = setTimeout(restore, 120);
    const t3 = setTimeout(restore, 250);
    const t4 = setTimeout(restore, 450);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [showDirectory, directoryProfileHandle, directoryItems, directoryLoading]);

  // Engagement state management
  const [followStatus, setFollowStatus] = useState<Record<string, boolean>>({});
  const [postReactions, setPostReactions] = useState<Record<string, { likes: number; dislikes: number; userReaction: number | null }>>({});
  const [postComments, setPostComments] = useState<Record<string, any[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<Record<string, boolean>>({});
  const [engagementLoading, setEngagementLoading] = useState<Record<string, { follow?: boolean; reaction?: boolean; comment?: boolean }>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [viewedPosts, setViewedPosts] = useState<Set<string>>(new Set());

  const formatTimeAgo = (value: unknown) => {
    const date = value ? new Date(value as any) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSec < 10) return "now";
    if (diffSec < 60) return `${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d`;
  };

  const [showIdConsole, setShowIdConsole] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);

  useEffect(() => {
    if (showIdConsole && session?.user) {
      fetch("/api/user/profile")
        .then((res) => res.json())
        .then((data) => {
          if (data?.success && data?.user) {
            setCurrentUserProfile(data.user);
            if (data.user.name) setDisplayName(data.user.name);
            if (data.user.handle) setCurrentHandle(data.user.handle);
            if (data.user.image) setProfilePicUrl(getHighResProfilePic(data.user.image));
          }
        })
        .catch(() => {});
    }
  }, [showIdConsole, session]);
  const [showStore, setShowStore] = useState(false);
  const [isStoreAnimating, setIsStoreAnimating] = useState(false);
  const [cardRotateX, setCardRotateX] = useState(0);
  const [cardRotateY, setCardRotateY] = useState(0);
  const [cardShineX, setCardShineX] = useState(50);
  const [cardShineY, setCardShineY] = useState(50);
  const [isUpgradingStore, setIsUpgradingStore] = useState(false);
  const [showPointsGuide, setShowPointsGuide] = useState(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [localPointsOverride, setLocalPointsOverride] = useState<number | null>(null);
  const [localBlueTickOverride, setLocalBlueTickOverride] = useState<string | null>(null);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [transactionNotification, setTransactionNotification] = useState<{
    show: boolean;
    type: "credit" | "debit";
    amount: number;
    title: string;
    message: string;
    txHash: string;
  } | null>(null);
  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
  const [isDowngrading, setIsDowngrading] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeSuccessMsg, setStoreSuccessMsg] = useState<string | null>(null);
  const [isConsoleClosing, setIsConsoleClosing] = useState(false);
  const [idConsoleTab, setIdConsoleTab] = useState<"my" | "global">("my");
  const [postAudience, setPostAudience] = useState<"GLOBAL" | "FOLLOWERS" | "FRIENDS" | "ALL">("GLOBAL");
  const [postTextDraft, setPostTextDraft] = useState("");
  const [postMediaFile, setPostMediaFile] = useState<File | null>(null);
  const [postMediaKind, setPostMediaKind] = useState<"image" | "video" | null>(null);
  const [idConsoleUploadProgress, setIdConsoleUploadProgress] = useState<number | null>(null);
  const [idConsoleLocalPreviewUrl, setIdConsoleLocalPreviewUrl] = useState<string | null>(null);
  const [idConsolePosts, setIdConsolePosts] = useState<any[] | null>(null);
  const [idConsolePostsLoading, setIdConsolePostsLoading] = useState(false);
  const [idConsolePostsError, setIdConsolePostsError] = useState<string | null>(null);
  const [showConsoleLoadingDelayed, setShowConsoleLoadingDelayed] = useState(false);
  const [postingIdConsole, setPostingIdConsole] = useState(false);
  const [idConsolePostStatus, setIdConsolePostStatus] = useState<string | null>(null);

  // Founder Grant State
  const [founderGrantTarget, setFounderGrantTarget] = useState<string | null>(null);
  const [founderGrantAmount, setFounderGrantAmount] = useState("");
  const [isFounderGrantModalOpen, setIsFounderGrantModalOpen] = useState(false);
  const [isFounderGrantLoading, setIsFounderGrantLoading] = useState(false);
  const [founderGrantError, setFounderGrantError] = useState<string | null>(null);

  // Followers state
  const [followers, setFollowers] = useState<any[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [followersError, setFollowersError] = useState<string | null>(null);

  // Console post engagement state
  const [consolePostComments, setConsolePostComments] = useState<Record<string, any[]>>({});
  const [consoleCommentsLoading, setConsoleCommentsLoading] = useState<Record<string, boolean>>({});
  const [consoleCommentInputs, setConsoleCommentInputs] = useState<Record<string, string>>({});
  const [consoleOpenCommentsPostId, setConsoleOpenCommentsPostId] = useState<string | null>(null);

  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(0);

  // Chat state
  const [chatFull, setChatFull] = useState(false);
  const [friendIdInput, setFriendIdInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);

  // Presence + typing state for active peer
  const [peerOnline, setPeerOnline] = useState<boolean | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerLastSeen, setPeerLastSeen] = useState<Date | null>(null);
  const [showOfflineTransitionName, setShowOfflineTransitionName] = useState(false);
  const lastOnlineRef = useRef<boolean | null>(null);
  const [canUseDom, setCanUseDom] = useState(false);

  // Initialize canUseDom flag
  useEffect(() => {
    setCanUseDom(true);
  }, []);

  // Enterprise Cookie Hygiene & Pre-Login Intent Capture: preserve ?demo=ai across OAuth redirects without cookie bloat
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Proactively purge oversized legacy cookies causing HTTP 494
      document.cookie = "ql_auto_demo=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie = "ql_synth_reqs=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";

      const params = new URLSearchParams(window.location.search);
      const isDemoAi = params.get("demo") === "ai" || params.get("demo") === "copilot";
      const isCopilot = params.get("copilot") === "1" || params.get("copilot") === "true";
      const chatParam = params.get("chat");

      if (isDemoAi || isCopilot) {
        const targetPeer = chatParam || "Rohit_7779";
        const intent = JSON.stringify({ chat: targetPeer, copilot: true, ts: Date.now() });
        window.sessionStorage.setItem("ql_auto_demo", intent);
      }
    } catch {}
  }, []);



  // Secure Message Sharing: Handle scrolling and highlighting for shared message
  useEffect(() => {
    if (!highlightedMessageId || chatMessages.length === 0) return;

    const hasMessage = chatMessages.some((m) => m.id === highlightedMessageId);
    if (!hasMessage) return;

    const timer = setTimeout(() => {
      const targetEl = document.querySelector(`[data-message-id="${highlightedMessageId}"]`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });

        // Clear highlight state after 3 seconds
        const clearTimer = setTimeout(() => {
          setHighlightedMessageId(null);
        }, 3000);
        return () => clearTimeout(clearTimer);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [chatMessages, highlightedMessageId]);

  // Quantum Referral Tracking core Algorithm
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (status !== 'authenticated') return; // Wait until referee is logged in
    const urlParams = new URLSearchParams(window.location.search);
    const refHandle = urlParams.get('ref');
    if (!refHandle) return;

    // Prevent self-referrals
    const myHandle = (session?.user as any)?.handle;
    if (myHandle && myHandle === refHandle) return;

    // Prevention of double claims via localStorage (Fast browser-side check)
    const cacheKey = `qlink_claimed_referral_${refHandle}`;
    if (localStorage.getItem(cacheKey) === 'true') return;

    const claimReferralClick = async () => {
      try {
        const res = await fetch('/api/referral/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referrerHandle: refHandle })
        });
        const data = await res.json();
        if (data.success) {
          localStorage.setItem(cacheKey, 'true');
          setTransactionNotification({
            show: true,
            type: 'credit',
            amount: 5,
            title: 'Quantum Referral Verified',
            message: `You helped @${refHandle} earn +5 Quantum Points! Welcome to Q-Link.`,
            txHash: 'REF-' + Math.random().toString(36).substring(2, 10).toUpperCase()
          });
          setTimeout(() => {
            setTransactionNotification(prev => prev ? { ...prev, show: false } : null);
          }, 8700);
        } else if (data.error && (data.error.includes('already claimed') || data.error.includes('Self-referral'))) {
          // Sync client storage if server confirms the click is invalid/spent
          localStorage.setItem(cacheKey, 'true');
        }
      } catch (err) {
        console.error('Failed to register referral click:', err);
      }
    };

    claimReferralClick();
  }, [session?.user, status]);

  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    setCardRotateY((x - xc) / (rect.width / 12)); // Max 15 degrees
    setCardRotateX(-(y - yc) / (rect.height / 12)); // Max 15 degrees
    setCardShineX((x / rect.width) * 100);
    setCardShineY((y / rect.height) * 100);
  };

  const handleCardMouseLeave = () => {
    setCardRotateX(0);
    setCardRotateY(0);
    setCardShineX(50);
    setCardShineY(50);
  };

  // Keep our own presence "online" based on active interaction and visibility state
  useEffect(() => {
    if (typeof window === "undefined") return;

    let stopped = false;
    let lastActivityTime = Date.now();
    let lastSentOnline: boolean | null = null;
    let lastPingTime = 0;

    // Handler to register user activity
    const recordActivity = () => {
      lastActivityTime = Date.now();
    };

    // Events to track user interaction (works on Mobile touch and Desktop mouse/keyboard)
    const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "touchmove", "scroll"];

    activityEvents.forEach((event) => {
      window.addEventListener(event, recordActivity, { passive: true });
    });

    const sendPing = async (forceOffline = false) => {
      try {
        await fetch("/api/presence/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offline: forceOffline })
        });
        lastSentOnline = !forceOffline;
        lastPingTime = Date.now();
      } catch {
        // ignore presence ping errors
      }
    };

    const runPingCycle = async () => {
      if (stopped) return;

      const now = Date.now();
      const isVisible = document.visibilityState === "visible";
      const isWithinActiveWindow = now - lastActivityTime <= 90_000; // 90s active window

      if (isVisible && isWithinActiveWindow) {
        // Tech-giant heartbeat: ping every 45s while actively interacting
        if (lastSentOnline !== true || now - lastPingTime >= 45_000) {
          await sendPing(false);
        }
      } else {
        // User is idle or tab is hidden: send offline state once
        if (lastSentOnline === true || lastSentOnline === null) {
          await sendPing(true);
        }
      }

      if (!stopped) {
        // Intelligent backoff: check every 10s if visible, 30s if hidden to minimize background timer wakeups
        const nextCheck = isVisible ? 10_000 : 30_000;
        setTimeout(runPingCycle, nextCheck);
      }
    };

    // Send immediate ping on load
    runPingCycle();

    // Listen to visibility change event (tab minimize, mobile background, phone lock)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        lastActivityTime = Date.now();
        sendPing(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Tech-giant non-blocking beacon for tab close / navigation
    const handleUnload = () => {
      if (lastSentOnline === true || lastSentOnline === null) {
        const payload = JSON.stringify({ offline: true });
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon("/api/presence/ping", payload);
        } else {
          sendPing(true);
        }
      }
    };
    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleUnload);
      window.removeEventListener("beforeunload", handleUnload);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, recordActivity);
      });
    };
  }, []);

  // Ultra-smooth momentum scroll physics with spring damping
  // DISABLED: This was causing random scrolling issues
  // useEffect(() => {
  //   const mainContainer = document.getElementById('main-scroll-container');
  //   if (!mainContainer) return;

  //   let isScrolling = false;
  //   let scrollVelocity = 0;
  //   let lastScrollY = 0;
  //   let lastTimestamp = 0;
  //   let animationFrameId: number | null = null;

  //   const handleScroll = () => {
  //     const currentScrollY = mainContainer.scrollTop;
  //     const currentTimestamp = performance.now();

  //     if (lastTimestamp > 0) {
  //       const deltaTime = currentTimestamp - lastTimestamp;
  //       const deltaY = currentScrollY - lastScrollY;
  //       scrollVelocity = deltaY / deltaTime;
  //     }

  //     lastScrollY = currentScrollY;
  //     lastTimestamp = currentTimestamp;
  //     isScrolling = true;

  //     // Clear previous timeout
  //     if (animationFrameId !== null) {
  //       cancelAnimationFrame(animationFrameId);
  //     }

  //     // Reset scrolling state after momentum stops
  //     animationFrameId = requestAnimationFrame(() => {
  //       setTimeout(() => {
  //         isScrolling = false;
  //         scrollVelocity = 0;
  //       }, 150);
  //     });
  //   };

  //   // Spring physics for overscroll
  //   const handleTouchStart = (e: TouchEvent) => {
  //     lastScrollY = mainContainer.scrollTop;
  //     lastTimestamp = performance.now();
  //     scrollVelocity = 0;
  //   };

  //   const handleTouchMove = (e: TouchEvent) => {
  //     const currentScrollY = mainContainer.scrollTop;
  //     const currentTimestamp = performance.now();
  //     const deltaTime = currentTimestamp - lastTimestamp;

  //     if (deltaTime > 0) {
  //       scrollVelocity = (currentScrollY - lastScrollY) / deltaTime;
  //     }

  //     lastScrollY = currentScrollY;
  //     lastTimestamp = currentTimestamp;
  //   };

  //   const handleTouchEnd = () => {
  //     if (Math.abs(scrollVelocity) > 0.5) {
  //       // Apply momentum
  //       const momentumScroll = () => {
  //         if (Math.abs(scrollVelocity) < 0.1) {
  //           scrollVelocity = 0;
  //           return;
  //         }

  //         scrollVelocity *= 0.95; // Damping factor
  //         mainContainer.scrollTop += scrollVelocity * 16;

  //         animationFrameId = requestAnimationFrame(momentumScroll);
  //       };

  //       animationFrameId = requestAnimationFrame(momentumScroll);
  //     }
  //   };

  //   mainContainer.addEventListener('scroll', handleScroll, { passive: true });
  //   mainContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
  //   mainContainer.addEventListener('touchmove', handleTouchMove, { passive: true });
  //   mainContainer.addEventListener('touchend', handleTouchEnd, { passive: true });

  //   return () => {
  //     mainContainer.removeEventListener('scroll', handleScroll);
  //     mainContainer.removeEventListener('touchstart', handleTouchStart);
  //     mainContainer.removeEventListener('touchmove', handleTouchMove);
  //     mainContainer.removeEventListener('touchend', handleTouchEnd);
  //     if (animationFrameId !== null) {
  //       cancelAnimationFrame(animationFrameId);
  //     }
  //   };
  // }, []);

  // Load presence for the currently active peer in full chat
  useEffect(() => {
    if (!activePeerHandle) {
      setPeerOnline(null);
      setPeerTyping(false);
      setPeerLastSeen(null);
      setShowOfflineTransitionName(false);
      lastOnlineRef.current = null;
      return;
    }

    let cancelled = false;
    let offlineTimeout: NodeJS.Timeout | null = null;

    const fetchPresence = async () => {
      try {
        const cleanPeer = cleanHandle(activePeerHandle);
        const cachedEtag = presenceEtagsRef.current.get(cleanPeer);
        const headers: Record<string, string> = {};
        if (cachedEtag) {
          headers["If-None-Match"] = cachedEtag;
        }

        const res = await fetch(
          `/api/presence/${encodeURIComponent(activePeerHandle)}`,
          { headers }
        );
        if (res.status === 304) {
          // Zero-byte 304 Not Modified: Presence state unchanged
          return;
        }
        if (!res.ok) return;

        const newEtag = res.headers.get("etag");
        if (newEtag) {
          presenceEtagsRef.current.set(cleanPeer, newEtag);
        }

        const data: {
          online?: boolean;
          lastSeenAt?: string | null;
          typing?: boolean;
        } = await res.json();

        if (cancelled) return;

        const prevOnline = lastOnlineRef.current;
        const nowOnline = Boolean(data.online);

        setPeerOnline(nowOnline);
        setPeerTyping(Boolean(data.typing));
        setPeerLastSeen(
          data.lastSeenAt ? new Date(data.lastSeenAt) : null,
        );

        // Handle the short "Chat with @handle" transition when they go offline
        if (prevOnline === null) {
          // first load for this peer
          lastOnlineRef.current = nowOnline;
          setShowOfflineTransitionName(false);
        } else {
          if (prevOnline && !nowOnline) {
            setShowOfflineTransitionName(true);
            if (offlineTimeout) clearTimeout(offlineTimeout);
            offlineTimeout = setTimeout(() => {
              setShowOfflineTransitionName(false);
            }, 3_000);
          }
          lastOnlineRef.current = nowOnline;
        }
      } catch {
        // ignore presence read errors
      }
    };

    const poller = createAdaptivePoller(
      async () => {
        await fetchPresence();
      },
      { baseIntervalMs: 3500, maxIntervalMs: 18000 }
    );
    poller.start();

    return () => {
      cancelled = true;
      poller.stop();
      if (offlineTimeout) clearTimeout(offlineTimeout);
    };
  }, [activePeerHandle]);

  const fetchIdConsolePosts = async () => {
    const cachedPosts = offlineCache.getStale<any[]>(CACHE_KEYS.ID_POSTS);
    if (cachedPosts && cachedPosts.length > 0) {
      const sanitized = cachedPosts.map((p) => {
        if (p.attachmentId === "cmtpyoutj00006yitzg7ufkce" || (p.media && !p.attachmentId)) {
          return { ...p, media: null, attachmentId: null, attachmentKind: null };
        }
        return p;
      });
      setIdConsolePosts(sanitized);
      if (!navigator.onLine) { setIdConsolePostsLoading(false); return; }
    }
    try {
      setIdConsolePostsLoading(true);
      setIdConsolePostsError(null);

      const headers: Record<string, string> = {};
      if (idConsolePostsEtagRef.current && cachedPosts && cachedPosts.length > 0) {
        headers["If-None-Match"] = idConsolePostsEtagRef.current;
      }

      const res = await fetch("/api/posts", { headers });
      if (res.status === 304) {
        // Zero-byte 304: Post feed is 100% unchanged!
        setIdConsolePostsLoading(false);
        return;
      }

      if (!res.ok) {
        if (cachedPosts && cachedPosts.length > 0) { setIdConsolePosts(cachedPosts); setIdConsolePostsError(null); setIdConsolePostsLoading(false); return; }
        const err = await res.json().catch(() => ({} as any));
        const msg = typeof (err as any)?.error === "string" ? (err as any).error : `HTTP ${res.status}`;
        setIdConsolePostsError(`Failed to load posts (${msg})`);
        return;
      }

      const newPostsEtag = res.headers.get("etag");
      if (newPostsEtag) idConsolePostsEtagRef.current = newPostsEtag;

      const data: { posts?: any[] } = await res.json();
      const posts = Array.isArray(data.posts) ? data.posts : [];
      offlineCache.set(CACHE_KEYS.ID_POSTS, posts, CACHE_TTL.ID_POSTS);
      setIdConsolePosts(posts);

      // Prefetch images in background for instant display
      posts.forEach((post: any) => {
        if (post?.attachment?.url && typeof window !== 'undefined') {
          const img = document.createElement('img');
          img.src = post.attachment.url;
        }
        if (post?.author?.image && typeof window !== 'undefined') {
          const img = document.createElement('img');
          img.src = post.author.image;
        }
      });

      // Initialize reaction data for console posts
      if (session?.user) {
        const reactionPromises = posts.map(async (post: any) => {
          await fetchPostReaction(post.id);
        });
        await Promise.all(reactionPromises);
      }
    } catch {
      const stale = offlineCache.getStale<any[]>(CACHE_KEYS.ID_POSTS);
      if (stale && stale.length > 0) { setIdConsolePosts(stale); setIdConsolePostsError(null); }
      else { setIdConsolePostsError("Failed to load posts (network error)"); }
    } finally {
      setIdConsolePostsLoading(false);
    }
  };

  const isDisplayablePost = (p: any) => {
    if (!p) return false;
    const hasText = typeof p?.text === "string" && p.text.trim().length > 0;
    const hasMedia = Boolean(p?.media?.url || p?.attachment?.url || p?.attachmentId);
    return hasText || hasMedia;
  };

  const fetchDirectoryLatestPosts = async () => {
    const cachedPosts = offlineCache.getStale<any[]>(CACHE_KEYS.DIR_POSTS);
    if (cachedPosts && cachedPosts.length > 0) {
      const validCached = cachedPosts.filter(isDisplayablePost);
      setDirectoryGlobalPosts(validCached);
      const byAuthorId: Record<string, any[]> = {};
      for (const p of validCached) {
        if (!p?.authorId) continue;
        const arr = byAuthorId[p.authorId] || [];
        if (arr.length >= 5) continue;
        arr.push(p);
        byAuthorId[p.authorId] = arr;
      }
      setDirectoryLatestPostsByAuthorId(byAuthorId);
      if (!navigator.onLine) {
        setDirectoryPostsLoading(false);
        return;
      }
    }

    try {
      setDirectoryPostsLoading(true);
      setDirectoryPostsError(null);

      const dirHeaders: Record<string, string> = {};
      if (dirPostsEtagRef.current && cachedPosts && cachedPosts.length > 0) {
        dirHeaders["If-None-Match"] = dirPostsEtagRef.current;
      }

      const postsRes = await fetch(
        `/api/posts?mode=directory_global_latest&perAuthor=10`,
        { headers: dirHeaders },
      );

      if (postsRes.status === 304) {
        // Zero-byte 304: Directory posts unchanged!
        setDirectoryPostsLoading(false);
        return;
      }

      if (!postsRes.ok) {
        if (cachedPosts && cachedPosts.length > 0) {
          setDirectoryPostsError(null);
          return;
        }
        const err = await postsRes.json().catch(() => ({} as any));
        const msg =
          typeof (err as any)?.error === "string"
            ? (err as any).error
            : `HTTP ${postsRes.status}`;
        setDirectoryPostsError(`Unable to load global posts (${msg}).`);
        return;
      }

      const newDirEtag = postsRes.headers.get("etag");
      if (newDirEtag) dirPostsEtagRef.current = newDirEtag;
      const postsData: { posts?: any[] } = await postsRes.json();
      const byAuthorId: Record<string, any[]> = {};
      const rawPosts = Array.isArray(postsData.posts) ? postsData.posts : [];
      const posts = rawPosts.filter(isDisplayablePost);
      offlineCache.set(CACHE_KEYS.DIR_POSTS, posts, CACHE_TTL.DIR_POSTS);
      setDirectoryGlobalPosts(posts);

      for (const p of posts) {
        if (!p?.authorId) continue;
        const arr = byAuthorId[p.authorId] || [];
        if (arr.length >= 5) continue;
        arr.push(p);
        byAuthorId[p.authorId] = arr;
      }
      setDirectoryLatestPostsByAuthorId(byAuthorId);

      // Prefetch post attachment images ONLY (skip video streams to prevent browser media cache poisoning)
      posts.forEach((post: any) => {
        const mediaUrl = post?.media?.url || post?.attachment?.url;
        const kind = (post?.media?.kind || post?.attachmentKind || "").toLowerCase();
        if (mediaUrl && (kind === "image" || kind.includes("image")) && typeof window !== "undefined") {
          const img = document.createElement("img");
          img.src = mediaUrl;
        }
      });
    } catch {
      const stale = offlineCache.getStale<any[]>(CACHE_KEYS.DIR_POSTS);
      if (stale && stale.length > 0) {
        setDirectoryPostsError(null);
      } else {
        setDirectoryPostsError("Unable to load global posts (network error).");
      }
    } finally {
      setDirectoryPostsLoading(false);
    }
  };

  // Fetch followers for current user
  const fetchFollowers = async () => {
    if (!(session?.user as any)?.id) return;

    try {
      setFollowersLoading(true);
      setFollowersError(null);

      const res = await fetch('/api/followers');
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        const msg = typeof (err as any)?.error === "string" ? (err as any).error : `HTTP ${res.status}`;
        setFollowersError(`Failed to load followers (${msg})`);
        return;
      }

      const data = await res.json();
      setFollowers(data.followers || []);
    } catch (error) {
      setFollowersError("Failed to load followers (network error)");
    } finally {
      setFollowersLoading(false);
    }
  };

  const handleStoreUpgrade = async (tier: 'DIAMOND' | 'SAPPHIRE' = 'DIAMOND') => {
    if (!(session?.user as any)?.id || isUpgradingStore) return;
    setIsUpgradingStore(true);
    setStoreError(null);
    setStoreSuccessMsg(null);

    const currentPoints = localPointsOverride !== null ? localPointsOverride : ((session?.user as any)?.points || 0);
    const isDiamond = tier === 'DIAMOND';
    const cost = isDiamond ? 100 : 50;

    try {
      const res = await fetch('/api/store/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: (session?.user as any)?.id, tier })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upgrade');
      }

      // 1. Silent Local State Update (0ms lag!)
      setLocalPointsOverride(Math.max(0, currentPoints - cost));
      setLocalBlueTickOverride(tier);
      loadDirectoryData(true);

      // 2. Trigger Bank-like Celestial Receipt popup
      setTransactionNotification({
        show: true,
        type: 'debit',
        amount: cost,
        title: 'Upgrade Successful',
        message: isDiamond 
          ? 'Diamond VIP Upgraded. Spectrum Rainbow Rhombus theme activated!' 
          : 'Sapphire VIP Upgraded. Celestial deep-cobalt theme activated!',
        txHash: 'TX-' + Math.random().toString(36).substring(2, 10).toUpperCase()
      });

      // 3. Silent background session token refresh safely
      if (typeof updateSession === 'function') {
        try {
          updateSession();
        } catch (e) {
          console.error("NextAuth updateSession failed:", e);
        }
      }

      // Auto-hide popup receipt after 3.5 seconds
      setTimeout(() => {
        setTransactionNotification(prev => prev ? { ...prev, show: false } : null);
      }, 8700);

    } catch (err: any) {
      setStoreError(err.message || 'Failed to complete upgrade.');
    } finally {
      setIsUpgradingStore(false);
    }
  };


  const handleStoreDowngrade = async () => {
    if (!(session?.user as any)?.id || isDowngrading) return;
    setIsDowngrading(true);
    setStoreError(null);
    setStoreSuccessMsg(null);
    try {
      const res = await fetch('/api/store/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: (session?.user as any)?.id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to downgrade');
      }

      // 1. Instantly reset local VIP status locally (0ms lag!)
      setLocalBlueTickOverride('NONE');
      loadDirectoryData(true);

      // 2. Trigger Reverted Ledger popup (styled as a debit)
      setTransactionNotification({
        show: true,
        type: 'debit',
        amount: 0,
        title: 'Status Revoked',
        message: 'Sapphire VIP status revoked. Reverted back to standard network user.',
        txHash: 'TX-' + Math.random().toString(36).substring(2, 10).toUpperCase()
      });

      // 3. Silent background session token refresh safely
      if (typeof updateSession === 'function') {
        try {
          updateSession();
        } catch (e) {
          console.error("NextAuth updateSession failed:", e);
        }
      }

      // 4. Close the downgrade confirmation modal
      setShowDowngradeModal(false);

      // Auto-hide popup receipt after 3.5 seconds
      setTimeout(() => {
        setTransactionNotification(prev => prev ? { ...prev, show: false } : null);
      }, 8700);

    } catch (err: any) {
      setStoreError(err.message || 'Failed to complete downgrade.');
    } finally {
      setIsDowngrading(false);
    }
  };

  // Engagement functions
  const handleFollow = async (userId: string) => {
    if (!(session?.user as any)?.id || engagementLoading[userId]?.follow) return;

    // Debug logging
    console.log('handleFollow called with:', {
      targetUserId: userId,
      currentUserId: (session?.user as any)?.id,
      areSame: userId === (session?.user as any)?.id,
      sessionUser: session?.user,
      targetUserType: typeof userId,
      currentUserType: typeof (session?.user as any)?.id
    });

    // Prevent self-follow
    if (userId === (session?.user as any)?.id) {
      console.log('Self-follow prevented');
      return;
    }

    try {
      setEngagementLoading(prev => ({ ...prev, [userId]: { ...prev[userId], follow: true } }));

      const isCurrentlyFollowing = followStatus[userId];

      if (isCurrentlyFollowing) {
        // Unfollow
        const res = await fetch(`/api/follow?followingId=${encodeURIComponent(userId)}`, {
          method: 'DELETE',
        });

        if (res.ok) {
          setFollowStatus(prev => ({ ...prev, [userId]: false }));
        } else {
          const data = await res.json().catch(() => ({}));
          console.error('Unfollow error:', data.error);
        }
      } else {
        // Follow
        const res = await fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followingId: userId }),
        });

        if (res.ok) {
          setFollowStatus(prev => ({ ...prev, [userId]: true }));
          fetchFollowers();
        } else {
          const data = await res.json().catch(() => ({}));
          console.error('Follow error:', data.error);
        }
      }
    } catch (error) {
      console.error('Follow/unfollow error:', error);
    } finally {
      setEngagementLoading(prev => ({ ...prev, [userId]: { ...prev[userId], follow: false } }));
    }
  };

  const handleReaction = async (postId: string, value: number) => {
    if (!(session?.user as any)?.id || engagementLoading[postId]?.reaction) return;

    try {
      setEngagementLoading(prev => ({ ...prev, [postId]: { ...prev[postId], reaction: true } }));

      const currentReaction = postReactions[postId]?.userReaction;
      let action = 'created';

      // Optimistic update
      if (currentReaction === value) {
        // Remove reaction
        setPostReactions(prev => ({
          ...prev,
          [postId]: {
            ...prev[postId],
            likes: prev[postId]?.likes - (value === 1 ? 1 : 0) || 0,
            dislikes: prev[postId]?.dislikes - (value === -1 ? 1 : 0) || 0,
            userReaction: null,
          }
        }));
        action = 'removed';
      } else {
        // Change or add reaction
        setPostReactions(prev => {
          const current = prev[postId] || { likes: 0, dislikes: 0, userReaction: null };
          const newLikes = current.likes + (value === 1 ? 1 : 0) - (current.userReaction === 1 ? 1 : 0);
          const newDislikes = current.dislikes + (value === -1 ? 1 : 0) - (current.userReaction === -1 ? 1 : 0);

          return {
            ...prev,
            [postId]: {
              likes: Math.max(0, newLikes),
              dislikes: Math.max(0, newDislikes),
              userReaction: value,
            }
          };
        });
        action = currentReaction ? 'updated' : 'created';
      }

      const res = await fetch('/api/posts/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, value }),
      });

      if (!res.ok) {
        // Revert optimistic update on error
        const data = await res.json().catch(() => ({}));
        console.error('Reaction error:', data.error);

        // Revert by refetching
        await fetchPostReaction(postId);
      }
    } catch (error) {
      console.error('Reaction error:', error);
      // Revert on error
      await fetchPostReaction(postId);
    } finally {
      setEngagementLoading(prev => ({ ...prev, [postId]: { ...prev[postId], reaction: false } }));
    }
  };

  const fetchPostReaction = async (postId: string) => {
    if (!postId) {
      console.warn('[fetchPostReaction] Invalid postId');
      return;
    }
    try {
      const res = await fetch(`/api/posts/reactions?postId=${encodeURIComponent(postId)}`);
      if (res.ok) {
        const data = await res.json();
        setPostReactions(prev => ({
          ...prev,
          [postId]: {
            likes: data.likes || 0,
            dislikes: data.dislikes || 0,
            userReaction: data.userReaction?.value || null,
          }
        }));
      } else if (res.status !== 404) {
        console.warn('[fetchPostReaction] Failed:', postId, res.status);
      }
    } catch (error) {
      console.error('[fetchPostReaction] Error:', postId, error);
    }
  };

  const fetchComments = async (postId: string) => {
    if (!(session?.user as any)?.id || commentsLoading[postId]) return;

    try {
      setCommentsLoading(prev => ({ ...prev, [postId]: true }));

      const res = await fetch(`/api/posts/comments?postId=${encodeURIComponent(postId)}`);
      if (res.ok) {
        const data = await res.json();
        setPostComments(prev => ({ ...prev, [postId]: data.comments }));
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('Fetch comments error:', data.error);
      }
    } catch (error) {
      console.error('Fetch comments error:', error);
    } finally {
      setCommentsLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  const handleAddComment = async (postId: string) => {
    const text = commentInputs[postId]?.trim();
    if (!(session?.user as any)?.id || !text || engagementLoading[postId]?.comment) return;

    try {
      setEngagementLoading(prev => ({ ...prev, [postId]: { ...prev[postId], comment: true } }));

      const res = await fetch('/api/posts/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, text }),
      });

      if (res.ok) {
        const data = await res.json();
        setPostComments(prev => ({
          ...prev,
          [postId]: [...(prev[postId] || []), data.comment]
        }));
        setCommentInputs(prev => ({ ...prev, [postId]: '' }));

        // Update comment count
        setPostReactions(prev => ({
          ...prev,
          [postId]: {
            ...prev[postId],
            likes: prev[postId]?.likes || 0,
            dislikes: prev[postId]?.dislikes || 0,
            userReaction: prev[postId]?.userReaction || null,
          }
        }));
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('Add comment error:', data.error);
      }
    } catch (error) {
      console.error('Add comment error:', error);
    } finally {
      setEngagementLoading(prev => ({ ...prev, [postId]: { ...prev[postId], comment: false } }));
    }
  };

  // Initialize engagement data when directory loads
  const initializeEngagementData = async (directoryItems: any[]) => {
    if (!(session?.user as any)?.id) return;
    if (!Array.isArray(directoryItems) || directoryItems.length === 0) return;

    const userIds = [...new Set(directoryItems.map(item => item.id).filter(id => Boolean(id) && !id.startsWith("synth_") && !id.startsWith("mock_")))];
    const postIds = directoryItems.flatMap(item => item.posts?.map((post: any) => post.id).filter((id: string) => Boolean(id) && !id.startsWith("synth_") && !id.startsWith("mock_")) || []);

    console.log('[initializeEngagementData] Processing:', { userCount: userIds.length, postCount: postIds.length });

    // Fetch follow status for all users
    const followPromises = userIds.map(async (userId) => {
      try {
        const res = await fetch(`/api/follow?followingId=${encodeURIComponent(userId)}`);
        if (res.ok) {
          const data = await res.json();
          setFollowStatus(prev => ({ ...prev, [userId]: data.isFollowing }));
        } else {
          console.warn('[initializeEngagementData] Follow fetch failed:', userId, res.status);
        }
      } catch (error) {
        console.error('[initializeEngagementData] Follow error:', userId, error);
      }
    });

    // Fetch reaction data for all posts
    const reactionPromises = postIds.map(async (postId) => {
      try {
        await fetchPostReaction(postId);
      } catch (error) {
        console.error('[initializeEngagementData] Reaction error:', postId, error);
      }
    });

    await Promise.all([...followPromises, ...reactionPromises]);
    console.log('[initializeEngagementData] Complete');
  };

  // Console post engagement functions
  const trackPostView = async (postId: string) => {
    if (!(session?.user as any)?.id || viewedPosts.has(postId)) return;

    try {
      await fetch('/api/posts/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });

      setViewedPosts(prev => new Set([...prev, postId]));
    } catch (error) {
      console.error('Error tracking view:', error);
    }
  };

  const fetchConsolePostComments = async (postId: string) => {
    if (!(session?.user as any)?.id || consoleCommentsLoading[postId]) return;

    try {
      setConsoleCommentsLoading(prev => ({ ...prev, [postId]: true }));

      const res = await fetch(`/api/posts/comments?postId=${encodeURIComponent(postId)}`);
      if (res.ok) {
        const data = await res.json();
        setConsolePostComments(prev => ({ ...prev, [postId]: data.comments }));
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('Fetch console comments error:', data.error);
      }
    } catch (error) {
      console.error('Fetch console comments error:', error);
    } finally {
      setConsoleCommentsLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  const handleConsoleAddComment = async (postId: string) => {
    const text = consoleCommentInputs[postId]?.trim();
    if (!(session?.user as any)?.id || !text || engagementLoading[postId]?.comment) return;

    try {
      setEngagementLoading(prev => ({ ...prev, [postId]: { ...prev[postId], comment: true } }));

      const res = await fetch('/api/posts/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, text }),
      });

      if (res.ok) {
        const data = await res.json();
        setConsolePostComments(prev => ({
          ...prev,
          [postId]: [...(prev[postId] || []), data.comment]
        }));
        setConsoleCommentInputs(prev => ({ ...prev, [postId]: '' }));
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('Add console comment error:', data.error);
      }
    } catch (error) {
      console.error('Add console comment error:', error);
    } finally {
      setEngagementLoading(prev => ({ ...prev, [postId]: { ...prev[postId], comment: false } }));
    }
  };

  useEffect(() => {
    if (!showIdConsole) return;
    fetchIdConsolePosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showIdConsole, idConsoleTab]);

  // Preload console data immediately when session is ready (no delay)
  useEffect(() => {
    if (!session?.user) return;
    fetchIdConsolePosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Initialize E2E Encryption Keys on login
  useEffect(() => {
    if (!session?.user) return;

    const setupE2EKeys = async () => {
      try {
        const serverPublicKey = (session.user as any).publicKeyString;
        const serverEncryptedPrivateKey = (session.user as any).encryptedPrivateKey;
        const masterSeed = (session.user as any).e2eMasterSeed;

        const { initE2EKeys, backupPrivateKey } = await import("@/lib/e2e-crypto");
        const publicKeyString = await initE2EKeys(
          serverEncryptedPrivateKey,
          serverPublicKey,
          masterSeed
        );

        if (!publicKeyString) return;

        // Determine if we need to upload a backup or update keys
        const needsPublicKeyUpload = !serverPublicKey || serverPublicKey !== publicKeyString;
        const needsBackupUpload = !serverEncryptedPrivateKey && !!masterSeed;

        if (needsPublicKeyUpload || needsBackupUpload) {
          console.log("[E2E] Syncing keys with the server...");

          let encryptedPrivateKey: string | undefined = undefined;
          if (masterSeed) {
            // Attempt to generate a backup of the private key
            const backupStr = await backupPrivateKey(masterSeed);
            if (backupStr) {
              encryptedPrivateKey = backupStr;
            }
          }

          // Only upload if we have a new public key or if we successfully created a backup
          if (needsPublicKeyUpload || encryptedPrivateKey) {
            const res = await fetch("/api/user/public-key", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                publicKeyString,
                ...(encryptedPrivateKey ? { encryptedPrivateKey } : {})
              }),
            });
            if (res.ok) {
              console.log("[E2E] Keys successfully synced/backed up to the server.");
              if (typeof updateSession === "function") {
                updateSession();
              }
            } else {
              console.warn("[E2E] Failed to sync keys:", res.statusText);
            }
          }
        } else {
          console.log("[E2E] E2E keys and backups are in sync with the server.");
        }
      } catch (err) {
        console.error("[E2E] Setup error:", err);
      }
    };

    setupE2EKeys();
  }, [session?.user, updateSession]);

  // Delayed loading indicator - only show "Loading..." after 300ms to prevent flash
  useEffect(() => {
    if (!idConsolePostsLoading) {
      setShowConsoleLoadingDelayed(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowConsoleLoadingDelayed(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [idConsolePostsLoading]);

  const handleIdConsolePost = async () => {
    if (postingIdConsole) return;

    const text = postTextDraft.trim();
    if (!text && !postMediaFile) {
      setIdConsolePostStatus("Write something or attach media.");
      return;
    }

    try {
      setPostingIdConsole(true);
      setIdConsolePostStatus(null);
      setIdConsoleUploadProgress(null);

      let attachmentId: string | null = null;
      let attachmentKind: "image" | "video" | null = null;

      if (postMediaFile && postMediaKind) {
        const maxBytes = postMediaKind === "video" ? 45 * 1024 * 1024 : 3 * 1024 * 1024;
        if (postMediaFile.size > maxBytes) {
          setIdConsolePostStatus(
            postMediaKind === "video"
              ? "Video too large (max 45MB)."
              : "Image too large (max 3MB).",
          );
          return;
        }

        const uploadMime = postMediaFile.type && postMediaFile.type !== "application/octet-stream"
          ? postMediaFile.type
          : (postMediaKind === "video" ? "video/mp4" : "image/jpeg");

        let signData: any = null;
        try {
          const signRes = await fetch("/api/posts/upload", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestSignedUrl: true,
              kind: postMediaKind,
              filename: postMediaFile.name,
              mimeType: uploadMime,
              size: postMediaFile.size,
            }),
          });

          if (signRes.ok) {
            signData = await signRes.json();
          }
        } catch (signErr) {
          console.warn("[idConsolePost] Sign URL request exception, falling back to direct upload:", signErr);
        }

        let directUploadSuccess = false;

        if (signData?.signedUrl) {
          const { signedUrl, attachment } = signData;
          setIdConsolePostStatus("Uploading…");
          try {
            directUploadSuccess = await new Promise<boolean>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.withCredentials = true;
              xhr.open("PUT", signedUrl);
              xhr.setRequestHeader("Content-Type", uploadMime);
              xhr.upload.onprogress = (e) => {
                if (!e.lengthComputable) return;
                const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
                setIdConsoleUploadProgress(pct);
              };
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve(true);
                } else {
                  reject(new Error("Direct upload failed"));
                }
              };
              xhr.onerror = () => reject(new Error("Direct upload failed"));
              xhr.send(postMediaFile);
            });
            if (directUploadSuccess) {
              attachmentId = attachment?.id || null;
              attachmentKind = attachment?.kind === "video" ? "video" : "image";
            }
          } catch (uploadErr) {
            console.warn("[idConsolePost] XHR PUT upload exception, falling back to multipart:", uploadErr);
          }
        }

        // Automatic Resilient Fallback to Multipart FormData Upload
        if (!directUploadSuccess) {
          setIdConsolePostStatus("Uploading to vault…");
          const formData = new FormData();
          formData.append("kind", postMediaKind);
          formData.append("file", postMediaFile);

          const formRes = await fetch("/api/posts/upload", {
            method: "POST",
            body: formData,
          });

          if (!formRes.ok) {
            const err = await formRes.json().catch(() => ({}));
            setIdConsolePostStatus(err?.error || "Upload failed");
            return;
          }

          const formJson = await formRes.json();
          attachmentId = formJson.attachment?.id || null;
          attachmentKind = formJson.attachment?.kind === "video" ? "video" : "image";
          directUploadSuccess = true;
        }
      }

      setIdConsolePostStatus("Posting…");
      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text ? text.trim() : null,
          audience: postAudience || "GLOBAL",
          attachmentId: attachmentId || null,
          attachmentKind: attachmentKind || null,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        const detailedMsg = err?.details?.[0]?.message || err?.error || "Failed to post";
        setIdConsolePostStatus(detailedMsg);
        return;
      }

      setPostTextDraft("");
      setPostMediaFile(null);
      setPostMediaKind(null);
      setIdConsoleUploadProgress(null);
      if (idConsoleLocalPreviewUrl) {
        try {
          URL.revokeObjectURL(idConsoleLocalPreviewUrl);
        } catch {
          // ignore
        }
      }
      setIdConsoleLocalPreviewUrl(null);
      setIdConsolePostStatus("Posted.");
      await fetchIdConsolePosts();
      if (postAudience === "GLOBAL" || postAudience === "ALL") {
        await fetchDirectoryLatestPosts();
      }
    } catch {
      setIdConsolePostStatus("Failed to post");
    } finally {
      setPostingIdConsole(false);
    }
  };

  const allCategories = [
    "Co-Founder",
    "Brother",
    "C.E.O",
    "Founder",
    "Millionaire",
    "Billionaire",
  ];

  const extendedCategories = [
    "Father",
    "Mother",
    "Brother",
    "Sister",
    "Husband",
    "Wife",
    "Son",
    "Daughter",
    "Grandfather",
    "Grandmother",
    "Uncle",
    "Aunt",
    "Cousin Brother",
    "Cousin Sister",
    "Nephew",
    "Niece",
    "Father-in-law",
    "Mother-in-law",
    "Brother-in-law",
    "Sister-in-law",
    "Son-in-law",
    "Daughter-in-law",
    "Fiancé",
    "Fiancée",
    "Boyfriend",
    "Girlfriend",
    "Partner",
    "Life Partner",
    "Romantic Partner",
    "Crush",
    "Love Interest",
    "Ex-Husband",
    "Ex-Wife",
    "Ex-Boyfriend",
    "Ex-Girlfriend",
    "Friend",
    "Best Friend",
    "Close Friend",
    "Childhood Friend",
    "School Friend",
    "College Friend",
    "Online Friend",
    "Guardian",
    "Caretaker",
    "Foster Parent",
    "Foster Child",
    "Adoptive Father",
    "Adoptive Mother",
    "Adopted Son",
    "Adopted Daughter",
    "Boss",
    "Manager",
    "Employee",
    "Colleague",
    "Team Member",
    "Client",
    "Customer",
    "Business Partner",
    "Co-Founder",
    "Investor",
    "Mentor",
    "Advisor",
    "Neighbor",
    "Acquaintance",
    "Stranger",
    "Enemy",
    "Rival",
    "Ex-Friend",
    "Follower",
    "Subscriber",
    "Community Member",
  ];

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [isCustomRoleOpen, setIsCustomRoleOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);

  const [authTakingLong, setAuthTakingLong] = useState(false);

  // Debug: track settings visibility
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[Settings] showSettings changed:", showSettings);
    if (!showSettings) {
      // Reset animation state after animation completes
      setTimeout(() => setIsSettingsAnimating(false), 400);
    }
  }, [showSettings]);

  // Reset console animation state
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[Console] showDirectory changed:", showDirectory, "isConsoleAnimating:", isConsoleAnimating);
    if (!showDirectory) {
      // Reset animation state after exit animation completes (600ms)
      setTimeout(() => setIsConsoleAnimating(false), 600);
    }
  }, [showDirectory]);

  // Reset VIP Terms animation state
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[VIP Terms] showVipTerms changed:", showVipTerms);
    if (!showVipTerms) {
      // Reset animation state after animation completes
      setTimeout(() => setIsVipTermsAnimating(false), 400);
    }
  }, [showVipTerms]);

  useEffect(() => {
    setCanUseDom(true);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("qc_email_visibility");
      if (stored === "public" || stored === "private") {
        setEmailVisibility(stored);
      }

      const storedAge = localStorage.getItem("qc_age_visibility");
      if (storedAge === "public" || storedAge === "private") {
        setAgeVisibility(storedAge);
      }

      const storedGender = localStorage.getItem("qc_gender_visibility");
      if (storedGender === "public" || storedGender === "private") {
        setGenderVisibility(storedGender);
      }

      const storedBio = localStorage.getItem("qc_bio_visibility");
      if (storedBio === "public" || storedBio === "private") {
        setBioVisibility(storedBio);
      }

      const storedInterests = localStorage.getItem("qc_interests_visibility");
      if (storedInterests === "public" || storedInterests === "private") {
        setInterestsVisibility(storedInterests);
      }
    } catch {
      // ignore storage read issues
    }
  }, []);

  // Aura color function
  const getAuraColor = (percentage: number) => {
    if (percentage === 0) return 'text-gray-400';
    if (percentage === 50) return 'text-orange-400';
    if (percentage === 100) return 'text-orange-300';
    if (percentage === 1000) return 'text-green-400';
    if (percentage === 10500) return 'text-red-400';
    if (percentage === 999999) return 'text-red-600';
    // Handle ranges for other values
    if (percentage > 0 && percentage < 50) return 'text-gray-300';
    if (percentage > 50 && percentage < 100) return 'text-orange-400';
    if (percentage > 100 && percentage < 1000) return 'text-orange-300';
    if (percentage > 1000 && percentage < 10500) return 'text-green-400';
    if (percentage > 10500 && percentage < 999999) return 'text-red-400';
    return 'text-gray-400';
  };

  useEffect(() => {
    try {
      localStorage.setItem("qc_email_visibility", emailVisibility);
      localStorage.setItem("qc_age_visibility", ageVisibility);
      localStorage.setItem("qc_gender_visibility", genderVisibility);
      localStorage.setItem("qc_bio_visibility", bioVisibility);
      localStorage.setItem("qc_interests_visibility", interestsVisibility);
    } catch {
      // ignore storage write issues
    }
  }, [emailVisibility, ageVisibility, genderVisibility, bioVisibility, interestsVisibility]);

  // Attachments: quick menu + upload status
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isHoveringAttach, setIsHoveringAttach] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);

  // Image preview + cropping before upload (for image attachments)
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const isSendingImageRef = useRef(false);
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] = useState<string | null>(null);
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any | null>(null);

  // Message Context Menu state & touch long-press tracking
  const [detailModalMessage, setDetailModalMessage] = useState<ChatMessage | null>(null);
  const [reactionModalMessage, setReactionModalMessage] = useState<ChatMessage | null>(null);
  const [emojiPickerTargetMessageId, setEmojiPickerTargetMessageId] = useState<string | null>(null);
  const [showE2EHelp, setShowE2EHelp] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
    isMe: boolean;
    content: string;
  } | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartedRef = useRef<boolean>(false);

  // Message Multi-Selection states
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());

  const prevPendingImageUrlRef = useRef<string | null>(null);
  const prevPeerHandleRef = useRef<string | null>(null);

  // Smart Chat Scroll State Tracking:
  // Prevents unwanted automatic scroll-down when user has scrolled up to read older messages
  const isUserScrolledUpRef = useRef<boolean>(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const lastMessagesLengthRef = useRef<number>(0);
  const initialScrollDoneRef = useRef<string | null>(null);

  // Smart scroll to bottom helper
  const scrollToBottom = useCallback((smooth = false) => {
    if (chatScrollRef.current) {
      if (smooth) {
        chatScrollRef.current.scrollTo({
          top: chatScrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      } else {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
      isUserScrolledUpRef.current = false;
    }
  }, []);

  // Listen to user scroll movements in chat container
  const handleChatContainerScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If distance from bottom is greater than 80px, user is deliberately reading older messages
    isUserScrolledUpRef.current = distanceFromBottom > 80;
  }, []);

  // Auto-scroll when peer starts typing if user is near bottom (WhatsApp standard)
  useEffect(() => {
    if (peerTyping && !isUserScrolledUpRef.current) {
      scrollToBottom(true);
    }
  }, [peerTyping, scrollToBottom]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;

    const peer = activePeerHandle;
    if (!peer) {
      initialScrollDoneRef.current = null;
      lastMessageIdRef.current = null;
      lastMessagesLengthRef.current = 0;
      isUserScrolledUpRef.current = false;
      return;
    }

    // 1. Initial load when opening chat with a peer or switching peers -> always scroll to bottom
    if (initialScrollDoneRef.current !== peer && chatMessages.length > 0) {
      initialScrollDoneRef.current = peer;
      isUserScrolledUpRef.current = false;
      lastMessagesLengthRef.current = chatMessages.length;
      lastMessageIdRef.current = chatMessages[chatMessages.length - 1]?.id || null;

      scrollToBottom();
      const t1 = setTimeout(() => scrollToBottom(), 50);
      const t2 = setTimeout(() => scrollToBottom(), 150);
      const t3 = setTimeout(() => scrollToBottom(), 350);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }

    // 2. Handling new incoming or outgoing messages
    if (chatMessages.length > 0) {
      const lastMessage = chatMessages[chatMessages.length - 1];
      const isNewMessage =
        lastMessage &&
        (lastMessage.id !== lastMessageIdRef.current || chatMessages.length > lastMessagesLengthRef.current);

      const meId = (session?.user as any)?.id as string | undefined;
      const sentByMe = Boolean(meId && lastMessage?.senderId === meId);

      if (isNewMessage) {
        lastMessageIdRef.current = lastMessage.id;
        lastMessagesLengthRef.current = chatMessages.length;

        if (sentByMe) {
          // User sent a message -> force scroll to bottom
          isUserScrolledUpRef.current = false;
          scrollToBottom();
          const t = setTimeout(() => scrollToBottom(), 60);
          return () => clearTimeout(t);
        } else if (!isUserScrolledUpRef.current) {
          // Incoming message from peer AND user is already at the bottom -> smooth scroll to bottom
          scrollToBottom(true);
          const t = setTimeout(() => scrollToBottom(), 60);
          return () => clearTimeout(t);
        }
        // IF USER HAS SCROLLED UP (isUserScrolledUpRef.current === true) -> DO NOT FORCE SCROLL! Preserve user reading position!
      } else {
        // Just polling refresh / tick delivery status update / read receipt update -> do NOT jump or scroll!
        lastMessageIdRef.current = lastMessage?.id || null;
        lastMessagesLengthRef.current = chatMessages.length;
      }
    }
  }, [chatMessages, pendingImagePreviewUrl, activePeerHandle, session?.user, scrollToBottom]);

  const handleAttachButtonClick = () => {
    if (!activePeerHandle || isUploadingAttachment) return;
    setAttachmentError(null);
    if (fileInputRef.current) {
      try {
        fileInputRef.current.value = "";
      } catch { }
      fileInputRef.current.click();
    }
  };

  const handleChooseAttachmentKind = (kind: "file" | "video" | "image_video") => {
    if (!activePeerHandle) return;
    const ref = kind === "video" ? videoInputRef : kind === "image_video" ? imageVideoInputRef : fileInputRef;
    if (ref.current) {
      try {
        ref.current.value = "";
      } catch {
        // ignore reset issues
      }
      ref.current.click();
    }
    setShowAttachMenu(false);
  };

  // High-Fidelity Voice Recording Helpers & Core Engine
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = async () => {
    if (!activePeerHandle) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];

      // Determine industry-standard mime-types based on platform support (Chrome/iOS compatibility)
      let options = {};
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options = { mimeType: "audio/webm;codecs=opus" };
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options = { mimeType: "audio/mp4" };
      }

      const recorder = new MediaRecorder(stream, options);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      setAudioChunks([]);
      setRecordingDuration(0);
      setIsRecording(true);
      setMediaRecorder(recorder);

      recorder.start(250); // Capture chunk data every 250ms for performance safety

      const timer = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      setRecordingTimer(timer);

      // Bind dynamic capture to stream chunk ref closure
      (recorder as any)._localChunks = chunks;

    } catch (err) {
      console.error("Microphone hardware error or permission denied:", err);
      alert("Could not access your microphone. Please enable microphone permissions in your browser's site settings.");
    }
  };

  const stopRecording = async (shouldSend: boolean) => {
    if (!mediaRecorder) return;

    if (recordingTimer) {
      clearInterval(recordingTimer);
      setRecordingTimer(null);
    }

    setIsRecording(false);

    const recorderWithChunks = mediaRecorder as any;
    const capturedChunks = recorderWithChunks._localChunks || [];

    mediaRecorder.onstop = async () => {
      // Release microphone hardware tracks immediately
      const stream = mediaRecorder.stream;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (!shouldSend) {
        setAudioChunks([]);
        setRecordingDuration(0);
        setMediaRecorder(null);
        return;
      }

      const mimeType = mediaRecorder.mimeType || "audio/webm";
      const audioBlob = new Blob(capturedChunks, { type: mimeType });

      if (audioBlob.size === 0) {
        alert("Audio clip was empty. Please record again.");
        setAudioChunks([]);
        setRecordingDuration(0);
        setMediaRecorder(null);
        return;
      }

      const fileExtension = mimeType.includes("mp4") ? "mp4" : "webm";
      const audioFile = new File(
        [audioBlob],
        `voice-message-${Date.now()}.${fileExtension}`,
        { type: mimeType }
      );

      setIsUploadingAttachment(true);
      setAttachmentError(null);

      try {
        const formData = new FormData();
        formData.append("file", audioFile);
        formData.append("kind", "file");
        formData.append("toHandle", activePeerHandle!);

        const res = await fetch("/api/attachments/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setAttachmentError(data.error || "Failed to upload voice message.");
          return;
        }

        if (data.message) {
          const fullMessage = {
            ...data.message,
            attachments: data.attachment
              ? [
                {
                  ...data.attachment,
                  sizeBytes: String(data.attachment.size),
                },
              ]
              : [],
          };
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === fullMessage.id)) return prev;
            return [...prev, fullMessage as ChatMessage];
          });

          setTimeout(() => {
            if (chatScrollRef.current) {
              chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
            }
          }, 100);
        }
      } catch (uploadErr) {
        console.error("Voice message upload error:", uploadErr);
        setAttachmentError("Connection lost. Failed to send voice message.");
      } finally {
        setIsUploadingAttachment(false);
        setAudioChunks([]);
        setRecordingDuration(0);
        setMediaRecorder(null);
      }
    };

    mediaRecorder.stop();
  };

  const handleTypingPing = useCallback(() => {
    if (!activePeerHandle) return;
    fetch("/api/presence/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toHandle: activePeerHandle, typing: true }),
    }).catch(() => {});

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      fetch("/api/presence/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toHandle: activePeerHandle, typing: false }),
      }).catch(() => {});
    }, 3500);
  }, [activePeerHandle]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!activePeerHandle) return;

    // Handle Edit Mode
    if (editingMessage) {
      const editId = editingMessage.id;
      setEditingMessage(null);
      const nowIso = new Date().toISOString();

      // Instant optimistic update in local message state
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === editId
            ? { ...m, content: text, isEdited: true, editedAt: nowIso }
            : m
        )
      );

      // Perform background server update
      try {
        let payloadText = text;
        if (isE2EEnabled && activePeerPublicKey) {
          try {
            const { encryptMessage } = await import("@/lib/e2e-crypto");
            payloadText = await encryptMessage(text, activePeerPublicKey);
          } catch (err) {
            console.error("[E2E] Encryption failed before edit:", err);
          }
        }

        const res = await fetch("/api/chat/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId: editId,
            content: payloadText,
          }),
        });

        if (!res.ok) {
          console.warn("[Edit Message] Server error status:", res.status);
        }
      } catch (err) {
        console.error("[Edit Message] Network error:", err);
      }
      return;
    }

    const tempId = "temp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);
    const meId = (session?.user as any)?.id;

    const optimisticMsg: ChatMessage = {
      id: tempId,
      content: text,
      createdAt: new Date().toISOString(),
      senderId: meId || "me",
      isEncrypted: isE2EEnabled,
      status: "PENDING", // Tech-giant standard: queued in outbox as PENDING
    };

    // Invalidate cached ETag to guarantee fresh sync on next poll cycle
    chatEtagsRef.current.delete(cleanHandle(activePeerHandle));

    // Queue in persistent Outbox
    outboxQueue.enqueue({
      tempId,
      toHandle: activePeerHandle,
      content: text,
      createdAt: optimisticMsg.createdAt,
      isEncrypted: isE2EEnabled,
      status: "PENDING",
    });

    // 1. Instant optimistic UI dispatch (0ms latency feel!)
    setChatMessages((prev) => [...prev, optimisticMsg]);

    // Scroll to bottom immediately
    setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 10);

    // Corporate tech-giant standard: If offline, keep message as PENDING in Outbox (clock icon 🕒)
    // As soon as network reconnects, online listener will auto-flush it to server!
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    // 2. Perform background encryption & server sync asynchronously
    try {
      let payloadText = text;
      if (isE2EEnabled && activePeerPublicKey) {
        try {
          const { encryptMessage } = await import("@/lib/e2e-crypto");
          payloadText = await encryptMessage(text, activePeerPublicKey);
        } catch (err) {
          console.error("[E2E] Encryption failed before send:", err);
        }
      }

      const res = await fetchWithRetry("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toHandle: activePeerHandle,
          content: payloadText,
        }),
      }, { maxRetries: 2, baseDelayMs: 600 });

      if (!res.ok) {
        outboxQueue.markStatus(tempId, "FAILED", `HTTP ${res.status}`);
        setChatMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "FAILED" } : m))
        );
      } else {
        const data = await res.json();
        if (data?.message) {
          outboxQueue.dequeue(tempId);
          setChatMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...data.message, content: text, status: "SENT" } : m))
          );
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      outboxQueue.markStatus(tempId, "FAILED", msg);
      setChatMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "FAILED" } : m))
      );
    }
  }, [activePeerHandle, activePeerPublicKey, session?.user, isE2EEnabled, editingMessage]);

  // Outbox Auto-Flush on network reconnection & manual retry
  const handleRetryMessage = useCallback(async (tempId: string) => {
    const msg = chatMessages.find((m) => m.id === tempId);
    if (!msg || !activePeerHandle) return;

    setChatMessages((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, status: "PENDING" } : m))
    );
    outboxQueue.markStatus(tempId, "PENDING");

    let payloadText = msg.content;
    if (isE2EEnabled && activePeerPublicKey) {
      try {
        const { encryptMessage } = await import("@/lib/e2e-crypto");
        payloadText = await encryptMessage(msg.content, activePeerPublicKey);
      } catch (err) {
        console.error("[E2E] Encryption failed on retry:", err);
      }
    }

    try {
      const res = await fetchWithRetry("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toHandle: activePeerHandle,
          content: payloadText,
        }),
      }, { maxRetries: 2, baseDelayMs: 600 });

      if (res.ok) {
        const data = await res.json();
        if (data?.message) {
          outboxQueue.dequeue(tempId);
          setChatMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...data.message, content: msg.content, status: "SENT" } : m))
          );
        }
      } else {
        outboxQueue.markStatus(tempId, "FAILED");
        setChatMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "FAILED" } : m))
        );
      }
    } catch {
      outboxQueue.markStatus(tempId, "FAILED");
      setChatMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "FAILED" } : m))
      );
    }
  }, [chatMessages, activePeerHandle, isE2EEnabled, activePeerPublicKey]);

  // Auto-flush outbox queue whenever network reconnects
  useEffect(() => {
    const handleOnlineFlush = async () => {
      await outboxQueue.flush(async (item) => {
        let payloadText = item.content;
        if (item.isEncrypted && activePeerPublicKey) {
          try {
            const { encryptMessage } = await import("@/lib/e2e-crypto");
            payloadText = await encryptMessage(item.content, activePeerPublicKey);
          } catch {}
        }
        try {
          const res = await fetch("/api/chat/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toHandle: item.toHandle, content: payloadText }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.message) {
              if (activePeerHandle && areHandlesEqual(activePeerHandle, item.toHandle)) {
                setChatMessages((prev) =>
                  prev.map((m) =>
                    m.id === item.tempId
                      ? { ...data.message, content: item.content, status: "SENT" }
                      : m
                  )
                );
              }
              return true;
            }
          }
        } catch {}
        return false;
      });
    };

    const handleOnlineRecovery = async () => {
      // 1. Wipe any transient error banners immediately
      setChatError(null);
      setSearchError(null);

      // 2. Flush Outbox FIRST so pending messages reach the server DB before history re-fetch
      await handleOnlineFlush();

      // 3. Re-sync active conversation silently from server history
      if (activePeerHandle) {
        await openChatWithPeer(activePeerHandle);
      }
    };

    window.addEventListener("online", handleOnlineRecovery);
    return () => window.removeEventListener("online", handleOnlineRecovery);
  }, [activePeerHandle, activePeerPublicKey]);

  const processSelectedFile = async (
    selected: File,
    kind: "file" | "video" | "image_video",
  ) => {
    if (!activePeerHandle) return;

    // Detect actual target upload kind based on selection
    let targetKind: "file" | "video" | "image" = "file";
    if (kind === "image_video") {
      if (selected.type.startsWith("image/")) {
        targetKind = "image";
      } else if (selected.type.startsWith("video/")) {
        targetKind = "video";
      }
    } else {
      targetKind = selected.type.startsWith("image/")
        ? "image"
        : selected.type.startsWith("video/")
        ? "video"
        : (kind as any);
    }

    // If this is an image, show preview with Send / Edit instead of uploading immediately.
    if (targetKind === "image" || selected.type.startsWith("image/")) {
      if (pendingImagePreviewUrl) {
        try {
          URL.revokeObjectURL(pendingImagePreviewUrl);
        } catch {
          // ignore
        }
      }
      const url = URL.createObjectURL(selected);
      setPendingImageFile(selected);
      setPendingImagePreviewUrl(url);
      setIsEditingImage(false);
      setAttachmentError(null);
      setShowAttachMenu(false);
      return;
    }

    // Non-image files or videos: support direct-to-cloud signed and chunked uploads up to 45MB
    const MAX_UPLOAD_LIMIT = 45 * 1024 * 1024; // 45MB limit (aligned with Supabase ceiling)
    if (selected.size > MAX_UPLOAD_LIMIT) {
      setAttachmentError(`File is too large (${(selected.size / (1024 * 1024)).toFixed(1)}MB). Maximum limit is 45MB.`);
      return;
    }

    setIsUploadingAttachment(true);
    setUploadProgressText("Preparing upload…");
    setAttachmentError(null);

    try {
      // 1. Fast Path for small files <= 3.5MB: use single multipart upload
      if (selected.size <= 3.5 * 1024 * 1024 && targetKind !== "video") {
        const formData = new FormData();
        formData.append("file", selected);
        formData.append("kind", targetKind);
        formData.append("toHandle", activePeerHandle);

        const res = await fetch("/api/attachments/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Unable to upload attachment.");
        }

        if (data.message) {
          const fullMessage = {
            ...data.message,
            attachments: data.attachment
              ? [
                {
                  ...data.attachment,
                  sizeBytes: String(data.attachment.size),
                },
              ]
              : [],
          };
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === fullMessage.id)) return prev;
            return [...prev, fullMessage as ChatMessage];
          });
        }
        return;
      }

      // 2. Large files / Videos (> 3.5MB or video):
      // Check if Direct Supabase Signed Upload is available
      let signedUploadSuccess = false;
      try {
        const signRes = await fetch("/api/attachments/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestSignedUrl: true,
            toHandle: activePeerHandle,
            filename: selected.name,
            mimeType: selected.type,
            size: selected.size,
            kind: targetKind,
          }),
        });

        const signData = await signRes.json().catch(() => ({}));
        if (signRes.ok && signData.mode === "supabase" && signData.signedUrl) {
          // Direct XHR upload to Supabase CDN (bypasses Vercel entirely)
          setUploadProgressText("Uploading to cloud…");
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", signData.signedUrl);
            xhr.setRequestHeader("Content-Type", selected.type || "application/octet-stream");
            xhr.upload.onprogress = (evt) => {
              if (evt.lengthComputable) {
                const percent = Math.round((evt.loaded / evt.total) * 100);
                setUploadProgressText(`Uploading ${targetKind === "video" ? "video" : "file"} (${percent}%)…`);
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`Signed upload status: ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error("Network error during signed upload"));
            xhr.send(selected);
          });

          // Notify server that upload completed
          setUploadProgressText("Finalizing message…");
          const completeRes = await fetch("/api/attachments/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              uploadComplete: true,
              toHandle: activePeerHandle,
              kind: targetKind,
              filename: selected.name,
              mimeType: selected.type,
              size: selected.size,
              bucket: signData.bucket,
              objectKey: signData.objectKey,
            }),
          });

          const completeData = await completeRes.json().catch(() => ({}));
          if (!completeRes.ok) {
            throw new Error(completeData.error || "Failed to finalize attachment.");
          }

          if (completeData.message) {
            const fullMessage = {
              ...completeData.message,
              attachments: completeData.attachment
                ? [
                  {
                    ...completeData.attachment,
                    sizeBytes: String(completeData.attachment.size),
                  },
                ]
                : [],
            };
            setChatMessages((prev) => {
              if (prev.some((m) => m.id === fullMessage.id)) return prev;
              return [...prev, fullMessage as ChatMessage];
            });
          }
          signedUploadSuccess = true;
        }
      } catch (signErr) {
        console.warn("[upload] Signed direct upload note, switching to resilient chunked vault:", signErr);
      }

      if (signedUploadSuccess) return;

      // 3. Resilient Chunked Vault Flow: Slices file into 2.5MB pieces to safely bypass Vercel 4.5MB ceiling
      setUploadProgressText("Initializing resilient upload…");
      const initRes = await fetch("/api/attachments/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initChunked: true,
          toHandle: activePeerHandle,
          filename: selected.name,
          mimeType: selected.type,
          size: selected.size,
          kind: targetKind,
        }),
      });

      const initData = await initRes.json().catch(() => ({}));
      if (!initRes.ok || !initData.uploadId) {
        throw new Error(initData.error || "Failed to initialize upload session.");
      }

      const uploadId = initData.uploadId;
      const chunkSize = initData.chunkSize || 2359296; // 2.25MB (exact multiple of 3 for bit-perfect Base64)
      const totalChunks = Math.ceil(selected.size / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(selected.size, start + chunkSize);
        const chunkBlob = selected.slice(start, end);

        // Convert slice to base64
        const chunkBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const resStr = reader.result as string;
            let b64 = resStr.includes(",") ? resStr.split(",")[1] : resStr;
            // Intermediate chunks of exact multiple of 3 should have zero padding
            if (i < totalChunks - 1) {
              b64 = b64.replace(/=+$/, "");
            }
            resolve(b64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(chunkBlob);
        });

        const percent = Math.round(((i + 1) / totalChunks) * 100);
        setUploadProgressText(`Uploading ${targetKind === "video" ? "video" : "file"} (${percent}%)…`);

        const chunkRes = await fetch("/api/attachments/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadChunk: true,
            uploadId,
            chunkIndex: i,
            data: chunkBase64,
          }),
        });

        if (!chunkRes.ok) {
          const chunkErrData = await chunkRes.json().catch(() => ({}));
          throw new Error(chunkErrData.error || `Chunk ${i + 1}/${totalChunks} upload failed.`);
        }
      }

      // Complete Chunked Upload with dynamic engaging titles
      const peerNameTag = activePeerHandle ? `@${activePeerHandle}` : "peer";
      const processingStages = [
        "Processing & stitching frames…",
        "Encrypting with Quantum Key…",
        "Securing zero-knowledge vault…",
        `Delivering to ${peerNameTag}…`,
      ];
      let stageIdx = 0;
      setUploadProgressText(processingStages[0]);
      const stageTimer = setInterval(() => {
        stageIdx = (stageIdx + 1) % processingStages.length;
        setUploadProgressText(processingStages[stageIdx]);
      }, 1200);

      try {
        const finishRes = await fetch("/api/attachments/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completeChunked: true,
            uploadId,
            toHandle: activePeerHandle,
            filename: selected.name,
            mimeType: selected.type,
            size: selected.size,
            kind: targetKind,
          }),
        });

        const finishData = await finishRes.json().catch(() => ({}));
        if (!finishRes.ok) {
          throw new Error(finishData.error || "Failed to complete upload.");
        }

        if (finishData.message) {
          const fullMessage = {
            ...finishData.message,
            attachments: finishData.attachment
              ? [
                {
                  ...finishData.attachment,
                  sizeBytes: String(finishData.attachment.size),
                },
              ]
              : [],
          };
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === fullMessage.id)) return prev;
            return [...prev, fullMessage as ChatMessage];
          });
        }
      } finally {
        clearInterval(stageTimer);
      }
    } catch (err: any) {
      console.error("[upload] Upload error:", err);
      setAttachmentError(err?.message || "Unable to upload attachment. Please try again.");
    } finally {
      setIsUploadingAttachment(false);
      setUploadProgressText(null);
    }
  };

  const handleAttachmentSelected = async (
    e: ChangeEvent<HTMLInputElement>,
    kind: "file" | "video" | "image_video",
  ) => {
    const selected = e.target.files?.[0];
    if (!selected || !activePeerHandle) return;

    await processSelectedFile(selected, kind);

    try {
      e.target.value = "";
    } catch {
      // ignore reset issues
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!activePeerHandle) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!activePeerHandle) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDraggingFile(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!activePeerHandle) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!activePeerHandle) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      await processSelectedFile(file, "image_video");
    }
  };

  const handlePasteFile = useCallback(
    async (file: File) => {
      if (!activePeerHandle) return;
      await processSelectedFile(file, "image_video");
    },
    [activePeerHandle, pendingImagePreviewUrl]
  );

  const handleSendPendingImage = async () => {
    if (!pendingImageFile || !activePeerHandle || isSendingImageRef.current || isUploadingAttachment) return;

    isSendingImageRef.current = true;
    setIsUploadingAttachment(true);
    setAttachmentError(null);

    const fileToSend = pendingImageFile;

    // Clear preview state immediately to prevent duplicate clicks/submits
    if (pendingImagePreviewUrl) {
      try {
        URL.revokeObjectURL(pendingImagePreviewUrl);
      } catch {
        // ignore
      }
    }
    setPendingImageFile(null);
    setPendingImagePreviewUrl(null);
    setIsEditingImage(false);

    try {
      const compressedFile = await compressImage(fileToSend);
      const formData = new FormData();
      formData.append("file", compressedFile);
      formData.append("kind", "image");
      formData.append("toHandle", activePeerHandle);

      const res = await fetch("/api/attachments/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 413) {
          setAttachmentError("File is too large to upload. Vercel server limit is 4.5MB.");
          return;
        }
        setAttachmentError(data.error || "Unable to upload attachment.");
        return;
      }

      if (data.message) {
        const fullMessage = {
          ...data.message,
          attachments: data.attachment
            ? [
              {
                ...data.attachment,
                sizeBytes: String(data.attachment.size),
              },
            ]
            : [],
        };
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === fullMessage.id)) return prev;
          return [...prev, fullMessage as ChatMessage];
        });
      }
    } catch {
      setAttachmentError("Unable to upload attachment. Please try again.");
    } finally {
      setIsUploadingAttachment(false);
      isSendingImageRef.current = false;
    }
  };

  // Chat message context menu & long-press event handlers
  const handleMessageContextMenu = (
    e: React.MouseEvent,
    messageId: string,
    isMe: boolean,
    content: string
  ) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      messageId,
      isMe,
      content,
    });
  };

  const handleMessageTouchStart = (
    e: React.TouchEvent,
    messageId: string,
    isMe: boolean,
    content: string
  ) => {
    touchStartedRef.current = true;
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    touchTimerRef.current = setTimeout(() => {
      if (touchStartedRef.current) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(50);
        }
        setContextMenu({
          x: clientX,
          y: clientY,
          messageId,
          isMe,
          content,
        });
      }
    }, 600);
  };

  const handleMessageTouchEnd = () => {
    touchStartedRef.current = false;
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleMessageTouchMove = () => {
    touchStartedRef.current = false;
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleUndoDelete = useCallback(() => {
    setPendingDelete((current) => {
      if (!current) return null;
      clearTimeout(current.timerId);
      // Restore message to active state in correct chronological sort
      setChatMessages((prev) => {
        const restored = [...prev, current.message];
        return restored.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
      return null;
    });
  }, []);

  const handleDismissDelete = useCallback(() => {
    setPendingDelete((current) => {
      if (!current) return null;
      clearTimeout(current.timerId);
      // Commit permanent server deletion
      fetch("/api/chat/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: current.messageId }),
      }).catch((err) => console.error("[Delete Message] Commit error:", err));
      return null;
    });
  }, []);

  const handleDeleteMessage = useCallback((messageId: string) => {
    setContextMenu(null);
    const targetMsg = chatMessages.find((m) => m.id === messageId);
    if (!targetMsg) return;

    // 1. Optimistically hide from UI view (0ms latency feel)
    setChatMessages((prev) => prev.filter((m) => m.id !== messageId));

    // 2. If there is already a pending delete waiting, commit it immediately
    setPendingDelete((current) => {
      if (current) {
        clearTimeout(current.timerId);
        fetch("/api/chat/delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: current.messageId }),
        }).catch((err) => console.error("[Delete Message] Commit error:", err));
      }

      // 3. Stage 5-second undo timer
      const timerId = setTimeout(async () => {
        try {
          await fetch("/api/chat/delete", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId }),
          });
        } catch (err) {
          console.error("[Delete Message] Server delete failed:", err);
        } finally {
          setPendingDelete(null);
        }
      }, 5000);

      return { messageId, message: targetMsg, timerId };
    });
  }, [chatMessages]);

  const handleToggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!messageId || !emoji) return;
    const currentUserId = (session?.user as any)?.id as string;
    if (!currentUserId) return;

    const currentUserName = (session?.user as any)?.name || (session?.user as any)?.handle || "You";
    const currentUserHandle = (session?.user as any)?.handle || "user";
    const currentUserImage = (session?.user as any)?.image || null;

    // 1. Optimistic Update (0ms instant response)
    setChatMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        const existingReactions = [...(msg.reactions || [])];
        const existingIndex = existingReactions.findIndex((r) => r.userId === currentUserId);
        const trimmedEmoji = emoji.trim();

        if (existingIndex > -1) {
          if (existingReactions[existingIndex].emoji === trimmedEmoji) {
            // Toggle OFF (remove)
            existingReactions.splice(existingIndex, 1);
          } else {
            // Replace with new emoji
            existingReactions[existingIndex] = {
              ...existingReactions[existingIndex],
              emoji: trimmedEmoji,
              createdAt: new Date().toISOString(),
            };
          }
        } else {
          // Add new reaction
          existingReactions.push({
            emoji: trimmedEmoji,
            userId: currentUserId,
            userHandle: currentUserHandle,
            userName: currentUserName,
            userImage: currentUserImage,
            createdAt: new Date().toISOString(),
          });
        }
        return { ...msg, reactions: existingReactions };
      })
    );

    // Also update reactionModalMessage if open
    setReactionModalMessage((curr) => {
      if (!curr || curr.id !== messageId) return curr;
      const existingReactions = [...(curr.reactions || [])];
      const existingIndex = existingReactions.findIndex((r) => r.userId === currentUserId);
      const trimmedEmoji = emoji.trim();

      if (existingIndex > -1) {
        if (existingReactions[existingIndex].emoji === trimmedEmoji) {
          existingReactions.splice(existingIndex, 1);
        } else {
          existingReactions[existingIndex] = {
            ...existingReactions[existingIndex],
            emoji: trimmedEmoji,
            createdAt: new Date().toISOString(),
          };
        }
      } else {
        existingReactions.push({
          emoji: trimmedEmoji,
          userId: currentUserId,
          userHandle: currentUserHandle,
          userName: currentUserName,
          userImage: currentUserImage,
          createdAt: new Date().toISOString(),
        });
      }
      return { ...curr, reactions: existingReactions };
    });

    // 2. Dispatch to server
    try {
      const res = await fetch("/api/chat/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji: emoji.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reactions) {
          setChatMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId ? { ...msg, reactions: data.reactions } : msg
            )
          );
          setReactionModalMessage((curr) =>
            curr && curr.id === messageId ? { ...curr, reactions: data.reactions } : curr
          );
        }
      }
    } catch (err) {
      console.error("[Reaction] Failed to sync reaction with server:", err);
    }
  }, [session]);

  const handleRemoveReaction = useCallback(async (messageId: string) => {
    if (!messageId) return;
    const currentUserId = (session?.user as any)?.id as string;
    if (!currentUserId) return;

    // 1. Optimistic removal
    setChatMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        const filtered = (msg.reactions || []).filter((r) => r.userId !== currentUserId);
        return { ...msg, reactions: filtered };
      })
    );

    setReactionModalMessage((curr) => {
      if (!curr || curr.id !== messageId) return curr;
      const filtered = (curr.reactions || []).filter((r) => r.userId !== currentUserId);
      return { ...curr, reactions: filtered };
    });

    // 2. Dispatch delete to server
    try {
      const res = await fetch(`/api/chat/react?messageId=${encodeURIComponent(messageId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reactions) {
          setChatMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId ? { ...msg, reactions: data.reactions } : msg
            )
          );
          setReactionModalMessage((curr) =>
            curr && curr.id === messageId ? { ...curr, reactions: data.reactions } : curr
          );
        }
      }
    } catch (err) {
      console.error("[Reaction] Failed to remove reaction on server:", err);
    }
  }, [session]);

  const handleStartEditMessage = useCallback((messageId: string, content: string) => {
    setContextMenu(null);
    let plainContent = content;
    try {
      if (content.startsWith('{"__e2e":true')) {
        const parsed = JSON.parse(content);
        plainContent = parsed.ciphertext || content;
      }
    } catch {
      // ignore
    }
    setEditingMessage({ id: messageId, content: plainContent });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  const handleCopyMessageText = (content: string) => {
    let textToCopy = content;
    try {
      if (content.startsWith('{"__e2e":true')) {
        const parsed = JSON.parse(content);
        textToCopy = parsed.ciphertext || content;
      }
    } catch {
      // ignore
    }

    textToCopy = textToCopy.replace(/^\[(FILE|VIDEO) attachment\]\s*/i, "");

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
    }
    setContextMenu(null);
  };

  const handleShareMessage = (messageId: string) => {
    if (!activePeerHandle) return;
    const shareUrl = `${window.location.origin}/?chat=${encodeURIComponent(activePeerHandle)}&messageId=${encodeURIComponent(messageId)}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        setShareToastText("Share link copied!");
        setTimeout(() => {
          setShareToastText(null);
        }, 2000);
      }).catch((err) => {
        console.error("Clipboard copy failed:", err);
      });
    }
    setContextMenu(null);
  };

  const handleBulkDelete = async () => {
    if (selectedMessageIds.size === 0) return;

    const messageIdsArray = Array.from(selectedMessageIds);
    const ownMessagesCount = chatMessages.filter(
      (m) => selectedMessageIds.has(m.id) && m.senderId === meId
    ).length;

    if (ownMessagesCount === 0) {
      alert("You cannot delete any of the selected messages (you are not the sender of any selected messages).");
      return;
    }



    try {
      const res = await fetch("/api/chat/delete-bulk", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageIds: messageIdsArray }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Bulk delete failed" }));
        alert(`Delete failed: ${err.error || "Unknown error"}`);
        return;
      }

      setChatMessages((prev) =>
        prev.filter((m) => !(selectedMessageIds.has(m.id) && m.senderId === meId))
      );

      setIsSelectionMode(false);
      setSelectedMessageIds(new Set());
    } catch (err) {
      console.error("[Bulk Delete] Error:", err);
      alert("Failed to delete messages due to a network error.");
    }
  };

  const handleSelectAll = () => {
    setSelectedMessageIds(new Set(chatMessages.map((m) => m.id)));
  };

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isContextMenuClick = target && typeof target.closest === "function" && target.closest("[data-context-menu]");
      if (isContextMenuClick) {
        return;
      }
      if (isSelectionMode) {
        const bubble = target && typeof target.closest === "function" ? target.closest("[data-message-bubble]") : null;
        if (bubble) {
          e.preventDefault();
          e.stopPropagation();
          const messageId = bubble.getAttribute("data-message-id") || "";
          setSelectedMessageIds((prev) => {
            const next = new Set(prev);
            if (next.has(messageId)) {
              next.delete(messageId);
            } else {
              next.add(messageId);
            }
            return next;
          });
          return;
        }
      }
      setContextMenu(null);
    };

    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // Block native browser context menu app-wide
      const target = e.target as HTMLElement;
      const isContextMenuClick = target && typeof target.closest === "function" && target.closest("[data-context-menu]");
      if (isContextMenuClick) {
        return;
      }
      const bubble = target && typeof target.closest === "function" ? target.closest("[data-message-bubble]") : null;
      if (bubble) {
        setContextMenu(null);

        const messageId = bubble.getAttribute("data-message-id") || "";
        const isMe = bubble.getAttribute("data-message-isme") === "true";
        const content = bubble.getAttribute("data-message-content") || "";

        // Add a micro-delay to prevent immediate closure if clicked coordinates propagate
        setTimeout(() => {
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            messageId,
            isMe,
            content,
          });
        }, 10);
      } else {
        setContextMenu(null);
      }
    };

    let touchTimer: NodeJS.Timeout | null = null;
    let touchStarted = false;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const bubble = target && typeof target.closest === "function" ? target.closest("[data-message-bubble]") : null;
      if (bubble) {
        touchStarted = true;
        const touch = e.touches[0];
        const clientX = touch.clientX;
        const clientY = touch.clientY;
        const messageId = bubble.getAttribute("data-message-id") || "";
        const isMe = bubble.getAttribute("data-message-isme") === "true";
        const content = bubble.getAttribute("data-message-content") || "";

        if (touchTimer) clearTimeout(touchTimer);
        touchTimer = setTimeout(() => {
          if (touchStarted) {
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(50);
            }
            setContextMenu({
              x: clientX,
              y: clientY,
              messageId,
              isMe,
              content,
            });
          }
        }, 600);
      }
    };

    const handleTouchEnd = () => {
      touchStarted = false;
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    };

    const handleTouchMove = () => {
      touchStarted = false;
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    };

    window.addEventListener("click", handleGlobalClick, true);
    window.addEventListener("contextmenu", handleGlobalContextMenu);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("click", handleGlobalClick, true);
      window.removeEventListener("contextmenu", handleGlobalContextMenu);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [isSelectionMode]);

  const handleOpenImageEditor = () => {
    if (!pendingImageFile || !pendingImagePreviewUrl) return;
    setIsEditingImage(true);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setAspect(undefined); // free-form by default
    setCroppedAreaPixels(null);
  };

  const handleCloseImageEditor = () => {
    setIsEditingImage(false);
  };

  const handleCropComplete = (_: any, croppedPixels: any) => {
    setCroppedAreaPixels(croppedPixels);
  };

  const handleAspectChange = (value: number | undefined) => {
    setAspect(value);
  };

  const applyImageCrop = async () => {
    if (!pendingImagePreviewUrl || !pendingImageFile || !croppedAreaPixels) {
      setIsEditingImage(false);
      return;
    }

    try {
      const croppedFile = await createCroppedImageFile(
        pendingImagePreviewUrl,
        croppedAreaPixels,
        pendingImageFile.name,
      );

      if (pendingImagePreviewUrl) {
        try {
          URL.revokeObjectURL(pendingImagePreviewUrl);
        } catch {
          // ignore
        }
      }

      const newUrl = URL.createObjectURL(croppedFile);
      setPendingImageFile(croppedFile);
      setPendingImagePreviewUrl(newUrl);
      setIsEditingImage(false);
    } catch {
      setAttachmentError("Unable to crop image. Please try again.");
      setIsEditingImage(false);
    }
  };

  const createCroppedImageFile = async (
    imageSrc: string,
    cropPixels: { x: number; y: number; width: number; height: number },
    fileName: string,
  ): Promise<File> => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = document.createElement("img");
      img.onload = () => resolve(img);
      img.onerror = (err: any) => reject(err);
      img.src = imageSrc;
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("No 2D context");
    }

    canvas.width = cropPixels.width;
    canvas.height = cropPixels.height;

    ctx.drawImage(
      image,
      cropPixels.x,
      cropPixels.y,
      cropPixels.width,
      cropPixels.height,
      0,
      0,
      cropPixels.width,
      cropPixels.height,
    );

    return new Promise<File>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty"));
          return;
        }
        const file = new File([blob], fileName, { type: blob.type });
        resolve(file);
      }, "image/png");
    });
  };

  const isFounder = (session?.user as any)?.handle === "Rohit_7779" || (session?.user as any)?.handle === "MR_ROHIT" || session?.user?.email === "rohiterrors@gmail.com";

  const handleOpenFounderGrantModal = (handle: string) => {
    setFounderGrantTarget(handle);
    setFounderGrantAmount("");
    setFounderGrantError(null);
    setIsFounderGrantModalOpen(true);
  };

  const handleFounderGrantSubmit = async () => {
    if (!founderGrantTarget || !founderGrantAmount) return;

    setIsFounderGrantLoading(true);
    setFounderGrantError(null);

    try {
      const res = await fetch("/api/admin/points/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientHandle: founderGrantTarget,
          amount: founderGrantAmount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFounderGrantError(data.error || "Failed to grant points.");
      } else {
        setIsFounderGrantModalOpen(false);

        // Show our gorgeous new Q-Link theme transaction popup!
        setTransactionNotification({
          show: true,
          type: "credit",
          amount: parseInt(founderGrantAmount, 10),
          title: "Quantum Currency Transmitted",
          message: `Successfully granted +${founderGrantAmount} QP to @${founderGrantTarget}!`,
          txHash: "TX-" + Math.random().toString(36).substring(2, 10).toUpperCase(),
        });

        // Autoclose transaction popup after 5.3s (Synced with Kinetic Runner Animation)
        setTimeout(() => {
          setTransactionNotification(prev => prev ? { ...prev, show: false } : null);
        }, 8700);

        // Instantly reload user data / feed
        try {
          await updateSession();
          await fetchDirectoryLatestPosts();
          await fetchIdConsolePosts();
        } catch { }
      }
    } catch {
      setFounderGrantError("Network error. Please try again.");
    } finally {
      setIsFounderGrantLoading(false);
    }
  };

  // PWA install / create-shortcut prompt
  const [installPromptEvent, setInstallPromptEvent] = useState<any | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isWindowsClient, setIsWindowsClient] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.userAgent.indexOf("Win") !== -1) {
      setIsWindowsClient(true);
    }
  }, []);

  // Authenticated: load outgoing & incoming requests once on auth
  useEffect(() => {
    if (!isAuthenticated) return;

    const deduplicateByFromUser = (reqs: IncomingRequest[]): IncomingRequest[] => {
      const seen = new Set<string>();
      return reqs.filter((r) => {
        const idKey = r.fromUser?.id || r.id;
        if (seen.has(idKey)) return false;
        seen.add(idKey);
        return true;
      });
    };

    const deduplicateByToUser = (reqs: OutgoingRequest[]): OutgoingRequest[] => {
      const seen = new Set<string>();
      return reqs.filter((r) => {
        const idKey = r.toUser?.id || r.id;
        if (seen.has(idKey)) return false;
        seen.add(idKey);
        return true;
      });
    };

    const loadOutgoingAndIncoming = () => {
      setIsLoadingOutgoing(true);
      setIsLoadingIncoming(true);
      setIncomingError(null);

      // Independent high-speed parallel fetches for instant millisecond UI hydration
      const outHeaders: Record<string, string> = {};
      if (outgoingFriendsEtagRef.current) {
        outHeaders["If-None-Match"] = outgoingFriendsEtagRef.current;
      }
      fetch("/api/friends/outgoing", { headers: outHeaders })
        .then(async (res) => {
          if (res.status === 304) return;
          if (res.ok) {
            const newEtag = res.headers.get("etag");
            if (newEtag) outgoingFriendsEtagRef.current = newEtag;
            const outData = await res.json();
            setOutgoing(deduplicateByToUser((outData.requests || []) as OutgoingRequest[]));
          }
        })
        .catch(() => {})
        .finally(() => {
          outgoingFetchedRef.current = true;
          setIsLoadingOutgoing(false);
        });

      const inHeaders: Record<string, string> = {};
      if (incomingFriendsEtagRef.current) {
        inHeaders["If-None-Match"] = incomingFriendsEtagRef.current;
      }
      fetch("/api/friends/incoming", { headers: inHeaders })
        .then(async (res) => {
          if (res.status === 304) return;
          if (res.ok) {
            const newEtag = res.headers.get("etag");
            if (newEtag) incomingFriendsEtagRef.current = newEtag;
            const inData = await res.json();
            setIncoming(deduplicateByFromUser((inData.requests || []) as IncomingRequest[]));
          } else {
            setIncomingError("Unable to load incoming requests.");
          }
        })
        .catch(() => {})
        .finally(() => {
          incomingFetchedRef.current = true;
          setIsLoadingIncoming(false);
        });
    };

    loadOutgoingAndIncoming();
  }, [status]);

  const loadDirectoryData = async (force: boolean = false) => {
    // SWR Pattern: Instant load from offline cache if available
    const cached = offlineCache.getStale<DirectoryItem[]>(CACHE_KEYS.DIRECTORY);
    if (!force && cached && cached.length > 0 && (!directoryItems || directoryItems.length === 0)) {
      setDirectoryItems(cached);
      if (!navigator.onLine) {
        setDirectoryLoading(false);
        setDirectoryError(null);
        return;
      }
    }

    // Avoid refetching if we already have data and not forcing
    if (!force && directoryItems && directoryItems.length > 0) {
      await fetchDirectoryLatestPosts();
      return;
    }

    setDirectoryLoading(true);
    setDirectoryError(null);
    try {
      const res = await fetch("/api/directory");
      if (!res.ok) {
        if (cached && cached.length > 0) {
          setDirectoryItems(cached);
          setDirectoryError(null);
        } else {
          setDirectoryError("Unable to load global directory. Please try again.");
        }
        return;
      }
      const data = await res.json();
      const items = (data.items || []) as DirectoryItem[];
      offlineCache.set(CACHE_KEYS.DIRECTORY, items, CACHE_TTL.DIRECTORY);
      setDirectoryItems(items);

      await fetchDirectoryLatestPosts();

      // Initialize engagement data for all users and posts
      // Small delay to ensure session is ready and reduce immediate fetch pressure
      if ((session?.user as any)?.id) {
        setTimeout(() => {
          initializeEngagementData(items).catch(err => {
            console.error('[loadData] Engagement init failed:', err);
          });
        }, 100);
      }

      // Prefetch profile images during animation for instant display
      items.forEach((item: DirectoryItem) => {
        if (item.image && typeof window !== 'undefined') {
          const img = document.createElement('img');
          img.src = item.image;
        }
      });
    } catch {
      const stale = offlineCache.getStale<DirectoryItem[]>(CACHE_KEYS.DIRECTORY);
      if (stale && stale.length > 0) {
        setDirectoryItems(stale);
        setDirectoryError(null);
      } else {
        setDirectoryError("Unable to load global directory. Please check your connection.");
      }
    } finally {
      setDirectoryLoading(false);
    }
  };

  const openDirectory = async () => {
    setIsConsoleAnimating(true);
    setShowDirectory(true);
    pushNavState({ screen: "directory" });
    setTimeout(() => {
      setIsConsoleAnimating(false);
    }, 600);

    // Start loading immediately - animation provides visual cover
    loadDirectoryData(false);
  };

  const closeDirectory = () => {
    if (directoryScrollRef.current) {
      const top = directoryScrollRef.current.scrollTop;
      directoryScrollTopRef.current = top;
      try {
        sessionStorage.setItem("qc_directory_scroll", String(top));
      } catch {}
    }
    setShowDirectory(false);
    setIsConsoleAnimating(true);
    setDirectoryProfileHandle(null);
    setDirectoryProfileInitialData(null);
    setViewingProfileHandle(null);
    setMode("home");
    replaceNavState({ screen: "home" });
    setTimeout(() => {
      setIsConsoleAnimating(false);
      setShowDirectoryMediaOnly(false);
      setMediaFilterTab('all');
      if (typeof window !== "undefined") {
        window.scrollTo({ left: 0 });
        const main = document.getElementById("main-scroll-container");
        if (main) main.scrollLeft = 0;
      }
    }, 600);
  };

  // PWA install prompt wiring: capture beforeinstallprompt and appinstalled events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isElectron = window.navigator.userAgent.toLowerCase().includes("electron");
    if (isElectron) return;

    const seenKey = "qc_pwa_install_seen_v1";
    const installedOrSkipped = window.localStorage.getItem(seenKey);

    const handleBeforeInstallPrompt = (e: any) => {
      // Only show our own custom UI
      e.preventDefault();
      setInstallPromptEvent(e);
      const onboardingCompleted = window.localStorage.getItem("qc_onboarding_completed");
      if (!installedOrSkipped && onboardingCompleted) {
        setShowInstallPrompt(true);
      }
    };

    const handleAppInstalled = () => {
      try {
        window.localStorage.setItem(seenKey, "installed");
      } catch {
        // ignore
      }
      setShowInstallPrompt(false);
      setInstallPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as any);
    window.addEventListener("appinstalled", handleAppInstalled as any);

    // Fallback: if the browser never fires beforeinstallprompt, still show
    // the shortcut screen once for new users after a short delay, provided onboarding is completed.
    if (!installedOrSkipped) {
      const id = window.setTimeout(() => {
        const onboardingCompleted = window.localStorage.getItem("qc_onboarding_completed");
        if (onboardingCompleted) {
          setShowInstallPrompt((current) => (current ? current : true));
        }
      }, 4000);
      return () => {
        window.clearTimeout(id);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as any);
        window.removeEventListener("appinstalled", handleAppInstalled as any);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as any);
      window.removeEventListener("appinstalled", handleAppInstalled as any);
    };
  }, []);

  // Light polling so incoming/outgoing stay in sync across devices
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    const refresh = async () => {
      try {
        const [outRes, inRes] = await Promise.all([
          fetch("/api/friends/outgoing"),
          fetch("/api/friends/incoming"),
        ]);

        if (cancelled) return;

        let currentOutgoing: OutgoingRequest[] = [];
        let currentIncoming: IncomingRequest[] = [];

        if (outRes.ok) {
          const outData = await outRes.json();
          currentOutgoing = (outData.requests || []) as OutgoingRequest[];
          setOutgoing(currentOutgoing);
        }

        if (inRes.ok) {
          const inData = await inRes.json();
          const rawReqs = (inData.requests || []) as IncomingRequest[];
          const seen = new Set<string>();
          currentIncoming = rawReqs.filter((r) => {
            const idKey = r.fromUser?.id || r.id;
            if (seen.has(idKey)) return false;
            seen.add(idKey);
            return true;
          });
          setIncoming(currentIncoming);

          // Check Q-BEACON Priority alerts in both incoming and outgoing connections
          const checkBeaconReq = (req: any, peerUser: any) => {
            if (req.status === "ACCEPTED" && peerUser?.handle && req.latestMessage) {
              const latestMsg = req.latestMessage;
              if (latestMsg?.content && latestMsg.content.includes("[Q-BEACON_EMERGENCY]:")) {
                const ackKey = `qlink_beacon_ack_${latestMsg.id}`;
                if (!localStorage.getItem(ackKey) && latestMsg.senderId !== myId) {
                  localStorage.setItem(ackKey, "1");
                  const rawContent = latestMsg.content.replace(/.*?\[Q-BEACON_EMERGENCY\]:\s*/, "").trim();
                  setActiveBeacon({
                    senderHandle: peerUser.handle,
                    senderName: peerUser.name,
                    senderImage: peerUser.profileImage || peerUser.image,
                    noteText: rawContent || "Priority Emergency Beacon!",
                  });
                  quantumAudio.warmup();
                  quantumAudio.playEmergencyChime();
                }
              }
            }
          };
          currentIncoming.forEach((req: any) => checkBeaconReq(req, req.fromUser));
          currentOutgoing.forEach((req: any) => checkBeaconReq(req, req.toUser));
        }

        // Server-Authoritative Unread State Reconciliation:
        // Collect all handles that genuinely have unread messages on the server
        const activeServerUnreadHandles = new Set<string>();

        currentOutgoing.forEach((req: any) => {
          if (req.status === "ACCEPTED" && req.toUser?.handle && req.isUnread) {
            const h = cleanHandle(req.toUser.handle);
            if (h && !areHandlesEqual(h, activePeerHandle)) {
              activeServerUnreadHandles.add(h);
            }
          }
        });

        currentIncoming.forEach((req: any) => {
          if (req.status === "ACCEPTED" && req.fromUser?.handle && req.isUnread) {
            const h = cleanHandle(req.fromUser.handle);
            if (h && !areHandlesEqual(h, activePeerHandle)) {
              activeServerUnreadHandles.add(h);
            }
          }
        });

        // Update local unreadMessages: Remove stale handles and add genuine unread handles
        setUnreadMessages((prev) => {
          // Filter out any handles that are NOT unread on the server or match current active room
          const cleaned = prev.filter((m) => {
            const h = cleanHandle(m.sender);
            return h && activeServerUnreadHandles.has(h) && !areHandlesEqual(h, activePeerHandle);
          });

          // Add newly discovered unread handles
          activeServerUnreadHandles.forEach((h) => {
            if (!cleaned.some((m) => cleanHandle(m.sender) === h)) {
              cleaned.push({ id: `srv-${h}-${Date.now()}`, sender: h });
            }
          });

          // Only update state reference if contents actually changed
          if (
            cleaned.length === prev.length &&
            cleaned.every((m, i) => m.id === prev[i].id && cleanHandle(m.sender) === cleanHandle(prev[i].sender))
          ) {
            return prev;
          }

          return cleaned;
        });

      } catch {
        // ignore network poll hiccups
      }
    };

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleNextRefresh = () => {
      if (cancelled) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      const isHidden = typeof document !== "undefined" && document.hidden;
      const delay = isHidden ? 10000 : 5000;
      refreshTimer = setTimeout(async () => {
        if (cancelled) return;
        await refresh();
        scheduleNextRefresh();
      }, delay);
    };

    refresh().finally(() => {
      scheduleNextRefresh();
    });

    const onVisChangeRefresh = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        if (refreshTimer) clearTimeout(refreshTimer);
        refresh().finally(() => {
          scheduleNextRefresh();
        });
      }
    };

    const onSyncMessages = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refresh().finally(() => {
        scheduleNextRefresh();
      });
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisChangeRefresh);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("qlink:sync-messages", onSyncMessages);
    }

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisChangeRefresh);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("qlink:sync-messages", onSyncMessages);
      }
    };
  }, [status, activePeerHandle, session?.user?.id, desktopNotificationsEnabled]);

  // Lightweight "realtime" polling: keep conversation in sync
  useEffect(() => {
    if (!activePeerHandle) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const cleanPeer = cleanHandle(activePeerHandle);
        const cachedEtag = chatEtagsRef.current.get(cleanPeer);
        const headers: Record<string, string> = {};
        if (cachedEtag) {
          headers["If-None-Match"] = cachedEtag;
        }

        const res = await fetch(
          `/api/chat/history?peerHandle=${encodeURIComponent(activePeerHandle)}`,
          { headers }
        );
        if (res.status === 304) {
          // Zero-byte 304 Not Modified: Conversation is unchanged
          return;
        }
        if (!res.ok) return;

        const newEtag = res.headers.get("etag");
        if (newEtag) {
          chatEtagsRef.current.set(cleanPeer, newEtag);
        }

        const data = await res.json();
        const peerKey = data.peer?.publicKeyString || null;
        const rawMessages = (data.messages as ChatMessage[]) || [];
        const decryptedMessages = await decryptMessageList(rawMessages, peerKey);

        if (cancelled) return;
        setChatRoomId((data.roomId as string) || null);
        setActivePeerPublicKey(peerKey);

        // Q-BEACON Check in active chat (matches 🚨, ⚡, or standard format)
        decryptedMessages.forEach((m) => {
          if (m.content && m.content.includes("[Q-BEACON_EMERGENCY]:") && m.senderId !== myId) {
            const ackKey = `qlink_beacon_ack_${m.id}`;
            if (!localStorage.getItem(ackKey)) {
              localStorage.setItem(ackKey, "1");
              const rawContent = m.content.replace(/.*?\[Q-BEACON_EMERGENCY\]:\s*/, "").trim();
              setActiveBeacon({
                senderHandle: activePeerHandle,
                noteText: rawContent || "Priority Emergency Beacon!",
              });
              quantumAudio.warmup();
              quantumAudio.playEmergencyChime();
            }
          }
        });

        setChatMessages((prev) => {
          const decryptedMap = new Map(decryptedMessages.map((m) => [m.id, m]));
          // Keep temp optimistic messages, update content, status, and edited metadata on existing confirmed messages
          const merged = prev.map((m) => {
            if (m.id.startsWith("temp-")) return m;
            const fresh = decryptedMap.get(m.id);
            if (fresh) {
              return {
                ...m,
                content: fresh.content,
                isEdited: fresh.isEdited || false,
                editedAt: fresh.editedAt || null,
                status: fresh.status || m.status,
                readAt: fresh.readAt,
                deliveredAt: fresh.deliveredAt,
                reactions: (fresh as any).reactions || [],
                attachments: ((fresh as any).attachments && (fresh as any).attachments.length > 0)
                  ? (fresh as any).attachments
                  : (m as any).attachments,
              };
            }
            return m;
          });
          // Add brand-new messages we haven't seen yet
          const existingIds = new Set(prev.map((m) => m.id));
          const brandNew = decryptedMessages.filter((m) => !existingIds.has(m.id));
          if (
            brandNew.length === 0 &&
            merged.length === prev.length &&
            merged.every(
              (m, i) =>
                m.id === prev[i].id &&
                m.content === prev[i].content &&
                m.status === prev[i].status &&
                m.isEdited === prev[i].isEdited &&
                m.readAt === prev[i].readAt &&
                m.deliveredAt === prev[i].deliveredAt &&
                JSON.stringify((m as any).reactions || []) === JSON.stringify((prev[i] as any).reactions || []) &&
                ((m as any).attachments?.length || 0) === ((prev[i] as any).attachments?.length || 0)
            )
          ) {
            return prev;
          }
          const updated = [...merged, ...brandNew];
          if (activePeerHandle) {
            peerMessagesCacheRef.current.set(cleanHandle(activePeerHandle), updated);
          }
          return updated;
        });

        // Sync open reactions modal if active
        if (reactionModalMessage) {
          const freshModalMsg = decryptedMessages.find((m) => m.id === reactionModalMessage.id);
          if (freshModalMsg && (freshModalMsg as any).reactions) {
            setReactionModalMessage((curr) =>
              curr && curr.id === freshModalMsg.id ? { ...curr, reactions: (freshModalMsg as any).reactions } : curr
            );
          }
        }

        const isAppHidden = typeof document !== "undefined" && (document.hidden || !document.hasFocus());

        // Update last seen message ID to local storage (only if window is focused)
        if (decryptedMessages.length > 0 && !isAppHidden) {
          const lastMsg = decryptedMessages[decryptedMessages.length - 1];
          localStorage.setItem(`qlink_last_msg_id_${cleanHandle(activePeerHandle)}`, lastMsg.id);
        }


      } catch {
        // ignore; next poll will try again
      }
    };

    const poller = createAdaptivePoller(
      async () => {
        await poll();
      },
      { baseIntervalMs: 1800, maxIntervalMs: 15000 }
    );
    poller.start();

    return () => {
      cancelled = true;
      poller.stop();
    };
  }, [activePeerHandle, desktopNotificationsEnabled]);

  useEffect(() => {
    if (status !== "loading") {
      setAuthTakingLong(false);
      return;
    }

    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;
      setAuthTakingLong(true);

      if (typeof window !== "undefined") {
        try {
          const key = "qc_auth_reloaded_once";
          const already = window.sessionStorage.getItem(key);
          if (!already) {
            window.sessionStorage.setItem(key, "1");
            window.location.reload();
          }
        } catch {
          // ignore storage/reload issues; user will see the hint text instead
        }
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "loading") {
      setHasInitiallyLoaded(true);
    }
  }, [status]);



  useEffect(() => {
    if (status !== "authenticated") return;
    const raw = (session.user as any)?.handle as string | undefined;
    if (raw && !currentHandle) {
      setCurrentHandle(raw);
    }

    const name = (session.user as any)?.name as string | undefined;
    if (name && !displayName) {
      setDisplayName(name);
    }
  }, [status, session, currentHandle, displayName]);

  useEffect(() => {
    // Reset smart skeleton fetch locks when user identity changes
    outgoingFetchedRef.current = false;
    incomingFetchedRef.current = false;
  }, [session?.user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Purge stale unscoped legacy caches to prevent cross-account ghost flashing
    try {
      localStorage.removeItem("qlink_cached_outgoing");
      localStorage.removeItem("qlink_cached_incoming");
      localStorage.removeItem("qlink_cached_directory");
    } catch {}
    const urlParams = new URLSearchParams(window.location.search);
    const forceTour = urlParams.get("tour") === "1" || urlParams.get("guide") === "1";
    const seen = window.localStorage.getItem("qc_seen_guide_v1");
    if (!seen || forceTour) {
      setShowGuide(true);
      setGuideStep(0);
    }
  }, []);

  const autoDemoTriggeredRef = useRef(false);

  // Auto-Launch Coordinator: ONLY opens Chat or Q-AI if explicitly requested via URL params (?demo=ai, ?copilot=1, ?chat=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "authenticated") return;
    if (autoDemoTriggeredRef.current) return;

    // Check if app is busy with guide / onboarding / install tour prompts
    const isAppFree = !showGuide && !showOnboarding && !showInstallPrompt;
    if (!isAppFree) return;

    let targetChat: string | null = null;
    let wantCopilot = false;
    let messageId: string | null = null;

    // Check current URL query params
    try {
      const params = new URLSearchParams(window.location.search);
      const isDemoAi = params.get("demo") === "ai" || params.get("demo") === "copilot";
      const isCopilot = params.get("copilot") === "1" || params.get("copilot") === "true";
      const chatParam = params.get("chat");
      messageId = params.get("messageId");

      if (isDemoAi || isCopilot) {
        targetChat = chatParam || "Rohit_7779";
        wantCopilot = true;
      } else if (chatParam) {
        targetChat = chatParam;
        wantCopilot = false;
      }
    } catch {}

    // Only fallback to pre-login intent if explicitly saved within last 45 seconds (e.g. immediately post OAuth callback)
    if (!targetChat) {
      try {
        const stored = window.sessionStorage.getItem("ql_auto_demo");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.chat && (Date.now() - (parsed.ts || 0) < 45000)) {
            targetChat = parsed.chat;
            wantCopilot = !!parsed.copilot;
          }
        }
      } catch {}
    }

    // Always clean up persistent demo intent flags and legacy cookies
    try {
      window.sessionStorage.removeItem("ql_auto_demo");
      document.cookie = "ql_auto_demo=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    } catch {}

    if (!targetChat) return;

    // Safety guard: cannot chat with oneself
    const meHandle = (session?.user as any)?.handle;
    if (meHandle && cleanHandle(targetChat).toLowerCase() === cleanHandle(meHandle).toLowerCase()) {
      replaceNavState({ screen: "home" });
      return;
    }

    autoDemoTriggeredRef.current = true;

    // Execute seamless opening
    const peerToOpen = targetChat.trim();
    openChatWithPeer(peerToOpen);
    setShowDirectory(false);
    setMode("home");

    if (messageId) {
      setHighlightedMessageId(messageId);
    }

    if (wantCopilot) {
      setIsQAIOpen(true);
      setShowAIHelpButton(false);
    }
  }, [status, showGuide, showOnboarding, showInstallPrompt, session]);

  // Keep a stable ref of current UI states for seamless gesture/hardware back handling without effect re-binding
  const navStateRef = useRef({
    showDirectory,
    directoryProfileHandle,
    activePeerHandle,
    showSettings,
    isQAIOpen,
    isNotifCenterOpen,
    showStore,
    showIdConsole,
    showEditProfileModal,
    viewingProfileHandle,
    lightboxImageUrl,
    lightboxVideoUrl,
  });

  navStateRef.current = {
    showDirectory,
    directoryProfileHandle,
    activePeerHandle,
    showSettings,
    isQAIOpen,
    isNotifCenterOpen,
    showStore,
    showIdConsole,
    showEditProfileModal,
    viewingProfileHandle,
    lightboxImageUrl,
    lightboxVideoUrl,
  };

  // 1. Initial Desktop Refresh (F5) & Direct Link Screen Hydration (runs strictly ONCE on mount)
  const initialNavHydratedRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (initialNavHydratedRef.current) return;
    initialNavHydratedRef.current = true;

    const initialNav = parseCurrentNavState();
    if (initialNav.screen === "directory") {
      openDirectory();
      if (initialNav.handle) {
        setDirectoryProfileHandle(initialNav.handle);
      }
    } else if (initialNav.screen === "settings") {
      setShowSettings(true);
    } else if (initialNav.screen === "qai") {
      setIsQAIOpen(true);
    } else if (initialNav.screen === "notifications") {
      setIsNotifCenterOpen(true);
    } else if (initialNav.screen === "store") {
      setShowStore(true);
    } else if (initialNav.screen === "idconsole") {
      setShowIdConsole(true);
    } else if (initialNav.screen === "editprofile") {
      setShowEditProfileModal(true);
    } else if (initialNav.screen === "profile" && initialNav.handle) {
      setViewingProfileHandle(initialNav.handle);
    } else if (initialNav.screen === "chat" && initialNav.handle) {
      const myHandle = (session?.user as any)?.handle;
      if (!myHandle || cleanHandle(initialNav.handle).toLowerCase() !== cleanHandle(myHandle).toLowerCase()) {
        openChatWithPeer(initialNav.handle);
      } else {
        replaceNavState({ screen: "home" });
      }
    }
  }, []);

  // 2. Android 3-Button & Browser Back Navigation Interceptor (Bound ONCE on mount)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = (e: PopStateEvent) => {
      const current = navStateRef.current;

      // Priority 1: Fullscreen Media Lightbox
      if (current.lightboxImageUrl || current.lightboxVideoUrl) {
        setLightboxImageUrl(null);
        setLightboxVideoUrl(null);
        return;
      }

      // Priority 2: Edit Profile Modal
      if (current.showEditProfileModal) {
        setShowEditProfileModal(false);
        replaceNavState({ screen: "home" });
        return;
      }

      // Priority 3: Sub-view inside Directory (User Profile)
      if (current.directoryProfileHandle) {
        setDirectoryProfileHandle(null);
        setViewingProfileHandle(null);
        setMode("home");
        replaceNavState({ screen: "directory" });
        return;
      }

      // Priority 4: Global Quantum Directory Modal
      if (current.showDirectory) {
        setShowDirectory(false);
        setDirectoryProfileHandle(null);
        setViewingProfileHandle(null);
        setMode("home");
        setIsConsoleAnimating(true);
        setTimeout(() => setIsConsoleAnimating(false), 400);
        replaceNavState({ screen: "home" });
        return;
      }

      // Priority 5: Settings Console
      if (current.showSettings) {
        setShowSettings(false);
        replaceNavState({ screen: "home" });
        return;
      }

      // Priority 6: QAI Copilot
      if (current.isQAIOpen) {
        setIsQAIOpen(false);
        replaceNavState({ screen: "home" });
        return;
      }

      // Priority 7: Notification Center
      if (current.isNotifCenterOpen) {
        setIsNotifCenterOpen(false);
        replaceNavState({ screen: "home" });
        return;
      }

      // Priority 8: Quantum Store / Pass
      if (current.showStore) {
        setShowStore(false);
        replaceNavState({ screen: "home" });
        return;
      }

      // Priority 9: ID Console
      if (current.showIdConsole) {
        setShowIdConsole(false);
        replaceNavState({ screen: "home" });
        return;
      }

      // Priority 10: Profile Preview in right panel
      if (current.viewingProfileHandle) {
        setViewingProfileHandle(null);
        setMode("home");
        replaceNavState({ screen: "home" });
        return;
      }

      // Priority 11: Active Chat (back returns to home stream)
      if (current.activePeerHandle) {
        setActivePeerHandle(null);
        setIsChatFull(false);
        replaceNavState({ screen: "home" });
        return;
      }

      // Dynamic forward restoration if state dictates
      const state = (e.state as QNavState) || parseCurrentNavState();
      if (state.screen === "directory") {
        setShowDirectory(true);
        loadDirectoryData(false);
        return;
      } else if (state.screen === "chat" && state.handle) {
        openChatWithPeer(state.handle);
        return;
      }

      // Priority 12: Root Home Screen Interception (Android Hardware Back Protection)
      // When the user is on the root home screen and presses the system Back button:
      // Prevent browser from navigating backwards into external OAuth redirect intermediates
      // (such as accounts.google.com), previous login sessions, or cross-origin referrers.
      const now = Date.now();
      const timeSinceLastPress = now - lastBackPressTimeRef.current;

      // Immediately re-anchor the history so the browser cannot slide backwards into OAuth
      try {
        window.history.pushState({ screen: "home", isRootGuard: true }, "", "/");
      } catch {}

      if (timeSinceLastPress < 2000) {
        // Confirmed intentional exit (double-back within 2 seconds)
        if (typeof window !== "undefined") {
          const isStandalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            (window.navigator as any).standalone;
          if (isStandalone) {
            window.close();
          }
        }
        return;
      }

      // First back press at root: trigger luxury "Press back again to exit" toast
      lastBackPressTimeRef.current = now;
      setExitToastVisible(true);
      if (exitToastTimerRef.current) clearTimeout(exitToastTimerRef.current);
      exitToastTimerRef.current = setTimeout(() => {
        setExitToastVisible(false);
      }, 2000);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // 3. Android PWA Root Navigation Guard Initialization
  useEffect(() => {
    if (typeof window === "undefined" || !isAuthenticated) return;
    armRootNavigationGuard();
  }, [isAuthenticated]);

  // While auth is loading, show loading spinner (only on initial launch, preventing flash during updateSession background refreshes)
  if (status === "loading" && !hasInitiallyLoaded) {
    return (
      <main className="relative flex min-h-screen w-full items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="text-xs text-slate-400">Connecting to quantum network...</p>
        </div>
    </main>
    );
  }

  // Unauthenticated: show login gate ONLY when user has genuinely logged out and has no valid session signature
  if (!isAuthenticated || !effectiveUser || !myId) {
    return (
      <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950">
        {/* Background glow effects */}
        <div
          className={`pointer-events-none absolute -left-32 -top-32 h-64 w-64 rounded-full blur-3xl ${isDefaultTheme ? "bg-cyan-500/20" : ""}`}
          style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-orb-primary)' : undefined }}
        />
        <div
          className={`pointer-events-none absolute -right-32 bottom-32 h-64 w-64 rounded-full blur-3xl ${isDefaultTheme ? "bg-fuchsia-500/20" : ""}`}
          style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-orb-secondary)' : undefined }}
        />

        <div className="relative z-10 w-full max-w-[480px] mx-auto px-4" style={{ maxWidth: "480px" }}>
          {/* Logo / Brand */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-slate-900/50 px-4 py-2 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-cyan-100">Q-Link Console</span>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-white">
              Welcome to <span className="bg-gradient-to-r from-cyan-400 to-fuchsia-400 bg-clip-text text-transparent">Quantum Link</span>
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Fast, private messaging across our global network
            </p>

            {/* Public Navigation for Guests & Search Bots */}
            <div className="mt-3 flex items-center justify-center gap-2 text-xs flex-wrap">
              <a
                href="/about"
                className="rounded-full border border-cyan-500/40 bg-cyan-950/40 px-3 py-1 font-semibold text-cyan-300 hover:bg-cyan-500 hover:text-slate-950 transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)]"
              >
                About &amp; Features
              </a>
              <a
                href="/privacy"
                className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1 font-semibold text-slate-300 hover:border-cyan-400 hover:text-cyan-200 transition-all"
              >
                🛡️ Privacy &amp; Protocol Charter
              </a>
            </div>
          </div>

                    {/* Sign-in Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-3">
            {/* Google Sign-in Button */}
            <button
              className="group relative overflow-hidden grid w-full h-[52px] min-h-[52px] max-h-[52px] grid-cols-[40px_1fr_40px] items-center rounded-xl border border-slate-700/80 bg-white px-3.5 text-xs sm:text-sm font-semibold text-slate-900 shadow-md transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-[transform,box-shadow,border-color] hover:-translate-y-[2px] hover:scale-[1.012] hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.38),0_0_25px_rgba(255,255,255,0.3)] hover:ring-2 hover:ring-white/40 active:translate-y-0 active:scale-[0.985] active:duration-150"
              onClick={() => handleOAuthSignIn("google")}
              disabled={!!oauthLaunchingProvider}
            >
              {/* Silky Smooth Satin Light Beam Sheen on Exact Hover */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-slate-900/[0.08] to-transparent transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-full" />
              <div className="flex h-6 w-6 items-center justify-center overflow-visible">
                <img
                  src="/google-icon.ico"
                  alt="Google"
                  className="h-5.5 w-5.5 object-contain animate-smooth-rotate-120 will-change-transform"
                  style={{ animationDelay: '0s' }}
                />
              </div>
              <span className="text-center whitespace-nowrap tracking-wide truncate">
                {oauthLaunchingProvider === "google" ? "Connecting..." : "Continue with Google"}
              </span>
              <div />
            </button>

            {/* Microsoft Sign-in Button */}
            <button
              className="group relative overflow-hidden grid w-full h-[52px] min-h-[52px] max-h-[52px] grid-cols-[40px_1fr_40px] items-center rounded-xl border border-slate-700/80 bg-white px-3.5 text-xs sm:text-sm font-semibold text-slate-900 shadow-md transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-[transform,box-shadow,border-color] hover:-translate-y-[2px] hover:scale-[1.012] hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.38),0_0_25px_rgba(255,255,255,0.3)] hover:ring-2 hover:ring-white/40 active:translate-y-0 active:scale-[0.985] active:duration-150"
              onClick={() => handleOAuthSignIn("azure-ad")}
              disabled={!!oauthLaunchingProvider}
            >
              {/* Silky Smooth Satin Light Beam Sheen on Exact Hover */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-slate-900/[0.08] to-transparent transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-full" />
              <div className="flex h-6 w-6 items-center justify-center overflow-visible">
                <img
                  src="/microsoft-icon.ico"
                  alt="Microsoft"
                  className="h-5.5 w-5.5 object-contain animate-smooth-rotate-microsoft will-change-transform"
                  style={{ animationDelay: '0.6s' }}
                />
              </div>
              <span className="text-center whitespace-nowrap tracking-wide truncate">
                {oauthLaunchingProvider === "azure-ad" ? "Connecting..." : "Continue with Microsoft"}
              </span>
              <div />
            </button>

            {/* GitHub Sign-in Button */}
            <button
              className="group relative overflow-hidden grid w-full h-[52px] min-h-[52px] max-h-[52px] grid-cols-[40px_1fr_40px] items-center rounded-xl border border-slate-700/80 bg-white px-3.5 text-xs sm:text-sm font-semibold text-slate-900 shadow-md transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-[transform,box-shadow,border-color] hover:-translate-y-[2px] hover:scale-[1.012] hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.38),0_0_25px_rgba(255,255,255,0.3)] hover:ring-2 hover:ring-white/40 active:translate-y-0 active:scale-[0.985] active:duration-150"
              onClick={() => handleOAuthSignIn("github")}
              disabled={!!oauthLaunchingProvider}
            >
              {/* Silky Smooth Satin Light Beam Sheen on Exact Hover */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-slate-900/[0.08] to-transparent transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-full" />
              <div className="flex h-6 w-6 items-center justify-center overflow-visible">
                <img
                  src="/github-icon.ico"
                  alt="GitHub"
                  className="h-5.5 w-5.5 object-contain animate-smooth-rotate-120 will-change-transform"
                  style={{ animationDelay: '1.2s' }}
                />
              </div>
              <span className="text-center whitespace-nowrap tracking-wide truncate">Continue with GitHub</span>
              <div />
            </button>

            {/* Unified Phone Login/Signup Button with Sophisticated Swap Animation */}
            <button
              className="phone-swap-btn group relative overflow-hidden grid w-full h-[52px] min-h-[52px] max-h-[52px] grid-cols-[40px_1fr_40px] items-center rounded-xl border border-cyan-500/20 bg-slate-800/40 text-slate-200 px-3.5 text-xs sm:text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-[transform,box-shadow,border-color] hover:-translate-y-[2px] hover:scale-[1.012] hover:border-cyan-400/50 hover:bg-slate-800/80 hover:text-white hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.45),0_0_25px_rgba(6,182,212,0.3)] hover:ring-1 hover:ring-cyan-400/40 active:translate-y-0 active:scale-[0.985] active:duration-150"
              onClick={() => {
                setShowNoAccountModal(true);
                setPhoneSignInStep("menu");
              }}
            >
              {/* Silky Smooth Cyan Light Beam Sheen on Exact Hover */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-cyan-400/15 to-transparent transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-full" />
              

              {/* Left Slot: Mobile icon with fluid exit/enter swap animation */}
              <div className="flex h-6 w-6 items-center justify-center overflow-hidden">
                <span className="phone-swap-icon text-base sm:text-lg select-none will-change-transform">📱</span>
              </div>

              {/* Center Slot: Dual-layer text swap carousel */}
              <div className="relative h-full flex items-center justify-center overflow-hidden pointer-events-none">
                {/* State 1: Continue with Phone (stays for 2s) */}
                <span className="phone-swap-text-phone text-center whitespace-nowrap tracking-wide truncate">
                  Continue with Phone
                </span>
                {/* State 2: [MORE] (stays for 3s) */}
                <span className="phone-swap-text-more absolute inset-0 flex items-center justify-center whitespace-nowrap font-mono text-xs sm:text-[13px] font-semibold tracking-[0.25em] text-cyan-300 drop-shadow-[0_0_10px_rgba(6,182,212,0.45)] uppercase">
                  [MORE]
                </span>
              </div>

              {/* Right Slot: Symmetrical 40px spacer keeping center text perfectly centered */}
              <div />
            </button>

            {/* Skip Button - Force Hidden */}
            {process.env.NODE_ENV === 'development' && (
              <button
                className="hidden mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:bg-slate-800 hover:text-white active:scale-[0.98]"
                onClick={() => {
                  localStorage.setItem('temp_bypass', 'true');
                  window.location.reload();
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 1.414L10.586 9.5H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                </svg>
                Skip (Test Animations)
              </button>
            )}

            {/* Terms & Conditions Acceptance Notice (Standard Corporate Tech-Giant Spec) */}
            <div className="pt-2 text-center text-xs text-slate-400">
              <p className="leading-relaxed">
                By logging in, you accept our{" "}
                <a
                  href="/terms.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  title="Open Official Terms & Conditions (PDF)"
                >
                  <span>Terms &amp; Conditions</span>
                  <svg className="h-3 w-3 inline text-cyan-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </p>
            </div>
          </div>

          {/* Meta & X Tech-Giant Style Minimalist Footer */}
          <footer className="mt-6 pt-4 border-t border-slate-800/60 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11.5px] text-slate-500 select-none">
            <a href="/about" className="hover:text-slate-300 hover:underline transition-colors">About</a>
            <span className="text-slate-700">·</span>
            <a href="/terms.pdf" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 hover:underline transition-colors">Terms &amp; Conditions</a>
            <span className="text-slate-700">·</span>
            <a href="/privacy" className="hover:text-slate-300 hover:underline transition-colors">Privacy Policy</a>
            <span className="text-slate-700">·</span>
            <a href="/privacy#section-4" className="hover:text-slate-300 hover:underline transition-colors">Cookie Sandbox</a>
            <span className="text-slate-700">·</span>
            <span className="text-slate-600 font-mono text-[11px]">© 2026 Q-Link Protocol</span>
          </footer>
        </div>

        {showVipTerms && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80">
            <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700/70 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-[1px] shadow-[0_0_40px_rgba(148,163,184,0.7)]">
              <div className="relative max-h-[80vh] rounded-3xl bg-slate-950/95 px-5 py-4 sm:px-6 sm:py-5 overflow-y-auto scrollbar-hide">
                <div className="pointer-events-none absolute -left-24 -top-24 h-52 w-52 rounded-full bg-gradient-to-br from-red-500/60 via-fuchsia-500/40 to-cyan-400/40 blur-2xl" />
                <div className="pointer-events-none absolute -right-16 bottom-[-3rem] h-40 w-40 rounded-full bg-gradient-to-tr from-cyan-400/40 via-sky-500/40 to-fuchsia-500/40 blur-2xl" />

                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Verification & Badges
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-slate-50 sm:text-lg">
                      Q-Link badge policy
                    </h2>
                    <p className="mt-1 text-[11px] text-slate-400">
                      These badges are designed to protect identity and highlight
                      high-signal profiles. They are never sold as generic clout
                      icons.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsVipTermsAnimating(true);
                      setTimeout(() => setShowVipTerms(false), 300);
                    }}
                    className="rounded-full border border-slate-600/70 bg-slate-900/80 px-2 py-1 text-[10px] text-slate-300 hover:border-cyan-400/70 hover:text-cyan-200 active:border-cyan-300 active:bg-cyan-800 active:text-cyan-50 active:scale-90 transition-all duration-100"
                  >
                    Close
                  </button>
                </div>

                <div className="relative mt-4 space-y-4 text-[11px] text-slate-200">
                  <div className="rounded-2xl border border-red-500/60 bg-red-500/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-red-300 bg-red-500 text-[9px] font-bold text-slate-50">
                        ✓
                      </span>
                      <p className="text-[11px] font-semibold text-red-200">
                        Elite Founder (Red Tick)
                      </p>
                    </div>
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-200">
                      <li>• Reserved for system-level IDs and verified founders only.</li>
                      <li>• Manual review and identity proof are required; cannot be purchased casually.</li>
                      <li>• Grants higher visibility for feedback, product ideas and investor conversations.</li>
                      <li>• Currently experimental and limited; policy may evolve as Q-Link grows.</li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-sky-500/60 bg-sky-500/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-sky-300 bg-sky-500 text-[9px] font-bold text-slate-50">
                        ✓
                      </span>
                      <p className="text-[11px] font-semibold text-sky-200">
                        Blue Tick (Verified ID)
                      </p>
                    </div>
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-200">
                      <li>• Confirms that a quantum ID maps to a real person or brand.</li>
                      <li>• Issued to early builders, professionals and public profiles after verification.</li>
                      <li>• May be available as a paid verification plan with strict anti-impersonation checks.</li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-fuchsia-500/60 bg-fuchsia-500/5 p-3">
                    <p className="text-[11px] font-semibold text-fuchsia-200">
                      Future premium tiers
                    </p>
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-200">
                      <li>• Additional tiers (e.g., Millionaire, Billionaire) may unlock advanced routing or priority lanes.</li>
                      <li>• All future tiers will follow the same principles: clear criteria, no fake status, no identity confusion.</li>
                    </ul>
                  </div>

                  <p className="text-[10px] text-slate-500">
                    Note: Badge designs, names and eligibility criteria may change as we learn from
                    real-world usage. We will always prioritize authenticity and safety over vanity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {showNoAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
            <div
              className="relative w-full max-w-[380px] rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-2xl overflow-hidden transition-all duration-300"
              style={{
                maxWidth: "380px",
                minHeight: phoneSignInStep === "phone" ? (showCountryDropdown ? "510px" : "380px") : "auto"
              }}
            >
              {/* Subtle background glow */}
              <div
                className={`pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full blur-3xl animate-pulse ${isDefaultTheme ? "bg-cyan-500/10" : ""}`}
                style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-orb-primary)' : undefined }}
              />
              <div
                className={`pointer-events-none absolute -right-20 -bottom-20 h-40 w-40 rounded-full blur-3xl animate-pulse ${isDefaultTheme ? "bg-fuchsia-500/10" : ""}`}
                style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-orb-secondary)' : undefined }}
              />

              {/* Close Button */}
              <button
                onClick={() => {
                  setShowNoAccountModal(false);
                  setPhoneSignInStep("menu");
                  setPhoneNumber("");
                  setOtpCode("");
                }}
                className="absolute right-4 top-4 rounded-full border border-slate-700/60 bg-slate-950/80 p-1.5 text-slate-400 hover:text-white hover:border-slate-500 transition-all active:scale-95 z-10"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {phoneSignInStep === "menu" && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-white tracking-wide">
                      Alternative Access
                    </h2>
                    <p className="mt-1.5 text-xs text-slate-400">
                      Explore alternative methods to establish a link to the network.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {/* Apple Sign-in (Pulsing badge) */}
                    <div className="relative group">
                      <button
                        disabled
                        className="opacity-50 cursor-not-allowed grid w-full grid-cols-[48px_1fr_48px] items-center rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-medium text-slate-500 transition-all relative overflow-hidden"
                      >
                        <div className="flex h-5 w-5 items-center justify-center overflow-hidden text-slate-400">
                          {/* Apple Logo SVG */}
                          <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-.96.04-2.13.64-2.82 1.45-.6.69-1.12 1.83-.98 2.94.1.08.21.12.33.12.93 0 2.01-.56 2.48-1.45z" />
                          </svg>
                        </div>
                        <span className="text-center pr-2 font-medium text-slate-400">Continue with Apple</span>
                        <div></div>
                      </button>
                      <span className="absolute top-1/2 -translate-y-1/2 right-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-300 font-bold uppercase tracking-wider text-[8px] px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.2)] animate-pulse">
                        Coming Soon
                      </span>
                    </div>

                    {/* Mobile Sign-in Button */}
                    <div className="relative group">
                      <button
                        disabled
                        className="opacity-50 cursor-not-allowed grid w-full grid-cols-[48px_1fr_48px] items-center rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-medium text-slate-500 transition-all relative overflow-hidden"
                      >
                        <div className="flex h-5 w-5 items-center justify-center overflow-hidden text-slate-400">
                          {/* Mobile Phone SVG */}
                          <svg className="h-5 w-5 stroke-current fill-none" viewBox="0 0 24 24" strokeWidth={2}>
                            <rect x="5" y="2" width="14" height="20" rx="2" />
                            <line x1="12" y1="18" x2="12" y2="18.01" strokeLinecap="round" />
                          </svg>
                        </div>
                        <span className="text-center pr-2 font-medium text-slate-400">Continue with Mobile Number</span>
                        <div></div>
                      </button>
                      <span className="absolute top-1/2 -translate-y-1/2 right-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-300 font-bold uppercase tracking-wider text-[8px] px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.2)] animate-pulse">
                        Coming Soon
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {phoneSignInStep === "phone" && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-white tracking-wide flex items-center justify-center gap-2">
                      <span className="text-cyan-400">📱</span> Quantum Shield Access
                    </h2>
                    <p className="mt-1.5 text-xs text-slate-400">
                      Enter your mobile number to establish a secure link.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* Flags Dropdown & Phone Number input wrapper */}
                    <div className="relative">
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Mobile Phone Number
                      </label>
                      <div className="relative flex rounded-xl border border-slate-700 bg-slate-950/80 focus-within:border-cyan-400/70 transition-all z-20">
                        {/* Selector Trigger Button */}
                        <button
                          type="button"
                          onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                          className="flex items-center gap-1.5 border-r border-slate-800 bg-slate-900/50 px-3 text-sm font-semibold text-slate-300 hover:bg-slate-900 transition-all rounded-l-xl focus:outline-none"
                        >
                          <img
                            src={`https://flagcdn.com/w40/${selectedCountry.code.toLowerCase()}.png`}
                            alt={selectedCountry.name}
                            className="h-3 w-4.5 object-cover rounded-sm shadow-sm select-none border border-slate-800"
                          />
                          <span className="text-slate-200">{selectedCountry.dial}</span>
                          <svg className={`h-3 w-3 text-slate-500 transition-transform duration-200 ${showCountryDropdown ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        <input
                          type="tel"
                          placeholder="98765 43210"
                          value={phoneNumber}
                          onFocus={() => setShowCountryDropdown(false)}
                          onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                          className="w-full bg-transparent px-3 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none"
                        />
                      </div>

                      {/* Dropdown Menu */}
                      {showCountryDropdown && (
                        <div className="absolute left-0 right-0 mt-1.5 rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-xl z-30 p-2 max-h-[220px] overflow-hidden flex flex-col animate-[fadeIn_0.15s_ease-out]">
                          {/* Search Input */}
                          <div className="relative mb-2">
                            <input
                              type="text"
                              placeholder="Search country or code..."
                              value={countrySearchQuery}
                              onChange={(e) => setCountrySearchQuery(e.target.value)}
                              className="w-full rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-400/50 transition-all"
                            />
                            {countrySearchQuery && (
                              <button
                                onClick={() => setCountrySearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                              >
                                ✕
                              </button>
                            )}
                          </div>

                          {/* Country List */}
                          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                            {filteredCountries.length === 0 ? (
                              <p className="text-center text-[10px] text-slate-500 py-3">No matching countries</p>
                            ) : (
                              filteredCountries.map((c) => (
                                <button
                                  key={c.code}
                                  type="button"
                                  onClick={() => {
                                    setSelectedCountry(c);
                                    setShowCountryDropdown(false);
                                    setCountrySearchQuery("");
                                  }}
                                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-900 hover:text-white transition-all active:scale-[0.98]"
                                >
                                  <div className="flex items-center gap-2">
                                    <img
                                      src={`https://flagcdn.com/w40/${c.code.toLowerCase()}.png`}
                                      alt={c.name}
                                      className="h-3.5 w-5 object-cover rounded-sm shadow-sm select-none border border-slate-900"
                                    />
                                    <span className="truncate max-w-[160px]">{c.name}</span>
                                  </div>
                                  <span className="font-semibold text-slate-500 text-[10px]">{c.dial}</span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={async () => {
                        if (!phoneNumber) {
                          alert("Please enter a valid mobile number.");
                          return;
                        }
                        const fullPhone = `${selectedCountry.dial}${phoneNumber}`;
                        setOtpSending(true);
                        try {
                          const res = await fetch("/api/auth/otp/send", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ phone: fullPhone }),
                          });
                          const data = await res.json();
                          if (res.ok) {
                            setPhoneSignInStep("otp");
                            if (data.mocked) {
                              alert(`[DEVELOPMENT MODE]\nVerification code logged to terminal! (For number: ${fullPhone})`);
                            }
                          } else {
                            alert(data.error || "Unable to dispatch OTP code.");
                          }
                        } catch (err) {
                          alert("Failed to reach key server. Try again.");
                        } finally {
                          setOtpSending(false);
                        }
                      }}
                      disabled={otpSending}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-slate-950 font-bold text-sm tracking-wider uppercase transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                    >
                      {otpSending ? "Generating Secure OTP..." : "Generate OTP"}
                    </button>

                    <button
                      onClick={() => setPhoneSignInStep("menu")}
                      className="w-full text-center text-xs text-slate-500 hover:text-slate-400 underline transition-all"
                    >
                      Back to options
                    </button>
                  </div>
                </div>
              )}

              {phoneSignInStep === "otp" && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-white tracking-wide">
                      OTP Key Verification
                    </h2>
                    <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                      Verification key dispatched to <span className="text-cyan-400 font-semibold">{selectedCountry.dial} {phoneNumber.replace(/(\d{5})(\d{5})/, "$1 $2")}</span>.<br />
                      Enter the 6-digit credential below.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                        Verification Code (OTP)
                      </label>
                      <input
                        type="text"
                        placeholder="• • • • • •"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                        className="w-full text-center tracking-[0.6em] font-mono rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-3 text-base text-slate-100 placeholder-slate-700 outline-none focus:border-cyan-400/70 transition-all"
                      />
                    </div>

                    <button
                      onClick={async () => {
                        if (otpCode.length !== 6) {
                          alert("Please enter the 6-digit OTP code.");
                          return;
                        }
                        const fullPhone = `${selectedCountry.dial}${phoneNumber}`;
                        setOtpSending(true);
                        try {
                          const result = await signIn("phone-otp", {
                            phone: fullPhone,
                            otp: otpCode,
                            redirect: false,
                          });
                          if (result?.error) {
                            alert(result.error || "Verification failed. Please check the code.");
                          } else {
                            setPhoneSignInStep("success");
                          }
                        } catch (err) {
                          alert("Failed to authenticate verification key.");
                        } finally {
                          setOtpSending(false);
                        }
                      }}
                      disabled={otpSending}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold text-sm tracking-wider uppercase transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                    >
                      {otpSending ? "Authenticating OTP..." : "Verify & Authenticate"}
                    </button>

                    <div className="flex justify-between text-xs px-1">
                      <button
                        onClick={async () => {
                          const fullPhone = `${selectedCountry.dial}${phoneNumber}`;
                          try {
                            const res = await fetch("/api/auth/otp/send", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ phone: fullPhone }),
                            });
                            const data = await res.json();
                            if (res.ok) {
                              alert("OTP resent successfully!");
                              if (data.mocked) {
                                alert(`[DEVELOPMENT MODE]\nNew Verification code logged to terminal!`);
                              }
                            } else {
                              alert(data.error || "Unable to resend OTP.");
                            }
                          } catch {
                            alert("Failed to resend secure key.");
                          }
                        }}
                        className="text-slate-400 hover:text-slate-300 transition-all underline"
                      >
                        Resend OTP
                      </button>
                      <button
                        onClick={() => setPhoneSignInStep("phone")}
                        className="text-slate-500 hover:text-slate-400 transition-all underline"
                      >
                        Change number
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {phoneSignInStep === "success" && (
                <div className="text-center space-y-6 py-4">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 text-3xl animate-bounce">
                    ✓
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-white tracking-wide">
                      Credential Validated
                    </h2>
                    <p className="mt-2 text-xs text-slate-400 leading-relaxed px-4">
                      Your quantum access node has been successfully established and verified.
                      Welcome to the Q-Link core directory!
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      window.location.reload();
                    }}
                    className="w-full py-3 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm tracking-wider uppercase transition-all hover:bg-emerald-400 active:scale-[0.98]"
                  >
                    Enter Core Directory
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inline settings card is rendered near the top-left instead of a global overlay */}
      </main>
    );
  }

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!friendIdInput.trim()) return;

    setSearching(true);
    setSearchError(null);
    setFoundUser(null);
    setSelectedCategories([]);
    setComment("");
    setRequestError(null);
    setRequestSuccess(null);

    try {
      const res = await fetch("/api/friends/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: friendIdInput.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSearchError(data.error || "Quantum ID not found.");
        return;
      }

      const data = await res.json();
      setFoundUser(data.user as FoundUser);
    } catch {
      setSearchError("Unable to reach quantum directory. Try again.");
    } finally {
      setSearching(false);
    }
  };

  const isTourModalBlocked = showOnboarding || showInstallPrompt;
  const highlightQuantumId = showGuide && !isTourModalBlocked && guideStep === 0;
  const highlightEditId = showGuide && !isTourModalBlocked && guideStep === 1;
  const highlightConnect = showGuide && !isTourModalBlocked && guideStep === 2;
  const highlightRequests = showGuide && !isTourModalBlocked && guideStep === 3;
  const highlightChatPanel = showGuide && !isTourModalBlocked && guideStep === 4;
  const highlightFullChat = showGuide && !isTourModalBlocked && guideStep === 5;
  const highlightConsole = showGuide && !isTourModalBlocked && guideStep === 6;
  const highlightSettingsPill = showGuide && !isTourModalBlocked && guideStep === 7;

  const advanceGuide = () => {
    const next = guideStep + 1;
    const maxStep = 7;
    if (next > maxStep) {
      setShowGuide(false);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("qc_seen_guide_v1", "1");
        } catch {
          // ignore
        }
      }
      return;
    }
    setGuideStep(next);
  };

  const restartGuide = () => {
    setShowGuide(true);
    setGuideStep(0);
  };

  const handleChatKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (!activePeerHandle || !chatInput.trim()) return;
      e.preventDefault();
      const text = chatInput.trim();
      setChatInput("");
      await handleSendMessage(text);
    }
  };

  const toggleCategory = (cat: string) => {
    setRequestError(null);
    setRequestSuccess(null);
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) {
        return prev.filter((c) => c !== cat);
      }
      if (prev.length >= 2) {
        return prev; // enforce max 2
      }
      return [...prev, cat];
    });
  };

  const handleSendRequest = async () => {
    if (!foundUser) return;
    const isVipTarget = isVipHandle(foundUser.handle);

    const categoriesToSend = isVipTarget
      ? ["Feedback"]
      : selectedCategories;

    if (!isVipTarget && categoriesToSend.length === 0) {
      setRequestError("Select at least one relationship category.");
      return;
    }

    setSendingRequest(true);
    setRequestError(null);
    setRequestSuccess(null);

    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toHandle: foundUser.handle,
          categories: categoriesToSend,
          message: comment,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRequestError(data.error || "Failed to send request.");
        return;
      }

      setRequestSuccess("Request sent successfully.");
      setComment("");
      setSelectedCategories([]);
      setFoundUser(null);
      setFriendIdInput("");

      // Refresh outgoing list
      const outRes = await fetch("/api/friends/outgoing");
      if (outRes.ok) {
        const outData = await outRes.json();
        setOutgoing((outData.requests || []) as OutgoingRequest[]);
      }

      // Return to home view
      setMode("home");
    } catch {
      setRequestError("Something went wrong. Try again.");
    } finally {
      setSendingRequest(false);
    }
  };

  async function openChatWithPeer(peerHandle: string) {
    const targetPeer = peerHandle.trim();
    if (!targetPeer) return;

    // Safety guard: cannot chat with oneself
    const meHandle = (session?.user as any)?.handle;
    const meId = (session?.user as any)?.id;
    if (
      (meHandle && cleanHandle(targetPeer).toLowerCase() === cleanHandle(meHandle).toLowerCase()) ||
      (meId && targetPeer === meId)
    ) {
      setActivePeerHandle(null);
      setIsChatFull(false);
      replaceNavState({ screen: "home" });
      return;
    }

    currentPeerFetchRef.current = targetPeer;
    setActivePeerHandle(targetPeer);
    setViewingProfileHandle(null);
    setMode("home");
    setDirectoryProfileHandle(null);
    setDirectoryProfileInitialData(null);
    setShowDirectory(false);
    setFoundUser(null);
    setIsConsoleAnimating(false);

    // Responsive split layout: On desktop (>= 1024px), keep split-screen layout with Home feed active and visible!
    // On mobile (< 1024px), expand chat to full viewport.
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsChatFull(true);
    } else {
      setIsChatFull(false);
    }

    pushNavState({ screen: "chat", handle: targetPeer });
    setChatError(null);
    setPeerOnline(null);
    setPeerLastSeen(null);
    setShowOfflineTransitionName(false);
    lastOnlineRef.current = null;
    initialScrollDoneRef.current = null;

    // Immediately clear unread status for target peer from unread tracker and connection lists
    setUnreadMessages((prev) => markHandleAsRead(prev, targetPeer));
    setIncoming((prev) =>
      prev.map((r) =>
        areHandlesEqual(r.fromUser?.handle, targetPeer)
          ? { ...r, isUnread: false, unreadCount: 0 }
          : r
      )
    );
    setOutgoing((prev) =>
      prev.map((r) =>
        areHandlesEqual(r.toUser?.handle, targetPeer)
          ? { ...r, isUnread: false, unreadCount: 0 }
          : r
      )
    );
    incomingFriendsEtagRef.current = null;
    outgoingFriendsEtagRef.current = null;

    // Instant SWR Cache Check & persistent Outbox merge (0ms display, zero message loss):
    const cacheKey = cleanHandle(targetPeer);
    const cached = peerMessagesCacheRef.current.get(cacheKey) || [];
    const outboxForPeer = outboxQueue.getForHandle(targetPeer);
    const pendingAsChatMsgs: ChatMessage[] = outboxForPeer.map((o) => ({
      id: o.tempId,
      content: o.content,
      createdAt: o.createdAt,
      senderId: (session?.user as any)?.id || "me",
      isEncrypted: o.isEncrypted,
      status: o.status || "PENDING",
    }));

    const immediateMessages = [...cached, ...pendingAsChatMsgs];
    if (immediateMessages.length > 0) {
      setChatMessages(immediateMessages);
      setChatLoading(false);
    } else {
      setChatMessages([]);
      setChatLoading(true);
    }

    try {
      const cleanTarget = cleanHandle(targetPeer);
      const cachedEtag = chatEtagsRef.current.get(cleanTarget);
      const headers: Record<string, string> = {};
      if (cachedEtag && cached.length > 0) {
        headers["If-None-Match"] = cachedEtag;
      }

      const res = await fetch(
        `/api/chat/history?peerHandle=${encodeURIComponent(targetPeer)}`,
        { headers }
      );

      // Discard response if user already navigated to another chat while request was in flight
      if (currentPeerFetchRef.current !== targetPeer) return;

      if (res.status === 304) {
        setChatLoading(false);
        setUnreadMessages((prev) => markHandleAsRead(prev, targetPeer));
        return;
      }

      if (!res.ok) {
        setChatLoading(false);
        // If offline or server error, preserve cached & outbox messages without error banner
        const outboxForPeer = outboxQueue.getForHandle(targetPeer);
        if (outboxForPeer.length > 0) {
          const pendingAsChatMsgs: ChatMessage[] = outboxForPeer.map((o) => ({
            id: o.tempId,
            content: o.content,
            createdAt: o.createdAt,
            senderId: (session?.user as any)?.id || "me",
            isEncrypted: o.isEncrypted,
            status: o.status || "PENDING",
          }));
          setChatMessages((prev) => (prev.length > 0 ? prev : pendingAsChatMsgs));
        }
        setChatError(null);
        return;
      }

      const newEtag = res.headers.get("etag");
      if (newEtag) chatEtagsRef.current.set(cleanTarget, newEtag);

      const data = await res.json();
      if (currentPeerFetchRef.current !== targetPeer) return;

      const peerKey = data.peer?.publicKeyString || null;
      const rawMessages = (data.messages as ChatMessage[]) || [];
      const decryptedMessages = await decryptMessageList(rawMessages, peerKey);

      if (currentPeerFetchRef.current !== targetPeer) return;

      setChatRoomId((data.roomId as string) || null);
      setActivePeerPublicKey(peerKey);
      const initialMessages = decryptedMessages.map((m) => ({
        ...m,
        createdAt: m.createdAt,
      }));
      // Deduplicate messages by ID
      const seenIds = new Set<string>();
      const uniqueMessages = initialMessages.filter((m) => {
        if (seenIds.has(m.id)) return false;
        seenIds.add(m.id);
        return true;
      });

      // Merge persistent Outbox messages so pending offline messages never disappear
      const outboxForPeer = outboxQueue.getForHandle(targetPeer);
      const pendingAsChatMsgs: ChatMessage[] = outboxForPeer.map((o) => ({
        id: o.tempId,
        content: o.content,
        createdAt: o.createdAt,
        senderId: (session?.user as any)?.id || "me",
        isEncrypted: o.isEncrypted,
        status: o.status || "PENDING",
      }));

      const finalMessages = [...uniqueMessages, ...pendingAsChatMsgs];
      setChatMessages(finalMessages);
      peerMessagesCacheRef.current.set(cacheKey, uniqueMessages);

      // Update last seen message ID to local storage
      if (uniqueMessages.length > 0) {
        const lastMsg = uniqueMessages[uniqueMessages.length - 1];
        localStorage.setItem(`qlink_last_msg_id_${cleanHandle(targetPeer)}`, lastMsg.id);
      }

      setUnreadMessages((prev) => markHandleAsRead(prev, targetPeer));
    } catch {
      if (currentPeerFetchRef.current === targetPeer) {
        // Tech-giant standard: keep existing cached & outbox messages, never wipe or show red error
        const outboxForPeer = outboxQueue.getForHandle(targetPeer);
        if (outboxForPeer.length > 0) {
          const pendingAsChatMsgs: ChatMessage[] = outboxForPeer.map((o) => ({
            id: o.tempId,
            content: o.content,
            createdAt: o.createdAt,
            senderId: (session?.user as any)?.id || "me",
            isEncrypted: o.isEncrypted,
            status: o.status || "PENDING",
          }));
          setChatMessages((prev) => (prev.length > 0 ? prev : pendingAsChatMsgs));
        }
        setChatError(null);
      }
    } finally {
      if (currentPeerFetchRef.current === targetPeer) {
        setChatLoading(false);
      }
    }
  };

  const handleIncomingDecision = async (
    requestId: string,
    action: "ACCEPT" | "REJECT",
    peerHandle: string
  ) => {
    setIncomingError(null);
    try {
      const res = await fetch("/api/friends/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setIncomingError(
          data.error || "Unable to update request. Please try again."
        );
        return;
      }

      const data = await res.json();
      const updated = data.request as IncomingRequest;

      setIncoming((prev) =>
        prev.map((r) => (r.id === updated.id ? { ...r, status: updated.status } : r))
      );

      if (action === "ACCEPT") {
        await openChatWithPeer(peerHandle);
      }
    } catch {
      setIncomingError("Unable to update request. Please try again.");
    }
  };

  const actuallySendChat = async () => {
    if (!activePeerHandle || !chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    await handleSendMessage(text);
  };

  const handleChatSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await actuallySendChat();
  };

  const handleTriggerEmergencyBeacon = async () => {
    if (!activePeerHandle) return;
    setIsSendingBeacon(true);
    setBeaconStatusMsg("Dispatching Priority Emergency Beacon...");
    try {
      quantumAudio.warmup();
      quantumAudio.playEmergencyChime();
      const res = await fetch("/api/chat/beacon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toHandle: activePeerHandle,
          noteText: chatInput ? chatInput.trim() : "Urgent Emergency Beacon Pulse!",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setBeaconStatusMsg(data.error || "Failed to dispatch beacon.");
        return;
      }
      setBeaconStatusMsg(`⚡ Emergency Beacon sent to @${activePeerHandle}!`);
      setTimeout(() => setBeaconStatusMsg(null), 4000);
      setChatInput("");
      if (chatInputRef.current) {
        chatInputRef.current.style.height = "auto";
      }
    } catch {
      setBeaconStatusMsg("Failed to dispatch beacon.");
    } finally {
      setIsSendingBeacon(false);
    }
  };

  const handleChatInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    if (chatInputRef.current) {
      chatInputRef.current.style.height = "auto";
      chatInputRef.current.style.height = `${chatInputRef.current.scrollHeight}px`;
    }

    if (!activePeerHandle) return;

    // Notify backend that we are typing to this peer.
    // Optimization: only send `typing: true` once per burst, but always
    // schedule a single `typing: false` after a short idle.
    const notifyTyping = async (typing: boolean) => {
      try {
        await fetch("/api/presence/typing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toHandle: activePeerHandle, typing }),
        });
      } catch {
        // ignore typing errors
      }
    };

    // Send `typing: true` immediately only when we enter a new typing burst
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      notifyTyping(true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      notifyTyping(false);
    }, 3000);
  };

  const quantumId = currentHandle || (effectiveUser as any)?.handle || "your-id";
  const meId = (effectiveUser as any)?.id as string | undefined;
  const meEmail = (effectiveUser as any)?.email as string | undefined;
  const effectiveBlueTickStatus = localBlueTickOverride !== null
    ? localBlueTickOverride
    : ((effectiveUser as any)?.blue_tick_status || 'NONE');

  const isVipHandle = (handle: string | null | undefined) => handle === "Rohit_7779";

  const formatLastOnlineTime = (date: Date | null) => {
    if (!date || Number.isNaN(date.getTime())) return "";
    try {
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.max(0, Math.floor(diffMs / 1000));

      if (diffSec < 60) return "just now";
      if (diffSec < 3600) {
        const mins = Math.floor(diffSec / 60);
        return `${mins}m ago`;
      }

      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday =
        date.getDate() === yesterday.getDate() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getFullYear() === yesterday.getFullYear();

      const timeStr = date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });

      if (isToday) {
        return `today at ${timeStr}`;
      } else if (isYesterday) {
        return `yesterday at ${timeStr}`;
      } else {
        const dateStr = date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        return `${dateStr} at ${timeStr}`;
      }
    } catch {
      return "";
    }
  };

  const validateHandleDraft = (value: string): string | null => {
    const trimmed = value.trim();

    // Special-case: allow the founder account to claim the reserved VIP handle
    // Rohit_7779 without enforcing the normal numeric/length rules.
    if (meEmail === "rohiterrors@gmail.com" && trimmed === "Rohit_7779") {
      return null;
    }

    const digitCount = (trimmed.match(/\d/g) || []).length;
    if (!trimmed) return null;
    if (trimmed.length < 6 || digitCount < 4) {
      return "Your quantum ID must be at least 6 characters and include at least 4 numbers.";
    }
    return null;
  };

  const startEditingHandle = () => {
    setHandleDraft(quantumId.replace(/^@/, ""));
    setNameDraft(displayName || "");
    setHandleError(null);
    setEditingHandle(true);
  };

  const cancelEditingHandle = () => {
    setEditingHandle(false);
    setHandleDraft("");
    setNameDraft("");
    setHandleError(null);
  };

  const onHandleDraftChange = (value: string) => {
    setHandleDraft(value);
    const msg = validateHandleDraft(value);
    setHandleError(msg);
  };

  const saveHandle = async () => {
    const trimmed = handleDraft.trim();
    const msg = validateHandleDraft(trimmed);
    if (msg) {
      setHandleError(msg);
      return;
    }

    if (!trimmed) return;

    setHandleSaving(true);
    setHandleError(null);

    try {
      const res = await fetch("/api/user/handle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: trimmed }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setHandleError(
          data.error ||
          "We couldn't update your quantum ID. Please review the rules above and try again.",
        );
        return;
      }

      const updatedHandle = (data.user?.handle as string | undefined) || trimmed;
      setCurrentHandle(updatedHandle);

      let updatedName = displayName;
      // Update display name if it changed
      const nameToSend = nameDraft.trim();
      if (nameToSend && nameToSend !== (displayName || "")) {
        try {
          const nameRes = await fetch("/api/user/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: nameToSend }),
          });

          const nameData = await nameRes.json().catch(() => ({}));
          if (!nameRes.ok) {
            // Reuse handleError surface for name failures as well
            setHandleError(
              nameData.error ||
              "We couldn't update your display name. Please try again.",
            );
          } else {
            updatedName = (nameData.user?.name as string | undefined) || nameToSend;
            setDisplayName(updatedName || null);
          }
        } catch {
          setHandleError(
            "We couldn't reach the server to update your display name. Please try again.",
          );
        }
      }

      // Authoritative state update: keep currentUserProfile, session, and local cache synchronized
      setCurrentUserProfile((prev: any) => ({
        ...prev,
        handle: updatedHandle,
        name: updatedName || prev?.name,
      }));
      if (session?.user) {
        (session.user as any).handle = updatedHandle;
        if (updatedName) (session.user as any).name = updatedName;
      }
      try {
        await updateSession({
          user: {
            handle: updatedHandle,
            name: updatedName || displayName,
          },
        });
      } catch {}

      setEditingHandle(false);
      setHandleDraft("");
      setNameDraft("");
      setHandleError(null);
    } catch {
      setHandleError(
        "We couldn't reach the quantum directory. Please check your connection and try again.",
      );
    } finally {
      setHandleSaving(false);
    }
  };

  const handleSkipInstall = () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("qc_pwa_install_seen_v1", "dismissed");
      }
    } catch {
      // ignore
    }
    setShowInstallPrompt(false);
    // User selected their choice on shortcut screen: now start tour guide
    startTourGuideIfEligible();
  };

  const handleProfilePicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      alert("Image size must be less than 1MB.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/user/profile-pic", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to upload profile picture.");
        return;
      }

      const data = await res.json();
      setProfilePicUrl(data.url);
      setCurrentUserProfile((prev: any) => ({ ...prev, image: data.url }));
      if (session?.user) {
        (session.user as any).image = data.url;
      }

      // Instantly update next-auth session and reload feed to propagate avatar across existing posts
      try {
        await updateSession({
          user: {
            image: data.url,
          },
        });
      } catch (err) {
        console.warn("Failed to update session silently:", err);
      }
      try {
        await fetchIdConsolePosts();
        await fetchDirectoryLatestPosts();
      } catch (err) {
        console.warn("Failed to reload posts automatically:", err);
      }
    } catch {
      alert("Failed to upload profile picture.");
    }

    // Reset input
    if (profilePicInputRef.current) {
      profilePicInputRef.current.value = "";
    }
  };

  const openUserProfile = (targetHandle: string | null | undefined, initialData?: any) => {
    if (!targetHandle) return;
    const clean = cleanHandle(targetHandle);
    
    // Open directly INSIDE the Global Quantum Directory modal
    setDirectoryProfileHandle(clean);
    setDirectoryProfileInitialData(initialData || null);
    setShowDirectory(true);
    pushNavState({ screen: "directory", handle: clean });
    setIsConsoleAnimating(true);
    setTimeout(() => setIsConsoleAnimating(false), 300);
  };

  const handleDirectorySelect = async (handle: string | null) => {
    if (!handle) return;
    const foundItem = (directoryItems || []).find(
      (item) => cleanHandle(item.handle) === cleanHandle(handle) || item.id === handle
    );
    openUserProfile(handle, foundItem);
  };

  const handleSignOut = async () => {
    try {
      try {
        localStorage.removeItem("qc_session_signature");
        localStorage.removeItem("qc_friends_count");
        localStorage.removeItem("qc_requests_count");
      } catch {}
      setCachedSessionUser(null);
      await signOut({ redirect: false });
      // Clear any local storage if needed
      localStorage.clear();

      // Notify Electron desktop main process to clear local config token, cookies, and lock
      if (typeof window !== "undefined" && (window as any).electronAPI?.logout) {
        (window as any).electronAPI.logout();
      } else {
        // Web redirect fallback: use replace to avoid appending a redundant login state to the history stack
        window.location.replace('/');
      }
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // ── Timestamp helpers ──────────────────────────────────────────────────────
  const formatDateLabel = (iso: string): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (msgDay.getTime() === today.getTime()) return "Today";
    if (msgDay.getTime() === yesterday.getTime()) return "Yesterday";
    return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  };

  const formatMsgDateFull = (iso: string): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (msgDay.getTime() === today.getTime()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return (
      d.toLocaleDateString([], { day: "numeric", month: "short" }) +
      " · " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const isSameDay = (isoA: string, isoB: string): boolean => {
    const a = new Date(isoA);
    const b = new Date(isoB);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return true;
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  };
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <main
      ref={mainScrollRef}
      id="main-scroll-container"
      className="scrollbar-hide"
      data-scrollbar-hide="true"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100dvh',
        overflowX: 'hidden',
        overflowY: isChatExpanded ? 'hidden' : 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        overflowAnchor: 'none',
      }}
    >
      <div style={{ width: '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: isChatExpanded ? '100%' : 'auto', flex: isChatExpanded ? '1' : 'unset', overflowAnchor: 'none' }}>
        {showInstallPrompt && !showOnboarding && (
          <div className="pointer-events-auto fixed inset-0 z-45 flex items-center justify-center bg-slate-950/80 px-4">
            <div className="max-w-md w-full rounded-2xl border border-cyan-500/30 bg-slate-950/95 p-5 text-xs text-slate-100 shadow-[0_0_50px_rgba(6,182,212,0.25)] backdrop-blur-md">
              <p className="text-sm font-bold text-cyan-400 font-mono uppercase tracking-wider">
                Create a shortcut to Q-link Chat
              </p>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                Install this app on your device for the ultimate full-screen experience, zero browser throttling, and 100% reliable background notifications.
              </p>
              <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-400/90 leading-relaxed">
                <strong>⚠️ Warning:</strong> Skipping installation may block real-time lock-screen chat alerts, especially on <strong>iOS (Safari)</strong> where Web Push notifications are exclusively supported for Home Screen apps!
              </div>
              {!installPromptEvent && (
                <p className="mt-2 text-[10px] text-slate-400 font-mono">
                  To install manually: open your browser options menu and tap <strong>&quot;Add to Home Screen&quot;</strong>.
                </p>
              )}
              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                {isWindowsClient && (
                  <a
                    href="/downloads/Q-Link-Setup.exe"
                    download="Q-Link-Setup.exe"
                    onClick={handleSkipInstall}
                    className="flex-1 inline-flex items-center justify-center rounded-xl bg-cyan-500 px-3 py-2.5 text-center font-bold text-slate-950 hover:bg-cyan-400 transition duration-200 text-xs tracking-wide shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                    style={{ textDecoration: 'none' }}
                  >
                    Download Windows App (.exe)
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleInstallClick}
                  disabled={!installPromptEvent}
                  className={
                    "flex-1 inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-center font-bold text-xs tracking-wide transition duration-200 " +
                    (installPromptEvent
                      ? (isWindowsClient ? "bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white" : "bg-cyan-500 text-slate-950 hover:bg-cyan-400")
                      : "bg-slate-900 text-slate-500 border border-slate-800/80 cursor-not-allowed")
                  }
                >
                  {isWindowsClient ? "Install Web App" : "Install app"}
                </button>
                <button
                  type="button"
                  onClick={handleSkipInstall}
                  className="flex-1 inline-flex items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2.5 text-center font-bold text-slate-200 hover:bg-slate-800/80 transition duration-200 text-xs tracking-wide"
                >
                  Continue in browser
                </button>
              </div>
            </div>
          </div>
        )}



        {showMoreCategories && (() => {
          const trimmedQuery = categorySearchQuery.trim().toLowerCase();
          const filteredCategories = extendedCategories.filter((cat) =>
            cat.toLowerCase().includes(trimmedQuery)
          );

          // Substring Highlight Engine for Real-Time Precision Query Sync
          const highlightMatch = (textVal: string, query: string) => {
            const cleanQuery = query.trim();
            if (!cleanQuery) return textVal;

            const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`(${escaped})`, "gi");
            const parts = textVal.split(regex);

            return parts.map((part, idx) => {
              if (part.toLowerCase() === cleanQuery.toLowerCase()) {
                return (
                  <span
                    key={idx}
                    className="rounded-[3px] bg-cyan-400/25 px-0.5 font-bold text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.85)] border border-cyan-400/40"
                  >
                    {part}
                  </span>
                );
              }
              return <span key={idx}>{part}</span>;
            });
          };

          const handleSpotlightMouseMove = (e: React.MouseEvent<HTMLElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
            e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
            e.currentTarget.style.setProperty("--spotlight-opacity", "1");
          };

          const handleSpotlightMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
            e.currentTarget.style.setProperty("--spotlight-opacity", "0");
          };

          return (
            <div
              className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-md transition-all duration-300"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setShowMoreCategories(false);
                  setCategorySearchQuery("");
                }
              }}
            >
              <div className="relative w-full max-w-md max-h-[75vh] rounded-3xl border border-cyan-400/35 bg-gradient-to-b from-slate-900/95 via-slate-950/98 to-slate-950 p-[1px] shadow-[0_12px_45px_rgba(6,182,212,0.35),0_0_20px_rgba(0,0,0,0.8)] overflow-hidden">
                <div className="relative flex max-h-[74vh] flex-col rounded-3xl bg-slate-950/90 px-4 py-4 overflow-hidden">
                  {/* Subtle Aurora Ambient Glow */}
                  <div
                    className={`pointer-events-none absolute -left-20 -top-20 h-44 w-44 rounded-full blur-3xl ${isDefaultTheme ? "bg-gradient-to-br from-cyan-500/25 via-blue-600/20 to-purple-600/15" : ""}`}
                    style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-orb-primary)' : undefined }}
                  />
                  <div
                    className={`pointer-events-none absolute -right-20 bottom-[-4rem] h-44 w-44 rounded-full blur-3xl ${isDefaultTheme ? "bg-gradient-to-tr from-indigo-500/20 via-sky-500/20 to-cyan-500/20" : ""}`}
                    style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-orb-secondary)' : undefined }}
                  />

                  {/* Header */}
                  <div className="relative flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                        </span>
                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                          More Relationship Types
                        </p>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400 font-medium">
                        Search & select the most accurate connection role (max 2).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreCategories(false);
                        setCategorySearchQuery("");
                      }}
                      className="rounded-full border border-slate-700/80 bg-slate-900/90 px-3.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-all hover:border-cyan-400/80 hover:bg-cyan-950/40 hover:text-cyan-200 active:scale-95 shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
                    >
                      Close
                    </button>
                  </div>

                  {/* Quiet Luxury Ultra-Sleek Search Bar (Enterprise Grade) */}
                  <div className="relative mt-3.5 space-y-2">
                    <div className="group relative flex items-center rounded-2xl border border-cyan-500/30 bg-slate-900/60 px-3.5 py-2.5 backdrop-blur-2xl transition-all duration-300 focus-within:border-cyan-400 focus-within:bg-slate-900/90 focus-within:shadow-[0_0_24px_rgba(6,182,212,0.3),inset_0_1px_1px_rgba(255,255,255,0.15)]">
                      {/* Search Glyph */}
                      <svg
                        className="h-4 w-4 text-cyan-400/80 transition-colors group-focus-within:text-cyan-300 drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>

                      <input
                        type="text"
                        value={categorySearchQuery}
                        onChange={(e) => setCategorySearchQuery(e.target.value)}
                        placeholder="Search relationship (e.g. Mentor, Co-Founder, Sister...)"
                        className="w-full bg-transparent pl-3 pr-7 text-xs font-medium text-white placeholder-slate-500 focus:outline-none"
                        autoFocus
                      />

                      {categorySearchQuery && (
                        <button
                          type="button"
                          onClick={() => setCategorySearchQuery("")}
                          className="absolute right-3 rounded-full p-1 text-slate-400 hover:bg-slate-800/80 hover:text-white transition-all active:scale-90"
                          title="Clear search"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Result Counter & Custom Role Toolbar */}
                    <div className="flex items-center justify-between px-1 text-[10.5px] font-medium text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        <span>{filteredCategories.length} {filteredCategories.length === 1 ? "type" : "types"} found</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {categorySearchQuery && (
                          <button
                            type="button"
                            onClick={() => setCategorySearchQuery("")}
                            className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors mr-1"
                          >
                            Reset Filter
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsCustomRoleOpen((prev) => !prev)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-all ${
                            isCustomRoleOpen
                              ? "bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-400/50 shadow-[0_0_10px_rgba(217,70,239,0.3)]"
                              : "bg-slate-900/80 text-slate-300 border border-slate-700 hover:border-fuchsia-400/60 hover:text-fuchsia-300"
                          }`}
                        >
                          <span>✨ + Custom Private Tag</span>
                        </button>
                      </div>
                    </div>

                    {/* Inline Expandable Quiet Luxury Custom Role Input */}
                    {isCustomRoleOpen && (
                      <div className="relative rounded-2xl border border-fuchsia-500/40 bg-gradient-to-b from-fuchsia-950/30 via-slate-900/70 to-slate-950/90 p-3 shadow-[0_4px_20px_rgba(217,70,239,0.2)] animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10.5px] font-bold text-fuchsia-300 flex items-center gap-1">
                            <span>🔒 Custom Private Relationship</span>
                          </span>
                          <span className="text-[9.5px] text-slate-400 font-medium">Only visible to you</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={customRoleInput}
                            onChange={(e) => setCustomRoleInput(e.target.value)}
                            placeholder="Enter custom nickname or tag (e.g. VIP Investor, Gym Partner)..."
                            className="flex-1 rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-fuchsia-400 focus:outline-none focus:shadow-[0_0_12px_rgba(217,70,239,0.25)]"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && customRoleInput.trim()) {
                                e.preventDefault();
                                const newRole = customRoleInput.trim();
                                toggleCategory(newRole);
                                setCustomRoleInput("");
                                setIsCustomRoleOpen(false);
                                setShowMoreCategories(false);
                              }
                            }}
                          />
                          <button
                            type="button"
                            disabled={!customRoleInput.trim()}
                            onClick={() => {
                              const newRole = customRoleInput.trim();
                              if (newRole) {
                                toggleCategory(newRole);
                                setCustomRoleInput("");
                                setIsCustomRoleOpen(false);
                                setShowMoreCategories(false);
                              }
                            }}
                            className="rounded-xl border border-fuchsia-400/60 bg-fuchsia-500/20 px-3 py-1.5 text-xs font-semibold text-fuchsia-200 transition-all hover:bg-fuchsia-500/30 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(217,70,239,0.2)] active:scale-95"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Scrollable Categories List */}
                  <div className="relative mt-2.5 flex-1 overflow-y-auto px-1 py-1 space-y-1.5 scrollbar-hide apple-smooth-scroll tech-giant-scroll-container">
                    {/* Instant Dynamic Custom Role Match Card if Query Not Exactly in List */}
                    {categorySearchQuery.trim().length > 0 &&
                      !extendedCategories.some(
                        (cat) => cat.toLowerCase() === categorySearchQuery.trim().toLowerCase()
                      ) && (
                        <button
                          type="button"
                          onMouseMove={handleSpotlightMouseMove}
                          onMouseLeave={handleSpotlightMouseLeave}
                          onClick={() => {
                            const customRole = categorySearchQuery.trim();
                            if (customRole) {
                              toggleCategory(customRole);
                              setShowMoreCategories(false);
                              setCategorySearchQuery("");
                            }
                          }}
                          className="x-magnetic-card group flex w-full items-center justify-between rounded-xl border border-fuchsia-500/40 bg-gradient-to-r from-fuchsia-950/40 via-purple-900/30 to-slate-900/70 px-3.5 py-2.5 text-[11.5px] font-medium text-left transition-all duration-200 shadow-[0_0_15px_rgba(217,70,239,0.25)] hover:border-fuchsia-400 hover:text-white"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 font-bold text-xs">
                              +
                            </span>
                            <div className="flex flex-col">
                              <span className="text-white font-semibold flex items-center gap-1.5">
                                <span>Create Custom:</span>
                                <span className="text-fuchsia-300 font-bold drop-shadow-[0_0_8px_rgba(217,70,239,0.6)]">
                                  "{categorySearchQuery.trim()}"
                                </span>
                              </span>
                              <span className="text-[9.5px] text-slate-400 font-normal">
                                🔒 Private to your account only — never shown on global public directory
                              </span>
                            </div>
                          </div>
                          <span className="flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-fuchsia-300 border border-fuchsia-500/30">
                            Private Tag
                          </span>
                        </button>
                      )}

                    {filteredCategories.length > 0 ? (
                      filteredCategories.map((cat) => {
                        const active = selectedCategories.includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onMouseMove={handleSpotlightMouseMove}
                            onMouseLeave={handleSpotlightMouseLeave}
                            onClick={() => {
                              toggleCategory(cat);
                              setShowMoreCategories(false);
                              setCategorySearchQuery("");
                            }}
                            className={`x-magnetic-card group flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-[11.5px] font-medium text-left transition-all duration-200 ${
                              active
                                ? "border-cyan-400/90 bg-cyan-500/20 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.35),inset_0_1px_1px_rgba(255,255,255,0.2)]"
                                : "border-slate-800/80 bg-slate-900/60 text-slate-200 hover:border-cyan-400/60 hover:bg-slate-900/90 hover:text-white"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`h-1.5 w-1.5 rounded-full transition-all ${active ? "bg-cyan-300 shadow-[0_0_6px_#22d3ee]" : "bg-slate-600 group-hover:bg-cyan-400"}`} />
                              <span className="truncate text-slate-200 group-hover:text-white">
                                {highlightMatch(cat, categorySearchQuery)}
                              </span>
                            </div>
                            {active && (
                              <span className="flex items-center gap-1 rounded-full bg-cyan-400/20 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-cyan-300 border border-cyan-400/40">
                                Selected
                              </span>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="rounded-full border border-slate-800 bg-slate-900/60 p-3 text-slate-500 mb-2">
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                        </div>
                        <p className="text-xs font-semibold text-slate-300">No relationship types match</p>
                        <p className="mt-1 text-[10.5px] text-slate-500 max-w-[200px]">
                          Try searching for another role or click below to clear
                        </p>
                        <button
                          type="button"
                          onClick={() => setCategorySearchQuery("")}
                          className="mt-3 rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-3 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/20 transition"
                        >
                          Show All Types
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {(showVipTerms || isVipTermsAnimating) && (
          <div className={`pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4 sm:px-0 ${showVipTerms ? (isVipTermsAnimating ? 'settings-backdrop-enter' : '') : 'settings-backdrop-exit'
            }`}
            style={{ backdropFilter: 'blur(8px)' }}
            onMouseDown={() => {
              setIsVipTermsAnimating(true);
              setTimeout(() => setShowVipTerms(false), 300);
            }}
          >
            <div className={`relative w-full max-w-2xl rounded-3xl border border-slate-700/70 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-[1px] shadow-[0_0_28px_rgba(148,163,184,0.6)] ${showVipTerms ? (isVipTermsAnimating ? 'vip-terms-modal-enter' : '') : 'vip-terms-modal-exit'
              }`}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="relative max-h-[80vh] rounded-3xl bg-slate-950/95 px-5 py-4 sm:px-6 sm:py-5 overflow-y-auto scrollbar-hide">
                <div className="pointer-events-none absolute -left-24 -top-24 h-52 w-52 rounded-full bg-gradient-to-br from-red-500/60 via-fuchsia-500/40 to-cyan-400/40 blur-2xl" />
                <div className="pointer-events-none absolute -right-16 bottom-[-3rem] h-40 w-40 rounded-full bg-gradient-to-tr from-cyan-400/40 via-sky-500/40 to-fuchsia-500/40 blur-2xl" />

                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Verification & Badges
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-slate-50 sm:text-lg">
                      Q-Link badge policy
                    </h2>
                    <p className="mt-1 text-[11px] text-slate-400">
                      These badges are designed to protect identity and highlight
                      high-signal profiles. They are never sold as generic clout
                      icons.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsVipTermsAnimating(true);
                      setTimeout(() => setShowVipTerms(false), 300);
                    }}
                    className="rounded-full border border-slate-600/70 bg-slate-900/80 px-2 py-1 text-[10px] text-slate-300 hover:border-cyan-400/70 hover:text-cyan-200 active:border-cyan-300 active:bg-cyan-800 active:text-cyan-50 active:scale-90 transition-all duration-100"
                  >
                    Close
                  </button>
                </div>

                <div className="relative mt-4 space-y-4 text-[11px] text-slate-200">
                  {/* Red Tick / Entrepreneur Verification */}
                  <div className="rounded-2xl border border-red-500/60 bg-red-500/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-red-300 bg-red-500 text-[9px] font-bold text-slate-50">
                        🔴
                      </span>
                      <p className="text-[11px] font-semibold text-red-200">
                        Red Tick (Entrepreneur Verification)
                      </p>
                    </div>

                    <p className="mt-2 text-[11px] text-slate-200">
                      The Red Tick is an elite verification status reserved exclusively for verified
                      entrepreneurs.
                    </p>

                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-200/90">
                      Eligibility Criteria
                    </p>
                    <ul className="mt-1 space-y-1 text-[11px] text-slate-200">
                      <li>• Applicant must be a verified Entrepreneur, passing strict cross-verification checks.</li>
                      <li>• Applicant must hold an active leadership role, such as CEO, Founder, Co-Founder or Chairman.</li>
                    </ul>

                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-200/90">
                      VIP Holding Plan
                    </p>
                    <ul className="mt-1 space-y-1 text-[11px] text-slate-200">
                      <li>• To obtain and retain the Red Tick with VIP Certification, the user must purchase the ₹1 Crore annual VIP Holding Plan.</li>
                      <li>• Valid for 1 year.</li>
                      <li>• Grants access to exclusive VIP IDs and VIP Groups.</li>
                      <li>• Provides maximum visibility across the entire platform.</li>
                    </ul>
                  </div>

                  {/* Billionaire Badge */}
                  <div className="rounded-2xl border border-amber-500/70 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-amber-300 bg-amber-500 text-[9px] font-bold text-slate-50">
                        👑
                      </span>
                      <p className="text-[11px] font-semibold text-amber-100">
                        Billionaire Badge (Auto-Attached)
                      </p>
                    </div>
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-200">
                      <li>• Automatically awarded upon approval of the 1-year Red Tick VIP Plan.</li>
                      <li>• No separate application is required.</li>
                      <li>• Remains active for the full duration of the VIP plan.</li>
                    </ul>
                  </div>

                  {/* Blue Tick / Popularity Verification */}
                  <div className="rounded-2xl border border-sky-500/60 bg-sky-500/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-sky-300 bg-sky-500 text-[9px] font-bold text-slate-50">
                        🔵
                      </span>
                      <p className="text-[11px] font-semibold text-sky-200">
                        Blue Tick (Popularity Verification)
                      </p>
                    </div>

                    <p className="mt-2 text-[11px] text-slate-200">
                      The Blue Tick is designed for highly active and popular users.
                    </p>

                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200/90">
                      Eligibility Criteria
                    </p>
                    <ul className="mt-1 space-y-1 text-[11px] text-slate-200">
                      <li>• Awarded to users with a high number of friends and engagement points.</li>
                      <li>• Valid for 1 year.</li>
                      <li>• No terms or financial requirements.</li>
                    </ul>

                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200/90">
                      Benefits
                    </p>
                    <ul className="mt-1 space-y-1 text-[11px] text-slate-200">
                      <li>• Improves global ranking visibility.</li>
                      <li>• Helps the profile appear near the top of search and discovery.</li>
                      <li>• A user with high points + Blue Tick can rank among the top IDs worldwide.</li>
                    </ul>
                  </div>

                  {/* Key Distinction */}
                  <div className="rounded-2xl border border-fuchsia-500/70 bg-fuchsia-500/5 p-3">
                    <p className="text-[11px] font-semibold text-fuchsia-200">
                      ⚠️ Key Distinction
                    </p>
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-200">
                      <li>• Blue Tick focuses on popularity and reach.</li>
                      <li>• Red Tick represents power, authority and verified leadership.</li>
                      <li>• Red Tick holders receive a dedicated VIP profile card, ensuring superior visibility in every section of the platform — beyond any Blue Tick ranking.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {(showDirectory || isConsoleAnimating) && (
          <div className={`pointer-events-auto fixed inset-0 z-40 flex items-stretch sm:items-center justify-center bg-slate-950/95 sm:bg-slate-950/85 p-0 sm:p-0 ${showDirectory ? (isConsoleAnimating ? 'console-backdrop-enter' : '') : 'console-backdrop-exit'
            }`}
            style={{ backdropFilter: 'blur(6px)' }}
            onMouseDown={() => {
              closeDirectory();
            }}
          >
            <div className={`relative w-full h-[100dvh] sm:w-[98vw] sm:h-[98dvh] max-w-none flex flex-col rounded-none sm:rounded-3xl border-0 sm:border ${isDefaultTheme ? "border-cyan-400/40" : ""} bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-0 sm:p-[1px] shadow-none ${isDefaultTheme ? "sm:shadow-[0_0_30px_rgba(34,211,238,0.7)]" : ""} transition-all duration-600 ${showDirectory ? (isConsoleAnimating ? 'console-modal-enter' : '') : 'console-modal-exit'
              }`}
              style={{
                borderColor: !isDefaultTheme ? 'var(--duo-border-glow)' : undefined,
                boxShadow: isDefaultTheme
                  ? (isConsoleAnimating
                      ? '0 0 100px rgba(34, 211, 238, 0.6), 0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                      : '0 0 30px rgba(34, 211, 238, 0.7), 0 25px 50px -12px rgba(0, 0, 0, 0.5)')
                  : (isConsoleAnimating
                      ? '0 0 80px var(--duo-shadow-glow), 0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                      : '0 0 30px var(--duo-shadow-glow), 0 25px 50px -12px rgba(0, 0, 0, 0.5)'),
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch'
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Aura Help Modal - Renders perfectly inside the relative directory container overlay */}
              <AuraHelpModal
                isOpen={showAuraHelp}
                onClose={() => setShowAuraHelp(false)}
              />
              {/* Close Button - Inside Modal */}
              <button
                type="button"
                onClick={() => {
                  closeDirectory();
                }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
                  e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
                  e.currentTarget.style.setProperty("--spotlight-opacity", "1");
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.setProperty("--spotlight-opacity", "0");
                }}
                className={`x-magnetic-close group absolute top-[max(env(safe-area-inset-top),2.5px)] right-2.5 z-50 flex h-8 w-8 items-center justify-center rounded-full border border-slate-600/60 bg-slate-900/90 text-slate-300 shadow-lg backdrop-blur-sm hover:border-red-400/80 hover:bg-red-500/10 hover:text-red-200 active:scale-95 sm:top-2 sm:right-4 sm:h-9 sm:w-9 cursor-pointer ${showDirectory ? (isConsoleAnimating ? 'close-button-enter' : '') : 'close-button-exit'
                  }`}
                aria-label="Close Global Quantum Directory"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform-gpu group-hover:scale-125 group-hover:text-red-100 group-hover:drop-shadow-[0_0_8px_rgba(244,63,94,0.9)]"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              <div
                style={{ overflowAnchor: "none" }}
                className={`relative flex h-full flex-col rounded-none sm:rounded-3xl bg-slate-950/95 py-0 overflow-hidden ${
                  directoryProfileHandle ? "px-0" : "px-2 sm:px-6"
                }`}
              >
                {directoryProfileHandle ? (
                  <div className="relative flex-1 min-h-0 h-full w-full overflow-hidden flex flex-col">
                    <QuantumUserProfileView
                      handle={directoryProfileHandle}
                      currentUserId={meId}
                      initialData={directoryProfileInitialData}
                      onProfileUpdated={(updatedUser) => {
                        setCurrentUserProfile((prev: any) => (prev ? { ...prev, ...updatedUser } : updatedUser));
                        if (updatedUser.name) setDisplayName(updatedUser.name);
                        if (updatedUser.handle) {
                          setCurrentHandle(updatedUser.handle);
                          setDirectoryProfileHandle(updatedUser.handle);
                        }
                        if (updatedUser.image) setProfilePicUrl(getHighResProfilePic(updatedUser.image));
                        if (session?.user) {
                          if (updatedUser.name) (session.user as any).name = updatedUser.name;
                          if (updatedUser.image) (session.user as any).image = updatedUser.image;
                          if (updatedUser.bio !== undefined) (session.user as any).bio = updatedUser.bio;
                          if (updatedUser.handle) (session.user as any).handle = updatedUser.handle;
                        }
                        try {
                          updateSession({ user: updatedUser });
                        } catch {}
                      }}
                      onBack={() => {
                        setDirectoryProfileHandle(null);
                        setViewingProfileHandle(null);
                        setMode("home");
                        replaceNavState({ screen: "directory" });
                      }}
                      onStartChat={(peerHandle) => {
                        setShowDirectory(false);
                        setIsConsoleAnimating(false);
                        setDirectoryProfileHandle(null);
                        setDirectoryProfileInitialData(null);
                        setViewingProfileHandle(null);
                        setFoundUser(null);
                        setMode("home");
                        openChatWithPeer(peerHandle);
                      }}
                      onSendConnectRequest={async (targetHandle, categories, note) => {
                        const res = await fetch("/api/friends/request", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            toHandle: targetHandle,
                            categories: categories.join(","),
                            message: note.trim(),
                          }),
                        });
                        if (!res.ok) {
                          const d = await res.json().catch(() => ({}));
                          throw new Error(d.error || "Failed to send request");
                        }
                      }}
                      allCategories={allCategories}
                    />
                  </div>
                ) : (
                  <>
                    <div
                      className={`pointer-events-none absolute -left-24 -top-24 h-52 w-52 rounded-full blur-3xl ${isDefaultTheme ? "bg-gradient-to-br from-cyan-400/50 via-fuchsia-500/40 to-indigo-400/40" : ""}`}
                      style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-orb-primary)' : undefined }}
                    />
                    <div
                      className={`pointer-events-none absolute -right-24 bottom-[-5rem] h-52 w-52 rounded-full blur-3xl ${isDefaultTheme ? "bg-gradient-to-tr from-indigo-400/40 via-sky-500/40 to-fuchsia-500/40" : ""}`}
                      style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-orb-secondary)' : undefined }}
                    />

                    <div className="relative flex items-center justify-between gap-3 pt-[max(env(safe-area-inset-top),14px)] sm:pt-4 pb-2 border-b border-slate-700/60">
                      <div>
                        <p
                          className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${isDefaultTheme ? "text-cyan-300/90" : ""}`}
                          style={{ color: !isDefaultTheme ? 'var(--duo-accent-text)' : undefined }}
                        >
                          Global Quantum Directory
                        </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Live view of quantum IDs across the network. Tap an ID to open the connect flow.
                    </p>
                  </div>
                </div>

                <div
                  ref={(node) => {
                    directoryScrollRef.current = node;
                    if (node) {
                      const savedTop = directoryScrollTopRef.current || (typeof window !== "undefined" ? Number(sessionStorage.getItem("qc_directory_scroll") || 0) : 0);
                      if (savedTop > 0 && node.scrollTop === 0) {
                        node.scrollTop = savedTop;
                      }
                    }
                  }}
                  onScroll={handleDirectoryScroll}
                  className="relative mt-3 flex-1 min-h-0 overflow-y-auto pb-6 pr-0 sm:pr-1 custom-directory-scroll"
                >
                  {/* X-Style Floating Scroll-to-Top Pill in Top-Center Area */}
                  <div
                    className={`sticky top-2 z-40 flex justify-center w-full pointer-events-none transition-all duration-300 ease-out ${
                      showDirectoryScrollToTop
                        ? "opacity-100 translate-y-0 scale-100"
                        : "opacity-0 -translate-y-3 scale-95 pointer-events-none"
                    }`}
                    style={{ height: 0, overflow: "visible" }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        scrollToDirectoryTop();
                      }}
                      className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-cyan-400/50 bg-slate-900/95 px-3.5 py-1.5 text-xs font-bold text-cyan-300 shadow-[0_4px_24px_rgba(0,0,0,0.7),0_0_16px_rgba(6,182,212,0.35)] backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:border-cyan-300 hover:bg-slate-800 hover:text-white active:scale-95 cursor-pointer group select-none"
                      title="Scroll to Top"
                      aria-label="Scroll to top of Global Directory"
                    >
                      <svg
                        className="w-3.5 h-3.5 transform transition-transform duration-200 group-hover:-translate-y-0.5 text-cyan-400 group-hover:text-cyan-200"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      <span className="tracking-wide text-[11px]">Top</span>
                    </button>
                  </div>
                  {directoryLoading && (
                    showDirectoryMediaOnly ? (
                      <GlobalDirectoryMediaSkeleton />
                    ) : (
                      <GlobalDirectoryIdsSkeleton />
                    )
                  )}
                  {directoryError && !directoryLoading && (
                    <p className="text-[11px] text-rose-300">{directoryError}</p>
                  )}

                  {!directoryLoading && !directoryError && directoryItems && directoryItems.length > 0 && (
                    (() => {
                      const handleSpotlightMouseMove = (e: React.MouseEvent<HTMLElement>) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
                        e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
                        e.currentTarget.style.setProperty("--spotlight-opacity", "1");
                      };

                      const handleSpotlightMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
                        e.currentTarget.style.setProperty("--spotlight-opacity", "0");
                      };

                      const allFeedPosts = (() => {
                        const rawPosts = directoryGlobalPosts.length > 0
                          ? directoryGlobalPosts
                          : Object.values(directoryLatestPostsByAuthorId || {}).flat();

                        const authorById = new Map<string, any>(
                          (directoryItems || []).map((item) => [item.id, item])
                        );

                        const seenIds = new Set<string>();
                        const list: any[] = [];

                        for (const p of rawPosts) {
                          if (!p?.id || seenIds.has(p.id)) continue;
                          const hasText = typeof p?.text === "string" && p.text.trim().length > 0;
                          const hasMedia = Boolean(p?.media?.url || p?.attachment?.url || p?.attachmentId);
                          if (!hasText && !hasMedia) continue;
                          seenIds.add(p.id);
                          const authorItem = authorById.get(p.authorId) || p.author || {
                            id: p.authorId,
                            handle: p.author?.handle || "user",
                            name: p.author?.name || "Verified User",
                            image: p.author?.image || null,
                            blueTickStatus: p.author?.blue_tick_status || "NONE",
                            isRedTick: false,
                          };
                          list.push({ ...p, author: authorItem });
                        }

                        return list.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
                      })();

                      const filteredFeedPosts = allFeedPosts.filter((post) => {
                        const kind = (post.media?.kind || post.attachmentKind || "").toLowerCase();
                        if (mediaFilterTab === 'all') return true;
                        if (mediaFilterTab === 'shorts') return kind === 'video';
                        if (mediaFilterTab === 'posts') return kind === 'image';
                        if (mediaFilterTab === 'tweets') return kind !== 'video' && kind !== 'image';
                        return true;
                      });

                      return (
                        <>
                          {!showDirectoryMediaOnly && directoryItems.some((item) => item.isRedTick) && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-200/90">
                                Elite Founder IDs
                              </p>
                              {directoryItems
                                .filter((item) => item.isRedTick)
                                .map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleDirectorySelect(item.handle)}
                                    className="w-full text-left"
                                  >
                                    <div className="founder-vip-aurora rounded-2xl border border-red-500/80 bg-slate-950/95 p-1.5 sm:p-2.5 overflow-hidden [clip-path:inset(0_round_1rem)] drop-shadow-[0_0_30px_rgba(248,113,113,0.55)]">
                                      <div className="founder-vip-aurora-inner founder-vip-shine space-y-1.5 rounded-2xl bg-gradient-to-br from-slate-950/90 via-slate-900/90 to-slate-950/90 px-3 py-2 relative overflow-hidden [clip-path:inset(0_round_1rem)] isolation-isolate">
                                        <div className="founder-vip-line-full absolute inset-x-0 -top-2 -bottom-2 rounded-2xl"></div>
                                        <div className="relative z-10 flex items-center justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="truncate text-[11px] font-semibold text-slate-50 flex items-center gap-1">
                                              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-red-400/80 bg-red-600/60 text-[8px] font-bold text-slate-50">
                                                ✓
                                              </span>
                                              @{item.handle}
                                            </p>
                                            <p className="text-[10px] font-semibold text-slate-200">
                                              Founder & CEO at Q‑Link
                                            </p>
                                          </div>
                                          <div className="relative z-10 shrink-0">
                                            <span className="rounded-full border border-red-400/80 bg-red-500/20 px-2 py-0.5 text-[9px] font-medium text-red-200">
                                              Elite Founder
                                            </span>
                                          </div>
                                        </div>
                                        <div className="relative z-10">
                                          <p className="text-[10px] text-slate-400">
                                            Tap to open this VIP founder ID and send a direct feedback request.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </button>
                                ))}
                            </div>
                          )}

                          {!showDirectoryMediaOnly && directoryItems.some((item) => item.blueTickStatus === 'DIAMOND') && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-pink-300">
                                💎 Diamond VIP IDs
                              </p>
                              {directoryItems
                                .filter((item) => item.blueTickStatus === 'DIAMOND')
                                .map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleDirectorySelect(item.handle)}
                                    className="w-full text-left"
                                  >
                                    <div className="rounded-2xl border border-pink-500/80 bg-slate-950/95 p-2.5 overflow-hidden [clip-path:inset(0_round_1rem)] drop-shadow-[0_0_30px_rgba(236,72,153,0.55)]">
                                      <div className="diamond-vip-card-root relative overflow-hidden rounded-2xl isolation-isolate">
                                        {/* ── Video looping background ─────────── */}
                                        <DiamondGlassCanvas />

                                        {/* ── CSS overlay stack — above WebGL canvas ──────────── */}
                                        <div className="diamond-vip-chroma-edge" />
                                        <div className="diamond-vip-glass-slab" />
                                        <div className="diamond-vip-rim-highlight" />

                                        {/* ── User content — overlaid above video/glass layers ── */}
                                        <div className="diamond-vip-content relative z-10 px-3 py-2 space-y-1.5 rounded-2xl bg-gradient-to-br from-slate-950/70 via-slate-900/60 to-slate-950/70 relative overflow-hidden">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                              <p className="truncate text-[11px] font-extrabold text-white flex items-center gap-1.5" style={{ textShadow: '0 0 12px rgba(236,72,153,0.9), 0 2px 4px rgba(0,0,0,0.85)' }}>
                                                <span className="diamond-vip-gem-badge">💎</span>
                                                <span className="dvip-handle-text">@{item.handle}</span>
                                              </p>
                                              <p className="dvip-name-line text-[10px] font-bold text-pink-100 mt-0.5" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.85)' }}>
                                                {item.name || 'Diamond VIP'}
                                              </p>
                                            </div>
                                            <div className="shrink-0">
                                              <span className="diamond-vip-badge-pill">Diamond VIP</span>
                                            </div>
                                          </div>
                                          <p className="dvip-tap-line text-[10px] font-medium text-pink-100/90 mt-1.5" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                                            Tap to open this Diamond VIP ID and send a direct connection request.
                                          </p>
                                        </div>
                                      </div>
                                    </div>


                                  </button>
                                ))}
                            </div>
                          )}

                          {!showDirectoryMediaOnly && directoryItems.some((item) => item.blueTickStatus === 'SAPPHIRE' && !item.id.startsWith('synth_')) && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">
                                💎 Sapphire VIP IDs
                              </p>
                              {directoryItems
                                .filter((item) => item.blueTickStatus === 'SAPPHIRE' && !item.id.startsWith('synth_'))
                                .map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleDirectorySelect(item.handle)}
                                    className="w-full text-left"
                                  >
                                    <div className="rounded-2xl border border-sky-500/80 bg-slate-950/95 p-2.5 overflow-hidden [clip-path:inset(0_round_1rem)] drop-shadow-[0_0_30px_rgba(14,165,233,0.55)]">
                                      <div className="sapphire-vip-card-root relative overflow-hidden rounded-2xl isolation-isolate">
                                        {/* Video looping background */}
                                        <SapphireGlassCanvas />

                                        {/* CSS overlay stack */}
                                        <div className="sapphire-vip-chroma-edge" />
                                        <div className="sapphire-vip-glass-slab" />
                                        <div className="sapphire-vip-rim-highlight" />

                                        {/* User content */}
                                        <div className="sapphire-vip-content relative z-10 px-3 py-2 space-y-1.5 rounded-2xl bg-gradient-to-br from-slate-950/30 via-slate-900/20 to-slate-950/30 relative overflow-hidden">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                              <p className="truncate text-[11px] font-extrabold text-white flex items-center gap-1.5" style={{ textShadow: '0 0 12px rgba(14,165,233,0.9), 0 2px 4px rgba(0,0,0,0.85)' }}>
                                                <span className="sapphire-vip-gem-badge">💎</span>
                                                <span className="dvip-handle-text">@{item.handle}</span>
                                              </p>
                                              <p className="dvip-name-line text-[10px] font-bold text-sky-100 mt-0.5" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.85)' }}>
                                                {item.name || 'Sapphire VIP'}
                                              </p>
                                            </div>
                                            <div className="shrink-0">
                                              <span className="sapphire-vip-badge-pill">Sapphire VIP</span>
                                            </div>
                                          </div>
                                          <p className="dvip-tap-line text-[10px] font-medium text-sky-100/90 mt-1.5" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                                            Tap to open this Sapphire VIP ID and send a direct connection request.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </button>
                                ))}
                            </div>
                          )}

                          {!showDirectoryMediaOnly && directoryItems.some((item) => item.blueTickStatus === 'verified' && !item.id.startsWith('synth_')) && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200/90">
                                Blue Tick Verified IDs
                              </p>
                              {directoryItems
                                .filter((item) => item.blueTickStatus === 'verified' && !item.id.startsWith('synth_'))
                                .map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleDirectorySelect(item.handle)}
                                    className="w-full text-left"
                                  >
                                    <div className="founder-vip-aurora rounded-2xl border border-sky-500/80 bg-slate-950/95 p-2.5 overflow-hidden [clip-path:inset(0_round_1rem)] drop-shadow-[0_0_30px_rgba(56,189,248,0.55)]">
                                      <div className="founder-vip-aurora-inner founder-vip-shine space-y-1.5 rounded-2xl bg-gradient-to-br from-slate-950/90 via-slate-900/90 to-slate-950/90 px-3 py-2 relative overflow-hidden">
                                        <div className="founder-vip-line-full absolute inset-x-0 -top-2 -bottom-2 rounded-2xl"></div>
                                        <div className="relative z-10 flex items-center justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="truncate text-[11px] font-semibold text-slate-50 flex items-center gap-1">
                                              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-sky-300 bg-sky-500 text-[8px] font-bold text-slate-50">
                                                ✓
                                              </span>
                                              @{item.handle}
                                            </p>
                                            <p className="text-[10px] font-semibold text-slate-200">
                                              {item.name || 'Verified User'}
                                            </p>
                                          </div>
                                          <div className="relative z-10">
                                            <span className="rounded-full border border-sky-400/80 bg-sky-500/20 px-2 py-0.5 text-[9px] font-medium text-sky-200">
                                              Blue Tick
                                            </span>
                                          </div>
                                        </div>
                                        <div className="relative z-10 flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold ${getAuraColor(item.auraPercentage)}`}>
                                              Aura: {item.auraPercentage}%
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                console.log('Blue Tick Aura help button clicked');
                                                setShowAuraHelp(true);
                                              }}
                                              className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-600/50 bg-slate-800/50 text-[8px] text-slate-400 hover:text-slate-300 hover:bg-slate-700/50 transition-all duration-200 cursor-pointer"
                                              title="What is Aura?"
                                            >
                                              ?
                                            </button>
                                            <span className="text-[10px] text-slate-400">
                                              • {item.points} points
                                            </span>
                                          </div>
                                        </div>
                                        <div className="relative z-10">
                                          <p className="text-[10px] text-slate-400">
                                            Tap to open this verified user and send a direct connection request.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </button>
                                ))}
                            </div>
                          )}

                          <div className="space-y-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                              {showDirectoryMediaOnly ? "Quantum Media Feed" : "All Quantum IDs"}
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setIdConsoleTab("my");
                                  setShowIdConsole(true);
                                }}
                                className={`group relative flex-1 overflow-hidden rounded-2xl border px-2.5 sm:px-3 py-2 text-left text-[10.5px] sm:text-[11px] font-semibold transition focus-visible:outline-none ${
                                  isDefaultTheme
                                    ? "border-cyan-400/50 bg-gradient-to-r from-cyan-500/10 via-sky-500/10 to-fuchsia-500/10 text-cyan-100 hover:border-cyan-300/80 hover:from-cyan-500/15 hover:via-sky-500/15 hover:to-fuchsia-500/15 focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                                    : "hover:opacity-90"
                                }`}
                                style={
                                  !isDefaultTheme
                                    ? {
                                        borderColor: 'var(--duo-border-glow)',
                                        backgroundColor: 'var(--duo-primary-pill-bg)',
                                        color: 'var(--duo-accent-text)',
                                      }
                                    : undefined
                                }
                              >
                                <span className="pointer-events-none absolute -left-16 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-cyan-400/30 blur-2xl transition group-hover:bg-cyan-400/40" />
                                <span className="pointer-events-none absolute -right-16 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-fuchsia-500/25 blur-2xl transition group-hover:bg-fuchsia-500/35" />
                                <span className="relative flex items-center justify-between gap-1.5 sm:gap-3">
                                  <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                                    <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
                                      <span
                                        className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${isDefaultTheme ? "bg-cyan-400/70" : ""}`}
                                        style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-accent-text)' : undefined }}
                                      />
                                      <span
                                        className={`relative inline-flex h-1.5 w-1.5 rounded-full ${isDefaultTheme ? "bg-cyan-200" : ""}`}
                                        style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-accent-text)' : undefined }}
                                      />
                                    </span>
                                    <span className="tracking-normal sm:tracking-[0.12em] uppercase whitespace-nowrap">See your ID</span>
                                  </span>
                                  <span className="text-[9.5px] sm:text-[10px] font-medium text-slate-200/90 shrink-0">
                                    Live
                                  </span>
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setShowDirectoryMediaOnly(!showDirectoryMediaOnly);
                                }}
                                className={`group relative flex-1 overflow-hidden rounded-2xl border px-3 py-2 text-left text-[11px] font-bold uppercase transition duration-300 active:scale-95 cursor-pointer ${showDirectoryMediaOnly
                                    ? "border-amber-400/85 bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-rose-500/15 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.4)]"
                                    : "border-fuchsia-500/40 bg-gradient-to-r from-indigo-500/10 via-fuchsia-500/10 to-pink-500/10 text-fuchsia-200 hover:border-fuchsia-400/80 hover:from-indigo-500/15 hover:to-pink-500/15 shadow-[0_0_15px_rgba(219,39,119,0.25)]"
                                  }`}
                              >
                                <span className="pointer-events-none absolute -left-16 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-fuchsia-500/20 blur-2xl transition group-hover:bg-fuchsia-500/30" />
                                <span className="pointer-events-none absolute -right-16 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-amber-500/20 blur-2xl transition group-hover:bg-amber-500/30" />
                                <span className="relative flex items-center justify-between gap-3">
                                  <span className="flex items-center gap-1.5">
                                    <span className="relative flex h-2 w-2 items-center justify-center">
                                      <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${showDirectoryMediaOnly ? "bg-amber-400" : "bg-fuchsia-400"}`} />
                                      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${showDirectoryMediaOnly ? "bg-amber-300" : "bg-fuchsia-300"}`} />
                                    </span>
                                    <span className="tracking-normal sm:tracking-[0.11em] whitespace-nowrap truncate">
                                      {showDirectoryMediaOnly ? "← All ID Cards" : "Shorts • Posts • Tweets"}
                                    </span>
                                  </span>
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setLocalPointsOverride((session?.user as any)?.points || 0);
                                  setShowStore(true);
                                  setIsStoreAnimating(true);
                                }}
                                title="Quantum Upgrade Store"
                                className="group relative flex h-[33px] w-[38px] flex-none items-center justify-center overflow-hidden rounded-2xl border border-blue-500/40 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-cyan-500/10 transition-all duration-300 hover:border-blue-400/80 hover:from-blue-500/20 hover:to-cyan-500/20 shadow-[0_0_15px_rgba(59,130,246,0.3)] active:scale-95"
                              >
                                <span className="pointer-events-none absolute -left-6 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-blue-400/20 blur-xl transition group-hover:bg-blue-400/30" />
                                <span className="relative flex items-center justify-center">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth="2.5"
                                    stroke="currentColor"
                                    className="h-4.5 w-4.5 text-blue-300 transition-all duration-300 group-hover:scale-110 group-hover:text-blue-200"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
                                    />
                                  </svg>
                                </span>
                              </button>
                            </div>

                            {/* Media Filter Sub-Navigation */}
                            {showDirectoryMediaOnly && (
                              <div className="flex flex-col gap-3 pb-3 mb-2 border-b border-slate-800/80 sticky top-0 bg-slate-950/95 z-30 pt-1 backdrop-blur-md">
                                <div className="flex items-center justify-between">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowDirectoryMediaOnly(false);
                                      setMediaFilterTab('all');
                                    }}
                                    className="group flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/40 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition duration-300 hover:border-cyan-400/80 hover:bg-cyan-500/10 hover:text-cyan-200 active:scale-95 shadow-[0_0_15px_rgba(34,211,238,0.1)] cursor-pointer"
                                  >
                                    <span className="text-[12px] transition group-hover:-translate-x-0.5">←</span>
                                    <span>Back to IDs</span>
                                  </button>

                                  <div className="flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/5 px-2.5 py-0.5 text-[10px] font-bold text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.15)] animate-pulse">
                                    <span className="relative flex h-1.5 w-1.5">
                                      <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping"></span>
                                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-300"></span>
                                    </span>
                                    <span>MEDIA ACTIVE</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                                  {[
                                    { id: 'all', label: 'All Feed', icon: OpticalAllFeedIcon, color: 'cyan' },
                                    { id: 'shorts', label: 'Shorts', icon: OpticalShortsIcon, color: 'amber' },
                                    { id: 'posts', label: 'Posts', icon: OpticalPostsIcon, color: 'rose' },
                                    { id: 'tweets', label: 'Tweets', icon: OpticalTweetsIcon, color: 'indigo' }
                                  ].map((tab) => {
                                    const isActive = mediaFilterTab === tab.id;
                                    const TabIcon = tab.icon;
                                    let activeClass = "";
                                    let inactiveClass = "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200 hover:bg-white/[0.06] backdrop-blur-xl shadow-[0_2px_8px_rgba(0,0,0,0.2)]";

                                    if (isActive) {
                                      if (tab.color === 'cyan') activeClass = "border-cyan-400/80 bg-gradient-to-r from-cyan-500/20 to-cyan-500/10 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.3)] ring-1 ring-cyan-400/30";
                                      else if (tab.color === 'amber') activeClass = "border-amber-400/80 bg-gradient-to-r from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_14px_rgba(245,158,11,0.3)] ring-1 ring-amber-400/30";
                                      else if (tab.color === 'rose') activeClass = "border-rose-400/80 bg-gradient-to-r from-rose-500/20 to-rose-500/10 text-rose-200 shadow-[0_0_14px_rgba(244,63,94,0.3)] ring-1 ring-rose-400/30";
                                      else if (tab.color === 'indigo') activeClass = "border-indigo-400/80 bg-gradient-to-r from-indigo-500/20 to-indigo-500/10 text-indigo-200 shadow-[0_0_14px_rgba(99,102,241,0.3)] ring-1 ring-indigo-400/30";
                                    }

                                    return (
                                      <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setMediaFilterTab(tab.id as any)}
                                        className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-95 cursor-pointer ${isActive ? activeClass : inactiveClass
                                          }`}
                                      >
                                        <span className="transition-transform duration-300 group-hover:scale-110">
                                          <TabIcon className="w-3.5 h-3.5" />
                                        </span>
                                        <span>{tab.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            <div className="space-y-1.5">
                              {!showDirectoryMediaOnly && directoryItems.map((item) => {
                                const bioText =
                                  item.bio ||
                                  (item.posts && item.posts.length > 0 && item.posts[0].text) ||
                                  (item.isRedTick
                                    ? "Founder & CEO at Q-Link • Pioneering decentralized quantum communications"
                                    : item.blueTickStatus === "DIAMOND"
                                    ? "Diamond VIP Node • High-throughput quantum mesh explorer"
                                    : item.blueTickStatus === "SAPPHIRE"
                                    ? "Sapphire VIP Node • Priority quantum relay operator"
                                    : item.blueTickStatus === "verified"
                                    ? "Verified Quantum Operator • Connecting across the global mesh"
                                    : "Active Quantum Node • Tap to connect and chat");

                                return (
                                <div
                                  key={item.id}
                                  onMouseMove={handleSpotlightMouseMove}
                                  onMouseLeave={handleSpotlightMouseLeave}
                                  onClick={() => handleDirectorySelect(item.handle)}
                                  className="group x-magnetic-card rounded-2xl border border-slate-800/80 bg-slate-950/80 p-3.5 sm:p-4 text-slate-200 hover:border-slate-700 hover:bg-slate-900/90 transition-all duration-200 cursor-pointer shadow-lg relative overflow-hidden"
                                >
                                  <div className="flex items-start gap-3 min-w-0">
                                    {/* Twitter/X Style Avatar */}
                                    <div className="relative shrink-0 pt-0.5">
                                      {item.image ? (
                                        <img
                                          src={item.image}
                                          alt={item.name || item.handle || "User"}
                                          className="h-10 w-10 sm:h-11 sm:w-11 rounded-full object-cover border border-slate-700/80 shadow-md"
                                        />
                                      ) : (
                                        <div className={`h-10 w-10 sm:h-11 sm:w-11 rounded-full flex items-center justify-center font-bold text-sm text-white uppercase shadow-inner border ${
                                          item.isRedTick 
                                            ? "bg-gradient-to-br from-red-600 to-red-950 border-red-500/50" 
                                            : item.blueTickStatus === "DIAMOND"
                                            ? "bg-gradient-to-br from-pink-600 to-pink-950 border-pink-500/50"
                                            : item.blueTickStatus === "SAPPHIRE"
                                            ? "bg-gradient-to-br from-sky-600 to-sky-950 border-sky-500/50"
                                            : "bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 border-slate-600/60"
                                        }`}>
                                          {(item.name || item.handle || "U")[0]}
                                        </div>
                                      )}
                                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-slate-950 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                                    </div>

                                    {/* Center Content: Name + Badges + @handle + Bio */}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 pr-1">
                                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                            <span className="font-bold text-sm text-white truncate group-hover:underline">
                                              {item.name || item.handle}
                                            </span>
                                            {item.isRedTick ? (
                                              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/25 border border-red-400/80 text-[8px] font-extrabold text-red-300 shadow-[0_0_8px_rgba(248,113,113,0.5)]" title="Elite Founder">
                                                ✓
                                              </span>
                                            ) : item.blueTickStatus === "DIAMOND" ? (
                                              <span className="text-xs shrink-0 drop-shadow-[0_0_6px_rgba(236,72,153,0.8)]" title="Diamond VIP">💎</span>
                                            ) : item.blueTickStatus === "SAPPHIRE" ? (
                                              <span className="text-xs shrink-0 drop-shadow-[0_0_6px_rgba(14,165,233,0.8)]" title="Sapphire VIP">💎</span>
                                            ) : item.blueTickStatus === "verified" ? (
                                              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-500 border border-sky-300 text-[8px] font-extrabold text-white shadow-[0_0_8px_rgba(56,189,248,0.5)]" title="Verified Blue Tick">
                                                ✓
                                              </span>
                                            ) : null}
                                          </div>
                                          <p className="text-xs text-slate-400 truncate mt-0.5">
                                            @{item.handle}
                                          </p>
                                        </div>

                                        {/* Right-Side Twitter/X Pill Button */}
                                        <div className="shrink-0">
                                          {item.id !== (session?.user as any)?.id && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleFollow(item.id);
                                              }}
                                              disabled={engagementLoading[item.id]?.follow}
                                              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer select-none shadow-sm ${
                                                followStatus[item.id]
                                                  ? "border border-slate-600/80 bg-slate-800/60 text-slate-200 hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-400"
                                                  : "bg-white text-slate-950 hover:bg-slate-200 hover:shadow-[0_0_12px_rgba(255,255,255,0.25)]"
                                              }`}
                                            >
                                              {engagementLoading[item.id]?.follow ? (
                                                <span className="inline-block animate-pulse">...</span>
                                              ) : followStatus[item.id] ? (
                                                "Following"
                                              ) : (
                                                "Follow"
                                              )}
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Clean Twitter/X Style Bio / Thought line */}
                                      <p className="mt-2 text-xs sm:text-[13px] text-slate-300 leading-relaxed line-clamp-3">
                                        {bioText}
                                      </p>

                                      {/* Metadata Footer: Aura & Points pills */}
                                      <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
                                        <span className={`font-semibold ${getAuraColor(item.auraPercentage || 0)}`}>
                                          ⚡ {item.auraPercentage || 0}% Aura
                                        </span>
                                        {item.points ? (
                                          <span className="text-slate-400">• {item.points} pts</span>
                                        ) : null}
                                        <span className="text-slate-500">• #{item.rank}</span>
                                        <span className="ml-auto text-[11px] text-cyan-400/90 font-medium group-hover:text-cyan-300 transition-colors">
                                          Connect →
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                              {!showDirectoryMediaOnly && (
                                <>
                                  {/* Quantum Optical Glass Shimmer (active during fast/down scroll) */}
                                  {directoryFastScrolling && (
                                    <QuantumDirectoryGlassShimmer />
                                  )}

                                  {/* All Active Nodes Synced Milestone Card */}
                                  <div className="mt-3 mb-2 flex flex-col items-center justify-center p-4 rounded-2xl border border-white/10 bg-slate-950/60 backdrop-blur-md text-center shadow-lg relative overflow-hidden">
                                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent" />
                                    <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 text-xs mb-1.5 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
                                      ✨
                                    </span>
                                    <p className="relative text-[11px] font-bold text-slate-200 tracking-wide">
                                      All Active Nodes Synced
                                    </p>
                                    <p className="relative text-[9.5px] text-slate-400 mt-0.5">
                                      You're viewing all verified members on the quantum mesh
                                    </p>
                                    <button
                                      type="button"
                                      onClick={scrollToDirectoryTop}
                                      className="relative mt-2.5 inline-flex items-center gap-1 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[10px] font-semibold hover:bg-cyan-500/20 hover:border-cyan-400 transition-all active:scale-95 cursor-pointer"
                                    >
                                      Back to Top ↑
                                    </button>
                                  </div>
                                </>
                              )}

                              {/* Dedicated Content-First Media Feed (Media Active Mode) */}
                              {showDirectoryMediaOnly && (
                                directoryPostsLoading && filteredFeedPosts.length === 0 ? (
                                  <GlobalDirectoryMediaSkeleton />
                                ) : filteredFeedPosts.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-900/30 rounded-3xl border border-slate-800/80 p-8 shadow-inner">
                                    <span className="text-4xl mb-3 animate-pulse">🔍</span>
                                    <p className="text-[12px] font-bold text-cyan-300 uppercase tracking-widest">
                                      No {mediaFilterTab === 'all' ? 'posts' : mediaFilterTab} Found
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-1 max-w-[280px] mx-auto leading-relaxed">
                                      Nobody has uploaded any {mediaFilterTab === 'all' ? 'content' : mediaFilterTab} in this category yet.
                                    </p>
                                  </div>
                                ) : (
                                  filteredFeedPosts.map((post) => {
                                    const item = post.author;
                                    const timeAgo = formatTimeAgo(post?.createdAt);
                                    const mediaKind = (post?.media?.kind || post?.attachmentKind || "").toLowerCase();
                                    const isVid = mediaKind === "video";
                                    const isImg = mediaKind === "image";
                                    let BadgeIcon = OpticalTweetsIcon;
                                     let badgeText = "Tweet";
                                     let badgeClass = "border-indigo-500/40 bg-indigo-500/10 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]";
                                     if (isVid) {
                                       BadgeIcon = OpticalShortsIcon;
                                       badgeText = "Shorts";
                                       badgeClass = "border-amber-500/40 bg-amber-500/10 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]";
                                     } else if (isImg) {
                                       BadgeIcon = OpticalPostsIcon;
                                       badgeText = "Post";
                                       badgeClass = "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]";
                                     }

                                    return (
                                      <div
                                        key={post.id}
                                        style={{ overflowAnchor: "none" }}
                                        className="rounded-3xl border border-slate-700/60 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-4 hover:border-cyan-400/50 transition-[border-color,box-shadow] duration-300 shadow-xl group/card relative overflow-hidden smooth-gpu-card"
                                        onClick={() => trackPostView(post.id)}
                                      >
                                        {/* Aura Ambient Background Glow on Hover */}
                                        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/0 via-fuchsia-500/0 to-cyan-500/0 opacity-0 group-hover/card:opacity-[0.03] transition-opacity duration-500 pointer-events-none" />

                                        {/* Header: Profile Info + Label */}
                                        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80 mb-3.5">
                                          <div
                                            className="flex items-center gap-2.5 min-w-0 cursor-pointer group/author hover:opacity-90 transition-opacity"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openUserProfile(item?.handle, item);
                                            }}
                                          >
                                            <div className="relative h-6.5 w-6.5 rounded-full overflow-hidden flex-shrink-0 bg-slate-800 border border-slate-700 group-hover/author:border-cyan-400/80 transition-colors">
                                              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/30 to-fuchsia-500/30 flex items-center justify-center text-[9.5px] font-bold text-white uppercase">
                                                {(item?.handle?.[0] || item?.name?.[0] || '?').toUpperCase()}
                                              </div>
                                              {isValidImageUrl(item?.image) && (
                                                <img
                                                  src={getHighResProfilePic(item.image)}
                                                  alt={item.name || item.handle || 'User'}
                                                  className="absolute inset-0 h-full w-full object-cover rounded-full"
                                                  referrerPolicy="no-referrer"
                                                  onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                  }}
                                                />
                                              )}
                                            </div>
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-1">
                                                <p className="truncate text-[11px] font-bold text-cyan-200 hover:text-cyan-100 transition">
                                                  @{item.handle}
                                                </p>
                                                {item.blueTickStatus === "SAPPHIRE" && (
                                                  <span className="flex h-3 w-3 items-center justify-center rounded-full bg-sky-500/20 border border-sky-400/80 text-[6.5px] font-bold text-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.4)]">
                                                    ✓
                                                  </span>
                                                )}
                                                {item.isRedTick && (
                                                  <span className="flex h-3 w-3 items-center justify-center rounded-full bg-red-500/25 border border-red-400/80 text-[6.5px] font-bold text-red-300 shadow-[0_0_8px_rgba(248,113,113,0.4)]">
                                                    ✓
                                                  </span>
                                                )}
                                              </div>
                                              <p className="text-[9.5px] text-slate-400 flex items-center gap-1 font-medium font-sans">
                                                {item.name || 'Verified User'} • {timeAgo}
                                              </p>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2">
                                             <span className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider backdrop-blur-md ${badgeClass}`}>
                                               <BadgeIcon className="w-3 h-3" />
                                               <span>{badgeText}</span>
                                             </span>
                                           </div>
                                        </div>

                                        {/* Text content */}
                                         {/* Text content with X-Style structure */}
                                         {post?.text && (
                                           <FormattedPostText text={post.text} />
                                         )}

                                         {/* Image Attachment */}
                                         {post?.media?.url && (isImg || post?.media?.kind === "image") && (
                                           <PostImageAttachment src={post.media.url} alt="Post media" containerClassName="my-2.5 overflow-hidden rounded-2xl border border-slate-800/90 bg-black/50 w-full relative shadow-xl" />
                                         )}

                                        {/* Video Attachment */}
                                        {post?.media?.url && (isVid || post?.media?.kind === "video") && (
                                          <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950 mb-3.5 relative shadow-lg">
                                            <div className="mx-auto w-full max-w-[720px] bg-slate-950 h-[380px] sm:h-[500px] md:h-[580px] lg:h-[640px] flex items-center justify-center">
                                              <SmartVideo
                                                src={post.media.url}
                                                className="h-full w-full"
                                                preload="metadata"
                                                autoplayMuted
                                              />
                                            </div>
                                          </div>
                                        )}

                                        {/* Action buttons */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3 mt-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const currentUserId = (session?.user as any)?.id;
                                                const postAuthorId = post.authorId;
                                                if (postAuthorId === currentUserId) {
                                                  alert('You cannot follow your own post');
                                                  return;
                                                }
                                                handleFollow(postAuthorId);
                                              }}
                                              disabled={!(session?.user as any)?.id || engagementLoading[post.authorId]?.follow}
                                              className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase transition-all duration-200 cursor-pointer ${followStatus[post.authorId]
                                                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.15)]'
                                                  : 'border-slate-700/60 bg-slate-900/60 text-slate-200 hover:border-cyan-400/60 hover:text-cyan-200'
                                                } ${engagementLoading[post.authorId]?.follow ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                              {engagementLoading[post.authorId]?.follow ? '...' : (followStatus[post.authorId] ? 'Following' : 'Follow')}
                                            </button>

                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleReaction(post.id, 1);
                                              }}
                                              disabled={!(session?.user as any)?.id || engagementLoading[post.id]?.reaction}
                                              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase transition-all duration-200 cursor-pointer ${postReactions[post.id]?.userReaction === 1
                                                  ? 'bg-pink-500/20 border-pink-400/60 text-pink-300 shadow-[0_0_10px_rgba(244,63,94,0.15)]'
                                                  : 'border-slate-700/60 bg-slate-900/60 text-slate-200 hover:border-pink-400/60 hover:text-pink-200'
                                                } ${engagementLoading[post.id]?.reaction ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                              {engagementLoading[post.id]?.reaction ? '...' : (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
                                              )}
                                            </button>

                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleReaction(post.id, -1);
                                              }}
                                              disabled={!(session?.user as any)?.id || engagementLoading[post.id]?.reaction}
                                              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase transition-all duration-200 cursor-pointer ${postReactions[post.id]?.userReaction === -1
                                                  ? 'bg-orange-500/20 border-orange-400/60 text-orange-300 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                                                  : 'border-slate-700/60 bg-slate-900/60 text-slate-200 hover:border-pink-400/60 hover:text-pink-200'
                                                } ${engagementLoading[post.id]?.reaction ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                              {engagementLoading[post.id]?.reaction ? '...' : (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.28a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" /></svg>
                                              )}
                                            </button>

                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDirectoryOpenCommentsPostId((cur) => cur === post.id ? null : post.id);
                                                if (!directoryOpenCommentsPostId || directoryOpenCommentsPostId !== post.id) {
                                                  fetchComments(post.id);
                                                }
                                              }}
                                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase transition-all duration-200 cursor-pointer ${directoryOpenCommentsPostId === post.id
                                                  ? 'bg-blue-500/25 border-blue-400/70 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                                                  : 'border-slate-700/60 bg-slate-900/60 text-slate-200 hover:border-blue-400/60 hover:text-blue-200'
                                                }`}
                                            >
                                              <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                                              </svg>
                                              <span>Comment</span>
                                              <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[9px] font-bold tracking-tight ${directoryOpenCommentsPostId === post.id
                                                  ? 'bg-blue-400/30 text-blue-200'
                                                  : 'bg-slate-800 text-slate-300 border border-slate-700/60'
                                                }`}>
                                                {postComments[post.id]?.length ?? (post?._count?.comments || 0)}
                                              </span>
                                            </button>
                                          </div>

                                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold tracking-wider">
                                            <span>{postReactions[post.id]?.likes || post?._count?.reactions || 0} LIKES</span>
                                            <span>•</span>
                                            <span>{post?._count?.comments || 0} COMMENTS</span>
                                          </div>
                                        </div>

                                        {/* Comments Section */}
                                        {directoryOpenCommentsPostId === post.id && (
                                          <div className="mt-3.5 rounded-2xl border border-slate-700/70 bg-slate-950/85 backdrop-blur-md p-3.5 shadow-2xl transition-all">
                                            {/* YouTube-style Container Header */}
                                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2.5">
                                              <div className="flex items-center gap-2">
                                                <span className="text-[10.5px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                                                  <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                                                  </svg>
                                                  Comments
                                                </span>
                                                <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-2 py-0.2 text-[9px] font-bold text-blue-300">
                                                  {postComments[post.id]?.length ?? (post?._count?.comments || 0)}
                                                </span>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => setDirectoryOpenCommentsPostId(null)}
                                                className="flex items-center gap-1 rounded-full border border-slate-700/60 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-500 px-2 py-0.5 text-[9.5px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                                                title="Close comments"
                                              >
                                                <span>✕</span>
                                                <span>Close</span>
                                              </button>
                                            </div>

                                            {/* Comment Input */}
                                            {(session?.user as any)?.id && (
                                              <div className="flex gap-2">
                                                <input
                                                  type="text"
                                                  value={commentInputs[post.id] || ''}
                                                  onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                                                  onKeyPress={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                      e.preventDefault();
                                                      handleAddComment(post.id);
                                                    }
                                                  }}
                                                  placeholder="Add a comment..."
                                                  className="flex-1 rounded-xl border border-slate-600/70 bg-slate-900/80 px-3 py-1.5 text-[10.5px] text-slate-100 outline-none ring-0 transition focus:border-blue-400 focus:bg-slate-900 focus:shadow-[0_0_0_1px_rgba(59,130,246,0.6)]"
                                                  disabled={engagementLoading[post.id]?.comment}
                                                />
                                                <button
                                                  onClick={() => handleAddComment(post.id)}
                                                  disabled={!commentInputs[post.id]?.trim() || engagementLoading[post.id]?.comment}
                                                  className="rounded-xl border border-slate-600/70 bg-slate-900/80 px-3 py-1.5 text-[10px] font-bold text-slate-200 transition hover:border-blue-400 hover:bg-slate-900 focus:border-blue-400 focus:bg-slate-900 focus:shadow-[0_0_0_1px_rgba(59,130,246,0.6)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                                >
                                                  {engagementLoading[post.id]?.comment ? '...' : 'Post'}
                                                </button>
                                              </div>
                                            )}

                                            {/* Comments List - YouTube style bounded internal scroll */}
                                            <div className="mt-3 space-y-2 max-h-60 sm:max-h-68 overflow-y-auto custom-directory-scroll pr-1">
                                              {commentsLoading[post.id] ? (
                                                       <PostCommentsSkeleton />
                                                     ) : postComments[post.id]?.length > 0 ? (
                                                postComments[post.id].map((comment) => (
                                                  <div key={comment.id} className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-2.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                      <div className="flex items-center gap-2">
                                                        <div className="relative h-4.5 w-4.5 rounded-full overflow-hidden flex-shrink-0 bg-slate-800">
                                                          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/30 to-fuchsia-500/30 flex items-center justify-center text-[7px] font-bold text-white uppercase">
                                                            {(comment.author.handle?.[0] || comment.author.name?.[0] || '?').toUpperCase()}
                                                          </div>
                                                          {isValidImageUrl(comment.author.image) && (
                                                            <img
                                                              src={getHighResProfilePic(comment.author.image)}
                                                              alt={comment.author.name || 'User'}
                                                              className="absolute inset-0 h-full w-full object-cover rounded-full"
                                                              referrerPolicy="no-referrer"
                                                              onError={(e) => {
                                                                (e.target as HTMLImageElement).style.display = 'none';
                                                              }}
                                                            />
                                                          )}
                                                        </div>
                                                        <span className="text-[9.5px] font-bold text-slate-300">
                                                          {comment.author.name || comment.author.handle || 'Anonymous'}
                                                        </span>
                                                      </div>
                                                      <span className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">
                                                        {formatTimeAgo(comment.createdAt)}
                                                      </span>
                                                    </div>
                                                    <p className="mt-1 text-[10px] text-slate-200 leading-relaxed font-normal">
                                                      {comment.content}
                                                    </p>
                                                  </div>
                                                ))
                                              ) : (
                                                <p className="text-[10px] text-slate-400 text-center py-2 font-medium">No comments yet. Be the first to comment!</p>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )
                              )}
                            </div>

                            {directoryPostsLoading && filteredFeedPosts.length > 0 && (
                              <div className="pt-3">
                                <GlobalDirectoryMediaSkeleton />
                              </div>
                            )}
                            {directoryPostsError && !directoryPostsLoading && (
                              <p className="text-[11px] text-rose-300">{directoryPostsError}</p>
                            )}
                          </div>
                        </>
                      );
                    })()
                  )}

                  {!directoryLoading && !directoryError && (!directoryItems || directoryItems.length === 0) && (
                    <p className="text-[11px] text-slate-500">No quantum IDs are visible in the directory yet.</p>
                  )}
                </div>
              </>
            )}
              </div>
            </div>
          </div>
        )}


        {/* Main Chat Container - Full Width */}
        <div
          className={
            isFocusMode
              ? "flex w-full flex-1 relative px-0 py-0 h-auto min-h-screen overflow-y-visible"
              : `flex w-full flex-1 glass-panel-responsive neon-border-responsive relative px-0 py-0 sm:px-6 md:px-8 lg:px-10 sm:py-6 md:py-8 ${isChatFull ? "h-full min-h-0 overflow-hidden" : "h-auto min-h-screen overflow-y-visible"} ${isGlowActive ? "glow-active" : ""}`
          }
          onTouchStart={() => setIsGlowActive(true)}
          onTouchEnd={() => setIsGlowActive(false)}
          onTouchCancel={() => setIsGlowActive(false)}
          style={{
            scrollBehavior: 'auto',
            overscrollBehaviorY: 'contain',
            WebkitOverflowScrolling: 'touch',
            overflowAnchor: 'none',
          }}>
          <style jsx>{`
          @keyframes glow-pulse {
            0%, 100% {
              box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.6), 0 0 40px rgba(56, 189, 248, 0.4), 0 0 80px rgba(56, 189, 248, 0.2);
            }
            50% {
              box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.8), 0 0 80px rgba(56, 189, 248, 0.6), 0 0 120px rgba(56, 189, 248, 0.4);
            }
          }
          @keyframes guide-glow {
            0%, 100% {
              box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.2), 0 0 20px rgba(56, 189, 248, 0.15);
            }
            50% {
              box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.6), 0 0 40px rgba(56, 189, 248, 0.4);
            }
          }
          .glow-pulse {
            animation: glow-pulse 1.2s ease-in-out infinite;
          }
          .guide-glow {
            animation: guide-glow 2s ease-in-out infinite;
          }

          /* Ultra-smooth scroll physics - DISABLED */
          .mobile-scroll-container {
            -webkit-overflow-scrolling: touch;
            scroll-behavior: auto;
            overscroll-behavior-y: contain;
          }

          /* Spring bounce effect for overscroll - DISABLED */
          @supports (overscroll-behavior: contain) {
            .mobile-scroll-container {
              overscroll-behavior: contain;
            }
          }

          /* Momentum-based scrolling - DISABLED */
          .mobile-scroll-container {
            scroll-snap-type: none;
            scroll-padding-top: 0;
            scroll-padding-bottom: 0;
          }

          /* Enhanced responsive borders */
          @media (min-width: 1024px) {
            .glass-panel {
              border-width: 1.5px;
              box-shadow: 
                0 0 0 1px rgba(34, 211, 238, 0.3),
                0 4px 20px rgba(0, 0, 0, 0.3),
                0 0 40px rgba(56, 189, 248, 0.1),
                inset 0 1px 0 rgba(255, 255, 255, 0.05);
            }
          }
          
          @media (min-width: 1280px) {
            .glass-panel {
              border-width: 2px;
              box-shadow: 
                0 0 0 1px rgba(34, 211, 238, 0.4),
                0 8px 30px rgba(0, 0, 0, 0.4),
                0 0 60px rgba(56, 189, 248, 0.15),
                inset 0 1px 0 rgba(255, 255, 255, 0.08);
            }
          }

          /* Responsive glass-panel for mobile edge-to-edge stretching */
          .glass-panel-responsive {
            background: transparent;
            border-radius: 0px !important;
            border: none !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
          }
          .neon-border-responsive {
            position: relative;
          }
          .neon-border-responsive::before {
            content: "";
            position: absolute;
            inset: 0;
            border-radius: inherit;
            background: conic-gradient(from 180deg at 50% 50%,
                rgba(56, 189, 248, 0.25),
                rgba(251, 113, 133, 0.55),
                rgba(129, 140, 248, 0.45),
                rgba(56, 189, 248, 0.25));
            opacity: 0;
            transition: opacity 350ms cubic-bezier(0.4, 0, 0.2, 1);
            filter: blur(16px);
            pointer-events: none;
            display: block !important; /* Enable on all screen sizes! */
          }
          /* Desktop-only hover and active glow states */
          @media (hover: hover) {
            .neon-border-responsive:hover::before,
            .neon-border-responsive:active::before {
              opacity: 1;
            }
          }

          /* Mobile/Desktop manual touch glow state (triggered instantly by React touch events) */
          .neon-border-responsive.glow-active::before {
            opacity: 1;
          }

          @media (min-width: 640px) {
            .glass-panel-responsive {
              background: rgba(15, 23, 42, 0.75);
              border-radius: 1.5rem !important;
              border: 1px solid rgba(148, 163, 184, 0.4) !important;
              box-shadow:
                0 0 0 1px rgba(148, 163, 184, 0.15),
                0 18px 60px rgba(15, 23, 42, 0.85) !important;
              backdrop-filter: blur(22px) saturate(160%) !important;
            }
            .neon-border-responsive::before {
              inset: -1px;
              filter: blur(12px); /* Standard desktop blur */
            }
          }
        `}</style>
          {showGuide && !showOnboarding && !showInstallPrompt && (
            <QuantumOnboardingTour
              isOpen={showGuide && !showOnboarding && !showInstallPrompt}
              step={guideStep}
              onStepChange={setGuideStep}
              onClose={() => {
                setShowGuide(false);
                if (typeof window !== "undefined") {
                  try {
                    window.localStorage.setItem("qc_seen_guide_v1", "1");
                  } catch {
                    // ignore
                  }
                }
              }}
            />
          )}
          <div
            className={
              "pointer-events-none absolute top-0 h-px " +
              (isDefaultTheme ? "bg-gradient-to-r from-cyan-400/0 via-cyan-400/70 to-fuchsia-500/0 " : "") +
              "inset-x-0"
            }
            style={
              !isDefaultTheme
                ? { background: 'linear-gradient(90deg, transparent 0%, var(--duo-border-glow) 50%, transparent 100%)' }
                : undefined
            }
          />

          <div
            className={
              isChatExpanded
                ? "relative grid h-full min-h-0 w-full min-w-0 max-w-full gap-8 overflow-hidden"
                : isFocusMode
                  ? "relative flex justify-center w-full min-w-0 max-w-full h-auto min-h-full overflow-y-visible"
                  : "relative grid w-full min-w-0 max-w-full h-auto min-h-full gap-0 overflow-y-visible lg:grid-cols-2 lg:items-start"
            }
          >
            {isFocusMode && <div className="ambient-breathing-bg" />}

            {/* LEFT: HOME / STATUS */}
            <section
              className={
                isChatExpanded
                  ? "hidden"
                  : isFocusMode
                    ? "fixed inset-0 z-[9999] bg-slate-950/95 overflow-y-auto px-0 py-0 flex flex-col"
                    : "space-y-4 sm:space-y-6 min-w-0 max-w-full px-1 sm:px-4 lg:px-6 py-4"
              }
            >
              <div className={isFocusMode ? "w-full min-h-screen relative flex flex-col" : "contents"}>
                {!isFocusMode && (
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2 flex-wrap max-w-full overflow-visible py-1 px-0.5">
                    <button
                      id="quantum-link-console-btn"
                      data-tour="console-btn"
                      type="button"
                      onClick={openDirectory}
                      className={
                        "inline-flex items-center gap-1 sm:gap-2 rounded-full border px-2 sm:px-3 py-1 text-[10.5px] sm:text-xs font-medium uppercase tracking-wider sm:tracking-[0.2em] transition focus-visible:outline-none animate-[pulse_2.4s_ease-in-out_infinite] shrink-0 " +
                        (isDefaultTheme
                          ? ("bg-cyan-500/5 text-cyan-100/80 hover:border-cyan-300 hover:bg-cyan-500/10 focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 " +
                             (highlightConsole ? "border-cyan-300 glow-pulse" : "border-cyan-400/40"))
                          : "hover:opacity-90")
                      }
                      style={
                        !isDefaultTheme
                          ? {
                              borderColor: 'var(--duo-border-glow)',
                              backgroundColor: 'var(--duo-primary-pill-bg)',
                              color: 'var(--duo-accent-text)',
                            }
                          : undefined
                      }
                    >
                      <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
                        <span
                          className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${isDefaultTheme ? "bg-cyan-400/70" : ""}`}
                          style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-accent-text)' : undefined }}
                        />
                        <span
                          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${isDefaultTheme ? "bg-cyan-300" : ""}`}
                          style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-accent-text)' : undefined }}
                        />
                      </span>
                      Quantum Link Console
                    </button>

                    <Link
                      href="/about"
                      className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full border border-slate-800 bg-slate-900/40 px-2.5 sm:px-3 py-1 text-[11px] sm:text-[11.5px] font-semibold text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300 transition-all duration-300 shrink-0"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#22d3ee] shrink-0" />
                      About
                    </Link>


                    <button
                      id="settings-btn"
                      data-tour="settings-btn"
                      type="button"
                      onClick={() => {
                        // Prevent rapid double-clicks causing flicker
                        const now = Date.now();
                        if (now - settingsClickTimeRef.current < 400) return;
                        settingsClickTimeRef.current = now;
                        // eslint-disable-next-line no-console
                        console.log("[Settings] pill clicked");
                        setIsSettingsAnimating(true);
                        setShowSettings((prev) => !prev);
                        setSettingsScreen("main");
                      }}
                      className={
                        "inline-flex items-center gap-1 sm:gap-1.5 rounded-full border bg-slate-900/70 px-2.5 sm:px-3 py-1 text-[11px] font-medium text-slate-200 hover:border-cyan-400/70 hover:text-cyan-200 shrink-0 " +
                        (highlightSettingsPill
                          ? "border-cyan-400 glow-pulse"
                          : "border-slate-600/70")
                      }
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      Settings
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsFocusMode((prev) => !prev)}
                      className={
                        "inline-flex items-center gap-1 rounded-full border bg-slate-900/70 px-3 py-1 text-[11px] font-medium transition-colors focus-glow-btn " +
                        (isFocusMode
                          ? "border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                          : "border-cyan-500/50 text-cyan-400 hover:border-cyan-400 hover:text-cyan-200")
                      }
                    >
                      <span className={`h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#22d3ee]`} />
                      {isFocusMode ? "Focus Mode: On" : "Focus Mode"}
                    </button>
                  </div>
                )}

                <SettingsModal
                  showSettings={showSettings}
                  isSettingsAnimating={isSettingsAnimating}
                  setShowSettings={(val) => {
                    setShowSettings(val);
                    if (!val) replaceNavState({ screen: "home" });
                    else pushNavState({ screen: "settings" });
                  }}
                  setIsSettingsAnimating={setIsSettingsAnimating}
                  settingsScreen={settingsScreen}
                  setSettingsScreen={setSettingsScreen}
                  settingsGlassTheme={settingsGlassTheme}
                  toggleSettingsGlassTheme={toggleSettingsGlassTheme}
                  canUseDom={canUseDom}
                  session={session}
                  currentHandle={currentHandle || undefined}
                  emailVisibility={emailVisibility}
                  setEmailVisibility={setEmailVisibility}
                  desktopNotificationsEnabled={desktopNotificationsEnabled}
                  toggleDesktopNotifications={toggleDesktopNotifications}
                  isPushEnabled={isPushEnabled}
                  togglePushNotifications={togglePushNotifications}
                  isE2EEnabled={isE2EEnabled}
                  setIsE2EEnabled={setIsE2EEnabled}
                  showOnboarding={showOnboarding}
                  setShowOnboarding={setShowOnboarding}
                  setOnboardingStep={setOnboardingStep}
                  displayName={displayName || ""}
                  setDisplayName={(val) => {
                    setDisplayName(val);
                    setCurrentUserProfile((prev: any) => (prev ? { ...prev, name: val } : { name: val }));
                    if (session?.user) {
                      (session.user as any).name = val;
                    }
                  }}
                  nameDraft={nameDraft}
                  setNameDraft={setNameDraft}
                  bioDraft={bioDraft}
                  setBioDraft={setBioDraft}
                  bioVisibility={bioVisibility}
                  setBioVisibility={setBioVisibility}
                  age={age}
                  ageVisibility={ageVisibility}
                  setAgeVisibility={setAgeVisibility}
                  gender={gender || ""}
                  genderVisibility={genderVisibility}
                  setGenderVisibility={setGenderVisibility}
                  selectedInterests={selectedInterests}
                  setSelectedInterests={setSelectedInterests}
                  interestsVisibility={interestsVisibility}
                  setInterestsVisibility={setInterestsVisibility}
                  showLogoutConfirm={showLogoutConfirm}
                  setShowLogoutConfirm={setShowLogoutConfirm}
                  handleSignOut={handleSignOut}
                  manualStopAnimation={manualStopAnimation}
                  setManualStopAnimation={setManualStopAnimation}
                  setIsAIArrowButtonVisible={setIsAIArrowButtonVisible}
                  setShowAIHelpButton={setShowAIHelpButton}
                />



                {showLogoutConfirm && !canUseDom && (
                  <div
                    className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 px-4"
                    onMouseDown={() => setShowLogoutConfirm(false)}
                  >
                    <div
                      className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-700/70 bg-slate-950/95 px-4 py-4 text-[11px] text-slate-200 shadow-2xl"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-slate-100">
                          Log out of Quantum Chat?
                        </p>
                        <p className="text-[10px] text-slate-400">
                          You will be signed out on this device. You can log back in anytime.
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowLogoutConfirm(false)}
                          className="rounded-xl border border-slate-600/70 bg-slate-900/80 px-3 py-2 text-[11px] font-medium text-slate-200 hover:border-cyan-400/70 hover:text-cyan-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowLogoutConfirm(false);
                            setShowSettings(false);
                            handleSignOut();
                          }}
                          className="rounded-xl border border-rose-500/80 bg-rose-500/15 px-3 py-2 text-[11px] font-medium text-rose-100 hover:bg-rose-500/25"
                        >
                          Log out
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <NotificationCenterModal
                  isOpen={isNotifCenterOpen}
                  onClose={() => {
                    setIsNotifCenterOpen(false);
                    replaceNavState({ screen: "home" });
                  }}
                  currentUserId={myId}
                  onNavigateToChat={(userHandle) => {
                    setIsNotifCenterOpen(false);
                    openChatWithPeer(userHandle);
                  }}
                />

                {!isFocusMode && (
                  <>
                    <div className="space-y-3 sm:space-y-4">
                      <h1 className="text-balance text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl md:text-6xl">
                        Talk to anyone on Earth
                        <span
                          className={`block bg-clip-text text-transparent transition-all duration-500 ${
                            isDefaultTheme
                              ? "bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-indigo-300"
                              : ""
                          }`}
                          style={!isDefaultTheme ? {
                            backgroundImage: "var(--duo-text-gradient, var(--duo-gradient, linear-gradient(135deg, #22d3ee 0%, #8b5cf6 100%)))",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                          } : undefined}
                        >
                          with a single ID.
                        </span>
                      </h1>
                      <p className="max-w-lg text-base text-slate-300/90 sm:text-lg leading-relaxed break-words">
                        Share your quantum chat ID, send a relationship request, and
                        open a secure, near-instant channel to your co-founders,
                        family, investors and more.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400/90 sm:text-sm">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${isDefaultTheme ? "border border-slate-500/40 bg-slate-900/50" : "border"}`}
                        style={!isDefaultTheme ? { backgroundColor: 'var(--duo-surface-card-inner)', borderColor: 'var(--duo-surface-card-border-subtle)' } : undefined}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Live presence
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${isDefaultTheme ? "border border-slate-500/40 bg-slate-900/50" : "border"}`}
                        style={!isDefaultTheme ? { backgroundColor: 'var(--duo-surface-card-inner)', borderColor: 'var(--duo-surface-card-border-subtle)' } : undefined}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                        Encrypted DMs
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${isDefaultTheme ? "border border-slate-500/40 bg-slate-900/50" : "border"}`}
                        style={!isDefaultTheme ? { backgroundColor: 'var(--duo-surface-card-inner)', borderColor: 'var(--duo-surface-card-border-subtle)' } : undefined}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                        Global handles
                      </span>
                    </div>
                  </>
                )}

                <div
                  ref={quantumIdRef}
                  className={
                    isFocusMode
                      ? "mt-0 space-y-4 rounded-none border-none bg-slate-900 p-2 sm:p-4 md:p-6 pt-16 w-full flex-1 flex flex-col text-base text-slate-200 transition-shadow scrollbar-hide"
                      : ("mt-4 space-y-4 rounded-2xl p-4 text-sm text-slate-300 transition-shadow scrollbar-hide " +
                         (isDefaultTheme ? "border border-slate-600/60 bg-slate-900/70" : "border"))
                  }
                  style={!isDefaultTheme ? {
                    backgroundColor: 'var(--duo-surface-card)',
                    borderColor: 'var(--duo-surface-card-border)',
                  } : undefined}
                >
                  <div
                    data-tour="quantum-id"
                    className={
                      "flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-xl transition-all scrollbar-hide " +
                      (isDefaultTheme ? "bg-slate-950/50 border border-slate-700/60" : "border")
                    }
                    style={!isDefaultTheme ? {
                      backgroundColor: 'var(--duo-surface-card-inner)',
                      borderColor: 'var(--duo-surface-card-border-subtle)',
                    } : undefined}
                  >
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400">
                          Quantum Operator
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 text-[8.5px] font-mono text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                          <span>NODE ACTIVE</span>
                        </span>
                      </div>
                      {displayName && !editingHandle && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => profilePicInputRef.current?.click()}
                            className="relative h-6 w-6 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 hover:border-cyan-400/70 flex items-center justify-center text-[10px] text-cyan-300 hover:text-cyan-200 transition-all duration-300 shadow-[0_0_8px_rgba(34,211,238,0.3)] hover:shadow-[0_0_12px_rgba(34,211,238,0.5)] cursor-pointer overflow-hidden flex-shrink-0"
                            title="Upload profile picture"
                          >
                            {profilePicUrl ? (
                              <img
                                src={profilePicUrl}
                                alt="Profile"
                                referrerPolicy="no-referrer"
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-cyan-400 text-xs font-bold leading-none">+</span>
                            )}
                          </button>
                          <span className="text-xs sm:text-sm font-semibold text-slate-100 tracking-tight truncate max-w-[110px] xs:max-w-[140px] sm:max-w-none">
                            {displayName}
                          </span>
                          {isVipHandle(quantumId) ? (
                            <span className="inline-flex items-center rounded-full bg-red-500/15 border border-red-500/40 px-1.5 py-0.2 text-[8px] font-bold text-red-300 shadow-[0_0_8px_rgba(239,68,68,0.3)]">
                              ⚡ FOUNDER
                            </span>
                          ) : effectiveBlueTickStatus === "SAPPHIRE" ? (
                            <span className="inline-flex items-center rounded-full bg-sky-500/15 border border-sky-500/40 px-1.5 py-0.2 text-[8px] font-bold text-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.3)]">
                              💎 SAPPHIRE
                            </span>
                          ) : null}
                          <input
                            ref={profilePicInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleProfilePicUpload}
                            className="hidden"
                          />
                        </div>
                      )}
                      {handleError && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-300">
                          <span>⚠</span>
                          <span>{handleError}</span>
                        </span>
                      )}
                    </div>
                    {editingHandle ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400">
                          Your Quantum ID
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col gap-1">
                            <div className="relative">
                              <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[11px] text-slate-500">
                                @
                              </span>
                              <input
                                value={handleDraft}
                                onChange={(e) => onHandleDraftChange(e.target.value)}
                                className="w-40 rounded-full border border-slate-600/70 bg-slate-900/80 py-1 pl-5 pr-2 text-[11px] text-slate-100 outline-none ring-0 transition focus:border-cyan-400 focus:bg-slate-900 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.6)]"
                                placeholder="new-id"
                              />
                            </div>
                            <input
                              value={nameDraft}
                              onChange={(e) => setNameDraft(e.target.value)}
                              className="w-40 rounded-full border border-slate-600/70 bg-slate-900/80 py-1 px-2 text-[11px] text-slate-100 outline-none ring-0 transition focus:border-cyan-400 focus:bg-slate-900 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.6)]"
                              placeholder="Your display name"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={saveHandle}
                            disabled={handleSaving}
                            className="rounded-full border border-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60 cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingHandle}
                            className="rounded-full border border-slate-600/70 bg-slate-900/60 px-2 py-0.5 text-[10px] font-medium text-slate-300 hover:bg-slate-800/80 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400">
                          Your Quantum ID
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              "rounded-full px-2 py-0.5 text-[11px] truncate max-w-[125px] xs:max-w-[150px] sm:max-w-none " +
                              (isDefaultTheme
                                ? (isVipHandle(quantumId)
                                    ? "bg-slate-800 font-semibold text-red-400"
                                    : effectiveBlueTickStatus === "SAPPHIRE"
                                      ? "bg-slate-800 font-semibold text-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.25)]"
                                      : "bg-slate-800 font-mono text-cyan-300")
                                : "font-semibold")
                            }
                            style={!isDefaultTheme ? {
                              backgroundColor: 'var(--duo-primary-pill-bg)',
                              color: 'var(--duo-accent-text)',
                            } : undefined}
                          >
                            @{quantumId}
                          </span>
                          {effectiveBlueTickStatus === "SAPPHIRE" && (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-500/20 border border-sky-400/80 text-[8px] font-bold text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.4)]">
                              ✓
                            </span>
                          )}
                          {/* Edit handle button: unconditionally rendered during onboarding tour */}
                          {(!(isVipHandle(quantumId) && meEmail !== "rohiterrors@gmail.com") || showGuide) && (
                            <button
                              id="tour-edit-profile-btn"
                              data-tour="edit-id"
                              type="button"
                              onClick={startEditingHandle}
                              className={
                                "rounded-full border bg-slate-900/70 px-2.5 py-0.5 text-[10px] font-medium text-slate-200 hover:border-cyan-400/70 hover:text-cyan-200 transition-all cursor-pointer " +
                                (highlightEditId
                                  ? "glow-pulse border-cyan-400/80"
                                  : "border-slate-500/70")
                              }
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-[10px] text-slate-500">
                      Share this ID so people can connect to you.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowGuide(true);
                        setGuideStep(0);
                      }}
                      className="rounded-full border border-slate-600/60 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-200 hover:border-cyan-400/70 hover:text-cyan-200 transition-colors cursor-pointer active:scale-95 shadow-sm"
                    >
                      How this works
                    </button>
                  </div>

                  {/* UNIFIED CONNECTIONS HUB WITH SEGMENTED TABS */}
                  {(() => {
                    // Combine and deduplicate accepted friends from both directions
                    const acceptedFriendsMap = new Map<string, any>();

                    // Outgoing accepted
                    for (const req of outgoing) {
                      if (req.status === "ACCEPTED" && req.toUser?.handle) {
                        const peerHandle = req.toUser.handle;
                        const isCurrentActive = areHandlesEqual(peerHandle, activePeerHandle);
                        const isUnread = !isCurrentActive && Boolean(req.isUnread) && isHandleUnread(unreadMessages, peerHandle);
                        acceptedFriendsMap.set(peerHandle.toLowerCase(), {
                          id: req.id,
                          peerHandle,
                          peerName: req.toUser.name,
                          categories: req.categories || [],
                          direction: "outgoing",
                          status: req.status,
                          isUnread,
                        });
                      }
                    }

                    // Incoming accepted
                    for (const req of incoming) {
                      if (req.status === "ACCEPTED" && req.fromUser?.handle) {
                        const peerHandle = req.fromUser.handle;
                        const key = peerHandle.toLowerCase();
                        const isCurrentActive = areHandlesEqual(peerHandle, activePeerHandle);
                        const isItemUnread = !isCurrentActive && Boolean(req.isUnread) && isHandleUnread(unreadMessages, peerHandle);
                        if (!acceptedFriendsMap.has(key)) {
                          acceptedFriendsMap.set(key, {
                            id: req.id,
                            peerHandle,
                            peerName: req.fromUser.name,
                            categories: req.categories || [],
                            direction: "incoming",
                            status: req.status,
                            isUnread: isItemUnread,
                          });
                        } else {
                          const existing = acceptedFriendsMap.get(key);
                          if (existing && !isItemUnread) {
                            existing.isUnread = false;
                          }
                        }
                      }
                    }

                    const acceptedFriends = Array.from(acceptedFriendsMap.values());
                    const pendingIncoming = incoming.filter((r) => r.status === "PENDING");
                    const pendingOutgoing = outgoing.filter((r) => r.status === "PENDING");
                    const totalPending = pendingIncoming.length + pendingOutgoing.length;

                    // Automatically calibrate skeleton count whenever data updates
                    if (typeof window !== "undefined" && (!isLoadingOutgoing && !isLoadingIncoming)) {
                      try {
                        const actualFriendCount = acceptedFriends.length;
                        const actualReqCount = totalPending;
                        if (actualFriendCount > 0 && actualFriendCount !== predictedFriendsCount) {
                          localStorage.setItem("qc_friends_count", String(actualFriendCount));
                        }
                        if (actualReqCount > 0 && actualReqCount !== predictedRequestsCount) {
                          localStorage.setItem("qc_requests_count", String(actualReqCount));
                        }
                      } catch {}
                    }

                    const hasDataLoaded = acceptedFriends.length > 0 || totalPending > 0;
                    const isInitialLoading = !hasDataLoaded && (isLoadingOutgoing || isLoadingIncoming);

                    const handleSpotlightMouseMove = (e: React.MouseEvent<HTMLElement>) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
                      e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
                      e.currentTarget.style.setProperty("--spotlight-opacity", "1");
                    };

                    const handleSpotlightMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
                      e.currentTarget.style.setProperty("--spotlight-opacity", "0");
                    };

                    return (
                      <div className="mt-3 space-y-2.5">
                        {/* Segmented Control Bar */}
                        <div className="flex items-center justify-between gap-2">
                          <div
                            ref={connectionsTabBarRef}
                            onMouseMove={handleTabBarMouseMove}
                            onMouseLeave={handleTabBarMouseLeave}
                            className={
                              "relative grid grid-cols-2 items-center rounded-xl p-1 backdrop-blur-md shadow-inner w-[200px] xs:w-[220px] sm:w-[240px] select-none overflow-hidden " +
                              (isDefaultTheme ? "border border-slate-800/80 bg-slate-950/80" : "border")
                            }
                            style={{
                              "--pill-x": connectionsTab === "friends" ? "0px" : "116px",
                              "--pill-transition": "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                              backgroundColor: !isDefaultTheme ? 'var(--duo-surface-card-inner)' : undefined,
                              borderColor: !isDefaultTheme ? 'var(--duo-surface-card-border-subtle)' : undefined,
                            } as React.CSSProperties}
                          >
                            {/* The Live Sticky Moving Spotlight Layer */}
                            <div
                              className={
                                "pointer-events-none absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg backdrop-blur-md z-0 will-change-transform " +
                                (isDefaultTheme
                                  ? "bg-gradient-to-r from-cyan-500/25 via-sky-500/20 to-blue-500/25 border border-cyan-400/50 shadow-[0_0_16px_rgba(6,182,212,0.35),0_0_30px_rgba(168,85,247,0.15)]"
                                  : "border")
                              }
                              style={{
                                left: "4px",
                                transform: "translateX(var(--pill-x, 0px))",
                                transition: "var(--pill-transition, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1))",
                                background: !isDefaultTheme ? 'var(--duo-tab-indicator-bg)' : undefined,
                                borderColor: !isDefaultTheme ? 'var(--duo-border-glow)' : undefined,
                                boxShadow: !isDefaultTheme ? '0 0 14px var(--duo-border-glow)' : undefined,
                              }}
                            >
                              {/* Prismatic Cyan-Purple-Pink Ambient Spotlight Glow */}
                              <div
                                className="absolute inset-0 rounded-lg pointer-events-none transition-opacity duration-300"
                                style={{
                                  background:
                                    "radial-gradient(90px circle at var(--mouse-in-pill, 50%) 50%, rgba(34, 211, 238, 0.45) 0%, rgba(168, 85, 247, 0.3) 45%, rgba(244, 63, 94, 0.16) 72%, transparent 100%)",
                                }}
                              />

                              {/* Specular Sheen across top edge */}
                              <div
                                className="absolute inset-x-0 top-0 h-[1px] pointer-events-none"
                                style={{
                                  background:
                                    "radial-gradient(55px 1px at var(--mouse-in-pill, 50%) 0%, rgba(255, 255, 255, 0.9) 0%, rgba(34, 211, 238, 0.6) 40%, rgba(168, 85, 247, 0.4) 75%, transparent 100%)",
                                }}
                              />
                            </div>

                            {/* Friends Button */}
                            <button
                              type="button"
                              onClick={() => setConnectionsTab("friends")}
                              className={`relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-1 px-2 text-xs font-semibold overflow-hidden transition-colors duration-200 select-none cursor-pointer ${
                                connectionsTab === "friends"
                                  ? "text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)] font-bold"
                                  : "text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              <span>Friends</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-colors duration-200 leading-none ${
                                connectionsTab === "friends" ? "bg-cyan-400/20 text-cyan-200 border border-cyan-400/30" : "bg-slate-800 text-slate-400"
                              }`}>
                                {acceptedFriends.length}
                              </span>
                            </button>

                            {/* Requests Button */}
                            <button
                              type="button"
                              onClick={() => setConnectionsTab("requests")}
                              className={`relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-1 px-2 text-xs font-semibold overflow-hidden transition-colors duration-200 select-none cursor-pointer ${
                                connectionsTab === "requests"
                                  ? "text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)] font-bold"
                                  : pendingIncoming.length > 0
                                    ? "text-amber-200"
                                    : "text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              <span>Requests</span>
                              {totalPending > 0 && (
                                <span className="relative inline-flex items-center ml-0.5">
                                  {pendingIncoming.length > 0 && (
                                    <span className="absolute -inset-0.5 rounded-full bg-orange-500 opacity-80 animate-ping" />
                                  )}
                                  <span
                                    className={`relative inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none transition-transform ${
                                      pendingIncoming.length > 0
                                        ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-[0_0_10px_#f97316]"
                                        : "bg-slate-800 text-slate-300 border border-slate-700"
                                    }`}
                                  >
                                    {totalPending}
                                  </span>
                                </span>
                              )}
                            </button>
                          </div>

                          <div ref={connectRef}>
                            <button
                              type="button"
                              onClick={() => setMode("connect")}
                              className={
                                "rounded-full px-3 py-1 text-xs font-semibold transition-all active:scale-95 " +
                                (isDefaultTheme
                                  ? "border border-cyan-400/70 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 hover:border-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                                  : "hover:brightness-110")
                              }
                              style={!isDefaultTheme ? {
                                backgroundColor: 'var(--duo-primary-pill-bg)',
                                borderColor: 'var(--duo-border-glow)',
                                color: 'var(--duo-accent-text)',
                                borderWidth: '1px',
                                borderStyle: 'solid',
                              } : undefined}
                            >
                              + Connect
                            </button>
                          </div>
                        </div>

                        {/* Global Founder VIP Card */}
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={async () => {
                              setMode("connect");
                              setFriendIdInput("Rohit_7779");
                              setSearching(true);
                              setSearchError(null);
                              setFoundUser(null);
                              setSelectedCategories([]);
                              setComment("");
                              setRequestError(null);
                              setRequestSuccess(null);

                              try {
                                const res = await fetch("/api/friends/search", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ handle: "Rohit_7779" }),
                                });

                                if (!res.ok) {
                                  const data = await res.json().catch(() => ({}));
                                  setSearchError(data.error || "Quantum ID not found.");
                                  return;
                                }

                                const data = await res.json();
                                setFoundUser(data.user as FoundUser);
                              } catch {
                                setSearchError("Unable to reach quantum directory. Try again.");
                              } finally {
                                setSearching(false);
                              }
                            }}
                            className="w-full text-left"
                          >
                            <div className="founder-vip-aurora rounded-2xl border border-red-500/80 bg-slate-950/95 p-2.5 overflow-hidden [clip-path:inset(0_round_1rem)] drop-shadow-[0_0_30px_rgba(248,113,113,0.55)] hover:border-red-400 transition-all">
                              <div className="founder-vip-aurora-inner founder-vip-shine space-y-1.5 rounded-2xl bg-gradient-to-br from-slate-950/90 via-slate-900/90 to-slate-950/90 px-3 py-2 relative overflow-hidden [clip-path:inset(0_round_1rem)] isolation-isolate">
                                <div className="founder-vip-line-full absolute inset-x-0 -top-2 -bottom-2 rounded-2xl"></div>
                                <div className="relative z-10 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-[11px] font-semibold text-slate-50 flex items-center gap-1">
                                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-red-400/80 bg-red-600/60 text-[8px] font-bold text-slate-50">
                                        ✓
                                      </span>
                                      @MR_ROHIT
                                    </p>
                                    <p className="text-[10px] font-semibold text-slate-200">
                                      Founder & CEO at Q-Link
                                    </p>
                                  </div>
                                  <span className="rounded-full border border-red-400/80 bg-red-500/20 px-2 py-0.5 text-[9px] font-medium text-red-200">
                                    Elite Founder
                                  </span>
                                </div>
                                <div className="relative z-10">
                                  <p className="text-[10px] text-slate-400">
                                    Tap to open the founder's VIP profile and send a direct feedback request.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </button>
                        </div>

                        {/* SINGLE UNIFIED SCROLL CONTAINER */}
                        <div
                          ref={requestsRef}
                          data-tour="requests"
                          className={
                            "space-y-1.5 overflow-y-auto scrollbar-hide smooth-gpu-scroll pr-1 " +
                            (isFocusMode ? "max-h-[50vh] " : "max-h-[52vh] ") +
                            (highlightRequests ? "glow-pulse border border-cyan-400/80 rounded-xl" : "")
                          }
                        >
                          {/* ADAPTIVE PREDICTIVE SKELETON (EXACT QUANTITY = ACTUAL ID COUNT) */}
                          {isInitialLoading ? (
                            <div className="space-y-1.5 animate-pulse">
                              {Array.from({ length: connectionsTab === "friends" ? Math.max(1, predictedFriendsCount) : Math.max(1, predictedRequestsCount) }).map((_, i) => (
                                <div
                                  key={i}
                                  className="quantum-skeleton-card flex items-center justify-between gap-2 rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 relative overflow-hidden"
                                >
                                  <div className="quantum-skeleton-shimmer" />
                                  <div className="min-w-0 space-y-1.5 flex-1">
                                    <div className="h-3 w-28 rounded-full bg-slate-800" />
                                    <div className="h-2 w-16 rounded-full bg-slate-800/60" />
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <div className="h-5 w-16 rounded-full bg-slate-800/70 border border-slate-700/40" />
                                    <div className="h-5 w-12 rounded-full bg-slate-800/50 border border-slate-700/30" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : connectionsTab === "friends" ? (
                            /* TAB 1: ALL ACCEPTED FRIENDS & CHATS */
                            acceptedFriends.length === 0 ? (
                              <div
                                className={
                                  "flex flex-col items-center justify-center py-8 text-center rounded-xl p-4 " +
                                  (isDefaultTheme ? "bg-slate-950/30 border border-slate-800/50" : "border")
                                }
                                style={!isDefaultTheme ? {
                                  backgroundColor: 'var(--duo-surface-card-inner)',
                                  borderColor: 'var(--duo-surface-card-border-subtle)',
                                } : undefined}
                              >
                                <p className="text-xs font-medium text-slate-400">No active connections yet</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">Use "+ Connect" to link with friends</p>
                              </div>
                            ) : (
                              acceptedFriends.map((f) => (
                                <div
                                  key={f.id}
                                  onMouseMove={handleSpotlightMouseMove}
                                  onMouseLeave={handleSpotlightMouseLeave}
                                  onClick={() => {
                                    openChatWithPeer(f.peerHandle);
                                  }}
                                  className={
                                    "x-magnetic-card group flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition-all duration-200 cursor-pointer " +
                                    (isDefaultTheme
                                      ? "border border-slate-800/70 bg-slate-950/45 hover:bg-slate-900/60 hover:border-cyan-500/35 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                                      : "border hover:brightness-110")
                                  }
                                  style={!isDefaultTheme ? {
                                    backgroundColor: 'var(--duo-surface-card-inner)',
                                    borderColor: 'var(--duo-surface-card-border-subtle)',
                                  } : undefined}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold text-slate-100 flex items-center gap-1.5 group-hover:text-cyan-200 transition-colors">
                                      @{f.peerHandle}
                                      {f.isUnread && (
                                        <span className="inline-block w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_#f97316] animate-pulse" title="New message!" />
                                      )}
                                    </p>
                                    <p className="truncate text-[10px] text-slate-500">
                                      {(f.categories || []).join(" • ") || "Friend"}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    {isFounder && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenFounderGrantModal(f.peerHandle);
                                        }}
                                        className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-fuchsia-400/80 bg-fuchsia-500/15 text-xs text-fuchsia-200 hover:bg-fuchsia-500/30 hover:border-fuchsia-300 shadow-[0_0_10px_rgba(240,46,170,0.3)] active:scale-90 transition-all cursor-pointer shrink-0"
                                        title={`Grant QP to @${f.peerHandle}`}
                                      >
                                        💎
                                      </button>
                                    )}
                                    <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                                      Connected
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openChatWithPeer(f.peerHandle);
                                      }}
                                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-all ${
                                        f.isUnread
                                          ? "border-orange-500 bg-orange-500/20 text-orange-200 shadow-[0_0_12px_rgba(249,115,22,0.4)] animate-pulse"
                                          : isDefaultTheme
                                            ? "border-cyan-400/70 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                                            : "hover:brightness-110"
                                      }`}
                                      style={!isDefaultTheme && !f.isUnread ? {
                                        backgroundColor: 'var(--duo-primary-pill-bg)',
                                        borderColor: 'var(--duo-border-glow)',
                                        color: 'var(--duo-accent-text)',
                                      } : undefined}
                                    >
                                      Chat
                                    </button>
                                  </div>
                                </div>
                              ))
                            )
                          ) : (
                            /* TAB 2: PENDING REQUESTS (INCOMING & OUTGOING) */
                            totalPending === 0 ? (
                              <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-950/30 rounded-xl border border-slate-800/50 p-4">
                                <p className="text-xs font-medium text-slate-400">No pending requests</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">All requests have been accepted</p>
                              </div>
                            ) : (
                              <>
                                {/* Pending Incoming Requests */}
                                {pendingIncoming.map((req) => (
                                  <div
                                    key={req.id}
                                    onMouseMove={handleSpotlightMouseMove}
                                    onMouseLeave={handleSpotlightMouseLeave}
                                    className="x-magnetic-card flex flex-col gap-1.5 rounded-xl border border-amber-500/30 bg-slate-950/60 px-3 py-2 shadow-[0_0_15px_rgba(245,158,11,0.05)] transition-all duration-200"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-xs font-semibold text-slate-200">
                                          @{req.fromUser?.handle || "unknown"}
                                        </p>
                                        <p className="truncate text-[10px] text-slate-400">
                                          {(req.categories || []).join(" • ")}
                                        </p>
                                      </div>
                                      <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                                        Incoming
                                      </span>
                                    </div>
                                    {req.message && (
                                      <p className="text-[10px] text-slate-400 line-clamp-2 italic">
                                        "{req.message}"
                                      </p>
                                    )}
                                    <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60">
                                      <button
                                        type="button"
                                        onClick={() => handleIncomingDecision(req.id, "ACCEPT", req.fromUser?.handle || "")}
                                        className="flex-1 rounded-full border border-emerald-400/70 bg-emerald-500/15 py-1 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/25 transition-all text-center"
                                      >
                                        Accept
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleIncomingDecision(req.id, "REJECT", req.fromUser?.handle || "")}
                                        className="flex-1 rounded-full border border-rose-400/70 bg-rose-500/15 py-1 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/25 transition-all text-center"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  </div>
                                ))}

                                {/* Pending Outgoing Requests */}
                                {pendingOutgoing.map((req) => (
                                  <div
                                    key={req.id}
                                    onMouseMove={handleSpotlightMouseMove}
                                    onMouseLeave={handleSpotlightMouseLeave}
                                    className="x-magnetic-card flex items-center justify-between gap-2 rounded-xl border border-slate-800/70 bg-slate-950/45 px-3 py-2 transition-all duration-200"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-semibold text-slate-200">
                                        @{req.toUser?.handle || "unknown"}
                                      </p>
                                      <p className="truncate text-[10px] text-slate-500">
                                        {(req.categories || []).join(" • ")}
                                      </p>
                                    </div>
                                    <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                                      Pending Sent
                                    </span>
                                  </div>
                                ))}
                              </>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })()}

                </div>

                {isFocusMode && (
                  <button
                    type="button"
                    onClick={() => setIsFocusMode(false)}
                    className="fixed top-4 right-4 z-[10000] rounded-full border bg-slate-950 px-4 py-2 text-xs font-semibold tracking-wider text-cyan-300 border-cyan-400 focus-glow-btn flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#22d3ee]" />
                    Exit Focus Mode
                  </button>
                )}
              </div>
            </section>

            {/* RIGHT: CONNECT FLOW / CHAT */}
            <ActiveChatPanel
              chatPanelRef={chatPanelRef}
              handleDragEnter={handleDragEnter}
              handleDragOver={handleDragOver}
              handleDragLeave={handleDragLeave}
              handleDrop={handleDrop}
              isChatExpanded={isChatExpanded}
              isFocusMode={isFocusMode}
              isDraggingFile={isDraggingFile}
              activePeerHandle={activePeerHandle}
              chatAnimMode={chatAnimMode}
              setShowLogoViewer={setShowLogoViewer}
              mode={mode}
              setMode={setMode}
              viewingProfileHandle={viewingProfileHandle}
              onCloseProfile={() => {
                setViewingProfileHandle(null);
                setMode("home");
              }}
              onCloseChat={() => {
                setActivePeerHandle(null);
                setIsChatFull(false);
                replaceNavState({ screen: "home" });
              }}
              onStartChatWithUser={(targetHandle) => {
                setViewingProfileHandle(null);
                setMode("home");
                openChatWithPeer(targetHandle);
              }}
              onSendConnectRequest={async (targetHandle, categories, note) => {
                const res = await fetch("/api/friends/request", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    toHandle: targetHandle,
                    categories: categories.join(","),
                    message: note.trim(),
                  }),
                });
                if (!res.ok) {
                  const d = await res.json().catch(() => ({}));
                  throw new Error(d.error || "Failed to send request");
                }
              }}
              highlightConnect={highlightConnect}
              handleSearch={handleSearch}
              friendIdInput={friendIdInput}
              setFriendIdInput={setFriendIdInput}
              searching={searching}
              selectedCategories={selectedCategories}
              toggleCategory={toggleCategory}
              requestError={requestError}
              requestSuccess={requestSuccess}
              searchError={searchError}
              setSearchError={setSearchError}
              foundUser={foundUser}
              setFoundUser={setFoundUser}
              comment={comment}
              setComment={setComment}
              sendingRequest={sendingRequest}
              handleSendRequest={handleSendRequest}
              allCategories={allCategories}
              setShowMoreCategories={setShowMoreCategories}
              peerOnline={peerOnline}
              peerTyping={peerTyping}
              peerLastSeen={peerLastSeen}
              showOfflineTransitionName={showOfflineTransitionName}
              highlightFullChat={highlightFullChat}
              setIsChatFull={setIsChatFull}
              highlightChatPanel={highlightChatPanel}
              chatScrollRef={chatScrollRef}
              handleChatContainerScroll={handleChatContainerScroll}
              chatError={chatError}
              setChatError={setChatError}
              handleRetryMessage={handleRetryMessage}
              chatLoading={chatLoading}
              chatMessages={chatMessages}
              meId={meId}
              myId={myId}
              effectiveUser={effectiveUser}
              handleDeleteMessage={handleDeleteMessage}
              onToggleReaction={handleToggleReaction}
              onRemoveReaction={handleRemoveReaction}
              onOpenReactionModal={(msg: any) => setReactionModalMessage(msg)}
              isSelectionMode={isSelectionMode}
              setIsSelectionMode={setIsSelectionMode}
              selectedMessageIds={selectedMessageIds}
              setSelectedMessageIds={setSelectedMessageIds}
              handleBulkDelete={handleBulkDelete}
              handleSelectAll={handleSelectAll}
              lightboxImageUrl={lightboxImageUrl}
              setLightboxImageUrl={setLightboxImageUrl}
              lightboxImageName={lightboxImageName}
              setLightboxImageName={setLightboxImageName}
              lightboxVideoUrl={lightboxVideoUrl}
              setLightboxVideoUrl={setLightboxVideoUrl}
              lightboxVideoName={lightboxVideoName}
              setLightboxVideoName={setLightboxVideoName}
              highlightedMessageId={highlightedMessageId}
              pendingImagePreviewUrl={pendingImagePreviewUrl}
              pendingImageFile={pendingImageFile}
              setPendingImageFile={setPendingImageFile}
              setPendingImagePreviewUrl={setPendingImagePreviewUrl}
              handleSendPendingImage={handleSendPendingImage}
              handleOpenImageEditor={handleOpenImageEditor}
              attachmentError={attachmentError}
              setAttachmentError={setAttachmentError}
              isUploadingAttachment={isUploadingAttachment}
              uploadProgressText={uploadProgressText}
              isEditingImage={isEditingImage}
              handleCropComplete={handleCropComplete}
              handleCloseImageEditor={handleCloseImageEditor}
              applyImageCrop={applyImageCrop}
              crop={crop}
              setCrop={setCrop}
              zoom={zoom}
              setZoom={setZoom}
              aspect={aspect}
              handleAspectChange={handleAspectChange}
              chatInput={chatInput}
              setChatInput={setChatInput}
              handleSendMessage={handleSendMessage}
              handleKeyDown={handleChatKeyDown}
              handleTypingPing={handleTypingPing}
              isRecording={isRecording}
              recordingDuration={recordingDuration}
              startRecording={startRecording}
              stopRecording={stopRecording}
              handleAttachButtonClick={handleAttachButtonClick}
              handleTriggerEmergencyBeacon={handleTriggerEmergencyBeacon}
              isSendingBeacon={isSendingBeacon}
              fileInputRef={fileInputRef}
              videoInputRef={videoInputRef}
              imageVideoInputRef={imageVideoInputRef}
              handleAttachmentSelected={handleAttachmentSelected}
              handlePasteFile={handlePasteFile}
              formatDuration={formatDuration}
              editingMessage={editingMessage}
              handleCancelEdit={handleCancelEdit}
              isChatFull={isChatFull}
              toggleChatFull={toggleChatFull}
              isQAIOpen={isQAIOpen}
              setIsQAIOpen={setIsQAIOpen}
              showAIHelpButton={showAIHelpButton}
              setShowAIHelpButton={setShowAIHelpButton}
              isAIArrowButtonVisible={isAIArrowButtonVisible}
              setIsAIArrowButtonVisible={setIsAIArrowButtonVisible}
              showCloseModal={showCloseModal}
              setShowCloseModal={setShowCloseModal}
              showLogoViewer={showLogoViewer}
              logoViewerImage={logoViewerImage}
              beaconStatusMsg={beaconStatusMsg}
              showSettings={showSettings}
              showDirectory={showDirectory}
              chatInputRef={chatInputRef}
              pendingImageRef={pendingImageRef}
              session={session}
              setIsVipTermsAnimating={setIsVipTermsAnimating}
              setShowVipTerms={setShowVipTerms}
              setManualStopAnimation={setManualStopAnimation}
            />
          </div>
        </div>

        {/* Dedicated Avatar Picture Viewer (WhatsApp DP style) - Separate Portal */}
        {avatarViewerImageUrl && canUseDom ? (
          createPortal(
            <div
              className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md px-4 animate-in fade-in duration-200"
              onClick={() => setAvatarViewerImageUrl(null)}
            >
              {/* Top Action Bar */}
              <div
                className="w-full max-w-md flex items-center justify-between mb-4 px-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col">
                  <span className="text-xs uppercase tracking-[0.2em] font-bold text-sky-400">
                    Sapphire VIP Profile
                  </span>
                  <span className="text-sm font-semibold text-slate-200">
                    {(session?.user as any)?.name || "Quantum User"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAvatarViewerImageUrl(null)}
                  className="h-9 w-9 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 flex items-center justify-center text-slate-300 hover:text-slate-100 transition-all duration-200 shadow-lg hover:rotate-90"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              {/* Display Container with WhatsApp DP Styling */}
              <div
                className="relative w-full max-w-md aspect-square rounded-2xl border border-sky-500/30 bg-slate-950/80 overflow-hidden shadow-[0_0_50px_rgba(56,189,248,0.4)] flex items-center justify-center p-1 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={getHighResProfilePic(avatarViewerImageUrl)}
                  alt="Hologram Profile Picture"
                  className="w-full h-full object-cover rounded-xl"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Bottom Footer Info */}
              <div
                className="mt-4 text-center px-4"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[11px] text-sky-300/80 font-medium tracking-wide">
                  @{(session?.user as any)?.handle || "your_handle"} • Verified Q-Link VIP
                </p>
              </div>
            </div>,
            document.body
          )
        ) : null}

        {/* Welcome Screen Logo Viewer - Separate Portal */}
        {showWelcomeLogoViewer && canUseDom ? (
          createPortal(
            <div
              className="fixed inset-0 z-[2001] flex items-start justify-end bg-black/40"
              onClick={() => setShowWelcomeLogoViewer(false)}
            >
              <div
                className="fixed top-4 right-4 w-80 max-w-[90vw]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative bg-slate-900/95 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-slate-200">Q-Link Logo</h3>
                      <button
                        type="button"
                        onClick={() => setShowWelcomeLogoViewer(false)}
                        className="rounded-full bg-slate-800/80 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700/80 hover:text-slate-100 transition-colors"
                      >
                        Close
                      </button>
                    </div>
                    <div className="flex justify-center">
                      <Image
                        src={welcomeLogoViewerImage}
                        alt="Q-Link Logo - Perfect Quality"
                        width={200}
                        height={200}
                        className="rounded-xl object-cover"
                      />
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-xs text-slate-400">Perfect Quality (1024×1024)</p>
                      <p className="text-[10px] text-slate-500 mt-1">Click outside to close</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        ) : null}

        {/* Onboarding Modal */}
        {showOnboarding ? (
          canUseDom ? (
            createPortal(
              <div
                className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6 overflow-y-auto"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-full max-w-lg mx-auto my-auto">
                  <div className="glass-panel relative rounded-2xl sm:rounded-3xl border border-cyan-400/40 bg-slate-900/95 p-5 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_30px_rgba(34,211,238,0.15)]">
                    {!isFirstAutoOnboarding && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowOnboarding(false);
                          setIsFirstAutoOnboarding(false);
                        }}
                        className="absolute right-3.5 top-3.5 sm:right-4 sm:top-4 h-8 w-8 rounded-full border border-slate-700/80 bg-slate-800/80 flex items-center justify-center text-slate-400 hover:text-cyan-300 hover:border-cyan-400/60 hover:bg-slate-800 transition"
                        aria-label="Close"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    {/* Screen 1: ID/Name Setup */}
                    {onboardingStep === 1 && (
                      <div className="space-y-6">
                        <div className="text-center">
                          <div
                            className="cursor-pointer hover:opacity-80 transition-opacity mb-6 flex items-center justify-center"
                            onClick={() => setShowWelcomeLogoViewer(true)}
                          >
                            <Image
                              src="/logo-256.png"
                              alt="Q-Link Logo"
                              width={64}
                              height={64}
                              className="rounded-full object-cover"
                              priority
                            />
                          </div>
                          <div className="mb-3 sm:mb-4 min-h-[3rem] flex items-center justify-center">
                            <div className={`transition-all duration-300 ease-in-out text-center ${logoAnimationStep >= 1 && logoAnimationStep <= 5 ? '-translate-x-1 opacity-90' : 'translate-x-0 opacity-100'
                              }`}>
                              <h2 className="text-xl sm:text-2xl font-extrabold text-cyan-300 tracking-tight leading-snug">
                                <span>Welcome to Quantum Chat </span>
                                <span className="inline-block whitespace-nowrap">
                                  <span className={`inline-block transition-all duration-200 ease-out ${logoAnimationStep >= 2 && logoAnimationStep <= 8 ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-0 scale-50'
                                    }`}>Q</span>
                                  <span className={`inline-block transition-all duration-200 ease-out ${logoAnimationStep >= 3 && logoAnimationStep <= 8 ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-0 scale-50'
                                    }`}>-</span>
                                  <span className={`inline-block transition-all duration-200 ease-out ${logoAnimationStep >= 4 && logoAnimationStep <= 8 ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-0 scale-50'
                                    }`}>L</span>
                                  <span className={`inline-block transition-all duration-200 ease-out ${logoAnimationStep >= 5 && logoAnimationStep <= 8 ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-0 scale-50'
                                    }`}>i</span>
                                  <span className={`inline-block transition-all duration-200 ease-out ${logoAnimationStep >= 6 && logoAnimationStep <= 8 ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-0 scale-50'
                                    }`}>n</span>
                                  <span className={`inline-block transition-all duration-200 ease-out ${logoAnimationStep >= 7 && logoAnimationStep <= 8 ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-0 scale-50'
                                    }`}>k</span>
                                </span>
                              </h2>
                            </div>
                          </div>
                          <p className="text-slate-300">Set up your quantum identity</p>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Your Quantum ID</label>
                            <div className="relative">
                              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">@</span>
                              <input
                                type="text"
                                value={handleDraft}
                                onChange={(e) => onHandleDraftChange(e.target.value)}
                                className="w-full rounded-xl border border-cyan-400/30 bg-slate-800/50 py-3 pl-8 pr-3 text-cyan-100 placeholder-slate-500 outline-none ring-0 transition focus:border-cyan-400 focus:bg-slate-800 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.6)]"
                                placeholder="quantum-1234"
                              />
                            </div>
                            {handleError && (
                              <p className="mt-1 text-xs text-amber-400">{handleError}</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Display Name</label>
                            <input
                              type="text"
                              value={nameDraft}
                              onChange={(e) => setNameDraft(e.target.value)}
                              className="w-full rounded-xl border border-cyan-400/30 bg-slate-800/50 py-3 px-3 text-cyan-100 placeholder-slate-500 outline-none ring-0 transition focus:border-cyan-400 focus:bg-slate-800 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.6)]"
                              placeholder="Your Name"
                            />
                          </div>
                        </div>

                        <div className="space-y-3 pt-2">
                          {/* Dedicated Auto-Generate Identity Action */}
                          <button
                            type="button"
                            onClick={handleAutoGenerate}
                            className="w-full flex items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/15 via-blue-500/15 to-purple-500/15 py-3 px-4 text-xs sm:text-sm font-semibold text-cyan-300 hover:border-cyan-400 hover:from-cyan-500/25 hover:to-blue-500/25 transition shadow-[0_0_15px_rgba(34,211,238,0.15)] active:scale-[0.99]"
                          >
                            <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span>Auto-Generate ID & Name</span>
                          </button>

                          {/* Primary Navigation Row */}
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={handleSkipOnboarding}
                              className="flex-1 rounded-xl border border-slate-700/80 bg-slate-800/60 py-3 px-4 text-xs sm:text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-600 transition text-center"
                            >
                              Skip
                            </button>
                            <button
                              type="button"
                              onClick={handleNextOnboarding}
                              className="flex-1 rounded-xl border border-cyan-400/60 bg-gradient-to-r from-cyan-500/30 to-blue-500/30 py-3 px-4 text-xs sm:text-sm font-bold text-cyan-200 hover:from-cyan-500/40 hover:to-blue-500/40 hover:border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.25)] transition text-center"
                            >
                              Next →
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Screen 2: Interests Selection */}
                    {onboardingStep === 2 && (
                      <div className="space-y-6">
                        <div className="text-center">
                          <h2 className="text-2xl font-bold text-cyan-300 mb-2">Your Interested Fields</h2>
                          <p className="text-slate-300">Select topics that best describe what you care about.</p>
                        </div>

                        <div className="max-h-96 overflow-y-auto scrollbar-hide space-y-1">
                          {interestsCategories.map((interest) => (
                            <div
                              key={interest}
                              onClick={() => toggleInterest(interest)}
                              className={`w-full text-left rounded-lg px-3 py-2 text-sm cursor-pointer ${selectedInterests.includes(interest)
                                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/50"
                                  : "bg-slate-800/50 text-slate-300 border border-slate-600/50 hover:bg-slate-700/50"
                                }`}
                            >
                              {interest}
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between">
                          <button
                            onClick={() => setOnboardingStep(1)}
                            className="rounded-xl border border-slate-600/50 bg-slate-800/50 px-6 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-500/50 transition"
                          >
                            Back
                          </button>
                          <button
                            onClick={handleNextOnboarding}
                            className="rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-6 py-3 text-sm font-medium text-cyan-300 hover:bg-cyan-500/30 hover:border-cyan-400/70 transition"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Screen 3: About You (Bio) */}
                    {onboardingStep === 3 && (
                      <div className="space-y-6">
                        <div className="text-center">
                          <h2 className="text-2xl font-bold text-cyan-300 mb-2">Your Quantum Bio</h2>
                          <p className="text-slate-300">Share a sharp, professional snapshot of who you are and what youre building.</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">Introduce yourself</label>
                          <textarea
                            value={bioDraft}
                            onChange={(e) => setBioDraft(e.target.value)}
                            rows={4}
                            className="w-full rounded-xl border border-cyan-400/30 bg-slate-800/60 px-3 py-3 text-sm text-cyan-100 placeholder-slate-500 outline-none ring-0 transition focus:border-cyan-400 focus:bg-slate-800 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.6)] resize-none"
                            placeholder="Example: Operator + builder focused on AI, systems and long-term compounding projects. I like sharp people, deep work and ambitious problems."
                          />
                          <p className="mt-1 text-[11px] text-slate-400">Think like a mini LinkedIn bio: clear, confident and to the point.</p>
                        </div>

                        <div className="flex justify-between">
                          <button
                            onClick={() => setOnboardingStep(2)}
                            className="rounded-xl border border-slate-600/50 bg-slate-800/50 px-6 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-500/50 transition"
                          >
                            Back
                          </button>
                          <button
                            onClick={handleNextOnboarding}
                            className="rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-6 py-3 text-sm font-medium text-cyan-300 hover:bg-cyan-500/30 hover:border-cyan-400/70 transition"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Screen 4: Age Selection */}
                    {onboardingStep === 4 && (
                      <div className="space-y-6">
                        <div className="text-center">
                          <h2 className="text-2xl font-bold text-cyan-300 mb-2">How old are you?</h2>
                          <p className="text-slate-300">We use this only to make your connections and recommendations smarter.</p>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm text-slate-300">Your age</span>
                            <span className="text-lg font-semibold text-cyan-300">{age ?? "Not set"}</span>
                          </div>
                          <input
                            type="range"
                            min={13}
                            max={80}
                            value={age ?? 21}
                            onChange={(e) => setAge(Number(e.target.value))}
                            className="w-full accent-cyan-400"
                          />
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>13</span>
                            <span>30</span>
                            <span>50</span>
                            <span>80</span>
                          </div>
                        </div>

                        <div className="flex justify-between">
                          <button
                            onClick={() => setOnboardingStep(3)}
                            className="rounded-xl border border-slate-600/50 bg-slate-800/50 px-6 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-500/50 transition"
                          >
                            Back
                          </button>
                          <button
                            onClick={handleNextOnboarding}
                            className="rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-6 py-3 text-sm font-medium text-cyan-300 hover:bg-cyan-500/30 hover:border-cyan-400/70 transition"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Screen 5: Gender Selection */}
                    {onboardingStep === 5 && (
                      <div className="space-y-6">
                        <div className="text-center">
                          <h2 className="text-2xl font-bold text-cyan-300 mb-2">How do you identify?</h2>
                          <p className="text-slate-300">Choose the option that best represents you. This is used only for your profile and matching.</p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => setGender("male")}
                            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition ${gender === "male"
                                ? "border-cyan-400/80 bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.4)]"
                                : "border-slate-600/60 bg-slate-800/60 text-slate-300 hover:border-cyan-400/40 hover:bg-slate-800"
                              }`}
                          >
                            Male
                          </button>
                          <button
                            type="button"
                            onClick={() => setGender("female")}
                            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition ${gender === "female"
                                ? "border-cyan-400/80 bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.4)]"
                                : "border-slate-600/60 bg-slate-800/60 text-slate-300 hover:border-cyan-400/40 hover:bg-slate-800"
                              }`}
                          >
                            Female
                          </button>
                          <button
                            type="button"
                            onClick={() => setGender("other")}
                            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition ${gender === "other"
                                ? "border-cyan-400/80 bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.4)]"
                                : "border-slate-600/60 bg-slate-800/60 text-slate-300 hover:border-cyan-400/40 hover:bg-slate-800"
                              }`}
                          >
                            Other
                          </button>
                        </div>

                        <div className="flex justify-between">
                          <button
                            onClick={() => setOnboardingStep(4)}
                            className="rounded-xl border border-slate-600/50 bg-slate-800/50 px-6 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:border-slate-500/50 transition"
                          >
                            Back
                          </button>
                          <button
                            onClick={handleFinishOnboarding}
                            className="rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-6 py-3 text-sm font-medium text-cyan-300 hover:bg-cyan-500/30 hover:border-cyan-400/70 transition"
                          >
                            Get Started
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            )
          ) : null
        ) : null}

        {showIdConsole ? (
          canUseDom ? (
            createPortal(
              <div
                className={`fixed inset-0 z-[2100] flex items-center justify-center bg-black/80 ${isConsoleClosing ? 'console-backdrop-exit' : 'console-backdrop-enter'
                  }`}
                style={{ willChange: 'opacity', transform: 'translateZ(0)' }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-full max-w-3xl mx-4">
                  <div
                    className={`glass-panel relative max-h-[90vh] overflow-y-auto scrollbar-hide rounded-3xl border border-cyan-400/30 bg-slate-900/95 p-6 shadow-xl ${isConsoleClosing ? 'console-modal-exit' : 'console-modal-enter'
                      }`}
                    style={{ willChange: 'transform, opacity', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                  >
                    <div
                      className={`pointer-events-none absolute -left-20 -top-20 h-48 w-48 rounded-full blur-3xl ${isDefaultTheme ? "bg-gradient-to-br from-cyan-400/45 via-fuchsia-500/35 to-indigo-400/30" : ""}`}
                      style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-orb-primary)' : undefined }}
                    />
                    <div
                      className={`pointer-events-none absolute -right-24 bottom-[-4rem] h-56 w-56 rounded-full blur-3xl ${isDefaultTheme ? "bg-gradient-to-tr from-indigo-400/35 via-sky-500/35 to-fuchsia-500/30" : ""}`}
                      style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-orb-secondary)' : undefined }}
                    />

                    <button
                      type="button"
                      onClick={() => {
                        setIsConsoleClosing(true);
                        setTimeout(() => {
                          setShowIdConsole(false);
                          setIsConsoleClosing(false);
                        }, 350);
                      }}
                      className="absolute right-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/70 bg-slate-900/90 text-slate-300 shadow-md transition hover:scale-105 hover:border-cyan-400/70 hover:bg-slate-800 hover:text-cyan-200 active:scale-95"
                      aria-label="Close ID Console"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>

                    {/* Quiet Luxury / Apple Glassmorphic Profile Card (X-Standard) */}
                    <div className="relative rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl overflow-hidden mb-3">
                      {/* Banner */}
                      <div
                        className="relative w-full h-24 sm:h-28 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 overflow-hidden"
                        style={
                          currentUserProfile?.banner
                            ? {
                                backgroundImage: `url(${currentUserProfile.banner})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }
                            : undefined
                        }
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />
                      </div>

                      {/* Profile details & Actions */}
                      <div className="px-4 pb-3.5">
                        <div className="flex justify-between items-end -mt-9 mb-2 relative z-10">
                          {/* Avatar */}
                          <div className="relative">
                            <div className="h-16 w-16 sm:h-18 sm:w-18 rounded-full overflow-hidden bg-slate-900 border-2 border-slate-950 shadow-xl">
                              {(currentUserProfile?.image || (session?.user as any)?.image) ? (
                                <img
                                  src={currentUserProfile?.image || (session?.user as any)?.image}
                                  alt="Profile"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center font-extrabold text-lg text-white bg-gradient-to-br from-cyan-600 via-slate-800 to-indigo-950 uppercase">
                                  {(currentUserProfile?.name?.[0] || (session?.user as any)?.name?.[0] || (session?.user as any)?.handle?.[0] || "Q")}
                                </div>
                              )}
                            </div>
                            <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-slate-950 shadow-[0_0_8px_#10b981]" />
                          </div>

                          {/* Edit Profile Button (X / Twitter Standard) */}
                          <button
                            type="button"
                            onClick={() => setShowEditProfileModal(true)}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 hover:border-cyan-400/50 text-white text-xs font-bold transition-all active:scale-95 shadow-md cursor-pointer backdrop-blur-md"
                          >
                            <svg className="h-3.5 w-3.5 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            <span>Edit Profile</span>
                          </button>
                        </div>

                        {/* Name & Handle */}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                              {currentUserProfile?.name || (session?.user as any)?.name || "Quantum User"}
                            </h2>
                            {((session?.user as any)?.handle === "Rohit_7779" || (session?.user as any)?.blue_tick_status === "FOUNDER") && (
                              <span className="text-red-400 text-xs" title="Elite Founder">✓</span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-slate-400">
                            @{currentUserProfile?.handle || (session?.user as any)?.handle || "your-id"}
                          </p>
                        </div>

                        {/* Bio Text */}
                        <p className="mt-2 text-xs text-slate-200 leading-relaxed">
                          {currentUserProfile?.bio || (session?.user as any)?.bio || (
                            <span className="text-slate-500 italic">No bio added yet. Tap "Edit Profile" to tell people about yourself.</span>
                          )}
                        </p>

                        {/* Metadata row: Location & Website */}
                        {(currentUserProfile?.location || currentUserProfile?.website) && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                            {currentUserProfile?.location && (
                              <div className="flex items-center gap-1">
                                <span>📍</span>
                                <span>{currentUserProfile.location}</span>
                              </div>
                            )}
                            {currentUserProfile?.website && (
                              <a
                                href={currentUserProfile.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-cyan-400 hover:underline"
                              >
                                <span>🔗</span>
                                <span>{currentUserProfile.website.replace(/^https?:\/\//, "")}</span>
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Modern Apple/X Segmented Navigation */}
                    <div className="relative mt-5 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl flex items-center gap-1 max-w-xs shadow-inner">
                      <button
                        type="button"
                        onClick={() => setIdConsoleTab("my")}
                        className={`flex-1 py-1.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${
                          idConsoleTab === "my"
                            ? "bg-white text-slate-950 shadow-[0_2px_10px_rgba(0,0,0,0.3)]"
                            : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>My Posts</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIdConsoleTab("global")}
                        className={`flex-1 py-1.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${
                          idConsoleTab === "global"
                            ? "bg-white text-slate-950 shadow-[0_2px_10px_rgba(0,0,0,0.3)]"
                            : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Global Feed</span>
                      </button>
                    </div>

                    <div className="relative mt-4 rounded-2xl border border-slate-700/60 bg-slate-950/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                          Create a post
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[11px] font-medium text-slate-400">Audience:</p>
                          <div className="inline-flex p-0.5 rounded-full border border-white/[0.1] bg-black/40 backdrop-blur-md">
                            {[
                              { key: "GLOBAL", label: "Global", icon: "🌐" },
                              { key: "FOLLOWERS", label: "Followers", icon: "👥" },
                              { key: "FRIENDS", label: "Friends", icon: "⭐" },
                            ].map((aud) => (
                              <button
                                key={aud.key}
                                type="button"
                                onClick={() => setPostAudience(aud.key as any)}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer ${
                                  postAudience === aud.key
                                    ? "bg-white text-slate-950 shadow-sm"
                                    : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
                                }`}
                              >
                                <span className="text-[11px]">{aud.icon}</span>
                                <span>{aud.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <textarea
                        value={postTextDraft}
                        onChange={(e) => setPostTextDraft(e.target.value)}
                        rows={3}
                        className="mt-3 w-full resize-none rounded-2xl border border-slate-700/60 bg-slate-900/60 p-3 text-[12px] text-slate-100 outline-none transition focus:border-cyan-400/70 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.5)]"
                        placeholder="Write a post..."
                      />

                      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <label
                            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95 shadow-sm ${
                              postingIdConsole ? "opacity-50 cursor-not-allowed pointer-events-none" : ""
                            }`}
                            title="Attach Photo or Video"
                          >
                            <svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>{idConsoleUploadProgress !== null ? `Uploading ${idConsoleUploadProgress}%` : "Media"}</span>
                            <input
                              type="file"
                              className="hidden"
                              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                              disabled={postingIdConsole}
                              onChange={(e) => {
                                const f = e.target.files?.[0] || null;
                                setPostMediaFile(f);
                                setIdConsoleUploadProgress(null);
                                setIdConsolePostStatus(null);
                                if (idConsoleLocalPreviewUrl) {
                                  try {
                                    URL.revokeObjectURL(idConsoleLocalPreviewUrl);
                                  } catch {}
                                  setIdConsoleLocalPreviewUrl(null);
                                }
                                if (!f) {
                                  setPostMediaKind(null);
                                  return;
                                }
                                const isVideo = f.type.startsWith("video/") || f.name.toLowerCase().endsWith(".mp4") || f.name.toLowerCase().endsWith(".webm") || f.name.toLowerCase().endsWith(".mov");
                                setPostMediaKind(isVideo ? "video" : "image");
                                try {
                                  const blob = (f.type && f.type.length > 0) ? f : new Blob([f], { type: isVideo ? "video/mp4" : "image/jpeg" });
                                  setIdConsoleLocalPreviewUrl(URL.createObjectURL(blob));
                                } catch {}
                              }}
                            />
                          </label>

                          {postMediaFile && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-400/30 text-sky-300 text-xs font-medium">
                              <span>{postMediaKind === "video" ? "🎬" : "📷"}</span>
                              <span className="truncate max-w-[120px] sm:max-w-[180px]">{postMediaFile.name}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setPostMediaFile(null);
                                  setPostMediaKind(null);
                                  if (idConsoleLocalPreviewUrl) {
                                    try { URL.revokeObjectURL(idConsoleLocalPreviewUrl); } catch {}
                                    setIdConsoleLocalPreviewUrl(null);
                                  }
                                }}
                                className="ml-1 text-slate-400 hover:text-white transition"
                                title="Remove file"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Tech-Giant Elevated Post Button */}
                        <button
                          type="button"
                          onClick={handleIdConsolePost}
                          disabled={postingIdConsole || (!postTextDraft.trim() && !postMediaFile)}
                          className={`px-6 py-1.5 rounded-full text-xs font-bold transition-all duration-200 flex items-center gap-1.5 shadow-md ${
                            (!postTextDraft.trim() && !postMediaFile) || postingIdConsole
                              ? "bg-white/10 text-white/30 cursor-not-allowed border border-white/5 pointer-events-none"
                              : "bg-white hover:bg-slate-200 text-slate-950 active:scale-95 shadow-[0_2px_15px_rgba(255,255,255,0.25)] cursor-pointer"
                          }`}
                        >
                          {postingIdConsole ? (
                            <>
                              <svg className="animate-spin h-3 w-3 text-slate-950" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              <span>Posting...</span>
                            </>
                          ) : (
                            <span>Post</span>
                          )}
                        </button>
                      </div>

                      {idConsolePostStatus ? (
                        <p className="mt-2 text-[11px] text-slate-300">{idConsolePostStatus}</p>
                      ) : null}

                      {idConsoleLocalPreviewUrl && postMediaKind === "image" ? (
                        <div className="mt-2 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/40 relative">
                          <button
                            type="button"
                            onClick={() => {
                              // Clear the image preview and reset file state
                              setPostMediaFile(null);
                              setPostMediaKind(null);
                              setIdConsoleUploadProgress(null);
                              setIdConsolePostStatus(null);
                              if (idConsoleLocalPreviewUrl) {
                                try {
                                  URL.revokeObjectURL(idConsoleLocalPreviewUrl);
                                } catch {
                                  // ignore
                                }
                                setIdConsoleLocalPreviewUrl(null);
                              }
                            }}
                            className="absolute top-2 right-2 z-10 rounded-full border border-slate-600/70 bg-slate-900/80 p-1.5 text-[10px] text-slate-200 hover:border-rose-400/70 hover:bg-rose-500/20 hover:text-rose-300 transition-all duration-200"
                            title="Remove image"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <img
                            src={idConsoleLocalPreviewUrl}
                            alt="Selected upload"
                            className="block w-full max-h-[360px] object-contain bg-slate-950/80"
                          />
                        </div>
                      ) : idConsoleLocalPreviewUrl && postMediaKind === "video" ? (
                        <div className="mt-2 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/80 relative w-full">
                          <button
                            type="button"
                            onClick={() => {
                              // Clear the video preview and reset file state
                              setPostMediaFile(null);
                              setPostMediaKind(null);
                              setIdConsoleUploadProgress(null);
                              setIdConsolePostStatus(null);
                              if (idConsoleLocalPreviewUrl) {
                                try {
                                  URL.revokeObjectURL(idConsoleLocalPreviewUrl);
                                } catch {
                                  // ignore
                                }
                                setIdConsoleLocalPreviewUrl(null);
                              }
                            }}
                            className="absolute top-2 right-2 z-10 rounded-full border border-slate-600/70 bg-slate-900/80 p-1.5 text-[10px] text-slate-200 hover:border-rose-400/70 hover:bg-rose-500/20 hover:text-rose-300 transition-all duration-200"
                            title="Remove video"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <QuantumVideoPlayer
                            src={idConsoleLocalPreviewUrl}
                            className="block w-full h-auto max-h-[70vh] bg-slate-950 rounded-2xl object-contain"
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="relative mt-4 rounded-2xl border border-slate-700/60 bg-slate-950/30 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                        {idConsoleTab === "my" ? "My feed" : "Global feed"}
                      </p>

                      {/* Followers Section - Only show in My feed */}
                      {idConsoleTab === "my" && (
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Your Followers
                            </p>
                            <span className="rounded-full border border-slate-700/60 bg-slate-900/60 px-2 py-0.5 text-[9px] font-medium text-slate-300">
                              {followers.length} followers
                            </span>
                          </div>

                          {followersLoading && (
                            <QuantumFollowersSkeleton />
                          )}

                          {followersError && (
                            <p className="text-[10px] text-rose-300">
                              {followersError}
                            </p>
                          )}

                          {!followersLoading && !followersError && followers.length > 0 && (
                            <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
                              {followers.map((follower) => (
                                <div
                                  key={follower.id}
                                  className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-900/40 p-2 hover:bg-slate-900/60 transition-all"
                                >
                                  <div className="relative h-6 w-6 rounded-full overflow-hidden flex-shrink-0 bg-slate-800">
                                    {/* Initials Fallback */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/30 to-fuchsia-500/30 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                                      {(follower.handle?.[0] || follower.name?.[0] || '?').toUpperCase()}
                                    </div>
                                    {isValidImageUrl(follower.image) && (
                                      <img
                                        src={getHighResProfilePic(follower.image)}
                                        alt={follower.name || 'User'}
                                        className="absolute inset-0 h-full w-full object-cover rounded-full"
                                        referrerPolicy="no-referrer"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[10px] font-medium text-slate-200">
                                      @{follower.handle}
                                    </p>
                                    {follower.name && (
                                      <p className="truncate text-[9px] text-slate-400">
                                        {follower.name}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className={`text-[9px] font-bold ${getAuraColor(follower.auraPercentage || 0)}`}>
                                      {follower.auraPercentage || 0}% Aura
                                    </span>
                                    {follower.points && (
                                      <span className="text-[9px] text-slate-400">
                                        • {follower.points} points
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {!followersLoading && !followersError && followers.length === 0 && (
                            <p className="text-[10px] text-slate-500">
                              No followers yet. Share your posts to get followers!
                            </p>
                          )}
                        </div>
                      )}

                      {showConsoleLoadingDelayed ? (
                        <QuantumIdConsolePostsSkeleton />
                      ) : idConsolePostsError ? (
                        <p className="mt-2 text-[11px] text-rose-300">{idConsolePostsError}</p>
                      ) : idConsolePosts && idConsolePosts.length ? (
                        <div
                          style={{ scrollbarGutter: "stable", overflowAnchor: "none" }}
                          className="mt-3 space-y-3"
                        >
                          {idConsolePosts
                            .filter((p) => {
                              const hasText = typeof p?.text === "string" && p.text.trim().length > 0;
                              const hasMedia = Boolean(p?.media?.url || p?.attachment?.url || p?.attachmentId);
                              if (!hasText && !hasMedia) return false;
                              return idConsoleTab === "my"
                                ? p?.authorId === (session?.user as any)?.id
                                : true;
                            })
                            .map((p) => {
                              return (
                                <div
                                  key={p.id}
                                  style={{ overflowAnchor: "none" }}
                                  className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-3 cursor-pointer hover:border-slate-600/80 transition-all"
                                  onClick={() => trackPostView(p.id)}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <div className="relative h-5 w-5 rounded-full overflow-hidden flex-shrink-0 bg-slate-800">
                                        {/* Initials Fallback */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/30 to-fuchsia-500/30 flex items-center justify-center text-[8px] font-bold text-white uppercase">
                                          {(p?.author?.handle?.[0] || p?.author?.name?.[0] || '?').toUpperCase()}
                                        </div>
                                        {isValidImageUrl(p?.author?.image) && (
                                          <img
                                            src={getHighResProfilePic(p.author.image)}
                                            alt={p.author.name || 'User'}
                                            className="absolute inset-0 h-full w-full object-cover rounded-full"
                                            referrerPolicy="no-referrer"
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                          />
                                        )}
                                      </div>
                                      <p className="text-[11px] font-semibold text-slate-200">
                                        @{p?.author?.handle || "unknown"}
                                      </p>
                                      {p?.author?.blue_tick_status === 'verified' && (
                                        <span className={isVipHandle(p?.author?.handle) ? "flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500/25 border border-red-400/80 text-[7px] font-bold text-red-300 shadow-[0_0_8px_rgba(248,113,113,0.4)]" : "text-blue-400"}>
                                          ✓
                                        </span>
                                      )}
                                      {p?.author?.blue_tick_status === 'SAPPHIRE' && (
                                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500/20 border border-sky-400/80 text-[7px] font-bold text-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.4)]">
                                          ✓
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-[10px] text-slate-400">{p.audience}</p>
                                      <p className="text-[8px] text-slate-500">{formatTimeAgo(p.createdAt)}</p>
                                    </div>
                                  </div>

                                  {p.text ? (
                                    <p className="mt-2 whitespace-pre-wrap text-[12px] text-slate-100">
                                      {p.text}
                                    </p>
                                  ) : null}

                                  {p?.media?.url && p?.media?.kind === "image" ? (
                                    <PostImageAttachment src={p.media.url} alt="Post media" containerClassName="mt-2 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950 w-full relative shadow-lg" />
                                  ) : p?.media?.url && p?.media?.kind === "video" ? (
                                    <div className="mt-2 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950 w-full relative shadow-lg">
                                      <div className="w-full relative bg-slate-950 flex items-center justify-center min-h-[260px] max-h-[75vh]">
                                        <SmartVideo
                                          src={p.media.url}
                                          className="w-full h-auto max-h-[75vh]"
                                          preload="auto"
                                          autoplayMuted
                                        />
                                      </div>
                                    </div>
                                  ) : p.attachmentId ? (
                                    <p className="mt-2 text-[11px] text-slate-400">
                                      Media attached: {p.attachmentKind || "file"}
                                    </p>
                                  ) : null}

                                  {/* Engagement Bar */}
                                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/40 pt-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleReaction(p.id, 1);
                                        }}
                                        disabled={!(session?.user as any)?.id || engagementLoading[p.id]?.reaction}
                                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium transition-all ${postReactions[p.id]?.userReaction === 1
                                            ? 'bg-pink-500/20 border-pink-400/60 text-pink-300'
                                            : 'border-slate-600/60 bg-slate-800/60 text-slate-300 hover:border-pink-400/60'
                                          } ${engagementLoading[p.id]?.reaction ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      >
                                        {engagementLoading[p.id]?.reaction ? (
                                          '...'
                                        ) : (
                                          <img
                                            src="/like_icon.svg"
                                            alt="Like"
                                            className="w-3 h-3"
                                          />
                                        )} {postReactions[p.id]?.likes || p?._count?.reactions || 0}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleReaction(p.id, -1);
                                        }}
                                        disabled={!(session?.user as any)?.id || engagementLoading[p.id]?.reaction}
                                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium transition-all ${postReactions[p.id]?.userReaction === -1
                                            ? 'bg-orange-500/20 border-orange-400/60 text-orange-300'
                                            : 'border-slate-600/60 bg-slate-800/60 text-slate-300 hover:border-orange-400/60'
                                          } ${engagementLoading[p.id]?.reaction ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      >
                                        {engagementLoading[p.id]?.reaction ? (
                                          '...'
                                        ) : (
                                          <img
                                            src="/dislike_icon.svg"
                                            alt="Dislike"
                                            className="w-3 h-3"
                                          />
                                        )} {postReactions[p.id]?.dislikes || 0}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConsoleOpenCommentsPostId((cur) =>
                                            cur === p.id ? null : p.id,
                                          );
                                          if (!consoleOpenCommentsPostId || consoleOpenCommentsPostId !== p.id) {
                                            fetchConsolePostComments(p.id);
                                          }
                                        }}
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[9px] font-medium transition-all duration-200 cursor-pointer ${consoleOpenCommentsPostId === p.id
                                            ? 'bg-blue-500/25 border-blue-400/70 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.25)]'
                                            : 'border-slate-600/60 bg-slate-800/60 text-slate-300 hover:border-blue-400/60'
                                          }`}
                                      >
                                        <svg className="w-3 h-3 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                          <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                                        </svg>
                                        <span>Comment</span>
                                        <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[8px] font-bold tracking-tight ${consoleOpenCommentsPostId === p.id
                                            ? 'bg-blue-400/30 text-blue-200'
                                            : 'bg-slate-700/80 text-slate-300 border border-slate-600/60'
                                          }`}>
                                          {consolePostComments[p.id]?.length ?? (p?._count?.comments || 0)}
                                        </span>
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-1 text-[8px] text-slate-500">
                                      <span>👁️ {p?._count?.views || 0} views</span>
                                    </div>
                                  </div>

                                  {/* Comments Section */}
                                  {consoleOpenCommentsPostId === p.id && (
                                    <div className="mt-3 rounded-2xl border border-slate-700/70 bg-slate-950/85 backdrop-blur-md p-2.5 shadow-xl transition-all">
                                      {/* YouTube-style Container Header */}
                                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 mb-2">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[9.5px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1">
                                            <svg className="w-3 h-3 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                                              <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                                            </svg>
                                            Comments
                                          </span>
                                          <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-1.5 py-0.2 text-[8px] font-bold text-blue-300">
                                            {consolePostComments[p.id]?.length ?? (p?._count?.comments || 0)}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setConsoleOpenCommentsPostId(null)}
                                          className="flex items-center gap-0.5 rounded-full border border-slate-700/60 bg-slate-900/60 hover:bg-slate-800 hover:border-slate-500 px-1.5 py-0.2 text-[8.5px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                                          title="Close comments"
                                        >
                                          <span>✕</span>
                                          <span>Close</span>
                                        </button>
                                      </div>

                                      {/* Comment Input */}
                                      {(session?.user as any)?.id && (
                                        <div className="mb-2 flex gap-2">
                                          <input
                                            type="text"
                                            value={consoleCommentInputs[p.id] || ''}
                                            onChange={(e) => setConsoleCommentInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                                            onKeyPress={(e) => {
                                              if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleConsoleAddComment(p.id);
                                              }
                                            }}
                                            placeholder="Add a comment..."
                                            className="flex-1 rounded-lg border border-slate-600/70 bg-slate-900/80 px-2 py-1 text-[10px] text-slate-100 outline-none ring-0 transition focus:border-blue-400 focus:bg-slate-900 focus:shadow-[0_0_0_1px_rgba(59,130,246,0.6)]"
                                            disabled={engagementLoading[p.id]?.comment}
                                          />
                                          <button
                                            onClick={() => handleConsoleAddComment(p.id)}
                                            disabled={!consoleCommentInputs[p.id]?.trim() || engagementLoading[p.id]?.comment}
                                            className="rounded-lg border border-slate-600/70 bg-slate-900/80 px-2 py-1 text-[10px] font-medium text-slate-200 transition hover:border-blue-400 hover:bg-slate-900 focus:border-blue-400 focus:bg-slate-900 focus:shadow-[0_0_0_1px_rgba(59,130,246,0.6)] disabled:opacity-50 disabled:cursor-not-allowed"
                                          >
                                            {engagementLoading[p.id]?.comment ? 'Posting...' : 'Post'}
                                          </button>
                                        </div>
                                      )}

                                      {/* Comments List - YouTube style bounded internal scroll */}
                                      <div className="space-y-2 max-h-52 sm:max-h-60 overflow-y-auto custom-directory-scroll pr-1">
                                        {consoleCommentsLoading[p.id] ? (
                                          <PostCommentsSkeleton />
                                        ) : consolePostComments[p.id]?.length > 0 ? (
                                          consolePostComments[p.id].map((comment) => (
                                            <div key={comment.id} className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-2">
                                              <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                  <div className="relative h-3 w-3 rounded-full overflow-hidden flex-shrink-0 bg-slate-800">
                                                    {/* Initials Fallback */}
                                                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/30 to-fuchsia-500/30 flex items-center justify-center text-[6px] font-bold text-white uppercase">
                                                      {(comment.author.handle?.[0] || comment.author.name?.[0] || '?').toUpperCase()}
                                                    </div>
                                                    {isValidImageUrl(comment.author.image) && (
                                                      <img
                                                        src={getHighResProfilePic(comment.author.image)}
                                                        alt={comment.author.name || 'User'}
                                                        className="absolute inset-0 h-full w-full object-cover rounded-full"
                                                        referrerPolicy="no-referrer"
                                                        onError={(e) => {
                                                          (e.target as HTMLImageElement).style.display = 'none';
                                                        }}
                                                      />
                                                    )}
                                                  </div>
                                                  <span className="text-[8px] font-medium text-slate-300">
                                                    {comment.author.handle || comment.author.name || 'Anonymous'}
                                                  </span>
                                                </div>
                                                <span className="text-[8px] text-slate-500">
                                                  {formatTimeAgo(comment.createdAt)}
                                                </span>
                                              </div>
                                              <p className="mt-1 text-[9px] text-slate-200 leading-relaxed">
                                                {comment.content}
                                              </p>
                                            </div>
                                          ))
                                        ) : (
                                          <p className="text-[10px] text-slate-400 text-center py-2">
                                            No comments yet. Be the first to comment!
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      ) : idConsolePosts === null ? (
                        <div className="mt-4 flex flex-col items-center justify-center gap-2 text-slate-500">
                          <div className="h-8 w-8 rounded-full border-2 border-slate-700/60 border-t-cyan-400 animate-spin" />
                          <p className="text-[11px]">Preparing your console…</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-slate-400">No posts yet.</p>
                      )}
                    </div>

                    {/* Edit Profile Modal */}
                    {showEditProfileModal && (
                      <EditProfileModal
                        isOpen={showEditProfileModal}
                        onClose={() => setShowEditProfileModal(false)}
                        currentUser={{
                          id: (session?.user as any)?.id || "",
                          name: currentUserProfile?.name || (session?.user as any)?.name,
                          handle: currentUserProfile?.handle || (session?.user as any)?.handle,
                          bio: currentUserProfile?.bio || (session?.user as any)?.bio,
                          image: currentUserProfile?.image || (session?.user as any)?.image,
                          banner: currentUserProfile?.banner,
                          location: currentUserProfile?.location,
                          website: currentUserProfile?.website,
                        }}
                        onSaved={(updated) => {
                          setCurrentUserProfile((prev: any) => (prev ? { ...prev, ...updated } : updated));
                          if (updated.name) setDisplayName(updated.name);
                          if (updated.handle) setCurrentHandle(updated.handle);
                          if (updated.image) setProfilePicUrl(getHighResProfilePic(updated.image));
                          if (session?.user) {
                            if (updated.name) (session.user as any).name = updated.name;
                            if (updated.image) (session.user as any).image = updated.image;
                            if (updated.bio !== undefined) (session.user as any).bio = updated.bio;
                            if (updated.handle) (session.user as any).handle = updated.handle;
                          }
                          try {
                            updateSession({ user: updated });
                          } catch {}
                          if (setDirectoryItems) {
                            setDirectoryItems((prev: any) =>
                              Array.isArray(prev)
                                ? prev.map((p: any) => (p.id === (session?.user as any)?.id ? { ...p, ...updated } : p))
                                : prev
                            );
                          }
                          try {
                            loadDirectoryData(true);
                          } catch {}
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            )
          ) : null
        ) : null}

        <StoreModal
          showStore={showStore}
          isStoreAnimating={isStoreAnimating}
          setIsStoreAnimating={setIsStoreAnimating}
          setShowStore={setShowStore}
          cardRotateX={cardRotateX}
          cardRotateY={cardRotateY}
          cardShineX={cardShineX}
          cardShineY={cardShineY}
          handleCardMouseMove={handleCardMouseMove}
          handleCardMouseLeave={handleCardMouseLeave}
          session={session}
          profilePicUrl={profilePicUrl}
          avatarLoadError={avatarLoadError}
          setAvatarLoadError={setAvatarLoadError}
          isAvatarHovered={isAvatarHovered}
          setIsAvatarHovered={setIsAvatarHovered}
          setAvatarViewerImageUrl={setAvatarViewerImageUrl}
          showPointsGuide={showPointsGuide}
          setShowPointsGuide={setShowPointsGuide}
          copiedInviteLink={copiedInviteLink}
          setCopiedInviteLink={setCopiedInviteLink}
          transactionNotification={transactionNotification}
          localBlueTickOverride={localBlueTickOverride}
          localPointsOverride={localPointsOverride}
          isUpgradingStore={isUpgradingStore}
          handleStoreUpgrade={handleStoreUpgrade}
          showDowngradeModal={showDowngradeModal}
          setShowDowngradeModal={setShowDowngradeModal}
          isDowngrading={isDowngrading}
          handleStoreDowngrade={handleStoreDowngrade}
          storeError={storeError}
          setStoreError={setStoreError}
          storeSuccessMsg={storeSuccessMsg}
          setStoreSuccessMsg={setStoreSuccessMsg}
          canUseDom={canUseDom}
        />
      </div>

      {/* Founder Grant Modal - Tech Giant & Fintech Standard */}
      {isFounder && isFounderGrantModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl animate-fade-in px-4">
          <div className="relative w-full max-w-[420px] rounded-3xl border border-cyan-500/25 bg-gradient-to-b from-slate-900/95 via-slate-950/98 to-slate-950 p-6 text-left shadow-[0_25px_60px_rgba(0,0,0,0.85),0_0_40px_rgba(6,182,212,0.12)] animate-scale-up overflow-hidden">
            {/* Ambient Top Glow */}
            <div
              className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-36 w-72 rounded-full blur-3xl ${isDefaultTheme ? "bg-cyan-500/15" : ""}`}
              style={{ backgroundColor: !isDefaultTheme ? 'var(--duo-orb-primary)' : undefined }}
            />

            {/* Header */}
            <div className="relative flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 via-blue-500/15 to-fuchsia-500/10 border border-cyan-400/30 shadow-[0_0_15px_rgba(34,211,238,0.2)] shrink-0">
                  <span className="text-xl select-none">💎</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-100 tracking-tight">
                      Grant Quantum Points
                    </h3>
                    <span className="rounded-full bg-fuchsia-500/15 border border-fuchsia-400/30 px-1.5 py-0.2 text-[8px] font-bold text-fuchsia-300 font-mono">
                      FOUNDER
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Direct peer-to-peer QP transmission</p>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsFounderGrantModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700/60 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-500 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Recipient Pod */}
            <div className="relative my-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/40 p-3 backdrop-blur-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-cyan-400/30 font-bold text-cyan-200 text-[11px] font-mono uppercase">
                  {founderGrantTarget?.[0] || 'Q'}
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] font-mono text-slate-500 block uppercase tracking-wider">Recipient</span>
                  <span className="text-xs font-bold text-cyan-300 font-mono truncate block">@{founderGrantTarget}</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-mono text-emerald-400 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                <span>CONNECTED</span>
              </span>
            </div>

            {/* Amount Input */}
            <div className="relative space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  Amount to Grant
                </label>
                {founderGrantAmount && (
                  <span className="text-[10px] font-bold text-cyan-400 font-mono">
                    +{founderGrantAmount} QP
                  </span>
                )}
              </div>

              <div className="relative flex items-center rounded-2xl border border-slate-700/80 bg-slate-950/70 px-3.5 py-1 focus-within:border-cyan-400/70 focus-within:shadow-[0_0_20px_rgba(6,182,212,0.2)] transition-all">
                <span className="text-sm font-black text-cyan-400 font-mono mr-2 select-none">QP</span>
                <input
                  type="number"
                  value={founderGrantAmount}
                  onChange={(e) => setFounderGrantAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent py-2.5 text-base sm:text-lg font-bold font-mono text-slate-100 placeholder-slate-600 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="1"
                  max="1000000"
                />
                <div className="flex items-center gap-1.5 ml-1 shrink-0">
                  {founderGrantAmount && (
                    <button
                      type="button"
                      onClick={() => setFounderGrantAmount("")}
                      className="text-slate-500 hover:text-slate-300 text-xs px-1.5 py-1 transition-colors cursor-pointer rounded-lg hover:bg-slate-800/60"
                      title="Clear"
                    >
                      ✕
                    </button>
                  )}

                  {/* Modern Minimalist Glass Micro-Stepper (Replaced clunky native browser grey spinner) */}
                  <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800/90 bg-slate-900/60 p-0.5 shadow-inner">
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseInt(founderGrantAmount || "0", 10);
                        setFounderGrantAmount(Math.max(1, val + 1).toString());
                      }}
                      className="flex h-3.5 w-5 items-center justify-center rounded text-[8px] text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/20 active:scale-75 transition-all cursor-pointer"
                      title="Increment"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseInt(founderGrantAmount || "0", 10);
                        if (val > 1) {
                          setFounderGrantAmount((val - 1).toString());
                        } else {
                          setFounderGrantAmount("");
                        }
                      }}
                      className="flex h-3.5 w-5 items-center justify-center rounded text-[8px] text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/20 active:scale-75 transition-all cursor-pointer"
                      title="Decrement"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Presets */}
            <div className="relative my-3.5 space-y-1.5">
              <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
                Quick Presets
              </span>
              <div className="grid grid-cols-4 gap-2">
                {[10, 50, 100, 500].map((amt) => {
                  const isSelected = founderGrantAmount === amt.toString();
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFounderGrantAmount(amt.toString())}
                      className={`rounded-xl border py-2 text-xs font-bold font-mono transition-all duration-150 active:scale-95 cursor-pointer ${
                        isSelected
                          ? "border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.35)]"
                          : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:bg-slate-800/80 hover:text-slate-200"
                      }`}
                    >
                      +{amt}
                    </button>
                  );
                })}
              </div>
            </div>

            {founderGrantError && (
              <div className="rounded-xl border border-red-500/25 bg-red-950/20 p-2.5 text-[10px] text-red-300 font-medium">
                {founderGrantError}
              </div>
            )}

            {/* Action Buttons */}
            <div className="relative mt-5 flex items-center justify-end gap-2.5 pt-3.5 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setIsFounderGrantModalOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleFounderGrantSubmit}
                disabled={isFounderGrantLoading || !founderGrantAmount || parseInt(founderGrantAmount, 10) <= 0}
                className="relative flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] transition duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isFounderGrantLoading ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                    <span>Transmitting...</span>
                  </>
                ) : (
                  <>
                    <span>Send Points</span>
                    <span className="text-sm">⚡</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global transaction notification popup - 100% Leakproof GPU-Clipped Kinetic Quantum Runner */}
      {!showStore && transactionNotification?.show && (() => {
        const isDowngradeTx = transactionNotification.amount === 0 && transactionNotification.type === 'debit';
        return (
          <div className="fixed top-8 sm:top-12 left-1/2 -translate-x-1/2 z-[9999] w-[94vw] max-w-[560px] pointer-events-auto flex justify-center isolate">
            <style dangerouslySetInnerHTML={{
              __html: `
              @keyframes portalVortexSlow {
                0% { transform: scale(0.2); opacity: 0; }
                4% { transform: scale(1.2); opacity: 0.8; }
                9% { transform: scale(1); opacity: 0.5; }
                16% { transform: scale(0.8); opacity: 0.1; }
                76% { transform: scale(0.8); opacity: 0.15; }
                85% { transform: scale(1.1); opacity: 0.6; }
                93% { transform: scale(1.2); opacity: 0.8; }
                100% { transform: scale(0.1); opacity: 0; }
              }

              @keyframes containerExpandContract {
                /* Phase 1: Portal Birth (Only 54px width, logo spins inside) */
                0% { width: 54px; opacity: 0; }
                4% { width: 54px; opacity: 1; }
                9% { width: 54px; opacity: 1; }

                /* Phase 2: Smooth Expand across track - physically pushes logo & reveals text */
                26% { width: 100%; opacity: 1; }

                /* Phase 3: Dwell 4.6 seconds for calm reading */
                80% { width: 100%; opacity: 1; }

                /* Phase 4: Smooth Contract - physically pulls logo left & swallows text */
                94% { width: 54px; opacity: 1; }

                /* Phase 5: Fade out */
                98% { width: 54px; opacity: 0.5; }
                100% { width: 54px; opacity: 0; }
              }

              @keyframes logoRollAtEdge {
                /* Phase 1: Portal spin at place */
                0% { transform: rotate(0deg) scale(0.2); opacity: 0; }
                4% { transform: rotate(180deg) scale(1.08); opacity: 1; }
                9% { transform: rotate(360deg) scale(1); opacity: 1; }

                /* Phase 2: Forward clockwise rolling as container expands */
                26% { transform: rotate(1440deg) scale(1); opacity: 1; }

                /* Phase 3: Dwell breath at right edge */
                30% { transform: rotate(1440deg) scale(1.04); opacity: 1; }
                53% { transform: rotate(1440deg) scale(1); opacity: 1; }
                76% { transform: rotate(1440deg) scale(1.04); opacity: 1; }
                80% { transform: rotate(1440deg) scale(1); opacity: 1; }

                /* Phase 4: Reverse counter-clockwise rolling as container contracts */
                94% { transform: rotate(360deg) scale(1); opacity: 1; }

                /* Phase 5: Spin-down into portal */
                98% { transform: rotate(180deg) scale(0.5); opacity: 0.5; }
                100% { transform: rotate(0deg) scale(0.1); opacity: 0; }
              }

              @keyframes dwellProgressSlow {
                0% { width: 100%; }
                26% { width: 100%; }
                80% { width: 0%; }
                100% { width: 0%; }
              }

              .animate-portal-slow {
                animation: portalVortexSlow 8.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
              .animate-container-expand {
                animation: containerExpandContract 8.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
              }
              .animate-logo-roll {
                animation: logoRollAtEdge 8.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
              }
              .animate-dwell-progress-slow {
                animation: dwellProgressSlow 8.5s linear forwards;
              }

              /* 100% GPU Leakproof Hardware Masking: Guarantees zero corner blur bleed */
              .leakproof-card {
                contain: paint;
                transform: translateZ(0);
                -webkit-mask-image: -webkit-radial-gradient(white, black);
                mask-image: -webkit-radial-gradient(white, black);
                isolation: isolate;
              }
            `}} />

            {/* Expanding/Contracting Pill Container - 100% Leakproof GPU Mask */}
            <div className={`relative rounded-3xl border shadow-[0_20px_50px_rgba(0,0,0,0.85)] overflow-hidden animate-container-expand leakproof-card ${
              isDowngradeTx
                ? 'border-fuchsia-500/40 bg-slate-950 shadow-[0_0_30px_rgba(240,46,170,0.2)]'
                : 'border-cyan-500/40 bg-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.2)]'
            }`}>
              {/* Portal Vortex Aura at Origin - strictly contained inside */}
              <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-8 h-8 animate-portal-slow">
                <div className={`w-8 h-8 rounded-full ${
                  isDowngradeTx ? 'bg-fuchsia-500/25' : 'bg-cyan-500/25'
                }`} />
              </div>

              {/* Inner Full Content (Fixed/Stable Layout - NEVER reflows as container expands) */}
              <div className="w-[94vw] max-w-[560px] flex items-center justify-between pl-4 sm:pl-5 pr-14 sm:pr-16 py-3.5 sm:py-4 min-h-[68px] sm:min-h-[74px] gap-3">
                {/* Left Text Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] sm:text-[11px] font-black uppercase tracking-wider font-mono ${
                      isDowngradeTx ? 'text-fuchsia-300' : 'text-cyan-300'
                    }`}>
                      {transactionNotification.title}
                    </span>
                    <span className="text-[7.5px] sm:text-[8.5px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                      {transactionNotification.txHash}
                    </span>
                  </div>
                  <p className="mt-1 text-xs sm:text-[13px] text-slate-100 font-medium leading-snug line-clamp-2">
                    {transactionNotification.message}
                  </p>
                </div>

                {/* Right Amount Badge */}
                <div className={`shrink-0 flex flex-col items-end justify-center px-3 py-1.5 rounded-xl border ${
                  isDowngradeTx
                    ? 'bg-fuchsia-500/15 border-fuchsia-400/30 text-fuchsia-200 shadow-[0_0_12px_rgba(240,46,170,0.2)]'
                    : 'bg-cyan-500/15 border-cyan-400/30 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                }`}>
                  <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-widest text-slate-400 block leading-none font-mono">
                    QUANTUM
                  </span>
                  <span className="text-xs sm:text-sm font-black tracking-wider font-mono mt-0.5 leading-none">
                    {isDowngradeTx ? 'RESET' : `${transactionNotification.type === 'credit' ? '+' : '-'}${transactionNotification.amount} QP`}
                  </span>
                </div>
              </div>

              {/* The Kinetic Q-Link Logo - PHYSICALLY PINNED TO RIGHT MOVING EDGE */}
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full overflow-hidden pointer-events-none flex items-center justify-center">
                <div className="relative w-full h-full rounded-full overflow-hidden p-[2px] animate-logo-roll">
                  <div className={`w-full h-full rounded-full overflow-hidden p-[2px] ${
                    isDowngradeTx
                      ? 'bg-gradient-to-br from-fuchsia-400 via-purple-500 to-pink-400 shadow-[0_0_20px_rgba(240,46,170,0.9)]'
                      : 'bg-gradient-to-br from-cyan-400 via-blue-500 to-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.9)]'
                  }`}>
                    <div className="w-full h-full rounded-full overflow-hidden bg-slate-950 flex items-center justify-center">
                      <Image
                        src="/logo-256.png"
                        alt="Q-Link"
                        width={36}
                        height={36}
                        className="rounded-full object-cover w-full h-full select-none pointer-events-none"
                        priority
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress Bar (Depleting smoothly with rounded ends) */}
              <div className="absolute bottom-0 inset-x-3 h-[2px] overflow-hidden rounded-full">
                <div className={`h-full rounded-full ${
                  isDowngradeTx
                    ? 'bg-gradient-to-r from-fuchsia-500 to-pink-400 shadow-[0_0_10px_rgba(240,46,170,0.85)]'
                    : 'bg-gradient-to-r from-cyan-400 via-blue-500 to-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.85)]'
                } animate-dwell-progress-slow`} />
              </div>
            </div>
          </div>
        );
      })()}
      {/* ── Message Details Modal (Detailed Date & Timestamp Section) ──────── */}
      {detailModalMessage && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setDetailModalMessage(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-cyan-400/40 bg-slate-950/95 p-5 shadow-[0_0_50px_rgba(0,0,0,0.9),0_0_30px_rgba(34,211,238,0.2)] backdrop-blur-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-cyan-200">Message Details</h3>
                  <p className="text-[10px] text-slate-400">Quantum channel transmission log</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalMessage(null)}
                className="h-7 w-7 rounded-full border border-slate-700 bg-slate-800/80 flex items-center justify-center text-slate-400 hover:text-white hover:border-cyan-400/50 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Details List */}
            <div className="space-y-2.5 py-4 text-xs">
              {/* Full Date & Timestamp (Requested by user) */}
              <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/30 to-slate-900/60 p-3 shadow-inner">
                <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <span>📅</span> Date & Exact Timestamp
                </p>
                <p className="text-slate-100 font-semibold text-xs">
                  {detailModalMessage.createdAt
                    ? new Date(detailModalMessage.createdAt).toLocaleDateString(undefined, {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "Unknown Date"}
                </p>
                <p className="text-cyan-300 text-[11px] font-mono mt-0.5">
                  {detailModalMessage.createdAt
                    ? new Date(detailModalMessage.createdAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                      })
                    : ""}
                </p>
              </div>

              {/* Delivery Status */}
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
                <span className="text-slate-400">Delivery Status</span>
                <div className="flex items-center gap-1.5 font-medium text-slate-200">
                  <span className="text-[11px]">{(detailModalMessage as any).status || "Delivered"}</span>
                  <MessageStatusTicks status={(detailModalMessage as any).status} isMe={true} />
                </div>
              </div>

              {/* Encryption Security (Accurate Status & Help) */}
              {(() => {
                const isMsgEncrypted = Boolean(
                  (detailModalMessage as any).isEncrypted ||
                  (detailModalMessage.content && detailModalMessage.content.trim().startsWith('{"__e2e"'))
                );

                if (isMsgEncrypted) {
                  return (
                    <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2">
                      <span className="text-slate-400">Security</span>
                      <span className="text-emerald-300 font-semibold flex items-center gap-1.5 text-[11px]">
                        <span>🔒</span> E2E Encrypted (Active)
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-2.5 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs">Security</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-300/90 font-medium text-[11px] flex items-center gap-1">
                          <span>🔓</span> Off (Standard)
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowE2EHelp((prev) => !prev)}
                          title="How to turn on End-to-End Encryption"
                          aria-label="How to turn on End-to-End Encryption"
                          className="h-5 w-5 rounded-full border border-amber-400/60 bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 text-[11px] font-black flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-[0_0_8px_rgba(251,191,36,0.3)]"
                        >
                          ?
                        </button>
                      </div>
                    </div>

                    {showE2EHelp && (
                      <div className="mt-2.5 pt-2.5 border-t border-amber-500/20 text-[11px] text-slate-300 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center gap-1.5 text-amber-200 font-semibold text-[11px]">
                          <span>💡</span>
                          <span>How to turn on End-to-End Encryption:</span>
                        </div>
                        <ol className="list-decimal list-inside text-slate-300 text-[10.5px] space-y-1 pl-1">
                          <li>Open <strong className="text-white">Settings</strong> (⚙️)</li>
                          <li>Find <strong className="text-white">E2E Encryption Shield</strong></li>
                          <li>Toggle switch to <strong className="text-cyan-300">On</strong></li>
                        </ol>
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setDetailModalMessage(null);
                              setShowE2EHelp(false);
                              openSettingsDirect();
                            }}
                            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/20 hover:bg-cyan-500/30 py-1.5 text-[11px] font-semibold text-cyan-200 transition active:scale-98 shadow-[0_0_12px_rgba(34,211,238,0.15)]"
                          >
                            <span>⚙️</span> Open Settings Now
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Sender Info */}
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
                <span className="text-slate-400">Sender</span>
                <span className="text-slate-200 font-mono text-[11px]">
                  {detailModalMessage.senderId === meId || detailModalMessage.senderId === "me" || String(detailModalMessage.id).startsWith("temp-")
                    ? "You (sender)"
                    : `@${activePeerHandle || "peer"}`}
                </span>
              </div>

              {/* Message Content Preview */}
              {detailModalMessage.content && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400">Message Content</span>
                    <button
                      type="button"
                      onClick={() => {
                        const cleanText = detailModalMessage.content.replace(/^[(FILE|VIDEO) attachment]\s*/i, "");
                        navigator.clipboard.writeText(cleanText);
                        setChatError("Copied!");
                        setTimeout(() => setChatError(null), 2000);
                      }}
                      className="text-[10px] font-semibold text-cyan-400 hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-slate-200 text-xs break-words max-h-20 overflow-y-auto scrollbar-hide">
                    {detailModalMessage.content.replace(/^[(FILE|VIDEO) attachment]\s*/i, "")}
                  </p>
                </div>
              )}
            </div>

            {/* Close Action */}
            <button
              type="button"
              onClick={() => setDetailModalMessage(null)}
              className="w-full rounded-xl border border-cyan-400/50 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 py-2.5 text-xs font-bold text-cyan-200 hover:from-cyan-500/30 hover:to-blue-500/30 transition text-center shadow-[0_0_15px_rgba(34,211,238,0.15)]"
            >
              Done
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── Message Reaction Details Modal (WhatsApp / Telegram / Apple style) ── */}
      <MessageReactionDetailsModal
        isOpen={Boolean(reactionModalMessage)}
        onClose={() => setReactionModalMessage(null)}
        message={reactionModalMessage}
        currentUserId={meId || myId || (session?.user as any)?.id || ""}
        onReact={handleToggleReaction}
        onRemoveReaction={handleRemoveReaction}
      />

      {/* ── Universal Emoji Picker Modal (1,800+ categorised emojis with live search) ── */}
      <UniversalEmojiPickerModal
        isOpen={Boolean(emojiPickerTargetMessageId)}
        onClose={() => setEmojiPickerTargetMessageId(null)}
        onSelectEmoji={(emoji) => {
          if (emojiPickerTargetMessageId) {
            handleToggleReaction(emojiPickerTargetMessageId, emoji);
            setEmojiPickerTargetMessageId(null);
          }
        }}
      />


      {/* Premium Sci-Fi WhatsApp-style Context Menu */}
      {contextMenu && (() => {
        const menuWidth = 230;
        const menuHeight = 175;
        let topPos = contextMenu.y - 10;
        let leftPos = contextMenu.x;
        let translateY = "-100%";

        if (typeof window !== "undefined") {
          if (leftPos - menuWidth / 2 < 10) {
            leftPos = menuWidth / 2 + 10;
          } else if (leftPos + menuWidth / 2 > window.innerWidth - 10) {
            leftPos = window.innerWidth - menuWidth / 2 - 10;
          }
          if (topPos - menuHeight < 10) {
            topPos = contextMenu.y + 15;
            translateY = "0%";
          }
        }

        const targetMsg = chatMessages.find((m) => m.id === contextMenu.messageId);
        const myReactionEmoji = targetMsg?.reactions?.find(
          (r) => r.userId === (meId || myId || (session?.user as any)?.id)
        )?.emoji;
        const reactionsCount = targetMsg?.reactions?.length || 0;

        return (
          <div
            data-context-menu
            style={{
              position: "fixed",
              top: topPos,
              left: leftPos,
              transform: `translate(-50%, ${translateY})`,
              zIndex: 9999,
            }}
            className="animate-fade-in w-[230px] max-w-[230px] overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#09111c]/95 p-1.5 shadow-[0_0_30px_rgba(6,182,212,0.3)] backdrop-blur-xl select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Horizontally Scrollable Tech-Giant Quick Reaction Bar with Left/Right Controls */}
            <div className="relative mb-1.5 flex items-center rounded-xl bg-white/[0.04] border border-white/10 p-0.5 shadow-inner w-full min-w-0">
              {/* Left Scroll Arrow */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const track = e.currentTarget.parentElement?.querySelector("[data-reaction-track]");
                  if (track) track.scrollBy({ left: -90, behavior: "smooth" });
                }}
                className="shrink-0 flex h-7 w-3.5 items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 transition active:scale-90 text-[11px] font-bold cursor-pointer"
                title="Scroll left"
              >
                ‹
              </button>

              {/* Scrollable Emojis List with Smooth Touch / Mouse / Wheel Scroll */}
              <div
                data-reaction-track
                onWheel={(e) => {
                  e.currentTarget.scrollLeft += e.deltaY;
                }}
                className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth px-1 flex-1 min-w-0"
              >
                {QUICK_DOCK_REACTIONS.map((emoji) => {
                  const isSelected = myReactionEmoji === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        handleToggleReaction(contextMenu.messageId, emoji);
                        setContextMenu(null);
                      }}
                      className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-base transition-transform duration-150 hover:scale-130 active:scale-90 cursor-pointer ${
                        isSelected
                          ? "bg-cyan-500/30 border border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.5)] scale-110"
                          : "hover:bg-white/10"
                      }`}
                      title={`React ${emoji}`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>

              {/* Right Scroll Arrow */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const track = e.currentTarget.parentElement?.querySelector("[data-reaction-track]");
                  if (track) track.scrollBy({ left: 90, behavior: "smooth" });
                }}
                className="shrink-0 flex h-7 w-3.5 items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 transition active:scale-90 text-[11px] font-bold cursor-pointer"
                title="Scroll right"
              >
                ›
              </button>

              {/* Pinned '+' Button opening Universal Android Keypad Emoji Picker (1,900+ Emojis) */}
              <button
                type="button"
                onClick={() => {
                  setEmojiPickerTargetMessageId(contextMenu.messageId);
                  setContextMenu(null);
                }}
                className="shrink-0 ml-0.5 flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-950/50 text-cyan-300 hover:text-white hover:border-cyan-400 hover:bg-cyan-500/25 shadow-[0_0_8px_rgba(6,182,212,0.3)] transition-all duration-150 active:scale-90 cursor-pointer"
                title="Browse all 1,900+ Android emojis"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>

            {/* Header Info (Sci-fi Theme) */}
            <div className="flex items-center justify-between border-b border-slate-800 px-2 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono">
              <span>Message Ops</span>
              {reactionsCount > 0 && (
                <span className="text-cyan-400/90 font-mono lowercase">
                  {reactionsCount} {reactionsCount === 1 ? "reaction" : "reactions"}
                </span>
              )}
            </div>

            <div className="mt-1 space-y-0.5">
              {/* View Reactions Option (Shows if message has reactions) */}
              {reactionsCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (targetMsg) {
                      setReactionModalMessage(targetMsg);
                    }
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-emerald-300 transition duration-150 hover:bg-emerald-950/50 hover:text-emerald-100 active:scale-95"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {targetMsg?.reactions?.[0]?.emoji || "🙏"}
                    </span>
                    <span>View Reactions</span>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300">
                    {reactionsCount}
                  </span>
                </button>
              )}

              {/* Message Details (Detailed Date & Timestamp Section) */}
              <button
                type="button"
                onClick={() => {
                  if (targetMsg) {
                    setDetailModalMessage(targetMsg);
                    setShowE2EHelp(false);
                  }
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-cyan-300 transition duration-150 hover:bg-cyan-950/60 hover:text-cyan-100 active:scale-95"
              >
                <svg className="h-3.5 w-3.5 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Message Details</span>
              </button>
              {/* Copy Button */}
              {!/\[(FILE|VIDEO) attachment\]/i.test(contextMenu.content) && (
                <button
                  type="button"
                  onClick={() => handleCopyMessageText(contextMenu.content)}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-300 transition duration-150 hover:bg-slate-800/80 hover:text-cyan-300 active:scale-95"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                  </svg>
                  <span>Copy Text</span>
                </button>
              )}

              {/* Share Link Button */}
              <button
                type="button"
                onClick={() => handleShareMessage(contextMenu.messageId)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-300 transition duration-150 hover:bg-slate-800/80 hover:text-cyan-300 active:scale-95"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 10.742l4.618-2.3a3 3 0 100-1.748l-4.618-2.3a3 3 0 100 5.696v0z" />
                </svg>
                <span>Share Link</span>
              </button>

              {/* Edit Message Button (Only for sender's own text messages) */}
              {contextMenu.isMe && !/\[(FILE|VIDEO) attachment\]/i.test(contextMenu.content) && (
                <button
                  type="button"
                  onClick={() => handleStartEditMessage(contextMenu.messageId, contextMenu.content)}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-cyan-300 transition duration-150 hover:bg-cyan-950/60 hover:text-cyan-200 active:scale-95"
                >
                  <svg className="h-3.5 w-3.5 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  <span>Edit Message</span>
                </button>
              )}

              {/* Select Button */}
              <button
                type="button"
                onClick={() => {
                  setIsSelectionMode(true);
                  setSelectedMessageIds(new Set([contextMenu.messageId]));
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-300 transition duration-150 hover:bg-slate-800/80 hover:text-cyan-300 active:scale-95"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Select</span>
              </button>

              {/* Delete Button (Always Available) */}
              <button
                type="button"
                onClick={() => handleDeleteMessage(contextMenu.messageId)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-rose-400 transition duration-150 hover:bg-rose-950/60 hover:text-rose-300 active:scale-95"
              >
                <svg className="h-3.5 w-3.5 text-rose-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>{contextMenu.isMe ? "Delete Message" : "Delete (for me)"}</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Glowing Cyberpunk Notification Toast */}
      <UndoSnackbar
        visible={!!pendingDelete}
        onUndo={handleUndoDelete}
        onDismiss={handleDismissDelete}
      />

      {shareToastText && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] animate-fade-in px-4 py-2 rounded-full border border-cyan-500/30 bg-[#09111c]/90 text-cyan-400 text-xs font-mono font-bold tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.4)] backdrop-blur-md flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
          {shareToastText}
        </div>
      )}

      {/* Quantum PWA Root Back Protection Exit Toast */}
      {exitToastVisible && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[10000] pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-in fade-in slide-in-from-bottom-3">
          <div className="flex items-center gap-2.5 rounded-full border border-cyan-400/40 bg-slate-950/90 px-4 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_20px_rgba(6,182,212,0.25)] backdrop-blur-xl ring-1 ring-white/10">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            <span className="text-xs font-medium tracking-wide text-slate-200">
              Press back again to exit Q-Link
            </span>
          </div>
        </div>
      )}

      {/* Q-BEACON Fullscreen Crimson Glassmorphic Radar Modal */}
      {activeBeacon && (
        <EmergencyBeaconModal
          senderHandle={activeBeacon.senderHandle}
          senderName={activeBeacon.senderName}
          senderImage={activeBeacon.senderImage}
          voiceUrl={activeBeacon.voiceUrl}
          noteText={activeBeacon.noteText}
          onClose={() => setActiveBeacon(null)}
          onAcknowledge={() => {
            if (activePeerHandle) {
              setChatInput("🟢 I'm awake!");
            }
          }}
        />
      )}

      {/* Autonomous Human Biomechanical Ghost Cursor Overlay */}
      <GhostCursor />
    </main>
  );
}