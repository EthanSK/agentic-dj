"""Exercise catalogue history and playlist preparation with a small private-free fixture.

Run from the repository root with python3 -m unittest discover -s tests -p 'test_rekordbox_catalog.py'.
"""

import argparse
from contextlib import closing, contextmanager
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from scripts import rekordbox_catalog as catalog


class RekordboxCatalogTest(unittest.TestCase):
    def setUp(self) -> None:
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.root = Path(scratch.name)
        self.source = self.root / "master.db"
        self.index = self.root / "catalog.sqlite"
        self.track = self.root / "Wii Shop.flac"
        self.track.touch()
        self.analysis = self.root / "share/ANLZ0000.DAT"
        self.analysis.parent.mkdir()
        self.analysis.touch()

        with closing(sqlite3.connect(self.source)) as db, db:
            db.executescript("""
                CREATE TABLE djmdArtist (ID TEXT PRIMARY KEY, Name TEXT);
                CREATE TABLE djmdAlbum (ID TEXT PRIMARY KEY, Name TEXT);
                CREATE TABLE djmdGenre (ID TEXT PRIMARY KEY, Name TEXT);
                CREATE TABLE djmdKey (ID TEXT PRIMARY KEY, ScaleName TEXT);
                CREATE TABLE djmdContent (
                    ID TEXT PRIMARY KEY, UUID TEXT, Title TEXT, FileNameL TEXT, ArtistID TEXT,
                    AlbumID TEXT, GenreID TEXT, BPM INTEGER, KeyID TEXT, Length INTEGER,
                    Rating INTEGER, FolderPath TEXT, AnalysisDataPath TEXT, Analysed INTEGER,
                    ServiceID INTEGER, rb_local_deleted INTEGER
                );
                CREATE TABLE djmdPlaylist (
                    ID TEXT PRIMARY KEY, Name TEXT, ParentID TEXT, Seq INTEGER, Attribute INTEGER,
                    rb_local_deleted INTEGER
                );
                CREATE TABLE djmdSongPlaylist (
                    ID TEXT PRIMARY KEY, PlaylistID TEXT, ContentID TEXT, TrackNo INTEGER,
                    rb_local_deleted INTEGER
                );
                INSERT INTO djmdArtist VALUES ('a', 'MÉMÉ');
                INSERT INTO djmdPlaylist VALUES ('p1', 'Memey', 'folder', 1, 0, 0);
                INSERT INTO djmdPlaylist VALUES ('p2', 'memey', 'root', 2, 0, 0);
                INSERT INTO djmdSongPlaylist VALUES ('s2', 'p1', 'missing', 2, 0);
                INSERT INTO djmdSongPlaylist VALUES ('s1', 'p1', 'track', 1, 0);
            """)
            db.execute("""
                INSERT INTO djmdContent
                VALUES ('track', 'uuid', '', 'Wii Shop.flac', 'a', NULL, NULL, 14800,
                        NULL, 128, 0, ?, '/ANLZ0000.DAT', 1, 0, 0)
            """, (str(self.track),))

        @contextmanager
        def read_fixture(path: Path):
            with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
                db.row_factory = sqlite3.Row
                yield db

        reader = patch.object(catalog, "read_rekordbox", read_fixture)
        reader.start()
        self.addCleanup(reader.stop)

    def search(self, *, history: bool = False) -> list[dict]:
        return catalog.search_catalog(argparse.Namespace(
            catalog=self.index, source=self.source, term="mémé", history=history,
            min_bpm=145, max_bpm=150, limit=10,
        ))

    def test_history_survives_removal_failed_refresh_and_reappearance(self) -> None:
        self.assertEqual(catalog.sync_catalog(self.index, self.source)["current"], 1)
        before = self.search()[0]
        self.assertEqual(before["title"], "Wii Shop.flac")
        with closing(sqlite3.connect(self.source)) as db, db:
            db.execute("INSERT INTO djmdContent (ID, rb_local_deleted) VALUES ('invalid', 0)")
        with self.assertRaises(sqlite3.IntegrityError):
            catalog.sync_catalog(self.index, self.source)
        self.assertEqual(self.search(), [before])
        with closing(sqlite3.connect(self.source)) as db, db:
            db.execute("DELETE FROM djmdContent WHERE ID = 'invalid'")
            db.execute("UPDATE djmdContent SET rb_local_deleted = 1 WHERE ID = 'track'")
        self.assertEqual(catalog.sync_catalog(self.index, self.source)["ever_seen"], 1)
        self.assertEqual(self.search(), [])
        self.assertEqual(self.search(history=True)[0]["in_collection"], 0)
        with closing(sqlite3.connect(self.source)) as db, db:
            db.execute("UPDATE djmdContent SET rb_local_deleted = 0, Title = 'Wii Shop' WHERE ID = 'track'")
        catalog.sync_catalog(self.index, self.source)
        after = self.search()[0]
        self.assertEqual(after["first_seen"], before["first_seen"])
        self.assertEqual(after["title"], "Wii Shop")

    def test_prepare_checks_files_and_will_not_overwrite_a_previous_plan(self) -> None:
        output = self.root / "Memey.m3u8"
        prepared = catalog.prepare_playlist(self.source, output, ["track"])
        self.assertEqual(prepared["tracks"][0]["id"], "track")
        expected = f"#EXTM3U\n{self.track}\n"
        self.assertEqual(output.read_text(), expected)
        with self.assertRaises(FileExistsError):
            catalog.prepare_playlist(self.source, output, ["track"])
        self.assertEqual(output.read_text(), expected)
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            catalog.prepare_playlist(self.source, self.root / "duplicate.m3u8", ["track", "track"])
        with closing(sqlite3.connect(self.source)) as db, db:
            db.execute("""
                INSERT INTO djmdContent (ID, UUID, FolderPath, rb_local_deleted)
                VALUES ('duplicate-path', 'uuid2', ?, 0)
            """, (str(self.track),))
        with self.assertRaisesRegex(ValueError, "ambiguous file path"):
            catalog.prepare_playlist(self.source, self.root / "ambiguous.m3u8", ["track"])
        self.assertFalse((self.root / "ambiguous.m3u8").exists())
        self.analysis.unlink()
        with self.assertRaisesRegex(ValueError, "analysis"):
            catalog.prepare_playlist(self.source, self.root / "unverified.m3u8", ["track"])
        self.assertFalse((self.root / "unverified.m3u8").exists())

    def test_playlist_name_collision_and_missing_members_keep_their_ids(self) -> None:
        matches = catalog.find_playlists(self.source, "MEMEY")
        self.assertEqual([(row["id"], row["parent_id"]) for row in matches], [
            ("p1", "folder"), ("p2", "root"),
        ])
        members = catalog.playlist_members(self.source, "p1")
        self.assertEqual([(row["position"], row["id"]) for row in members], [(1, "track"), (2, "missing")])
        self.assertIsNone(members[1]["title"])
