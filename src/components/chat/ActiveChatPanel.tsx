"use client";

import { useDuoTheme } from "@/app/providers/DuoThemeProvider";

import React, { memo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Cropper from "react-easy-crop";
import { ChatInputConsole } from "@/components/ChatInputConsole";
import { MessageStatusTicks } from "@/components/MessageStatusTicks";
import { YouTubeInlinePreview } from "@/components/YouTubeInlinePreview";
import { UniversalSocialEmbedPreview, extractSocialMediaEmbedInfo } from "./UniversalSocialEmbedPreview";
import QAIAssistantModal from "@/components/QAIAssistantModal";
import QuantumVideoPlayerComponent from "@/components/QuantumVideoPlayer";
import { QuantumUserProfileView } from "@/components/profile/QuantumUserProfileView";
import { QuantumChatImageLightbox } from "./QuantumChatImageLightbox";

// ── Shared Helpers (Extracted from page.tsx) ───────────────────────────────────
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
   QUANTUM CHAT HISTORY SKELETON
   Alternating incoming and outgoing realistic message bubbles with
   hardware-accelerated cyan aurora sweeps and zero layout shift.
   ========================================================================== */
function QuantumChatHistorySkeleton({ peerHandle }: { peerHandle?: string | null } = {}) {
  return (
    <div className="space-y-4 py-3 animate-in fade-in duration-200 select-none">
      {/* 1. Subtle incoming message placeholder (Clean text outline, zero fake media) */}
      <div className="flex justify-start w-full">
        <div className="quantum-skeleton-card max-w-[65%] rounded-2xl rounded-bl-sm border border-slate-700/50 bg-slate-900/80 px-3.5 py-2.5 space-y-1.5 shadow-sm relative overflow-hidden">
          <div className="quantum-skeleton-shimmer" />
          <div className="h-2.5 w-36 rounded-full bg-slate-800" />
          <div className="h-2.5 w-24 rounded-full bg-slate-800/70" />
          <div className="flex justify-end pt-0.5">
            <div className="h-1.5 w-8 rounded-full bg-slate-800/50" />
          </div>
        </div>
      </div>

      {/* 2. Subtle outgoing message placeholder (Clean text outline, zero fake media) */}
      <div className="flex justify-end w-full">
        <div className="quantum-skeleton-card max-w-[60%] rounded-2xl rounded-br-sm border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 to-sky-950/40 px-3.5 py-2.5 space-y-1.5 shadow-[0_0_12px_rgba(56,189,248,0.15)] relative overflow-hidden">
          <div className="quantum-skeleton-shimmer" />
          <div className="h-2.5 w-28 rounded-full bg-cyan-800/40 border border-cyan-500/20" />
          <div className="flex justify-end items-center gap-1 pt-0.5">
            <div className="h-1.5 w-6 rounded-full bg-cyan-700/40" />
            <div className="h-1.5 w-1.5 rounded-full bg-cyan-400/60" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   QUIET LUXURY ATTACHMENT ACTION BUTTON & MICRO-TOOLTIP
   Apple Optical Crystal icon button with spring physics and luxury tooltip.
   ========================================================================== */
interface AttachmentActionButtonProps {
  onClick: (e: React.MouseEvent) => void | Promise<void>;
  ariaLabel: string;
  tooltip: string;
  variant?: "default" | "danger" | "cyan";
  icon: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

function AttachmentActionButton({
  onClick,
  ariaLabel,
  tooltip,
  variant = "default",
  icon,
  disabled = false,
  className = "",
}: AttachmentActionButtonProps) {
  const variantStyles = {
    default:
      "border-white/10 bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.14] hover:border-white/30 hover:shadow-[0_0_12px_rgba(255,255,255,0.12)]",
    danger:
      "border-rose-500/20 bg-rose-500/[0.08] text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/20 hover:border-rose-400/40 hover:shadow-[0_0_12px_rgba(244,63,94,0.25)]",
    cyan:
      "border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-300/80 hover:text-cyan-100 hover:bg-cyan-500/20 hover:border-cyan-400/40 hover:shadow-[0_0_12px_rgba(34,211,238,0.25)]",
  };

  const tooltipVariantStyles = {
    default: "text-white/90 border-white/15 bg-black/90",
    danger: "text-rose-200 border-rose-500/30 bg-black/90",
    cyan: "text-cyan-200 border-cyan-500/30 bg-black/90",
  };

  return (
    <div className="relative group/act-btn inline-flex items-center justify-center">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-label={ariaLabel}
        className={`relative flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur-xl transition-all duration-200 active:scale-90 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-sm ${variantStyles[variant]} ${className}`}
      >
        {icon}
      </button>

      {/* Apple-grade luxury micro-tooltip */}
      <div className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-50 opacity-0 group-hover/act-btn:opacity-100 group-hover/act-btn:-translate-y-0.5 transition-all duration-150 ease-out whitespace-nowrap">
        <div
          className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[9.5px] font-medium tracking-tight shadow-[0_4px_16px_rgba(0,0,0,0.8)] backdrop-blur-xl select-none ${tooltipVariantStyles[variant]}`}
        >
          {tooltip}
        </div>
      </div>
    </div>
  );
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

  const formatMsgTime = (iso: string): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  };

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
    if (msgDay.getTime() === yesterday.getDate()) return "Yesterday";
    const diffTime = Math.abs(today.getTime() - msgDay.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 7) {
      return d.toLocaleDateString([], { weekday: "long" });
    }
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
// ──────────────────────────────────────────────────────────────────────────────

export interface ActiveChatPanelProps {
  chatMessages?: any[];
  allCategories?: any[];
  selectedCategories?: any[];
  viewingProfileHandle?: string | null;
  onCloseProfile?: () => void;
  onCloseChat?: () => void;
  onStartChatWithUser?: (handle: string) => void;
  onSendConnectRequest?: (targetHandle: string, categories: string[], note: string) => Promise<void>;
  profileInitialData?: any;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string) => void;
  onOpenReactionModal?: (message: any) => void;
  [key: string]: any;
}

export const ActiveChatPanel = memo(function ActiveChatPanel(props: ActiveChatPanelProps) {
  const { isDefaultTheme } = useDuoTheme();
  const {
    chatPanelRef,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    isChatExpanded,
    isFocusMode,
    isDraggingFile,
    activePeerHandle,
    chatAnimMode,
    setShowLogoViewer,
    mode,
    setMode,
    highlightConnect,
    handleSearch,
    friendIdInput,
    setFriendIdInput,
    searching,
    selectedCategories = [],
    toggleCategory,
    requestError,
    requestSuccess,
    searchError,
    setSearchError,
    foundUser,
    setFoundUser,
    comment,
    setComment,
    sendingRequest,
    handleSendRequest,
    allCategories = [],
    setShowMoreCategories,
    peerOnline,
    peerTyping,
    peerLastSeen,
    showOfflineTransitionName,
    highlightFullChat,
    setIsChatFull,
    highlightChatPanel,
    chatScrollRef,
    handleChatContainerScroll,
    chatError,
    setChatError,
    handleRetryMessage,
    chatLoading,
    chatMessages = [],
    meId,
    viewingProfileHandle,
    onCloseProfile,
    onCloseChat,
    onStartChatWithUser,
    onSendConnectRequest,
    profileInitialData,
    myId,
    effectiveUser,
    handleDeleteMessage,
    onToggleReaction,
    onRemoveReaction,
    onOpenReactionModal,
    isSelectionMode,
    setIsSelectionMode,
    selectedMessageIds,
    setSelectedMessageIds,
    handleBulkDelete,
    handleSelectAll,
    lightboxImageUrl,
    setLightboxImageUrl,
    lightboxImageName,
    setLightboxImageName,
    lightboxVideoUrl,
    setLightboxVideoUrl,
    lightboxVideoName,
    setLightboxVideoName,
    highlightedMessageId,
    pendingImagePreviewUrl,
    pendingImageFile,
    setPendingImageFile,
    setPendingImagePreviewUrl,
    handleSendPendingImage,
    handleOpenImageEditor,
    attachmentError,
    setAttachmentError,
    isUploadingAttachment,
    uploadProgressText,
    isEditingImage,
    handleCropComplete,
    handleCloseImageEditor,
    applyImageCrop,
    crop,
    setCrop,
    zoom,
    setZoom,
    aspect,
    handleAspectChange,
    chatInput,
    setChatInput,
    handleSendMessage,
    handleKeyDown,
    handleTypingPing,
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    handleAttachButtonClick,
    handleTriggerEmergencyBeacon,
    isSendingBeacon,
    fileInputRef,
    videoInputRef,
    imageVideoInputRef,
    handleAttachmentSelected,
    formatDuration,
    editingMessage,
    handleCancelEdit,
    isChatFull,
    toggleChatFull,
    isQAIOpen,
    setIsQAIOpen,
    showAIHelpButton,
    setShowAIHelpButton,
    isAIArrowButtonVisible,
    setIsAIArrowButtonVisible,
    showCloseModal,
    setShowCloseModal,
    showLogoViewer,
    logoViewerImage,
    beaconStatusMsg,
    showSettings,
    showDirectory,
    chatInputRef,
    pendingImageRef,
    session,
    setIsVipTermsAnimating,
    setShowVipTerms,
    setManualStopAnimation,
    handlePasteFile,
  } = props;

  const handlePanelPaste = (e: React.ClipboardEvent) => {
    if (e.defaultPrevented) return;
    const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (targetTag === "textarea" || targetTag === "input") {
      return;
    }

    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    let imageFile: File | null = null;
    const items = clipboardData.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            imageFile = blob;
            break;
          }
        }
      }
    }

    if (!imageFile && clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const file = clipboardData.files[i];
        const isImage =
          (file.type && file.type.startsWith("image/")) ||
          /\.(png|jpe?g|webp|gif|bmp|svg|ico)$/i.test(file.name || "");
        if (isImage) {
          imageFile = file;
          break;
        }
      }
    }

    if (imageFile) {
      e.preventDefault();
      const mime = imageFile.type || "image/png";
      const ext = mime.split("/")[1]?.replace("+xml", "") || "png";
      const filename =
        imageFile.name && imageFile.name !== "image.png"
          ? imageFile.name
          : `screenshot_${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;

      const fileWithCleanName = new File([imageFile], filename, {
        type: mime,
        lastModified: Date.now(),
      });

      if (handlePasteFile) {
        handlePasteFile(fileWithCleanName);
      }
    }
  };

  // Auto-scroll to show live WhatsApp-style typing bubble when peer is typing
  useEffect(() => {
    if (peerTyping && chatScrollRef?.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [peerTyping, chatScrollRef]);

  // WhatsApp-Style Context Menu & Message Details State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    message: any;
  } | null>(null);

  const [detailModalMessage, setDetailModalMessage] = useState<any | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Centralized Optical Attachment Download Handler with loading state
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);

  const handleDownloadAttachment = async (attachmentId: string, originalName: string) => {
    if (downloadingAttachmentId === attachmentId) return;
    setDownloadingAttachmentId(attachmentId);
    try {
      const res = await fetch(`/api/attachments/download?id=${encodeURIComponent(attachmentId)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Download failed" }));
        console.error("[Download] Failed:", res.status, err);
        setChatError(`Download failed · ${err.error ?? "Please try again"}`);
        setTimeout(() => setChatError(null), 4000);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = originalName;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("[Download] Error:", err);
      setChatError(`Download error · ${err instanceof Error ? err.message : "Please try again"}`);
      setTimeout(() => setChatError(null), 4000);
    } finally {
      setDownloadingAttachmentId(null);
    }
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    const timer = setTimeout(() => {
      window.addEventListener("click", handleClose);
      window.addEventListener("scroll", handleClose, true);
    }, 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, msg: any) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, typeof window !== "undefined" ? window.innerWidth - 220 : 300);
    const y = Math.min(e.clientY, typeof window !== "undefined" ? window.innerHeight - 260 : 400);
    setContextMenu({ x, y, message: msg });
  };

  const handleTouchStart = (msg: any, e: React.TouchEvent) => {
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
    const touch = e.touches[0];
    if (!touch) return;
    const x = Math.min(touch.clientX, typeof window !== "undefined" ? window.innerWidth - 220 : 300);
    const y = Math.min(touch.clientY, typeof window !== "undefined" ? window.innerHeight - 260 : 400);
    longPressTimeoutRef.current = setTimeout(() => {
      if (typeof window !== "undefined" && window.navigator && "vibrate" in window.navigator) {
        try { window.navigator.vibrate(40); } catch (_) {}
      }
      setContextMenu({ x, y, message: msg });
    }, 450);
  };

  const handleTouchEnd = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  return (
            <section
              ref={chatPanelRef}
              data-tour="chat-panel"
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onPaste={handlePanelPaste}
              className={
                "relative scrollbar-hide " +
                (isChatExpanded
                  ? "fixed inset-0 z-[9999] flex h-[100dvh] w-full max-w-[100vw] overflow-hidden"
                  : isFocusMode
                    ? "hidden"
                    : "flex h-auto min-h-full flex-1 flex-col min-w-0 max-w-full px-1 sm:px-4 lg:px-6 py-4 overflow-visible")
              }
            >
              {isDraggingFile && (
                <div
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className="absolute inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md border-2 border-dashed border-cyan-400/80 rounded-2xl m-3 sm:m-4 animate-float-in"
                >
                  {/* Tech corner elements */}
                  <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-cyan-400 pointer-events-none" />
                  <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-cyan-400 pointer-events-none" />
                  <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-cyan-400 pointer-events-none" />
                  <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-cyan-400 pointer-events-none" />

                  {/* Glowing Drop Area Icon */}
                  <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.3)] animate-pulse pointer-events-none">
                    <svg
                      className="h-8 w-8 text-cyan-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 16.5 4.5H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z"
                      />
                    </svg>
                  </div>

                  <h3 className="text-sm font-black uppercase tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-300 pointer-events-none">
                    Quantum Link Upload
                  </h3>
                  <p className="mt-2 text-xs text-slate-300 text-center font-medium px-6 pointer-events-none">
                    Drop files here to send securely to @{activePeerHandle}
                  </p>
                  <span className="mt-1 text-[9px] font-mono text-slate-500 uppercase tracking-widest pointer-events-none">
                    Maximum file size: 50MB
                  </span>
                </div>
              )}

              {/* glow-ping removed to prevent outer sharp corner artifact */}

              {Boolean((mode === "profile" || viewingProfileHandle) && viewingProfileHandle) ? (
                <div
                  className={
                    "liquid-glass-surface glass-panel relative z-10 rounded-2xl fullchat-panel overflow-hidden transition-all duration-300 " +
                    (isChatExpanded ? "fullscreen rounded-none border-none " : "") +
                    (chatAnimMode !== 'idle' ? chatAnimMode + " " : "") +
                    "flex flex-1 h-full min-h-[580px] w-full flex-col p-0 border-slate-500/60"
                  }
                >
                  <QuantumUserProfileView
                    handle={viewingProfileHandle!}
                    currentUserId={meId}
                    initialData={profileInitialData || foundUser}
                    onBack={() => {
                      if (onCloseProfile) onCloseProfile();
                      else setMode("home");
                    }}
                    onStartChat={(peerHandle) => {
                      setFoundUser(null);
                      if (onStartChatWithUser) {
                        onStartChatWithUser(peerHandle);
                      } else {
                        setMode("home");
                      }
                    }}
                    onSendConnectRequest={onSendConnectRequest}
                    allCategories={allCategories}
                  />
                </div>
              ) : (
                <div
                  className={
                    "liquid-glass-surface glass-panel relative z-10 rounded-2xl fullchat-panel overflow-hidden transition-all duration-300 " +
                    (isChatExpanded ? "fullscreen rounded-none border-none " : "") +
                    (chatAnimMode !== 'idle' ? chatAnimMode + " " : "") +
                    (isChatExpanded
                      ? "flex-1 flex h-[100dvh] min-h-0 w-full flex-col space-y-3 p-0 sm:p-3"
                      : "flex h-auto min-h-0 flex-col space-y-5 p-5") +
                    " border-slate-500/60"
                  }
                >
                {!isChatExpanded && (
                  <>
                    <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-4">
                        <div
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setShowLogoViewer(true)}
                        >
                          <Image
                            src="/logo-256.png"
                            alt="Q-Link Logo"
                            width={32}
                            height={32}
                            className="rounded-full object-cover"
                            priority
                          />
                        </div>
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
                            Session Key
                          </p>
                          <p className="mt-1 min-w-0 text-xs font-mono text-slate-300 break-all sm:break-normal">
                            q-link://channel
                            <span className={isDefaultTheme ? "text-cyan-300" : ""} style={!isDefaultTheme ? { color: "var(--duo-primary, #22d3ee)" } : undefined}>/alpha</span>
                          </p>
                        </div>
                      </div>

                      
                      <div className="flex w-full flex-row items-center justify-between text-left sm:w-auto sm:flex-col sm:items-end sm:text-right">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          Status
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          {mode === "home" ? "Idle" : "Connecting"}
                        </span>
                      </div>
                    </header>

                    {/* Friend search form */}
                    <form
                      data-tour="connect"
                      onSubmit={handleSearch}
                      className={
                        "space-y-4 rounded-2xl " +
                        (highlightConnect
                          ? "glow-pulse border-cyan-400/80"
                          : "")
                      }
                    >
                      <label className="space-y-2 text-xs font-medium text-slate-200">
                        <span className="flex items-center justify-between gap-2">
                          <span>
                            {mode === "home"
                              ? "Search a friend by quantum ID"
                              : "Enter quantum chat ID"}
                          </span>
                          <span className="text-[10px] font-normal text-slate-400">
                            Example: @orion-9x or @yourname
                          </span>
                        </span>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                            @
                          </div>
                          <input
                            value={friendIdInput}
                            onChange={(e) => setFriendIdInput(e.target.value)}
                            placeholder="friend-id"
                            className="w-full rounded-xl border border-slate-600/70 bg-slate-900/80 py-2.5 pl-7 pr-24 text-sm text-slate-100 outline-none ring-0 transition focus:border-cyan-400 focus:bg-slate-900 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.6)]" style={!isDefaultTheme ? { backgroundColor: "var(--duo-surface-card-inner, rgba(2, 6, 23, 0.6))", borderColor: "var(--duo-surface-card-border, rgba(51, 65, 85, 0.7))" } : undefined}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-mono text-slate-500">
                            x.chat
                          </span>
                        </div>
                      </label>

                      <button
                        type="submit"
                        disabled={!friendIdInput.trim() || searching}
                        className={`group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          isDefaultTheme
                            ? "bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-400 text-slate-950 shadow-[0_0_25px_rgba(56,189,248,0.65)] hover:shadow-[0_0_40px_rgba(56,189,248,0.85)]"
                            : "hover:brightness-110 active:scale-[0.99]"
                        }`}
                        style={!isDefaultTheme ? {
                          background: "var(--duo-gradient, linear-gradient(135deg, #22d3ee 0%, #8b5cf6 100%))",
                          boxShadow: "var(--duo-btn-shadow, var(--duo-glow, 0 0 25px rgba(56,189,248,0.65)))",
                          color: "var(--duo-btn-text, #ffffff)",
                        } : undefined}
                      >
                        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition group-hover:translate-x-full group-hover:opacity-100" />
                        <span className="relative flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${isDefaultTheme ? "bg-slate-900" : ""}`}
                            style={!isDefaultTheme ? { backgroundColor: "var(--duo-btn-text, #ffffff)" } : undefined}
                          />
                          {searching
                            ? "Scanning quantum directory…"
                            : "Connect via quantum ID"}
                        </span>
                      </button>
                    </form>

                    <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                      <span>
                        {mode === "home"
                          ? "Next: choose relationship & send a note"
                          : "Next: username reservation & secure pairing"}
                      </span>
                      {mode === "connect" && (
                        <button
                          type="button"
                          onClick={() => setMode("home")}
                          className="text-[10px] font-medium text-cyan-300 hover:text-cyan-200"
                        >
                          Back to console
                        </button>
                      )}
                    </div>

                    {/* Messages & request state */}
                    {/* Tech-giant standard: hide raw error text during offline/routine states */}
                    {searchError && typeof navigator !== "undefined" && navigator.onLine && (
                      <p className="mt-2 text-[11px] text-rose-300/90 font-mono tracking-wide">{searchError}</p>
                    )}
                    {requestSuccess && (
                      <p className="mt-2 text-[11px] text-emerald-300">
                        {requestSuccess}
                      </p>
                    )}
                    {requestError && (
                      <p className="mt-2 text-[11px] text-rose-300">{requestError}</p>
                    )}

                    {/* Found user + categories + note / VIP special card */}
                    {foundUser && !activePeerHandle && (
                      <>
                        {isVipHandle(foundUser.handle) ? (
                          <div className="relative mt-3">
                            {/* Close Button — OUTSIDE founder-vip-aurora so contain:paint can't clip it */}
                            <button
                              type="button"
                              onClick={() => {
                                setMode("home");
                                setFoundUser(null);
                                setSearchError(null);
                              }}
                              className="absolute -top-3 -left-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-red-400/60 bg-slate-900/90 text-red-300 shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-red-300 hover:bg-red-500/10 hover:text-red-200 hover:shadow-red-500/25 active:scale-90"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
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
                            <div className="founder-vip-aurora rounded-2xl border border-red-500/80 bg-slate-950/95 p-[2px] shadow-[0_0_40px_rgba(248,113,113,0.65)]">
                              <div className="founder-vip-aurora-inner founder-vip-shine space-y-3 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 relative overflow-hidden [clip-path:inset(0_round_1rem)] isolation-isolate">
                                <div className="founder-vip-line-full absolute inset-x-0 -top-2 -bottom-2 rounded-2xl"></div>
                                <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-red-400/80 bg-red-600/60 px-2.5 py-0.5 text-[10px] font-semibold text-slate-50">
                                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-red-300 bg-red-500 text-[9px] font-bold">
                                    ✓
                                  </span>
                                  <span className="tracking-wide">@{foundUser.handle}</span>
                                </div>

                                <div className="flex items-start justify-between gap-2 pt-5">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-50">
                                      {foundUser.name || foundUser.email || "@MR_ROHIT"}
                                    </p>
                                    <p className="mt-0.5 text-[11px] font-semibold text-slate-100">
                                      Founder & CEO at Q‑Link
                                    </p>
                                  </div>
                                  <span className="mt-1 rounded-full border border-red-400/80 bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-200">
                                    Elite Founder
                                  </span>
                                </div>

                                <div className="space-y-1 text-[11px] text-slate-200">
                                  <p>
                                    This is a globally recognized **VIP founder ID** on Q‑Link. The Red
                                    Tick is an elite badge reserved for system-level identities and
                                    upcoming premium entrepreneur verification.
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    The Red Tick VIP tier will soon be available for purchase for
                                    selected IDs only, with enhanced visibility and VIP features.
                                  </p>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                    Send feedback request
                                  </p>
                                  <textarea
                                    className="min-h-[60px] w-full resize-none rounded-xl border border-slate-600/70 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none ring-0 transition focus:border-red-400 focus:bg-slate-950 focus:shadow-[0_0_0_1px_rgba(248,113,113,0.6)]"
                                    placeholder="Share your feedback or improvement ideas for Q‑Link…"
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                  />
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <button
                                    type="button"
                                    onClick={handleSendRequest}
                                    disabled={sendingRequest}
                                    className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-red-400 via-rose-500 to-fuchsia-500 px-4 py-2.5 text-sm font-medium text-slate-950 shadow-[0_0_25px_rgba(248,113,113,0.7)] transition hover:shadow-[0_0_40px_rgba(248,113,113,0.9)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition group-hover:translate-x-full group-hover:opacity-100" />
                                    <span className="relative flex items-center gap-2">
                                      <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />
                                      {sendingRequest ? "Sending VIP request…" : "Send request"}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsVipTermsAnimating(true);
                                      setShowVipTerms(true);
                                    }}
                                    className="mt-1 inline-flex items-center justify-center rounded-xl border border-slate-600/70 bg-slate-900/80 px-3 py-1.5 text-[10px] font-medium text-slate-200 hover:border-red-400/70 hover:text-red-200 active:border-red-300 active:bg-red-900/80 active:text-red-50 active:scale-90 transition-all duration-100 sm:mt-0 sm:flex-none"
                                  >
                                    View Verification & Badge Policy
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : foundUser.blue_tick_status === "SAPPHIRE" ? (
                          <div className="relative mt-3">
                            {/* Close Button — OUTSIDE founder-vip-sapphire so contain:paint can't clip it */}
                            <button
                              type="button"
                              onClick={() => {
                                setMode("home");
                                setFoundUser(null);
                                setSearchError(null);
                              }}
                              className="absolute -top-3 -left-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-sky-400/60 bg-slate-900/90 text-sky-300 shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-sky-300 hover:bg-sky-500/10 hover:text-sky-200 hover:shadow-sky-500/25 active:scale-90"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
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
                            <div className="founder-vip-sapphire rounded-2xl border border-sky-500/80 bg-slate-950/95 p-[2px] shadow-[0_0_40px_rgba(14,165,233,0.65)]">
                              <div className="founder-vip-sapphire-inner founder-vip-sapphire-shine space-y-3 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 relative overflow-hidden [clip-path:inset(0_round_1rem)] isolation-isolate">
                                <div className="founder-vip-sapphire-line-full absolute inset-x-0 -top-2 -bottom-2 rounded-2xl"></div>
                                <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-sky-400/80 bg-sky-600/60 px-2.5 py-0.5 text-[10px] font-semibold text-slate-50">
                                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-sky-300 bg-sky-500 text-[9px] font-bold">
                                    ✓
                                  </span>
                                  <span className="tracking-wide">@{foundUser.handle}</span>
                                </div>

                                <div className="flex items-start justify-between gap-2 pt-5">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-50">
                                      {foundUser.name || foundUser.email || "Quantum User"}
                                    </p>
                                    <p className="mt-0.5 text-[11px] font-semibold text-slate-300">
                                      Quantum VIP Member
                                    </p>
                                  </div>
                                  <span className="mt-1 rounded-full border border-sky-400/80 bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-200">
                                    Sapphire VIP
                                  </span>
                                </div>

                                <div className="space-y-1 text-[11px] text-slate-200">
                                  <p>
                                    This is a verified **Sapphire VIP profile** on Q‑Link. Unlocked cosmic high directory sorting and 1.5x permanent Aura score booster.
                                  </p>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                    Relationship categories
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {allCategories.slice(0, 3).map((cat: any) => {
                                      const active = selectedCategories.includes(cat);
                                      return (
                                        <button
                                          key={cat}
                                          type="button"
                                          onClick={() => toggleCategory(cat)}
                                          className={`rounded-full border px-2.5 py-1 text-[11px] transition ${active
                                              ? "border-sky-400/75 bg-sky-500/15 text-sky-200"
                                              : "border-slate-700/60 bg-slate-900/70 text-slate-300 hover:border-sky-400/60 hover:text-sky-200"
                                            }`}
                                        >
                                          {cat}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                    Add note (optional)
                                  </p>
                                  <textarea
                                    className="min-h-[50px] w-full resize-none rounded-xl border border-slate-600/70 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none ring-0 transition focus:border-sky-400 focus:bg-slate-950 focus:shadow-[0_0_0_1px_rgba(56,189,248,0.6)]"
                                    placeholder="Type a secure connection request note..."
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                  />
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <button
                                    type="button"
                                    onClick={handleSendRequest}
                                    disabled={sendingRequest}
                                    className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 px-4 py-2.5 text-sm font-medium text-slate-950 shadow-[0_0_25px_rgba(56,189,248,0.7)] transition hover:shadow-[0_0_40px_rgba(56,189,248,0.9)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition group-hover:translate-x-full group-hover:opacity-100" />
                                    <span className="relative flex items-center gap-2">
                                      <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />
                                      {sendingRequest ? "Sending VIP request…" : "Send request"}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMode("home");
                                      setFoundUser(null);
                                      setSearchError(null);
                                    }}
                                    className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:border-slate-500 hover:bg-slate-800"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 space-y-3 rounded-2xl border border-slate-600/70 bg-slate-900/90 p-3 relative" style={!isDefaultTheme ? { backgroundColor: "var(--duo-surface-card, rgba(15, 23, 42, 0.9))", borderColor: "var(--duo-surface-card-border, rgba(51, 65, 85, 0.7))" } : undefined}>
                            {/* Close Button for Regular User Card */}
                            <button
                              type="button"
                              onClick={() => {
                                setMode("home");
                                setFoundUser(null);
                                setSearchError(null);
                              }}
                              className="absolute -top-2 -left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-400/60 bg-slate-900/90 text-slate-300 shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-cyan-400/70 hover:bg-cyan-500/10 hover:text-cyan-200 hover:shadow-cyan-500/25 active:scale-90 responsive-button text-overflow-fix"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5"
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
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-50">
                                  {foundUser.name ||
                                    foundUser.email ||
                                    "Unknown user"}
                                </p>
                                <p className="truncate text-xs text-cyan-300">
                                  @{foundUser.handle}
                                </p>
                              </div>
                              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                                Quantum match
                              </span>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                Relationship categories
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                {allCategories.map((cat: any) => {
                                  const active = selectedCategories.includes(cat);
                                  return (
                                    <button
                                      key={cat}
                                      type="button"
                                      onClick={() => toggleCategory(cat)}
                                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${active
                                          ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                                          : "border-slate-600/70 bg-slate-900/70 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200"
                                        }`}
                                    >
                                      {cat}
                                    </button>
                                  );
                                })}

                                {/* Custom & Extended Selected Roles Dynamic Luminous Badge */}
                                {selectedCategories
                                  .filter((cat: any) => !allCategories.includes(cat))
                                  .map((customCat: any) => (
                                    <button
                                      key={customCat}
                                      type="button"
                                      onClick={() => toggleCategory(customCat)}
                                      className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/90 bg-fuchsia-500/25 px-3 py-1 text-[11px] font-semibold text-fuchsia-200 shadow-[0_0_15px_rgba(217,70,239,0.4),inset_0_1px_1px_rgba(255,255,255,0.25)] animate-in zoom-in-95 duration-200 hover:bg-fuchsia-500/35 transition-all"
                                      title="Click to remove role"
                                    >
                                      <span className="flex h-1.5 w-1.5 rounded-full bg-fuchsia-300 shadow-[0_0_6px_#f472b6]" />
                                      <span>{customCat}</span>
                                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-fuchsia-400/30 text-[9px] text-white hover:bg-fuchsia-400/60 transition-colors">
                                        ✕
                                      </span>
                                    </button>
                                  ))}

                                <button
                                  type="button"
                                  onClick={() => setShowMoreCategories(true)}
                                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                                    selectedCategories.some((c) => !allCategories.includes(c as string))
                                      ? "border-fuchsia-400/70 bg-fuchsia-500/20 text-fuchsia-200 shadow-[0_0_12px_rgba(217,70,239,0.35)]"
                                      : "border-slate-600/70 bg-slate-900/70 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200"
                                  }`}
                                >
                                  <span>More</span>
                                  {selectedCategories.filter((c: any) => !allCategories.includes(c as string)).length > 0 && (
                                    <span className="ml-1 rounded-full bg-fuchsia-500 px-1.5 py-0.2 text-[9.5px] font-bold text-white shadow-[0_0_6px_#d946ef]">
                                      {selectedCategories.filter((c: any) => !allCategories.includes(c as string)).length}
                                    </span>
                                  )}
                                </button>
                              </div>
                              <p className="text-[10px] text-slate-500">
                                You can select up to two categories.
                              </p>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                Send a note
                              </p>
                              <textarea
                                className="min-h-[60px] w-full resize-none rounded-xl border border-slate-600/70 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none ring-0 transition focus:border-cyan-400 focus:bg-slate-950 focus:shadow-[0_0_0_1px_rgba(34,211,238,0.6)]"
                                placeholder="Tell them why you want to connect…"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                              />
                            </div>

                            <button
                              type="button"
                              onClick={handleSendRequest}
                              disabled={sendingRequest}
                              className={`group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                isDefaultTheme
                                  ? "bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-400 text-slate-950 shadow-[0_0_25px_rgba(56,189,248,0.65)] hover:shadow-[0_0_40px_rgba(56,189,248,0.85)]"
                                  : "hover:opacity-95"
                              }`}
                              style={!isDefaultTheme ? {
                                background: "var(--duo-gradient)",
                                color: "var(--duo-btn-text, #ffffff)",
                                boxShadow: "var(--duo-btn-shadow)",
                              } : undefined}
                            >
                              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition group-hover:translate-x-full group-hover:opacity-100" />
                              <span className="relative flex items-center gap-2">
                                <span className={`h-1.5 w-1.5 rounded-full ${isDefaultTheme ? "bg-slate-900" : ""}`} style={!isDefaultTheme ? { backgroundColor: "var(--duo-btn-text, #ffffff)" } : undefined} />
                                {sendingRequest
                                  ? "Sending request…"
                                  : "Send quantum request"}
                              </span>
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Chat view */}
                {(!foundUser || Boolean(activePeerHandle)) && (
                  <div
                    className={
                      "glass-panel flex flex-col gap-3 text-xs text-slate-300 relative overflow-y-hidden scrollbar-hide transition-all duration-300 ease-out " + (isQAIOpen ? "sm:pr-[360px] " : "") +
                      (isChatExpanded
                        ? "flex-1 min-h-0 mt-0 sm:mt-2 rounded-none sm:rounded-2xl border-none sm:border liquid-glass-surface p-2 sm:p-4 " +
                        (highlightChatPanel ? "glow-pulse border-cyan-400/80" : "border-slate-600/70")
                        : "flex-1 min-h-0 mt-4 -mx-5 -mb-5 p-4 rounded-t-2xl rounded-b-2xl border-t liquid-glass-surface " +
                        (highlightChatPanel
                          ? "glow-pulse border-cyan-400/80 border-x-0 border-b-0"
                          : "border-slate-600/70 border-x-0 border-b-0"))
                    }
                    style={{
                      minHeight: isChatExpanded ? '100%' : '400px',
                      maxHeight: isChatExpanded ? '100%' : '85vh',
                      ...(!isDefaultTheme ? {
                        backgroundColor: "var(--duo-surface-card, rgba(15, 23, 42, 0.8))",
                        borderColor: highlightChatPanel ? undefined : "var(--duo-surface-card-border, rgba(51, 65, 85, 0.7))",
                      } : {})
                    }}
                  >
                    {/* Fixed header at top of chat card */}
                    <div
                      style={!isDefaultTheme ? { backgroundColor: "var(--duo-surface-card, rgba(15, 23, 42, 0.95))", borderColor: (peerOnline || peerTyping) ? undefined : "var(--duo-surface-card-border-subtle, rgba(51, 65, 85, 0.6))" } : undefined}
                      className={
                        "flex items-center justify-between gap-2 border-b liquid-glass-header pb-1 px-1 rounded-t-xl " +
                        (peerOnline || peerTyping
                          ? "border-emerald-400/80 shadow-[0_0_18px_rgba(16,185,129,0.45)]"
                          : "border-slate-700/60")
                      }
                    >
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {!activePeerHandle && "Quantum tunnel preview"}
                        {activePeerHandle && peerTyping && (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <span>@{activePeerHandle} is typing</span>
                            <span className="flex gap-0.5">
                              <span className="h-1 w-1 rounded-full bg-emerald-300 animate-pulse" />
                              <span className="h-1 w-1 rounded-full bg-emerald-300 animate-pulse delay-150" />
                              <span className="h-1 w-1 rounded-full bg-emerald-300 animate-pulse delay-300" />
                            </span>
                          </span>
                        )}
                        {activePeerHandle && !peerTyping && peerOnline && (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>@{activePeerHandle} · Online</span>
                          </span>
                        )}
                        {activePeerHandle &&
                          !peerTyping &&
                          !peerOnline &&
                          showOfflineTransitionName && (
                            <span className="text-slate-400">{`Chat with @${activePeerHandle}`}</span>
                          )}
                        {activePeerHandle &&
                          !peerTyping &&
                          !peerOnline &&
                          !showOfflineTransitionName &&
                          peerLastSeen && (
                            <span className="inline-flex items-center gap-1 text-slate-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                              <span>
                                Last online at {formatLastOnlineTime(peerLastSeen)}
                              </span>
                            </span>
                          )}
                        {activePeerHandle &&
                          !peerTyping &&
                          !peerOnline &&
                          !showOfflineTransitionName &&
                          !peerLastSeen && (
                            <span className="text-slate-400">{`Chat with @${activePeerHandle}`}</span>
                          )}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          id="chat-toggle-full-btn"
                          data-tour="full-chat"
                          type="button"
                          onClick={toggleChatFull}
                          className={
                            "rounded-full border bg-slate-900 px-2 py-0.5 text-[10px] text-slate-200 hover:border-cyan-400/70 hover:text-cyan-200 fullchat-toggle " +
                            (highlightFullChat || (activePeerHandle && !isChatExpanded)
                              ? "glow-pulse border-cyan-400/80 shadow-[0_0_10px_rgba(34,211,238,0.4)]"
                              : "border-slate-600/70 ") +
                            (isChatExpanded ? "fullchat-x-spotlight" : "")
                          }
                          title={isChatExpanded ? "Minimize chat" : "Expand to full chat"}
                        >
                          {isChatExpanded ? (
                            <span className="fullchat-x-icon inline-flex items-center justify-center font-semibold text-[11px] leading-none">
                              ×
                            </span>
                          ) : (
                            "Full chat"
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Scrollable middle: errors + messages + pending preview at bottom */}
                    <div
                      ref={chatScrollRef}
                      onScroll={handleChatContainerScroll}
                      className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 scrollbar-hide apple-smooth-scroll tech-giant-scroll-container bg-[#080d19]/95 rounded-xl p-2"
                      style={{
                        overflowAnchor: 'none',
                        scrollBehavior: 'auto',
                        overscrollBehavior: 'contain',
                        WebkitOverflowScrolling: 'touch',
                      }}
                    >
                      {/* Tech-giant standard: no raw red text inside conversation stream */}

                      <div className="space-y-2">
                        {chatLoading && (
                          <QuantumChatHistorySkeleton peerHandle={activePeerHandle} />
                        )}

                        {!chatLoading && chatMessages.length === 0 && !activePeerHandle && (
                          <div className="space-y-2">
                            <div className="flex justify-start">
                              <div className="rounded-2xl rounded-bl-sm bg-slate-800/90 px-3 py-2 text-slate-100 shadow-sm">
                                <p>
                                  Welcome to Q-link. Once your request is accepted,
                                  this panel becomes your live chat.
                                </p>
                              </div>
                            </div>
                            <div className="flex justify-end">
                              <div
                                className={`rounded-2xl rounded-br-sm px-3 py-2 transition-all duration-500 ${
                                  isDefaultTheme
                                    ? "bg-gradient-to-r from-cyan-400/90 to-sky-500/90 text-slate-950 shadow-[0_0_18px_rgba(56,189,248,0.7)]"
                                    : "shadow-md"
                                }`}
                                style={!isDefaultTheme ? {
                                  background: "var(--duo-bubble-bg, var(--duo-gradient))",
                                  boxShadow: "var(--duo-glow, 0 0 18px rgba(56,189,248,0.7))",
                                  color: "var(--duo-bubble-text, #ffffff)",
                                } : undefined}
                              >
                                <p>
                                  For now, start by sending a connection request
                                  with your chosen categories.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {!chatLoading && chatMessages.length === 0 && activePeerHandle && (
                          <p className="text-[11px] text-slate-500">
                            No messages yet. Say hi to @{activePeerHandle}.
                          </p>
                        )}

                        {!chatLoading && chatMessages.map((m: any, msgIdx: number) => {
                          const isMe = Boolean(
                            m.id.startsWith("temp-") ||
                            m.senderId === "me" ||
                            (meId && m.senderId === meId) ||
                            (myId && m.senderId === myId) ||
                            ((effectiveUser as any)?.id && m.senderId === (effectiveUser as any).id)
                          );
                          const prevMsg = msgIdx > 0 ? chatMessages[msgIdx - 1] : null;
                          const showDateSep = !prevMsg || !isSameDay(prevMsg.createdAt, m.createdAt);

                          const attachments = (m as any).attachments as
                            | {
                              id: string;
                              kind: string;
                              bucket: string;
                              objectKey: string;
                              originalName: string;
                              mimeType: string;
                              sizeBytes: string;
                            }[]
                            | undefined;

                          const filesBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
                          const videosBase =
                            process.env.NEXT_PUBLIC_SUPABASE_VIDEOS_URL || filesBase;

                          const makePublicUrl = (
                            bucket: string,
                            objectKey: string,
                            kind: string,
                            id?: string,
                          ) => {
                            if (bucket === "local" || objectKey?.startsWith("/uploads/")) {
                              return objectKey;
                            }
                            if (bucket === "database" || objectKey?.startsWith("data:")) {
                              if (kind === "video") {
                                return id ? `/api/media/stream?id=${encodeURIComponent(id)}` : objectKey;
                              }
                              return objectKey;
                            }
                            const base = kind === "video" ? videosBase : filesBase;
                            if (!base) {
                              return id ? `/api/media/stream?id=${encodeURIComponent(id)}` : "";
                            }
                            return `${base}/storage/v1/object/public/${bucket}/${objectKey}`;
                          };

                          // Always hide the noisy "[FILE attachment]" / "[VIDEO attachment]"
                          // marker text from the visible message content. The raw content is
                          // still available for logic (e.g. detecting auto-deleted attachments).
                          const displayContent = m.content.replace(
                            /^\[(FILE|VIDEO) attachment\]\s*/i,
                            "",
                          );

                          const isSelected = selectedMessageIds.has(m.id);
                          const isHighlighted = highlightedMessageId === m.id;

                          return (
                            <React.Fragment key={m.id}>
                              {/* ── Date Separator ──────────────────────────────── */}
                              {showDateSep && (
                                <div className="flex items-center gap-3 py-3 select-none">
                                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
                                  <span className="px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-950/20 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-500/80 font-mono shadow-[0_0_10px_rgba(6,182,212,0.15)] backdrop-blur-sm">
                                    {formatDateLabel(m.createdAt)}
                                  </span>
                                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
                                </div>
                              )}
                              {/* ── Message Row ─────────────────────────────────── */}
                              <div
                                data-message-bubble
                                data-message-id={m.id}
                                data-message-isme={String(!!isMe)}
                                data-message-content={m.content}
                                className="flex items-center w-full transition-all duration-300 ease-out"
                              >
                                {/* Glowing Checkbox */}
                                <div
                                  className="flex items-center justify-center transition-all duration-300 ease-out overflow-hidden"
                                  style={{
                                    width: isSelectionMode ? "28px" : "0px",
                                    opacity: isSelectionMode ? 1 : 0,
                                    marginRight: isSelectionMode ? "8px" : "0px",
                                  }}
                                >
                                  <div className={`h-5 w-5 rounded-full border flex items-center justify-center transition-all duration-200 cursor-pointer shrink-0 ${isSelected
                                      ? "border-cyan-400 bg-cyan-400 text-slate-950 shadow-[0_0_12px_#22d3ee]"
                                      : "border-slate-600 bg-slate-950/40 hover:border-cyan-500/50"
                                    }`}>
                                    {isSelected && (
                                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                </div>

                                {/* Bubble Alignments */}
                                <div className={`flex-1 flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                                  {(() => {
                                    const socialEmbedInfo = extractSocialMediaEmbedInfo(displayContent);
                                    const hasMedia = Boolean((attachments && attachments.length > 0) || socialEmbedInfo);

                                    // Check if message content is exclusively the social media URL
                                    const textWithoutUrls = displayContent ? displayContent.replace(/(https?:\/\/[^\s]+)/gi, "").trim() : "";
                                    const isSocialUrlOnly = Boolean(socialEmbedInfo && textWithoutUrls.length === 0);

                                    const isFilenameOnly = Boolean(
                                      attachments &&
                                      attachments.length > 0 &&
                                      attachments.some(
                                        (att) =>
                                          att.originalName.trim().toLowerCase() === displayContent.trim().toLowerCase() ||
                                          displayContent.trim() === `[IMAGE attachment]` ||
                                          displayContent.trim() === `[FILE attachment]` ||
                                          displayContent.trim() === `[VIDEO attachment]`
                                      )
                                    );
                                    const shouldShowCaption = Boolean(displayContent && !isFilenameOnly && !isSocialUrlOnly);
                                    const isImageOnlyAttachment = Boolean(
                                      attachments &&
                                      attachments.length > 0 &&
                                      attachments.every((a: any) =>
                                        a.kind === "image" ||
                                        a.mimeType?.startsWith("image/") ||
                                        /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(a.originalName)
                                      ) &&
                                      !shouldShowCaption
                                    );

                                    return (
                                      <React.Fragment>
                                      <div
                                        data-message-card
                                        style={{ WebkitTouchCallout: "none" }}
                                        title="Right-click for options"
                                        className={
                                          hasMedia
                                            ? `${
                                                (socialEmbedInfo && isSocialUrlOnly) || isImageOnlyAttachment
                                                  ? "w-fit max-w-[95%] sm:max-w-[420px] p-0 bg-transparent border-0 shadow-none"
                                                  : socialEmbedInfo
                                                    ? "w-fit max-w-[95%] sm:max-w-[420px] p-2 rounded-2xl sm:rounded-3xl backdrop-blur-2xl bg-white/[0.05] dark:bg-slate-950/50 border border-white/20 dark:border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
                                                    : "w-fit max-w-[94%] sm:max-w-[85%] md:max-w-[460px] p-2 sm:p-2.5 rounded-2xl sm:rounded-3xl backdrop-blur-2xl bg-white/[0.05] dark:bg-slate-950/50 border border-white/20 dark:border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
                                              } ${
                                                isMe ? "rounded-br-sm" : "rounded-bl-sm"
                                              } text-white select-none cursor-pointer transition-all duration-300 ${
                                                isHighlighted
                                                  ? "ring-2 ring-cyan-400/90 shadow-[0_0_30px_rgba(6,182,212,0.5)] scale-[1.02]"
                                                  : isSelected
                                                    ? "ring-2 ring-cyan-400/90 shadow-lg scale-[0.99]"
                                                    : "hover:border-white/30"
                                              }`
                                            : isMe
                                              ? `${socialEmbedInfo ? "w-fit max-w-[95%] sm:max-w-[85%] md:max-w-[805px]" : "max-w-[85%] sm:max-w-[75%]"} rounded-2xl rounded-br-sm bg-gradient-to-r from-cyan-400/90 to-sky-500/90 px-2.5 py-1 sm:px-3 sm:py-1.5 text-slate-950 select-none cursor-pointer transition-all duration-300 ${isHighlighted
                                                  ? "shadow-[0_0_30px_#22d3ee,0_0_15px_#38bdf8] ring-2 ring-cyan-200 ring-offset-2 ring-offset-slate-950 scale-[1.03]"
                                                  : isSelected
                                                    ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950 scale-[0.98] shadow-[0_0_18px_rgba(56,189,248,0.7)]"
                                                    : "shadow-[0_0_12px_rgba(56,189,248,0.45)]"
                                                }`
                                              : `${socialEmbedInfo ? "w-fit max-w-[95%] sm:max-w-[85%] md:max-w-[805px]" : "max-w-[85%] sm:max-w-[75%]"} rounded-2xl rounded-bl-sm bg-slate-800/90 px-2.5 py-1 sm:px-3 sm:py-1.5 text-slate-100 select-none cursor-pointer transition-all duration-300 ${isHighlighted
                                                  ? "bg-slate-700/95 ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.6)] scale-[1.03]"
                                                  : isSelected
                                                    ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950 scale-[0.98] shadow-md"
                                                    : "shadow-sm"
                                                }`
                                        }
                                      >
                                        {/* Thin WhatsApp-Style Content Layout */}
                                        {!hasMedia ? (
                                          <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-0.5">
                                            {displayContent && (
                                              <span className="break-words flex-1 min-w-[20px] text-[13px] sm:text-[14px] leading-snug">
                                                {m.isEncrypted && (
                                                  <span
                                                    title="End-to-End Encrypted"
                                                    className={`inline-flex items-center text-[10px] mr-1 select-none ${isMe ? "text-slate-950/60" : "text-cyan-400/80"}`}
                                                  >
                                                    🔒
                                                  </span>
                                                )}
                                                {editingMessage?.id === m.id ? (
                                                  <span className="italic text-cyan-300 animate-pulse flex items-center gap-1.5 py-0.5">
                                                    <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                                                    <span className="text-[11px] font-semibold">Editing in composer...</span>
                                                  </span>
                                                ) : (
                                                  <span>{renderMessageText(displayContent, !!isMe)}</span>
                                                )}
                                              </span>
                                            )}

                                            {/* Slim Inline Timestamp (WhatsApp-Style) */}
                                            {m.createdAt && (
                                              <span
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setDetailModalMessage(m);
                                                }}
                                                title="Click or right-click for Message Details"
                                                className={`inline-flex items-center gap-1 text-[9px] font-mono tracking-tight select-none shrink-0 self-end -mb-0.5 ml-auto hover:opacity-100 transition ${
                                                  isMe ? "text-slate-950/70" : "text-slate-400/80"
                                                }`}
                                              >
                                                {(m as any).isEdited && (
                                                  <span className="italic text-[8px] opacity-80" title={(m as any).editedAt ? `Edited: ${formatMsgTime((m as any).editedAt)}` : "Edited"}>
                                                    (edited)
                                                  </span>
                                                )}
                                                <span>{formatMsgTime(m.createdAt)}</span>
                                                <MessageStatusTicks status={(m as any).status} isMe={!!isMe} onRetry={() => handleRetryMessage && handleRetryMessage(m.id)} />
                                              </span>
                                            )}
                                          </div>
                                        ) : (
                                          <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} w-fit max-w-full`}>
                                            {shouldShowCaption && (
                                              <p className="break-words flex items-center flex-wrap gap-1 text-[13px] sm:text-[14px] leading-snug mb-1.5 px-0.5 text-white/95 font-medium">
                                                {m.isEncrypted && (
                                                  <span
                                                    title="End-to-End Encrypted"
                                                    className="inline-flex items-center text-[10px] mr-1 select-none text-cyan-400/80"
                                                  >
                                                    🔒
                                                  </span>
                                                )}
                                                <span>{renderMessageText(socialEmbedInfo ? textWithoutUrls : displayContent, false)}</span>
                                              </p>
                                            )}

                                    {/* Social Media Inline Video & Reel Embed Preview (YouTube, Instagram, X, Facebook) */}
                                    {(() => {
                                      const socialInfo = socialEmbedInfo;
                                      if (!socialInfo) return null;
                                      return (
                                        <UniversalSocialEmbedPreview
                                          info={socialInfo}
                                          isMe={!!isMe}
                                        />
                                      );
                                    })()}

                                    {/* Attachments, if any */}
                                    {attachments && attachments.length > 0 && (() => {
                                      const uniqueAttachments = Array.from(
                                        new Map(attachments.map((att: any) => [att.objectKey || att.id, att])).values()
                                      );
                                      return (
                                        <div className="mt-0.5 space-y-2">
                                          {uniqueAttachments.map((a) => {
                                          const isImg =
                                            a.kind === "image" ||
                                            a.mimeType?.startsWith("image/") ||
                                            /\.(jpe?g|png|webp|gif|svg|bmp)$/i.test(a.originalName);

                                          const isVid =
                                            a.kind === "video" ||
                                            a.mimeType?.startsWith("video/") ||
                                            /\.(mp4|webm|mov|mkv|avi)$/i.test(a.originalName);

                                          const effectiveKind = isVid ? "video" : isImg ? "image" : a.kind;
                                          const url = makePublicUrl(a.bucket, a.objectKey, effectiveKind, a.id);

                                          if (!url) {
                                            return (
                                              <div key={a.id} className="text-[11px] text-slate-400">
                                                Attachment: {a.originalName}
                                              </div>
                                            );
                                          }

                                          if (isImg) {
                                            return (
                                              <div key={a.id} className="relative group/img overflow-hidden rounded-2xl sm:rounded-3xl border border-white/20 dark:border-white/15 shadow-[0_12px_36px_rgba(0,0,0,0.65)] transition-all duration-300 w-fit max-w-full">
                                                <div
                                                  role="button"
                                                  tabIndex={0}
                                                  onClick={() => {
                                                    setLightboxImageUrl(url);
                                                    setLightboxImageName(a.originalName);
                                                  }}
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                      setLightboxImageUrl(url);
                                                      setLightboxImageName(a.originalName);
                                                    }
                                                  }}
                                                  className="block focus:outline-none focus:ring-2 focus:ring-cyan-400/80 transition-transform duration-300 group-hover/img:scale-[1.01] cursor-zoom-in relative"
                                                  title="Click to view & zoom image"
                                                >
                                                  <img
                                                    src={url}
                                                    alt={a.originalName}
                                                    loading="lazy"
                                                    decoding="async"
                                                    className="max-h-[360px] sm:max-h-[420px] max-w-[280px] sm:max-w-[340px] w-auto h-auto object-contain block select-none rounded-2xl sm:rounded-3xl"
                                                  />
                                          
                                                  {/* Subtle optical specular gradient overlay */}
                                                  <div className="pointer-events-none absolute inset-0 rounded-2xl sm:rounded-3xl bg-gradient-to-t from-black/50 via-transparent to-black/15 opacity-70" />
                                                </div>
                                          
                                                {/* Floating Apple Optical Glass Action Toolbar (top-right) */}
                                                <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 sm:opacity-0 group-hover/img:opacity-100 transition-all duration-200 z-20">
                                                  <div className="relative group/img-btn flex items-center justify-center">
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setLightboxImageUrl(url);
                                                        setLightboxImageName(a.originalName);
                                                      }}
                                                      aria-label="Zoom image"
                                                      title="Zoom"
                                                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-slate-950/80 text-cyan-300 shadow-lg backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:bg-slate-900 active:scale-95 cursor-pointer"
                                                    >
                                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                                                      </svg>
                                                    </button>
                                                    <div className="pointer-events-none absolute bottom-full mb-1 right-0 z-30 opacity-0 group-hover/img-btn:opacity-100 transition-all duration-150 ease-out whitespace-nowrap">
                                                      <div className="rounded-full border border-white/15 bg-black/90 px-2 py-0.5 text-[9px] font-medium tracking-tight text-white/90 shadow-xl backdrop-blur-xl">
                                                        Zoom
                                                      </div>
                                                    </div>
                                                  </div>
                                          
                                                  <div className="relative group/img-btn flex items-center justify-center">
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDownloadAttachment(a.id, a.originalName);
                                                      }}
                                                      disabled={downloadingAttachmentId === a.id}
                                                      aria-label="Download image"
                                                      title="Download"
                                                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-slate-950/80 text-cyan-300 shadow-lg backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:bg-slate-900 active:scale-95 cursor-pointer disabled:opacity-50"
                                                    >
                                                      {downloadingAttachmentId === a.id ? (
                                                        <svg className="h-3.5 w-3.5 animate-spin text-cyan-300" viewBox="0 0 24 24" fill="none">
                                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                                        </svg>
                                                      ) : (
                                                        <svg className="h-3.5 w-3.5 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                          <polyline points="7 10 12 15 17 10" />
                                                          <line x1="12" y1="15" x2="12" y2="3" />
                                                        </svg>
                                                      )}
                                                    </button>
                                                    <div className="pointer-events-none absolute bottom-full mb-1 right-0 z-30 opacity-0 group-hover/img-btn:opacity-100 transition-all duration-150 ease-out whitespace-nowrap">
                                                      <div className="rounded-full border border-white/15 bg-black/90 px-2 py-0.5 text-[9px] font-medium tracking-tight text-white/90 shadow-xl backdrop-blur-xl">
                                                        Download
                                                      </div>
                                                    </div>
                                                  </div>
                                          
                                                  {isMe && (
                                                    <div className="relative group/img-btn flex items-center justify-center">
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleDeleteMessage(m.id);
                                                        }}
                                                        aria-label="Delete image"
                                                        title="Delete"
                                                        className="flex h-7 w-7 items-center justify-center rounded-full border border-rose-500/30 bg-slate-950/80 text-rose-300 shadow-lg backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:bg-rose-950/80 active:scale-95 cursor-pointer"
                                                      >
                                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                      </button>
                                                      <div className="pointer-events-none absolute bottom-full mb-1 right-0 z-30 opacity-0 group-hover/img-btn:opacity-100 transition-all duration-150 ease-out whitespace-nowrap">
                                                        <div className="rounded-full border border-rose-500/30 bg-black/90 px-2 py-0.5 text-[9px] font-medium tracking-tight text-rose-200 shadow-xl backdrop-blur-xl">
                                                          Delete
                                                        </div>
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                          
                                                {/* WhatsApp/Telegram Floating Timestamp Pill (bottom-right) */}
                                                {m.createdAt && (
                                                  <div
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setDetailModalMessage(m);
                                                    }}
                                                    title="Click for Message Details"
                                                    className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-2.5 py-0.5 text-[9.5px] font-mono tracking-tight text-white/90 shadow-md border border-white/10 select-none cursor-pointer hover:bg-black/80 transition z-20"
                                                  >
                                                    {(m as any).isEdited && (
                                                      <span className="italic text-[8px] opacity-80" title={(m as any).editedAt ? `Edited: ${formatMsgTime((m as any).editedAt)}` : "Edited"}>
                                                        (edited)
                                                      </span>
                                                    )}
                                                    <span>{formatMsgTime(m.createdAt)}</span>
                                                    <MessageStatusTicks status={(m as any).status} isMe={!!isMe} onRetry={() => handleRetryMessage && handleRetryMessage(m.id)} />
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }

                                          if (isVid) {
                                            return (
                                              <div key={a.id} className="space-y-1.5">
                                                <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-white/15 dark:border-white/10 bg-black/40 backdrop-blur-md">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setLightboxVideoUrl(url);
                                                      setLightboxVideoName(a.originalName);
                                                    }}
                                                    className="block w-full focus:outline-none focus:ring-2 focus:ring-cyan-400/80"
                                                  >
                                                    <QuantumVideoPlayerComponent
                                                      src={url}
                                                      className="max-h-64 w-full rounded-xl"
                                                    />
                                                  </button>
                                                </div>
                                                <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
                                                  <span className="truncate text-[10.5px] font-mono text-white/50 tracking-tight select-none">
                                                    {a.originalName}
                                                  </span>
                                                  <div className="flex items-center gap-1.5 shrink-0">
                                                    {isMe && (
                                                      <AttachmentActionButton
                                                        onClick={() => handleDeleteMessage(m.id)}
                                                        ariaLabel="Delete video"
                                                        tooltip="Delete video"
                                                        variant="danger"
                                                        icon={
                                                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                          </svg>
                                                        }
                                                      />
                                                    )}
                                                    <AttachmentActionButton
                                                      onClick={() => handleDownloadAttachment(a.id, a.originalName)}
                                                      ariaLabel="Download video"
                                                      tooltip={downloadingAttachmentId === a.id ? "Downloading…" : "Download video"}
                                                      variant="cyan"
                                                      disabled={downloadingAttachmentId === a.id}
                                                      icon={
                                                        downloadingAttachmentId === a.id ? (
                                                          <svg className="h-3.5 w-3.5 animate-spin text-cyan-300" viewBox="0 0 24 24" fill="none">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                                          </svg>
                                                        ) : (
                                                          <svg className="h-3.5 w-3.5 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                            <polyline points="7 10 12 15 17 10" />
                                                            <line x1="12" y1="15" x2="12" y2="3" />
                                                          </svg>
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          }

                                          if (a.mimeType?.startsWith("audio/") || a.originalName.endsWith(".webm") || a.originalName.endsWith(".ogg") || a.originalName.endsWith(".mp3") || a.originalName.endsWith(".wav")) {
                                            return (
                                              <div key={a.id} className="space-y-1 my-1">
                                                <div className="rounded-xl border border-white/15 bg-white/[0.06] dark:bg-slate-950/60 p-2.5 shadow-sm backdrop-blur-md flex flex-col gap-1.5 min-w-[200px] sm:min-w-[240px]">
                                                  <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-md">
                                                        <svg className="h-3 w-3 text-slate-950" fill="currentColor" viewBox="0 0 24 24">
                                                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                                                        </svg>
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                        <p className="text-[9px] font-bold text-cyan-300 uppercase tracking-wider truncate">
                                                          Voice Message
                                                        </p>
                                                        <p className="text-[8px] text-white/60 truncate max-w-[100px] sm:max-w-[130px]">
                                                          {a.originalName}
                                                        </p>
                                                      </div>
                                                    </div>

                                                    {/* Quiet Luxury Action Buttons */}
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                      {isMe && (
                                                        <AttachmentActionButton
                                                          onClick={() => handleDeleteMessage(m.id)}
                                                          ariaLabel="Delete voice message"
                                                          tooltip="Delete voice note"
                                                          variant="danger"
                                                          icon={
                                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                          }
                                                          className="!h-6 !w-6"
                                                        />
                                                      )}
                                                      <AttachmentActionButton
                                                        onClick={() => handleDownloadAttachment(a.id, a.originalName)}
                                                        ariaLabel="Download Voice Note"
                                                        tooltip={downloadingAttachmentId === a.id ? "Downloading…" : "Download audio"}
                                                        variant="cyan"
                                                        disabled={downloadingAttachmentId === a.id}
                                                        icon={
                                                          downloadingAttachmentId === a.id ? (
                                                            <svg className="h-3 w-3 animate-spin text-cyan-300" viewBox="0 0 24 24" fill="none">
                                                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                                            </svg>
                                                          ) : (
                                                            <svg className="h-3 w-3 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                              <polyline points="7 10 12 15 17 10" />
                                                              <line x1="12" y1="15" x2="12" y2="3" />
                                                            </svg>
                                                          )
                                                        }
                                                        className="!h-6 !w-6"
                                                      />
                                                    </div>
                                                  </div>
                                                  <CustomAudioPlayer src={url} />
                                                </div>
                                              </div>
                                            );
                                          }

                                          // Default: generic file attachment card
                                          return (
                                            <div
                                              key={a.id}
                                              className="group/file flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.05] dark:bg-slate-950/60 p-2.5 backdrop-blur-xl shadow-sm transition hover:border-white/25"
                                            >
                                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-gradient-to-br from-cyan-500/15 to-blue-500/15 text-cyan-300 shadow-sm backdrop-blur-md">
                                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                    <polyline points="14 2 14 8 20 8" />
                                                    <line x1="16" y1="13" x2="8" y2="13" />
                                                    <line x1="16" y1="17" x2="8" y2="17" />
                                                  </svg>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                  <p className="truncate text-[12px] font-medium text-white/90">
                                                    {a.originalName}
                                                  </p>
                                                  <p className="text-[10px] text-white/40 tracking-tight">
                                                    Attachment
                                                  </p>
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-1.5 shrink-0">
                                                {isMe && (
                                                  <AttachmentActionButton
                                                    onClick={() => handleDeleteMessage(m.id)}
                                                    ariaLabel="Delete file"
                                                    tooltip="Delete file"
                                                    variant="danger"
                                                    icon={
                                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                      </svg>
                                                    }
                                                  />
                                                )}
                                                <AttachmentActionButton
                                                  onClick={() => handleDownloadAttachment(a.id, a.originalName)}
                                                  ariaLabel="Download file"
                                                  tooltip={downloadingAttachmentId === a.id ? "Downloading…" : "Download file"}
                                                  variant="cyan"
                                                  disabled={downloadingAttachmentId === a.id}
                                                  icon={
                                                    downloadingAttachmentId === a.id ? (
                                                      <svg className="h-3.5 w-3.5 animate-spin text-cyan-300" viewBox="0 0 24 24" fill="none">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                                      </svg>
                                                    ) : (
                                                      <svg className="h-3.5 w-3.5 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                        <polyline points="7 10 12 15 17 10" />
                                                        <line x1="12" y1="15" x2="12" y2="3" />
                                                      </svg>
                                                    )
                                                  }
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}

                                    {/* If this message used to represent a file/video attachment
                                   but the attachment metadata is now gone (e.g. auto-deleted
                                   after 24h), show an unavailable placeholder instead of
                                   leaving nothing. */}
                                    {!attachments?.length &&
                                      /\[(FILE|VIDEO) attachment\]/i.test(m.content) &&
                                      m.createdAt &&
                                      Date.now() - new Date(m.createdAt).getTime() > 24 * 60 * 60 * 1000 && (
                                      <div className="mt-1 flex items-center justify-center rounded-xl border border-dashed border-white/20 bg-black/40 px-3 py-2 text-center text-[11px] text-white/60">
                                        <div>
                                          <p className="font-medium text-white/80">Attachment unavailable</p>
                                          <p className="mt-0.5 text-[10px] text-white/40">
                                            This file or video was removed automatically after 24 hours.
                                            Ask the sender to re-send it if you still need it.
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                            {/* Timestamp below Media (only shown if message has media) */}
                                            {hasMedia && !isImageOnlyAttachment && m.createdAt && (
                                              <div className="mt-1.5 flex items-center justify-end px-1">
                                                <span
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDetailModalMessage(m);
                                                  }}
                                                  title="Click or right-click for Message Details"
                                                  className="inline-flex items-center gap-1.5 text-[9.5px] font-mono tracking-tight select-none cursor-pointer text-white/60 hover:text-white/95 transition"
                                                >
                                                  {(m as any).isEdited && (
                                                    <span className="italic text-[8.5px] opacity-80" title={(m as any).editedAt ? `Edited: ${formatMsgTime((m as any).editedAt)}` : "Edited"}>
                                                      (edited)
                                                    </span>
                                                  )}
                                                  <span>{formatMsgTime(m.createdAt)}</span>
                                                  <MessageStatusTicks status={(m as any).status} isMe={!!isMe} onRetry={() => handleRetryMessage && handleRetryMessage(m.id)} />
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Floating Message Reaction Badge (WhatsApp/Telegram/Apple style) */}
                                      {m.reactions && m.reactions.length > 0 && (() => {
                                        const uniqueEmojis = Array.from(new Set(m.reactions.map((r: any) => r.emoji))).slice(0, 3);
                                        const totalCount = m.reactions.length;
                                        const hasMyReaction = m.reactions.some(
                                          (r: any) => r.userId === meId || r.userId === myId
                                        );

                                        return (
                                          <div
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (onOpenReactionModal) {
                                                onOpenReactionModal(m);
                                              } else {
                                                setDetailModalMessage(m);
                                              }
                                            }}
                                            title={
                                              m.reactions
                                                .map((r: any) => `${r.userName || r.userHandle}: ${r.emoji}`)
                                                .join(", ") + " · Click to view"
                                            }
                                            className={`-mt-2.5 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold backdrop-blur-xl transition-all duration-200 cursor-pointer shadow-md select-none hover:scale-110 active:scale-95 ${
                                              isMe ? "self-end mr-1.5" : "self-start ml-1.5"
                                            } ${
                                              hasMyReaction
                                                ? "bg-[#09111c]/95 border border-cyan-400/60 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                                                : "bg-[#0b1320]/90 border border-white/20 text-slate-200 hover:border-white/40"
                                            }`}
                                          >
                                            <span className="flex items-center tracking-tight">
                                              {uniqueEmojis.map((emoji: any, i: number) => (
                                                <span key={i} className="text-xs leading-none">
                                                  {emoji}
                                                </span>
                                              ))}
                                            </span>
                                            {totalCount > 1 && (
                                              <span className="text-[10px] font-mono font-bold leading-none opacity-90">
                                                {totalCount}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()}
                                      </React.Fragment>
                                    );
                                  })()}
                                </div>
                              </div>
                            </React.Fragment>
                          );
                        })}

                        {/* ── WhatsApp-Style Live Typing Indicator Bubble ──────── */}
                        {peerTyping && activePeerHandle && (
                          <div
                            data-peer-typing-bubble
                            className="flex items-center justify-start w-full transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-2 pt-1 pb-1 select-none"
                          >
                            <div
                              className="rounded-2xl rounded-bl-sm bg-slate-800/90 border border-slate-700/60 shadow-[0_2px_12px_rgba(0,0,0,0.4),0_0_15px_rgba(34,211,238,0.12)] backdrop-blur-md px-3.5 py-2.5 flex items-center gap-1.5 transition-all duration-300"
                              style={!isDefaultTheme ? {
                                backgroundColor: "var(--duo-surface-card-inner, rgba(30, 41, 59, 0.9))",
                                borderColor: "var(--duo-surface-card-border-subtle, rgba(51, 65, 85, 0.6))",
                              } : undefined}
                              title={`@${activePeerHandle} is typing...`}
                            >
                              <span className="h-2 w-2 rounded-full bg-cyan-400/90 shadow-[0_0_6px_rgba(34,211,238,0.6)] animate-whatsapp-dot-1" />
                              <span className="h-2 w-2 rounded-full bg-cyan-400/90 shadow-[0_0_6px_rgba(34,211,238,0.6)] animate-whatsapp-dot-2" />
                              <span className="h-2 w-2 rounded-full bg-cyan-400/90 shadow-[0_0_6px_rgba(34,211,238,0.6)] animate-whatsapp-dot-3" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Dynamic scroll spacer when pending image preview is shown */}
                      {pendingImagePreviewUrl && pendingImageFile && (
                        <div className="h-[210px] w-full shrink-0 pointer-events-none" />
                      )}
                    </div>

                    {isEditingImage && pendingImagePreviewUrl && (
                      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 px-4">
                        <div className="relative w-full max-w-xl aspect-[4/3] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950">
                          <Cropper
                            image={pendingImagePreviewUrl}
                            crop={crop}
                            zoom={zoom}
                            aspect={aspect}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={handleCropComplete}
                          />
                        </div>
                        <div className="mt-3 flex w-full max-w-xl flex-wrap items-center justify-between gap-2 text-[11px]">
                          <div className="flex flex-wrap gap-1 text-slate-300">
                            <button
                              type="button"
                              onClick={() => handleAspectChange(undefined)}
                              className={`rounded-full px-2 py-0.5 border text-[10px] ${aspect === undefined
                                  ? "border-cyan-400/80 bg-cyan-500/20 text-cyan-100"
                                  : "border-slate-600/80 bg-slate-900 text-slate-300 hover:border-cyan-400/70 hover:text-cyan-100"
                                }`}
                            >
                              Free
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAspectChange(1)}
                              className={`rounded-full px-2 py-0.5 border text-[10px] ${aspect === 1
                                  ? "border-cyan-400/80 bg-cyan-500/20 text-cyan-100"
                                  : "border-slate-600/80 bg-slate-900 text-slate-300 hover:border-cyan-400/70 hover:text-cyan-100"
                                }`}
                            >
                              1:1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAspectChange(4 / 3)}
                              className={`rounded-full px-2 py-0.5 border text-[10px] ${aspect === 4 / 3
                                  ? "border-cyan-400/80 bg-cyan-500/20 text-cyan-100"
                                  : "border-slate-600/80 bg-slate-900 text-slate-300 hover:border-cyan-400/70 hover:text-cyan-100"
                                }`}
                            >
                              4:3
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAspectChange(16 / 9)}
                              className={`rounded-full px-2 py-0.5 border text-[10px] ${aspect === 16 / 9
                                  ? "border-cyan-400/80 bg-cyan-500/20 text-cyan-100"
                                  : "border-slate-600/80 bg-slate-900 text-slate-300 hover:border-cyan-400/70 hover:text-cyan-100"
                                }`}
                            >
                              16:9
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleCloseImageEditor}
                              className="rounded-full border border-slate-600/80 bg-slate-900 px-3 py-1 text-[11px] font-medium text-slate-100 hover:border-slate-400/80"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={applyImageCrop}
                              className="rounded-full border border-cyan-400/80 bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-400 px-3 py-1 text-[11px] font-medium text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.7)]"
                            >
                              Apply crop
                            </button>
                          </div>
                        </div>
                      </div>
                    )}                  <div className="relative z-[50] -mx-1.5 sm:-mx-2.5">
                      {/* Premium Sci-Fi Selection Mode Command Control Bar */}
                      {isSelectionMode && (
                        <div
                          className="absolute bottom-[calc(100%+8px)] left-1.5 right-1.5 sm:left-2.5 sm:right-2.5 z-[50] rounded-2xl border border-cyan-500/40 bg-[#09111c]/95 p-3 text-[11px] text-slate-200 shadow-[0_0_30px_rgba(6,182,212,0.35)] backdrop-blur-md transition-all duration-300 animate-slide-up flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                        >
                          {/* Title & Selection Count */}
                          <div className="flex items-center gap-2 px-1">
                            <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
                            <span className="text-xs font-bold text-slate-200 font-sans tracking-wide">
                              {selectedMessageIds.size} message{selectedMessageIds.size !== 1 ? "s" : ""} selected
                            </span>
                          </div>

                          {/* Actions Panel */}
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            {/* Select All */}
                            <button
                              type="button"
                              onClick={handleSelectAll}
                              className="px-3.5 py-1.5 rounded-xl border border-slate-800 bg-slate-900/40 text-[10px] font-bold text-slate-300 uppercase tracking-wider transition hover:border-cyan-500/30 hover:text-cyan-400 active:scale-95 duration-150"
                            >
                              Select All
                            </button>

                            {/* Delete Selected (only if there are own messages selected) */}
                            <button
                              type="button"
                              onClick={handleBulkDelete}
                              disabled={
                                chatMessages.filter(
                                  (m) => selectedMessageIds.has(m.id) && m.senderId === meId
                                ).length === 0
                              }
                              className="px-3.5 py-1.5 rounded-xl border border-rose-500/25 bg-rose-500/5 text-[10px] font-bold text-rose-400 uppercase tracking-wider transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-20 disabled:pointer-events-none active:scale-95 duration-150 shadow-[0_0_8px_rgba(244,63,94,0.05)] hover:shadow-[0_0_12px_rgba(244,63,94,0.15)]"
                            >
                              Delete Selected
                            </button>

                            {/* Cancel / Dismiss */}
                            <button
                              type="button"
                              onClick={() => {
                                setIsSelectionMode(false);
                                setSelectedMessageIds(new Set());
                              }}
                              className="px-3.5 py-1.5 rounded-xl border border-slate-800 bg-slate-900/40 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition hover:border-slate-700 hover:text-slate-200 active:scale-95 duration-150"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Pending image preview pinned statically above input box */}
                      {pendingImagePreviewUrl && pendingImageFile && (
                        <div
                          ref={pendingImageRef}
                          className="absolute bottom-[calc(100%+8px)] left-1.5 right-1.5 sm:left-2.5 sm:right-2.5 z-[50] rounded-2xl border border-slate-600/25 bg-[#09111c]/25 backdrop-blur-[1.5px] p-2 text-[11px] text-slate-200 shadow-[0_0_25px_rgba(0,0,0,0.4)] transition-all"
                        >
                          <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold">
                            Pending image
                          </p>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="relative group/pending overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/80 cursor-zoom-in">
                              <button
                                type="button"
                                onClick={() => {
                                  if (pendingImagePreviewUrl) {
                                    setLightboxImageUrl(pendingImagePreviewUrl);
                                    setLightboxImageName(pendingImageFile.name || "Pending image");
                                  }
                                }}
                                className="block w-full focus:outline-none focus:ring-2 focus:ring-cyan-400/80 transition-transform duration-300 group-hover/pending:scale-[1.02] cursor-zoom-in relative"
                                title="Click or tap to view & zoom image"
                              >
                                <img
                                  src={pendingImagePreviewUrl}
                                  alt="Pending attachment"
                                  className="max-h-40 w-full object-contain sm:max-h-48 sm:w-64 transition-opacity duration-200"
                                />
                                {/* Optical Zoom Pill on hover & mobile tap */}
                                <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950/80 border border-white/20 text-[10px] text-white/90 backdrop-blur-md opacity-0 group-hover/pending:opacity-100 transition-opacity shadow-md pointer-events-none">
                                  <svg className="h-3 w-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                                  </svg>
                                  <span>Tap to zoom</span>
                                </div>
                              </button>
                            </div>
                            <div className="flex flex-1 flex-col items-stretch gap-1 sm:items-end">
                              <div className="w-full truncate text-left text-[10px] text-slate-400 sm:text-right">
                                {pendingImageFile.name}
                              </div>
                              <div className="flex justify-start gap-2 sm:justify-end">
                                <button
                                  type="button"
                                  disabled={isUploadingAttachment}
                                  onClick={() => {
                                    setPendingImageFile(null);
                                    setPendingImagePreviewUrl(null);
                                    setAttachmentError(null);
                                    if (imageVideoInputRef.current) imageVideoInputRef.current.value = "";
                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                  }}
                                  className="inline-flex items-center justify-center rounded-full border border-rose-500/50 bg-slate-950 px-3 py-1 text-[11px] font-medium text-rose-300 hover:border-rose-400/80 hover:text-rose-200 hover:bg-rose-500/10 disabled:opacity-60 transition-all"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isUploadingAttachment}
                                  onClick={handleOpenImageEditor}
                                  className="inline-flex items-center justify-center rounded-full border border-slate-500/80 bg-slate-950 px-3 py-1 text-[11px] font-medium text-slate-100 hover:border-cyan-400/80 hover:text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-60 transition-all"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={isUploadingAttachment || !activePeerHandle}
                                  onClick={handleSendPendingImage}
                                  className="inline-flex items-center justify-center rounded-full border border-cyan-400/80 bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-400 px-3 py-1 text-[11px] font-medium text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.7)] disabled:opacity-60 hover:shadow-[0_0_18px_rgba(34,211,238,0.9)] transition-all"
                                >
                                  {isUploadingAttachment ? "Sending…" : "Send"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <ChatInputConsole
                        isCompact={isQAIOpen}
                        externalValue={chatInput}
                        onExternalValueConsumed={() => setChatInput("")}
                        activePeerHandle={activePeerHandle}
                        onSend={(text) => {
                          setChatInput("");
                          handleSendMessage(text);
                        }}
                        onTypingPing={handleTypingPing}
                        isUploadingAttachment={isUploadingAttachment}
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
                        formatDuration={formatDuration}
                        editingMessage={editingMessage}
                        onCancelEdit={handleCancelEdit}
                        onPasteFile={handlePasteFile}
                        hasPendingImage={Boolean(pendingImageFile)}
                        onSendPendingImage={handleSendPendingImage}
                      />
                    </div>
                    {beaconStatusMsg && (
                      <p className="mt-1 text-[10px] font-semibold text-rose-400 animate-pulse">
                        {beaconStatusMsg}
                      </p>
                    )}
                    {isUploadingAttachment && (
                      <div className="mt-1.5 flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-[11px] text-cyan-300 backdrop-blur-md shadow-[0_0_12px_rgba(6,182,212,0.25)] animate-pulse w-fit">
                        <svg className="h-3 w-3 animate-spin text-cyan-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>{uploadProgressText || "Uploading attachment…"}</span>
                      </div>
                    )}
                    {attachmentError && (
                      <p className="mt-1 text-[10px] text-rose-300">
                        {attachmentError}
                      </p>
                    )}

                    
      {/* In-Chat Docked Q-AI Sidecar with Context-Aware Friend Agent */}
                    <QAIAssistantModal
                      isOpen={isQAIOpen}
                      onClose={() => setIsQAIOpen(false)}
                      appState={{
                        activeScreen: (isChatFull ? "chat" : showDirectory ? "directory" : showSettings ? "settings" : "home") as "home" | "chat" | "directory" | "settings",
                        isQAIOpen,
                        isChatFull,
                        showSettings,
                        showDirectory,
                        activePeerHandle: activePeerHandle || null,
                        isRecording,
                      }}
                      onInsertToChat={(text) => {
                        setChatInput(text);
                        if (chatInputRef.current) {
                          chatInputRef.current.value = text;
                          chatInputRef.current.style.height = "auto";
                          chatInputRef.current.focus();
                        }
                      }}
                      activeDraftText={chatInput}
                      activePeerHandle={activePeerHandle}
                      rawChatMessages={chatMessages}
                      meId={meId}
                    />

                    {/* Local self-contained smooth fade animation */}
                    <style dangerouslySetInnerHTML={{
                      __html: `
                    @keyframes floatInUp {
                      0% {
                        opacity: 0;
                        transform: translateY(12px);
                      }
                      100% {
                        opacity: 1;
                        transform: translateY(0);
                      }
                    }
                    .animate-float-in {
                      animation: floatInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    }
                    @keyframes cyberWave {
                      0%, 100% { transform: scaleY(0.25); }
                      50% { transform: scaleY(1); }
                    }
                    .animate-cyberwave-1 { animation: cyberWave 0.9s ease-in-out infinite; }
                    .animate-cyberwave-2 { animation: cyberWave 0.6s ease-in-out infinite; }
                    .animate-cyberwave-3 { animation: cyberWave 0.8s ease-in-out infinite; }
                    .animate-cyberwave-4 { animation: cyberWave 0.5s ease-in-out infinite; }
                    .animate-cyberwave-5 { animation: cyberWave 0.7s ease-in-out infinite; }
                  `}} />

                    {/* Unified AI Floating Help Component with Smooth 5s Appear / 4s Hide Animation */}
                    {showAIHelpButton && !isQAIOpen ? (
                      <div className="absolute bottom-20 right-4 z-[99] transition-all duration-500 ease-in-out opacity-100 scale-100 translate-y-0 animate-float-in">
                        <div className="relative group">
                          {/* Built-in Sleek Close Button at Top-Right Corner (Fully Visible & Unclipped) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCloseModal(true);
                            }}
                            className="absolute top-2 right-2 h-5.5 w-5.5 rounded-full border border-red-500/60 bg-red-950/90 hover:bg-red-900 text-red-300 hover:text-white hover:border-red-400 flex items-center justify-center z-50 shadow-[0_0_10px_rgba(239,68,68,0.4)] transition-all duration-200 hover:scale-110"
                            title="Close AI Help"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>

                          {/* Sci-Fi AI Help Banner Button (Perfect Rounded-2xl Curve with Zero Corner Bleed) */}
                          <button
                            type="button"
                            onClick={() => {
                              setIsQAIOpen(true);
                              setShowAIHelpButton(false);
                              setIsChatFull(true);
                            }}
                            className="group relative overflow-hidden rounded-2xl border border-cyan-400/50 bg-[#09111c]/95 pl-5 pr-9 py-3.5 shadow-[0_0_20px_rgba(6,182,212,0.25)] backdrop-blur-md transition-all duration-300 hover:border-cyan-400/80 hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] flex items-center gap-3 isolate"
                            style={{ clipPath: "inset(0 round 1rem)" }}
                          >
                            {/* Animated Background Gradient */}
                            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/20 via-blue-500/20 to-purple-400/20 animate-pulse pointer-events-none" />

                            {/* Glowing Border Effect */}
                            <div className="absolute inset-0 rounded-2xl border border-cyan-400/30 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)] animate-pulse pointer-events-none" />

                            {/* Button Content */}
                            <div className="relative flex items-center gap-3 pointer-events-none">
                              {/* AI Icon */}
                              <div className="relative">
                                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                  <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                                  </svg>
                                </div>
                                {/* Orbiting Particles */}
                                <div className="absolute inset-0 animate-spin">
                                  <div className="absolute top-0 left-1/2 h-1 w-1 bg-cyan-400 rounded-full transform -translate-x-1/2" />
                                  <div className="absolute bottom-0 left-1/2 h-1 w-1 bg-blue-400 rounded-full transform -translate-x-1/2" />
                                  <div className="absolute left-0 top-1/2 h-1 w-1 bg-purple-400 rounded-full transform -translate-y-1/2" />
                                  <div className="absolute right-0 top-1/2 h-1 w-1 bg-pink-400 rounded-full transform -translate-y-1/2" />
                                </div>
                              </div>

                              {/* Text */}
                              <div className="text-left">
                                <p className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-300">
                                  Need AI Help
                                </p>
                                <p className="text-[10px] text-cyan-400/70 group-hover:text-cyan-300 transition-colors">
                                  Smart assistance
                                </p>
                              </div>
                            </div>

                            {/* Hover Glow Effect */}
                            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/10 to-blue-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Manual AI Help Trigger Button (100% Pure Circle with Zero Sharp Corner Artifacts) */
                      <div
                        className={`absolute bottom-20 right-4 z-[99] rounded-full p-1 select-none transition-all duration-500 ease-in-out ${
                          isAIArrowButtonVisible && !isQAIOpen
                            ? "opacity-100 scale-100 pointer-events-auto"
                            : "opacity-0 scale-90 pointer-events-none"
                        }`}
                        style={{ willChange: "opacity, transform" }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setShowAIHelpButton(true);
                            setManualStopAnimation(false);
                            localStorage.setItem("qlink_manual_stop_ai_animation", "false");
                          }}
                          className="group relative h-9.5 w-9.5 rounded-full border-[2.5px] border-cyan-400 bg-[#09111c]/95 shadow-[0_0_18px_rgba(34,211,238,0.5)] transition-all duration-300 hover:border-cyan-300 hover:scale-105 hover:shadow-[0_0_25px_rgba(34,211,238,0.8)] flex items-center justify-center backdrop-blur-md overflow-hidden"
                          title="Need AI Help / Smart Assistance"
                        >
                          {/* Contained soft pulse glow */}
                          <div className="absolute inset-0 rounded-full bg-cyan-400/25 animate-pulse pointer-events-none" />
                          <svg className="h-4.5 w-4.5 text-cyan-300 group-hover:text-white transition-colors duration-200 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                          </svg>
                          {/* Inner radiant highlight */}
                          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-400/30 via-sky-500/15 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        </button>
                      </div>
                    )}

                    {/* Close Confirmation Modal */}
                    {showCloseModal && (
                      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-[6px] animate-float-in">
                        <div className="relative w-[320px] max-w-[320px] rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-[1px] shadow-[0_0_30px_rgba(34,211,238,0.25)] overflow-hidden h-auto">
                          <div className="relative rounded-2xl bg-gradient-to-b from-slate-950 to-slate-900 px-4 py-3 overflow-hidden">
                            {/* Glow Effects */}
                            <div className="pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full bg-gradient-to-br from-cyan-400/40 via-fuchsia-500/30 to-indigo-400/30 blur-3xl animate-pulse" />
                            <div className="pointer-events-none absolute -right-20 bottom-[-4rem] h-40 w-40 rounded-full bg-gradient-to-tr from-indigo-400/30 via-sky-500/30 to-fuchsia-500/30 blur-3xl animate-pulse" />

                            {/* Modal Header */}
                            <div className="text-center mb-3">
                              <div className="mx-auto mb-2 h-10 w-10 rounded-full border border-cyan-400/60 bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center">
                                <svg className="h-6 w-6 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <h3 className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-300 mb-1">
                                AI Help Assistant
                              </h3>
                              <p className="text-xs text-slate-300 leading-relaxed">
                                This is your intelligent AI assistant that provides smart help and guidance throughout your chat experience. It appears automatically to offer assistance when you might need it.
                              </p>
                            </div>

                            {/* Feature List */}
                            <div className="space-y-1 mb-3">
                              <div className="flex items-center gap-3">
                                <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                <p className="text-xs text-slate-400 font-medium">Smart contextual assistance</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                                <p className="text-xs text-slate-400 font-medium">Real-time chat guidance</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                                <p className="text-xs text-slate-400 font-medium">Premium AI-powered features</p>
                              </div>
                            </div>

                            {/* Question */}
                            <div className="text-center mb-3">
                              <p className="text-sm font-bold text-cyan-200">
                                Do you want to close the AI assistant?
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                You can always trigger it again using the arrow button.
                              </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowCloseModal(false);
                                  setShowAIHelpButton(false);
                                  setIsAIArrowButtonVisible(false);
                                  setManualStopAnimation(true);
                                  localStorage.setItem("qlink_manual_stop_ai_animation", "true");
                                }}
                                className="flex-1 rounded-xl border border-red-500/80 bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500 hover:text-white transition-all duration-200"
                              >
                                Yes, Close
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowCloseModal(false)}
                                className="flex-1 rounded-xl border border-cyan-500/80 bg-cyan-500/20 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500 hover:text-white transition-all duration-200"
                              >
                                No, Keep
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Zoomable Image Lightbox */}
                    {lightboxImageUrl && (
                      <QuantumChatImageLightbox
                        isOpen={Boolean(lightboxImageUrl)}
                        imageUrl={lightboxImageUrl}
                        imageName={lightboxImageName}
                        onClose={() => {
                          setLightboxImageUrl(null);
                          setLightboxImageName(null);
                        }}
                      />
                    )}

                    {/* Video Player Lightbox */}
                    {lightboxVideoUrl && (
                      <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
                        onClick={() => {
                          setLightboxVideoUrl(null);
                          setLightboxVideoName(null);
                        }}
                      >
                        <div
                          className="relative max-h-[90vh] max-w-5xl w-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <QuantumVideoPlayerComponent
                            src={lightboxVideoUrl}
                            autoPlayMuted={false}
                            className="max-h-[90vh] w-full rounded-2xl shadow-2xl"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setLightboxVideoUrl(null);
                              setLightboxVideoName(null);
                            }}
                            className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-slate-100 hover:bg-black/90 cursor-pointer"
                          >
                            Close
                          </button>
                          {lightboxVideoName && (
                            <div className="mt-2 truncate text-center text-[11px] text-slate-300">
                              {lightboxVideoName}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Logo Viewer */}
                    {showLogoViewer && (
                      <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
                        onClick={() => setShowLogoViewer(false)}
                      >
                        <div
                          className="relative max-h-[90vh] max-w-5xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <img
                            src={logoViewerImage}
                            alt="Q-Link Logo - High Quality"
                            className="max-h-[90vh] w-full rounded-2xl object-contain shadow-2xl"
                          />
                          <button
                            type="button"
                            onClick={() => setShowLogoViewer(false)}
                            className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-slate-100 hover:bg-black/90"
                          >
                            Close
                          </button>
                          <div className="mt-2 truncate text-center text-[11px] text-slate-300">
                            Q-Link Chat Logo - Perfect Quality (1024×1024)
                          </div>
                        </div>
                      </div>
                    )}


                  </div>
                )}
              </div>
              )}
              </section>
  );
});

export default ActiveChatPanel;
