"use client";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Modal } from "./modal";

type Props = { open: boolean; onClose: () => void; src: string; filename: string; mimeType: string };

/**
 * Shows an image or PDF proof inside the shared Modal (native <dialog>, so it renders in the top layer
 * and is never clipped by the expense row). PDFs are fetched and shown from a blob: URL because the
 * proof endpoint replies with `Content-Security-Policy: sandbox`, which stops browsers' PDF viewers
 * from rendering it inside an iframe.
 */
export function ProofViewer({ open, onClose, src, filename, mimeType }: Props) {
  const isPdf = mimeType === "application/pdf";
  const [pdf, setPdf] = useState<{ src: string; url?: string; failed?: boolean } | null>(null);

  useEffect(() => {
    if (!open || !isPdf) return;
    let url: string | undefined;
    let cancelled = false;
    void fetch(src).then(async (response) => {
      if (!response.ok) throw new Error("load failed");
      const blob = new Blob([await response.arrayBuffer()], { type: "application/pdf" });
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setPdf({ src, url });
    }).catch(() => { if (!cancelled) setPdf({ src, failed: true }); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, isPdf, src]);

  const current = pdf?.src === src ? pdf : null;
  return (
    <Modal open={open} onClose={onClose} title={filename} id={`proof-${src.split("/").pop()}`} className="proof-dialog">
      <div className="proof-viewer">
        {isPdf
          ? current?.url
            ? <iframe className="proof-frame" src={current.url} title={filename} />
            : <p className="proof-viewer-status" role={current?.failed ? "alert" : "status"}>
              {current?.failed ? "This PDF could not be loaded." : "Loading PDF…"}
            </p>
          // eslint-disable-next-line @next/next/no-img-element -- authenticated, no-store proof bytes; next/image would add nothing
          : <img className="proof-image" src={src} alt={filename} />}
      </div>
      <div className="proof-viewer-footer">
        <a href={src} target="_blank" rel="noopener noreferrer" data-autofocus>
          <ExternalLink size={14} aria-hidden="true" /> Open in new tab
        </a>
      </div>
    </Modal>
  );
}
