PRAGMA foreign_keys = ON;

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80),
  role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
  invite_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by_profile_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE recovery_credentials (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX sessions_profile_idx ON sessions(profile_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE profile_resources (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('exercises', 'blocks', 'routines', 'plans', 'sessions')),
  id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(profile_id, kind, id),
  UNIQUE(kind, id)
);

CREATE INDEX profile_resources_list_idx ON profile_resources(profile_id, kind, updated_at);

CREATE TABLE catalog_exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE recommendations (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  reviewed_by TEXT REFERENCES profiles(id),
  reviewed_at TEXT
);

CREATE INDEX recommendations_status_idx ON recommendations(status, created_at);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 15728640),
  state TEXT NOT NULL CHECK(state IN ('quarantine', 'ready', 'rejected')),
  created_at TEXT NOT NULL
);

CREATE TABLE media_upload_intents (
  token_hash TEXT PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 15728640),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);
