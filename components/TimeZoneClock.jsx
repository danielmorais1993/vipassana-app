// src/components/TimeZoneClock.jsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";

/**
 * TimeZoneClock
 *
 * Props (optional):
 *  - initialZone: string (IANA timezone id e.g. "America/Sao_Paulo"). If omitted, detected automatically.
 *  - showLocal: boolean (default true) — whether to show detected local timezone info.
 *
 * Usage:
 *   <TimeZoneClock initialZone="America/Sao_Paulo" />
 */
export default function TimeZoneClock({ initialZone = null, showLocal = true }) {
  // detect browser timezone (IANA) reliably if available
  const detectedZone = useMemo(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return tz || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const [selectedZone, setSelectedZone] = useState(initialZone || detectedZone);
  const [now, setNow] = useState(() => new Date());
  const mountedRef = useRef(true);

  // update every second
  useEffect(() => {
    mountedRef.current = true;
    const id = setInterval(() => {
      if (mountedRef.current) setNow(new Date());
    }, 1000);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  // small list of useful timezones — you can expand this list
  const commonZones = useMemo(() => [
    "UTC",
    "Europe/London",
    "Europe/Paris",
    "America/New_York",
    "America/Sao_Paulo",
    "America/Los_Angeles",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Australia/Sydney",
  ], []);

  const zoneOptions = useMemo(() => {
    // keep detected zone at top if not already present
    const uniq = Array.from(new Set([detectedZone, ...commonZones]));
    return uniq;
  }, [detectedZone, commonZones]);

  const formatForZone = useCallback((date, tz, opts = {}) => {
    try {
      const formatter = new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        hour12: false,
        year: "numeric",
        month: "short",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        ...opts,
      });
      return formatter.format(date);
    } catch {
      // fallback simple ISO
      return date.toISOString();
    }
  }, []);

  // compute offset (e.g., +03:00) for a timezone by comparing to UTC
  const tzOffsetString = useCallback((tz, date = new Date()) => {
    try {
      const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      // format to parts to get local time in that tz
      const parts = dtf.formatToParts(date);
      // construct a date string in that zone and parse as if local -> then compute offset
      const get = (type) => parts.find(p => p.type === type)?.value || "00";
      const s = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
      // parse as if it's local time (this is a heuristic but works for offset computation)
      const asLocal = new Date(s + "Z");
      const utcMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
      // offset minutes between tz and UTC:
      const offsetMinutes = Math.round((asLocal.getTime() - utcMs) / 60000);
      const sign = offsetMinutes >= 0 ? "+" : "-";
      const absMin = Math.abs(offsetMinutes);
      const hh = String(Math.floor(absMin / 60)).padStart(2, "0");
      const mm = String(absMin % 60).padStart(2, "0");
      return `${sign}${hh}:${mm}`;
    } catch {
      return "+00:00";
    }
  }, []);

  // small validator for IANA timezone (best-effort)
  const isValidZone = useCallback((tz) => {
    try {
      // try constructing Intl formatter — will throw if invalid
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, []);

  // temporary input state for custom-zone input
  const [customZone, setCustomZone] = useState("");

  const applyCustomZone = useCallback(() => {
    if (!customZone) return;
    const tz = customZone.trim();
    if (isValidZone(tz)) {
      setSelectedZone(tz);
      setCustomZone("");
    } else {
      // quick feedback: keep input but optionally you could show an error UI
      setCustomZone(tz + " ");
      alert(`Time zone "${tz}" is not recognized as a valid IANA timezone.`);
    }
  }, [customZone, isValidZone]);

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm max-w-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-emerald-600">Seu fuso detectado</div>
          <div className="font-semibold">{detectedZone}</div>
          <div className="text-sm opacity-80 mt-1">{formatForZone(now, detectedZone)}</div>
        </div>

        <div className="text-right">
          <div className="text-xs text-emerald-600">Relógio (selecionado)</div>
          <div className="font-semibold">{selectedZone}</div>
          <div className="text-sm opacity-80 mt-1">{formatForZone(now, selectedZone)}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2">
        <label htmlFor="tz-select" className="text-sm">Escolher fuso horário</label>
        <div className="flex gap-2">
          <select
            id="tz-select"
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="p-2 border rounded flex-1"
          >
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <button onClick={() => setSelectedZone(detectedZone)} className="px-3 py-2 rounded bg-emerald-600 text-white">Usar local</button>
        </div>

        <div className="flex gap-2 items-center">
          <input
            placeholder="Ex: Europe/Berlin"
            value={customZone}
            onChange={(e) => setCustomZone(e.target.value)}
            className="p-2 border rounded flex-1"
            onKeyDown={(e) => { if (e.key === "Enter") applyCustomZone(); }}
            aria-label="Custom timezone"
          />
          <button onClick={applyCustomZone} className="px-3 py-2 rounded bg-blue-600 text-white">Aplicar</button>
        </div>

        <div className="text-xs opacity-80 mt-1">
          Offset: <strong>{tzOffsetString(selectedZone, now)}</strong>
        </div>

        <div className="mt-2 text-xs opacity-70">
          Hora atual: <code>{formatForZone(now, selectedZone)}</code>
        </div>
      </div>
    </div>
  );
}
