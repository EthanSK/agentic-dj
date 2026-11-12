#!/usr/bin/env python3
"""Sync or query the agent's private SQLite catalogue of Rekordbox recordings.

Run this script with sync, search, or prepare. Sync and prepare open the native
library read-only. Prepare writes an M3U8 for import through Rekordbox itself.
"""

import argparse
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import sys
from time import perf_counter

REKORDBOX_DB = Path.home() / "Library/Pioneer/rekordbox/master.db"
CATALOG_DB = Path.home() / "Library/Application Support/Agentic DJ/rekordbox-catalog.sqlite"

TRACKS = """
    SELECT c.UUID AS uuid, c.ID AS id, COALESCE(NULLIF(c.Title, ''), c.FileNameL, '') AS title,
           a.Name AS artist, al.Name AS album, g.Name AS genre, c.BPM / 100.0 AS bpm,
           k.ScaleName AS musical_key, c.Length AS seconds, c.Rating AS rating,
           c.FolderPath AS path, c.AnalysisDataPath AS analysis_path,
           c.Analysed AS analysed, c.ServiceID AS service_id
    FROM djmdContent c
    LEFT JOIN djmdArtist a ON a.ID = c.ArtistID
    LEFT JOIN djmdAlbum al ON al.ID = c.AlbumID
    LEFT JOIN djmdGenre g ON g.ID = c.GenreID
    LEFT JOIN djmdKey k ON k.ID = c.KeyID
    WHERE c.rb_local_deleted = 0
"""


@contextmanager
def read_rekordbox(path: Path):
    from pyrekordbox.masterdb.database import BLOB
    from pyrekordbox.utils import deobfuscate
    from sqlcipher3 import dbapi2

    # The normal ORM connection can write. Enforce read-only at the file and SQL levels.
    try:
        with closing(dbapi2.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as connection:
            key = deobfuscate(BLOB).replace("'", "''")
            connection.execute(f"PRAGMA key = '{key}'")
            connection.execute("PRAGMA query_only = ON")
            connection.row_factory = dbapi2.Row
            yield connection
    except dbapi2.Error as error:
        raise ValueError(f"Could not read the Rekordbox collection: {error}") from error


def open_catalog(path: Path, *, writable: bool = False) -> sqlite3.Connection:
    if writable:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Create new catalogues with private permissions even under a permissive umask.
        fd = os.open(path, os.O_CREAT | os.O_WRONLY, 0o600)
        os.close(fd)
    mode = "rw" if writable else "ro"
    connection = sqlite3.connect(path.resolve().as_uri() + f"?mode={mode}", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def sync_catalog(catalog: Path, source: Path) -> dict[str, int | float]:
    started = perf_counter()
    # The default catalogue belongs to this Mac's library. Separate sources can
    # share a catalogue without deactivating each other's recordings.
    library = str(source.resolve())
    with closing(open_catalog(catalog, writable=True)) as target, target:
        target.executescript("""
            CREATE TABLE IF NOT EXISTS tracks (
                library TEXT NOT NULL,
                uuid TEXT NOT NULL CHECK (uuid <> ''),
                id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT,
                album TEXT,
                genre TEXT,
                bpm REAL,
                musical_key TEXT,
                seconds INTEGER,
                rating INTEGER,
                path TEXT,
                analysis_path TEXT,
                analysed INTEGER,
                service_id INTEGER,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                in_collection INTEGER NOT NULL CHECK (in_collection IN (0, 1)),
                PRIMARY KEY (library, uuid)
            );
            CREATE INDEX IF NOT EXISTS tracks_current_bpm ON tracks (in_collection, bpm);
        """)
        # Serialize syncs before reading the native snapshot so an older snapshot
        # cannot arrive late and overwrite a newer one.
        target.execute("BEGIN IMMEDIATE")
        with read_rekordbox(source) as origin:
            rows = [dict(row) for row in origin.execute(TRACKS)]
        now = datetime.now(timezone.utc).isoformat()
        target.execute("UPDATE tracks SET in_collection = 0 WHERE library = ? AND in_collection = 1", (library,))
        target.executemany("""
            INSERT INTO tracks (
                library, uuid, id, title, artist, album, genre, bpm,
                musical_key, seconds, rating, path, analysis_path, analysed,
                service_id, first_seen, last_seen, in_collection
            ) VALUES (
                :library, :uuid, :id, :title, :artist, :album, :genre, :bpm,
                :musical_key, :seconds, :rating, :path, :analysis_path, :analysed,
                :service_id, :now, :now, 1
            )
            ON CONFLICT (library, uuid) DO UPDATE SET
                id = excluded.id, title = excluded.title, artist = excluded.artist,
                album = excluded.album, genre = excluded.genre, bpm = excluded.bpm,
                musical_key = excluded.musical_key, seconds = excluded.seconds,
                rating = excluded.rating, path = excluded.path, analysis_path = excluded.analysis_path,
                analysed = excluded.analysed, service_id = excluded.service_id,
                last_seen = excluded.last_seen, in_collection = 1
        """, (dict(row, library=library, now=now) for row in rows))
        total = target.execute("SELECT count(*) FROM tracks WHERE library = ?", (library,)).fetchone()[0]
    return {"current": len(rows), "ever_seen": total, "elapsed_ms": round((perf_counter() - started) * 1000, 1)}


def search_catalog(args: argparse.Namespace) -> list[dict]:
    # A literal search supports partial names and avoids treating wildcards in a
    # title as operators. Unicode casefold also handles non-ASCII artists.
    with closing(open_catalog(args.catalog)) as catalog:
        catalog.create_function("casefold", 1, str.casefold, deterministic=True)
        rows = catalog.execute("""
            SELECT id, uuid, title, artist, album, genre, bpm, musical_key, seconds,
                   rating, analysed, service_id, in_collection, first_seen, last_seen
            FROM tracks
            WHERE library = :library AND (:history OR in_collection = 1)
              AND (:min_bpm IS NULL OR bpm >= :min_bpm)
              AND (:max_bpm IS NULL OR bpm <= :max_bpm)
              AND instr(casefold(title || ' ' || coalesce(artist, '') || ' ' ||
                                 coalesce(album, '') || ' ' || coalesce(genre, '')), :term) > 0
            ORDER BY in_collection DESC, coalesce(rating, 0) DESC, title COLLATE NOCASE, uuid
            LIMIT :limit
        """, {
            "library": str(args.source.resolve()), "history": args.history,
            "min_bpm": args.min_bpm, "max_bpm": args.max_bpm,
            "term": args.term.casefold(), "limit": args.limit,
        })
        return [dict(row) for row in rows]


def prepare_playlist(source: Path, output: Path, ids: list[str]) -> dict:
    if not ids:
        raise ValueError("Select at least one Rekordbox track")
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate track IDs in the requested running order")
    if output.suffix.lower() != ".m3u8":
        raise ValueError("Playlist output must have the .m3u8 extension")
    paths: list[Path] = []
    tracks: list[dict] = []
    with read_rekordbox(source) as origin:
        origin.execute("BEGIN")
        # Read the selected records and their path counts in one snapshot. Retain
        # the caller's running order instead of relying on SQL result order.
        id_parameters = ", ".join("?" for _ in ids)
        selected = {
            row["id"]: row
            for row in origin.execute(TRACKS + f" AND c.ID IN ({id_parameters})", ids)
        }
        for track_id in ids:
            row = selected.get(track_id)
            if row is None:
                raise ValueError(f"Track {track_id} is absent from the current collection")
            path = Path(row["path"] or "")
            analysis = source.parent / "share" / (row["analysis_path"] or "").lstrip("/")
            if row["service_id"] not in (0, None) or not path.is_absolute() or not path.is_file():
                raise ValueError(f"Track {track_id} is not an available local file")
            if (not row["analysed"] or not row["bpm"] or row["bpm"] <= 0
                    or not analysis.is_file() or not os.access(analysis, os.R_OK)):
                raise ValueError(f"Track {track_id} has no verified analysis file and BPM")
            if not os.access(path, os.R_OK) or "\n" in str(path) or "\r" in str(path):
                raise ValueError(f"Track {track_id} has an unreadable or unsupported file path")
            if path in paths:
                raise ValueError(f"Track {track_id} has an ambiguous file path in Rekordbox")
            paths.append(path)
            tracks.append({key: row[key] for key in ("id", "title", "artist", "seconds")})
        path_parameters = ", ".join("?" for _ in paths)
        path_counts = dict(origin.execute(f"""
            SELECT FolderPath, count(*) FROM djmdContent
            WHERE rb_local_deleted = 0 AND FolderPath IN ({path_parameters})
            GROUP BY FolderPath
        """, [str(path) for path in paths]).fetchall())
        for track_id, path in zip(ids, paths, strict=True):
            if path_counts.get(str(path)) != 1:
                raise ValueError(f"Track {track_id} has an ambiguous file path in Rekordbox")
    # A retry must reconcile the first import, rather than silently replacing its plan.
    with os.fdopen(os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as playlist:
        playlist.write("#EXTM3U\n" + "".join(f"{path}\n" for path in paths))
    return {"file": str(output), "tracks": tracks}


def find_playlists(source: Path, term: str) -> list[dict]:
    with read_rekordbox(source) as origin:
        origin.create_function("casefold", 1, str.casefold, deterministic=True)
        rows = origin.execute("""
            SELECT ID AS id, Name AS name, ParentID AS parent_id, Seq AS position, Attribute AS kind
            FROM djmdPlaylist
            WHERE rb_local_deleted = 0 AND instr(casefold(coalesce(Name, '')), ?) > 0
            ORDER BY ParentID, Seq, ID
        """, (term.casefold(),))
        return [dict(row) for row in rows]


def playlist_members(source: Path, playlist_id: str) -> list[dict]:
    with read_rekordbox(source) as origin:
        origin.execute("BEGIN")
        playlist = origin.execute("""
            SELECT Attribute FROM djmdPlaylist WHERE ID = ? AND rb_local_deleted = 0
        """, (playlist_id,)).fetchone()
        if playlist is None or playlist["Attribute"] != 0:
            raise ValueError(f"No regular playlist with ID {playlist_id}")
        rows = origin.execute("""
            SELECT s.TrackNo AS position, s.ContentID AS id, c.Title AS title, a.Name AS artist,
                   c.Length AS seconds
            FROM djmdSongPlaylist s
            LEFT JOIN djmdContent c ON c.ID = s.ContentID AND c.rb_local_deleted = 0
            LEFT JOIN djmdArtist a ON a.ID = c.ArtistID
            WHERE s.PlaylistID = ? AND s.rb_local_deleted = 0
            ORDER BY s.TrackNo, s.ID
        """, (playlist_id,))
        return [dict(row) for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=CATALOG_DB)
    parser.add_argument("--source", type=Path, default=REKORDBOX_DB)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("sync", help="Record the current collection and keep previously seen tracks")
    search = commands.add_parser("search", help="Find tracks by title, artist, album, genre or BPM")
    search.add_argument("term", nargs="?", default="")
    search.add_argument("--history", action="store_true", help="Include tracks no longer in the collection")
    search.add_argument("--min-bpm", type=float)
    search.add_argument("--max-bpm", type=float)
    search.add_argument("--limit", type=int, default=30)
    prepare = commands.add_parser("prepare", help="Write an import file for exact, existing Rekordbox track IDs")
    prepare.add_argument("output", type=Path)
    prepare.add_argument("ids", nargs="+")
    playlists = commands.add_parser("playlists", help="Find native playlists and folders by name")
    playlists.add_argument("term", nargs="?", default="")
    members = commands.add_parser("members", help="Read a native playlist in saved order")
    members.add_argument("playlist_id")
    args = parser.parse_args()
    try:
        if args.command == "sync":
            result = sync_catalog(args.catalog, args.source)
        elif args.command == "search":
            if args.limit < 1:
                parser.error("--limit must be positive")
            result = search_catalog(args)
        elif args.command == "prepare":
            result = prepare_playlist(args.source.resolve(), args.output, args.ids)
        elif args.command == "playlists":
            result = find_playlists(args.source, args.term)
        else:
            result = playlist_members(args.source, args.playlist_id)
    except (ImportError, OSError, ValueError, sqlite3.Error) as error:
        parser.exit(1, f"{error}\n")
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == "__main__":
    main()
