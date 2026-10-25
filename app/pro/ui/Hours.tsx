"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { WeekHours } from "@/shared/scope";
import { saveWorkingHours } from "../actions";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TICKS = ["12 am", "3 am", "6 am", "9 am", "12 pm", "3 pm", "6 pm", "9 pm"];

const time = (slot: number) => {
  const h = Math.floor(slot / 2) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${slot % 2 ? "30" : "00"} ${h >= 12 ? "pm" : "am"}`;
};

/** "8:00 am – 12:00 pm, 1:00 pm – 5:00 pm" or "Closed". */
function summary(cells: boolean[]) {
  const runs: [number, number][] = [];
  let start: number | null = null;
  cells.forEach((on, j) => {
    if (on && start === null) start = j;
    if (!on && start !== null) {
      runs.push([start, j]);
      start = null;
    }
  });
  if (start !== null) runs.push([start, 48]);
  return runs.length ? runs.map(([a, b]) => `${time(a)} – ${time(b)}`) : ["Closed"];
}

/** Schedule: drag across a day to add hours, drag over dark time to take it off. Saves when you let go. */
export function Hours({ providerId, initial }: { providerId: number; initial: WeekHours }) {
  const [days, setDays] = useState(initial);
  const [saved, setSaved] = useState<"saved" | "saving" | "error" | null>(null);
  const [, startTransition] = useTransition();
  const drag = useRef<{ val: boolean } | null>(null);
  const latest = useRef(days);
  latest.current = days;

  function paint(i: number, j: number, val: boolean) {
    setDays((d) => (d[i][j] === val ? d : d.map((row, k) => (k === i ? row.map((c, m) => (m === j ? val : c)) : row))));
  }

  useEffect(() => {
    const stop = () => {
      if (!drag.current) return;
      drag.current = null;
      setSaved("saving");
      startTransition(async () => {
        try {
          await saveWorkingHours(providerId, latest.current);
          setSaved("saved");
        } catch {
          setSaved("error");
        }
      });
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [providerId]);

  return (
    <div className="card hours">
      <div className="hours-ticks" aria-hidden="true">
        {TICKS.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {days.map((cells, i) => (
        <div key={DAYS[i]} className="hours-row">
          <div className="hours-day">
            <strong>{DAYS[i]}</strong>
            <span className={cells.some(Boolean) ? "small" : "small muted"}>
              {summary(cells).map((s) => (
                <span key={s} style={{ display: "block" }}>
                  {s}
                </span>
              ))}
            </span>
          </div>
          <div className="hours-cells" role="group" aria-label={`${DAYS[i]} hours`}>
            {cells.map((on, j) => (
              <button
                key={j}
                type="button"
                className={`cell${on ? " on" : ""}${j % 2 ? " half" : ""}`}
                aria-label={`${DAYS[i]} ${time(j)}: ${on ? "open" : "closed"}`}
                aria-pressed={on}
                onPointerDown={(e) => {
                  e.preventDefault();
                  drag.current = { val: !on };
                  paint(i, j, !on);
                }}
                onPointerEnter={() => drag.current && paint(i, j, drag.current.val)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  const next = days.map((row, k) => (k === i ? row.map((c, m) => (m === j ? !on : c)) : row));
                  setDays(next);
                  setSaved("saving");
                  startTransition(async () => {
                    await saveWorkingHours(providerId, next).then(() => setSaved("saved"), () => setSaved("error"));
                  });
                }}
              />
            ))}
          </div>
        </div>
      ))}
      <p className="small muted" aria-live="polite">
        {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved. New offers use these hours." : saved === "error" ? "Couldn't save. Try again." : "Offers and booking times only fall inside these hours."}
      </p>
    </div>
  );
}
