import tempfile
import unittest
from pathlib import Path

from native.storage import TextStore


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "texts"
        self.store = TextStore(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_utf8_persists_and_updates(self):
        self.store.save("筆記", "中文\nprint('hello')")
        reopened = TextStore(self.root)
        self.assertEqual(reopened.list(), ["筆記.txt"])
        self.assertEqual(reopened.read("筆記.txt"), "中文\nprint('hello')")
        reopened.save("筆記.txt", "更新", overwrite=True)
        self.assertEqual(self.store.read("筆記.txt"), "更新")

    def test_collision_does_not_overwrite(self):
        self.store.save("test.py", "original")
        with self.assertRaises(FileExistsError):
            self.store.save("test.py", "replacement")
        self.assertEqual(self.store.read("test.py"), "original")

    def test_delete_is_recoverable(self):
        self.store.save("note.txt", "recover me")
        self.store.delete("note.txt")
        self.assertEqual(self.store.list(), [])
        self.assertEqual(next((self.root / ".trash").iterdir()).read_text(encoding="utf-8"), "recover me")

    def test_invalid_names(self):
        for name in ("../secret.txt", "a/b.txt", "a\\b.txt", "CON.txt", "nul.py", "test.exe", "x:ads.txt", ".hidden.txt", "trail.txt "):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.store.save(name, "bad")

    def test_large_file_rejected(self):
        with self.assertRaises(ValueError):
            self.store.save("huge.txt", "x" * (2 * 1024 * 1024 + 1))

    def test_list_only_text_files(self):
        self.store.save("script.js", "const x = 1;")
        (self.root / "outside.exe").write_text("ignored")
        (self.root / "folder.txt").mkdir()
        self.assertEqual(self.store.list(), ["script.js"])

    def test_symlink_cannot_escape(self):
        outside = Path(self.temp.name) / "outside.txt"
        outside.write_text("secret", encoding="utf-8")
        try:
            (self.root / "link.txt").symlink_to(outside)
        except OSError:
            self.skipTest("本機未允許建立符號連結")
        self.assertEqual(self.store.list(), [])
        with self.assertRaises(ValueError):
            self.store.read("link.txt")
        with self.assertRaises(ValueError):
            self.store.save("link.txt", "overwrite", True)
        self.assertEqual(outside.read_text(encoding="utf-8"), "secret")


if __name__ == "__main__":
    unittest.main()
