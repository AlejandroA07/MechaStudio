import { useEffect, useState } from "react";

import type { TrainingDatabase } from "../storage/training-database";

export function ExerciseMedia({
  mediaId,
  name,
  database,
  mode = "card",
  fallback,
}: {
  readonly mediaId?: string | undefined;
  readonly name: string;
  readonly database: TrainingDatabase;
  readonly mode?: "card" | "runner";
  readonly fallback?: string;
}) {
  const [media, setMedia] = useState<{ url: string; kind: "image" | "gif" | "video" }>();

  useEffect(() => {
    let active = true;
    let url: string | undefined;
    if (mediaId) {
      void database.getMedia(mediaId).then((asset) => {
        if (!asset || !active) return;
        url = URL.createObjectURL(asset.data);
        setMedia({ url, kind: asset.kind });
      });
    }
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [database, mediaId]);

  const className =
    mode === "runner" ? "runner__media-placeholder runner__media-placeholder--asset" : "exercise-card__image";
  if (!media)
    return (
      <div className={className} aria-hidden="true">
        {fallback ?? name.slice(0, 1)}
      </div>
    );
  if (media.kind === "video") {
    return (
      <div className={className}>
        <video src={media.url} aria-label={`${name} demonstration`} autoPlay loop muted playsInline />
      </div>
    );
  }
  return (
    <div className={className}>
      <img src={media.url} alt={`${name} demonstration`} />
    </div>
  );
}
