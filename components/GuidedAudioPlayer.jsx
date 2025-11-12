import React, { useEffect, useRef, useState } from "react";

/**
 * GuidedAudioPlayer
 * props:
 *  - tracks: [{ id, title, src }]
 *
 * This component:
 *  - mounts a single hidden <audio> element and controls it via refs
 *  - manages its own internal state (index, playing, time, volume)
 *  - is wrapped in React.memo to avoid re-render when parent updates every second
 */
function GuidedAudioPlayer({ tracks = [] }) {
  const audioRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const current = tracks && tracks.length ? tracks[index] : null;

  // create one audio element on mount (client-side)
  useEffect(() => {
    if (audioRef.current) return;
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.style.display = "none";
    document.body.appendChild(a);
    audioRef.current = a;

    // cleanup on full unmount of component
    return () => {
      try {
        a.pause();
        a.src = "";
        a.remove();
      } catch (e) {}
      audioRef.current = null;
    };
  }, []);

  // attach stable listeners
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onLoaded = () => setDuration(a.duration || 0);
    const onTime = () => setCurrentTime(a.currentTime || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      // auto next if available
      setIndex((i) => {
        if (i < tracks.length - 1) return i + 1;
        return i;
      });
    };

    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
    // intentionally no tracks/index in deps — listeners are stable for the element
  }, [tracks.length]);

  // load selected track when index changes
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!current) {
      a.pause();
      a.src = "";
      setDuration(0);
      setCurrentTime(0);
      setPlaying(false);
      return;
    }
    const nextSrc = current.src;
    // only update src if changed to avoid reloading unnecessarily
    if (a.src !== nextSrc) {
      a.src = nextSrc;
      a.load();
      setDuration(a.duration || 0);
      setCurrentTime(0);
    }
    // attempt to play only if the UI indicates playing
    if (playing) {
      a.play().catch(() => setPlaying(false));
    }
  }, [index, current, playing]);

  // sync volume/mute to element
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = volume;
    a.muted = muted;
  }, [volume, muted]);

  // control helpers
  const play = () => {
    const a = audioRef.current;
    if (!a) return;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };
  const pause = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    setPlaying(false);
  };
  const stop = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPlaying(false);
    setCurrentTime(0);
  };
  const next = () => setIndex((i) => Math.min(i + 1, tracks.length - 1));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));
  const seekTo = (s) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(s, a.duration || 0));
    setCurrentTime(a.currentTime);
  };

  const toggleMute = () => setMuted((m) => !m);

  return (
    <div className="bg-white p-4 rounded-2xl shadow space-y-3">
      <h4 className="font-medium text-emerald-700">Áudios Guiados</h4>

      <div className="space-y-2">
        {tracks.map((t, i) => (
          <div key={t.id} className={`flex items-center justify-between p-2 border rounded ${i === index ? "bg-emerald-50" : ""}`}>
            <div className="pr-4">
              <div className="font-semibold">{t.title}</div>
              <div className="text-xs opacity-70 truncate max-w-xs">{t.src}</div>
            </div>

            <div className="flex gap-2 items-center">
              <button
                onClick={() => {
                  setIndex(i);
                  // play the chosen track
                  setTimeout(() => {
                    // allow effect to set src first, then play
                    play();
                  }, 50);
                }}
                className="px-3 py-2 rounded bg-emerald-600 text-white text-sm shadow-sm hover:opacity-90 focus:outline-none"
              >
                {i === index && playing ? "Pausar" : "Tocar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <input
          aria-label="Seek"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs opacity-70 mt-1">
          <div>{new Date((currentTime || 0) * 1000).toISOString().substr(14, 5)}</div>
          <div>{new Date((duration || 0) * 1000).toISOString().substr(14, 5)}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={prev} aria-label="Anterior" className="px-2 py-1 rounded bg-gray-100">⏮</button>
        <button onClick={() => (playing ? pause() : play())} aria-label={playing ? "Pausar" : "Tocar"} className="px-3 py-1 rounded bg-emerald-600 text-white">
          {playing ? "Pausar" : "Tocar"}
        </button>
        <button onClick={stop} aria-label="Parar" className="px-2 py-1 rounded bg-gray-100">⏹</button>
        <button onClick={next} aria-label="Próxima" className="px-2 py-1 rounded bg-gray-100">⏭</button>

        <button onClick={toggleMute} aria-label="Mute" className="ml-auto px-2 py-1 rounded bg-gray-100">{muted ? "🔇" : "🔊"}</button>
        <input
          aria-label="Volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
          style={{ width: 120 }}
        />
      </div>
    </div>
  );
}

// shallow comparator: only re-render when the tracks reference changes
export default React.memo(GuidedAudioPlayer, (prevProps, nextProps) => {
  return prevProps.tracks === nextProps.tracks;
});
