"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function TimezoneSettings({
  initialTimezone,
  onSaved,
}: {
  initialTimezone: string;
  onSaved?: (timezone: string) => void;
}) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(initialTimezone);
  const [zones, setZones] = useState([
    initialTimezone,
    "UTC",
    "Asia/Jakarta",
    "Asia/Makassar",
    "Asia/Jayapura",
    "Asia/Singapore",
    "America/New_York",
    "Europe/London",
  ]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (typeof Intl.supportedValuesOf === "function")
        setZones([
          ...new Set([
            initialTimezone,
            "UTC",
            ...Intl.supportedValuesOf("timeZone"),
          ]),
        ]);
    });
    return () => cancelAnimationFrame(frame);
  }, [initialTimezone]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/v1/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Timezone could not be saved.");
      setTimezone(body.settings.timezone);
      onSaved?.(body.settings.timezone);
      setMessage("Timezone saved. Your spending periods are updated.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Timezone could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="timezone-settings" onSubmit={submit}>
      <div>
        <p className="eyebrow">MAKE IT LOCAL</p>
        <h3>Your timezone</h3>
        <p className="muted">
          See your spending by your day, week and month. Weeks start on Monday.
        </p>
      </div>
      <label htmlFor="display-timezone">Display timezone</label>
      <select
        id="display-timezone"
        aria-label="Display timezone"
        value={timezone}
        onChange={(event) => {
          setTimezone(event.target.value);
          setMessage("");
        }}
        disabled={busy}
      >
        {[...new Set(zones)].map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <div className="timezone-preview">
        {new Intl.DateTimeFormat("en", {
          timeZone: timezone,
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date())}
        <span>Current time in {timezone}</span>
      </div>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="form-message success" role="status">
          {message}
        </p>
      )}
      <button type="submit" disabled={busy || timezone === initialTimezone}>
        {busy ? "Saving timezone..." : "Save timezone"}
      </button>
    </form>
  );
}
