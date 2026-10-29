import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, Play, PlayCircle, X } from "lucide-react";
import type { Me } from "@/lib/journey";
import {
  markPlatformTourSeen,
  platformTourSeen,
  PLATFORM_TOUR,
  videosFor,
  type TutorialVideo,
} from "@/lib/tutorials";

/** A video in a pop-up card. With more than one video, the others are listed underneath. */
export function VideoDialog({
  videos,
  initial,
  onClose,
  autoPlay = true,
  label = "Tutorial video",
  intro,
  footer,
}: {
  label?: string;
  videos: TutorialVideo[];
  initial?: string;
  onClose: () => void;
  autoPlay?: boolean;
  intro?: ReactNode;
  footer?: ReactNode;
}) {
  const [id, setId] = useState(initial ?? videos[0].id);
  const video = videos.find((v) => v.id === id) ?? videos[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.classList.add("overflow-hidden");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("overflow-hidden");
    };
  }, [onClose]);

  // Portalled to <body>: inside the blurred header, `fixed` would be trapped to the header's box.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={video.title}
        onClick={(e) => e.stopPropagation()}
        className="hz-fade-up flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              {label} · {video.length}
            </span>
            <h2 className="mt-1 font-display text-xl font-bold tracking-tight">{video.title}</h2>
            {intro ?? <p className="mt-1 text-sm text-muted-foreground">{video.blurb}</p>}
          </div>
          <button
            onClick={onClose}
            autoFocus
            aria-label="Close video"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:border-primary hover:text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="overflow-y-auto">
          <div className="bg-black">
            <video
              key={video.id}
              src={video.src}
              poster={video.poster}
              controls
              autoPlay={autoPlay}
              playsInline
              preload="metadata"
              className="aspect-video w-full"
            />
          </div>
          {videos.length > 1 && (
            <ul className="flex flex-col gap-2 p-4 sm:flex-row">
              {videos
                .filter((v) => v.id !== video.id)
                .map((v) => (
                  <li key={v.id} className="flex-1">
                    <button
                      onClick={() => setId(v.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border p-2 text-left hover:border-primary"
                    >
                      <img
                        src={v.poster}
                        alt=""
                        className="aspect-video w-24 shrink-0 rounded-lg object-cover"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{v.title}</span>
                        <span className="text-xs text-muted-foreground">{v.length}</span>
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {footer && <div className="border-t border-border px-5 py-4 sm:px-6">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The small blue "Tutorial video" button in the header: plays the guide for the current section. */
export function TutorialVideoButton() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tab = useRouterState({
    select: (s) => (s.location.search as { tab?: string } | undefined)?.tab,
  });
  const [open, setOpen] = useState(false);
  const { label, videos } = videosFor(pathname, tab);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-tour="tutorial-video"
        aria-label={`${label} video: ${videos[0].title}`}
        title={videos[0].title}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground shadow-[0_6px_16px_-8px_var(--primary)] transition-transform hover:scale-[1.03] active:scale-95"
      >
        <PlayCircle className="h-4 w-4" />
        <span className="hidden sm:inline">{label}</span>
      </button>
      {open && <VideoDialog videos={videos} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Opens the platform tour once, right after payment and before the onboarding tests. */
export function PlatformTourPopup({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (me.journey.status === "PAID" && !platformTourSeen()) setOpen(true);
  }, [me.journey.status]);
  if (!open) return null;
  const close = () => {
    markPlatformTourSeen();
    setOpen(false);
  };
  const first = me.profile.full_name?.split(" ")[0];
  return (
    <VideoDialog
      videos={[PLATFORM_TOUR]}
      label="Platform tutorial"
      autoPlay={false}
      onClose={close}
      intro={
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          You're in{first ? `, ${first}` : ""}. Before your onboarding tests, watch this tour of how
          Huzzler works. You can watch it again any time from the Platform tutorial page.
        </p>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button onClick={close} className="btn-duo-outline !px-4 !py-2 text-sm">
            Watch later
          </button>
          <Link to="/tests" onClick={close} className="btn-duo !px-4 !py-2 text-sm">
            Start my onboarding tests <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      }
    />
  );
}

/** A clickable video card (poster, title, length) that opens the video in a pop-up. */
export function VideoCard({ video, large }: { video: TutorialVideo; large?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:border-primary"
      >
        <span className="relative block">
          <img src={video.poster} alt="" className="aspect-video w-full object-cover" />
          <span className="absolute inset-0 grid place-items-center bg-black/20 transition-colors group-hover:bg-black/10">
            <span
              className={`grid place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-110 ${large ? "h-16 w-16" : "h-11 w-11"}`}
            >
              <Play className={`ml-0.5 fill-current ${large ? "h-7 w-7" : "h-5 w-5"}`} />
            </span>
          </span>
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {video.length}
          </span>
        </span>
        <span className={`block ${large ? "p-5" : "p-4"}`}>
          <span className={`block font-display font-bold ${large ? "text-lg" : "text-sm"}`}>
            {video.title}
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
            {video.blurb}
          </span>
        </span>
      </button>
      {open && <VideoDialog videos={[video]} onClose={() => setOpen(false)} />}
    </>
  );
}
