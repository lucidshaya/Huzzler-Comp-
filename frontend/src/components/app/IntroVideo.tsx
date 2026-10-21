import { useEffect, useRef, useState } from "react";
import { Clapperboard, Play } from "lucide-react";

const SRC = "/videos/huzzler-intro.mp4";
const POSTER = "/videos/huzzler-intro-poster.jpg";

/**
 * Landing-page explainer in an animated blue frame. Drop the file in public/videos/
 * (see the README there); until it exists the card shows a "coming soon" state.
 */
export function IntroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [missing, setMissing] = useState(false);

  // The page is server-rendered, so a 404 can fire before onError is attached: check on mount too.
  useEffect(() => {
    if (ref.current?.error) return setMissing(true);
    let gone = false;
    fetch(SRC, { method: "HEAD" })
      .then((r) => {
        if (!gone && (!r.ok || !(r.headers.get("content-type") ?? "").startsWith("video/")))
          setMissing(true);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);

  const play = () => {
    const v = ref.current;
    if (!v) return;
    v.controls = true;
    void v.play().catch(() => {});
  };

  return (
    <div className="hz-video-wrap group relative mx-auto w-full max-w-4xl">
      <div className="hz-video-glow" aria-hidden />
      <div className="hz-video-frame">
        <div className="relative aspect-video overflow-hidden rounded-[1.6rem] bg-charcoal">
          {!missing && (
            <video
              ref={ref}
              src={SRC}
              poster={POSTER}
              preload="metadata"
              playsInline
              className="h-full w-full object-cover"
              onPlay={() => setPlaying(true)}
              onEnded={() => setPlaying(false)}
              onError={() => setMissing(true)}
              aria-label="Huzzler explainer video"
            />
          )}

          {/* Overlay: play button, or the coming-soon state when there's no video yet. */}
          {!playing && (
            <button
              type="button"
              onClick={missing ? undefined : play}
              disabled={missing}
              aria-label={missing ? "Video coming soon" : "Play the Huzzler video"}
              className="hz-video-overlay absolute inset-0 flex flex-col items-center justify-center gap-4 text-white"
            >
              <span className="hz-video-grid" aria-hidden />
              <span className="relative grid h-20 w-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_40px_-4px_var(--primary)] transition-transform duration-300 group-hover:scale-110 animate-pulse-ring md:h-24 md:w-24">
                {missing ? (
                  <Clapperboard className="h-8 w-8" />
                ) : (
                  <Play className="ml-1 h-9 w-9 fill-current" />
                )}
              </span>
              <span className="relative text-center">
                <span className="block font-display text-xl font-bold md:text-2xl">
                  {missing ? "The Huzzler story, coming soon" : "See Huzzler in 77 seconds"}
                </span>
                <span className="mt-1 block text-sm text-white/70">
                  {missing
                    ? "A quick tour of tests, squads and shipping real projects."
                    : "From onboarding tests to your first shipped project."}
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
