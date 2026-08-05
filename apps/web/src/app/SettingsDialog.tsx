import { useEffect, useState } from "react";

import { createBackup, inspectBackup, restoreBackup, type BackupPreview } from "../backup/backup";
import {
  getCloudProfile,
  logoutProfile,
  recoverProfile,
  redeemInvite,
  syncWithCloud,
  type CloudProfile,
} from "../cloud/cloud-client";
import type { TrainingDatabase } from "../storage/training-database";

export type SettingsSection = "backup" | "storage" | "credits" | "profile";

export function SettingsDialog({
  section,
  database,
  onClose,
  onRestored,
}: {
  readonly section: SettingsSection;
  readonly database: TrainingDatabase;
  readonly onClose: () => void;
  readonly onRestored: () => Promise<void>;
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <h2 id="settings-title">
            {section === "backup"
              ? "Backup & restore"
              : section === "storage"
                ? "Storage"
                : section === "profile"
                  ? "Profile & sync"
                  : "Sources & credits"}
          </h2>
          <button className="icon-button icon-button--light" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        {section === "backup" && <BackupSettings database={database} onRestored={onRestored} />}
        {section === "storage" && <StorageSettings />}
        {section === "profile" && <ProfileSettings database={database} onSynced={onRestored} />}
        {section === "credits" && <Credits />}
      </section>
    </div>
  );
}

function BackupSettings({
  database,
  onRestored,
}: {
  readonly database: TrainingDatabase;
  readonly onRestored: () => Promise<void>;
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<BackupPreview>();
  const [message, setMessage] = useState("");

  function selectBackup(next: File | undefined) {
    setFile(next);
    setPreview(undefined);
    setMessage("");
    if (!next) return;
    void inspectBackup(next)
      .then(setPreview)
      .catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : "Invalid backup"));
  }

  async function download() {
    const blob = await createBackup(database);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mechastudio-${new Date().toISOString().slice(0, 10)}.zip`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function restore() {
    if (!file || !preview) return;
    if (
      !window.confirm(
        `Import ${preview.exercises} exercises, ${preview.blocks} blocks, ${preview.routines} routines, and ${preview.plans} plans?`,
      )
    )
      return;
    await restoreBackup(database, file);
    await onRestored();
    setMessage("Backup imported successfully.");
  }

  return (
    <div className="settings-stack">
      <section>
        <h3>Download a portable copy</h3>
        <p>Includes your local exercises, media, blocks, routines, plans, and session names.</p>
        <button className="button button--primary" onClick={() => void download()}>
          Download ZIP backup
        </button>
      </section>
      <section>
        <h3>Import a backup</h3>
        <p>The whole archive is validated before any records are changed.</p>
        <input type="file" accept=".zip,application/zip" onChange={(event) => selectBackup(event.target.files?.[0])} />
        {preview && (
          <div className="backup-preview">
            <strong>Ready to import</strong>
            <span>{preview.exercises} exercises</span>
            <span>{preview.blocks} blocks</span>
            <span>{preview.routines} routines</span>
            <span>{preview.plans} plans</span>
            <span>{preview.mediaFiles} media files</span>
          </div>
        )}
        <button className="button" disabled={!preview} onClick={() => void restore()}>
          Import selected backup
        </button>
      </section>
      {message && (
        <p className="settings-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function ProfileSettings({
  database,
  onSynced,
}: {
  readonly database: TrainingDatabase;
  readonly onSynced: () => Promise<void>;
}) {
  const [profile, setProfile] = useState<CloudProfile | null>();
  const [mode, setMode] = useState<"invite" | "recovery">("invite");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getCloudProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  async function connect() {
    setMessage("");
    try {
      if (mode === "invite") {
        const result = await redeemInvite(code, displayName);
        setProfile(result.profile);
        setRecoveryCode(result.recoveryCode);
      } else {
        const result = await recoverProfile(code);
        setProfile(result.profile);
      }
      await syncWithCloud(database);
      await onSynced();
      setMessage("Profile connected and this device is synchronized.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to connect profile");
    }
  }

  async function sync() {
    setMessage("Synchronizing…");
    try {
      await syncWithCloud(database);
      await onSynced();
      setMessage("This device is synchronized.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to synchronize");
    }
  }

  async function logout() {
    await logoutProfile();
    setProfile(null);
    setMessage("Profile disconnected. Local IndexedDB data remains on this device.");
  }

  if (profile === undefined) return <p>Checking for a connected profile…</p>;

  if (profile) {
    return (
      <div className="settings-stack">
        <section>
          <p className="eyebrow">{profile.role}</p>
          <h3>{profile.displayName}</h3>
          <p>Cloud records synchronize with this browser's IndexedDB. Cached Sessions remain available offline.</p>
          <div className="inline-actions">
            <button className="button button--primary" onClick={() => void sync()}>
              Synchronize now
            </button>
            <button className="button" onClick={() => void logout()}>
              Disconnect
            </button>
          </div>
        </section>
        {recoveryCode && (
          <section className="recovery-code">
            <h3>Save this recovery code now</h3>
            <code>{recoveryCode}</code>
            <p>It is shown once and connects another device. Do not share it.</p>
          </section>
        )}
        {message && (
          <p className="settings-message" role="status">
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="settings-stack">
      <section>
        <h3>Connect a private profile</h3>
        <p>
          The local app works without an account. Profiles require the Cloudflare backend and synchronize Mac, iPhone,
          and Windows browsers.
        </p>
        <div className="segmented">
          <button aria-selected={mode === "invite"} onClick={() => setMode("invite")}>
            Invite
          </button>
          <button aria-selected={mode === "recovery"} onClick={() => setMode("recovery")}>
            Recovery
          </button>
        </div>
        {mode === "invite" && (
          <label className="field">
            <span>Display name</span>
            <input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
        )}
        <label className="field">
          <span>{mode === "invite" ? "Invite code" : "Recovery code"}</span>
          <input
            value={code}
            maxLength={256}
            autoComplete="one-time-code"
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <button
          className="button button--primary"
          disabled={code.length < 12 || (mode === "invite" && !displayName.trim())}
          onClick={() => void connect()}
        >
          Connect profile
        </button>
      </section>
      {message && (
        <p className="settings-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function StorageSettings() {
  const [usage, setUsage] = useState<{ usage: number; quota: number }>();
  const [persistent, setPersistent] = useState<boolean>();
  useEffect(() => {
    void navigator.storage
      ?.estimate()
      .then((estimate) => setUsage({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }));
    void navigator.storage?.persisted?.().then(setPersistent);
  }, []);
  async function requestPersistence() {
    setPersistent(await navigator.storage.persist());
  }
  const percent = usage?.quota ? Math.round((usage.usage / usage.quota) * 100) : 0;
  return (
    <div className="settings-stack">
      <section>
        <h3>This browser</h3>
        <p>
          IndexedDB belongs to this browser profile. Refreshing or restarting normally keeps it; clearing site data
          removes it.
        </p>
        {usage && (
          <>
            <div className="storage-meter">
              <span style={{ width: `${Math.min(100, percent)}%` }}></span>
            </div>
            <p>
              {formatBytes(usage.usage)} used of approximately {formatBytes(usage.quota)} available.
            </p>
          </>
        )}
        <button
          className="button"
          disabled={!navigator.storage?.persist || persistent}
          onClick={() => void requestPersistence()}
        >
          {persistent ? "Persistent storage granted" : "Request persistent storage"}
        </button>
      </section>
      <section>
        <h3>Other devices</h3>
        <p>
          Your Mac, iPhone, and Windows browser each have separate storage. Use ZIP backup until profile sync is
          enabled.
        </p>
      </section>
    </div>
  );
}

function Credits() {
  return (
    <div className="settings-stack">
      <section>
        <h3>Starter catalog</h3>
        <p>
          The initial exercises are a small built-in demonstration catalog. Imported providers retain their own author,
          source, and license records.
        </p>
      </section>
      <section>
        <h3>Planned source</h3>
        <p>
          <a href="https://wger.de/en/software/api" target="_blank" rel="noreferrer">
            wger exercise API
          </a>{" "}
          is the first catalog adapter. Runtime Sessions never depend on a third-party API.
        </p>
      </section>
      <section>
        <h3>Safety</h3>
        <p>
          MechaStudio organizes routines; it is not medical advice. Stop if movement causes pain and seek qualified
          guidance when appropriate.
        </p>
      </section>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
