"""檢查GitHub Pages引用、原始碼封裝與本機資料隔離。"""

import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile

from tools.package_project import ROOT, ROOT_FILES, package_project


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in {"src", "href"} and value:
                self.paths.append(value)


class ProjectLayoutTests(unittest.TestCase):
    def test_root_pages_and_case_sensitive_asset_references(self):
        self.assertTrue((ROOT / ".nojekyll").is_file())
        for page in ("index.html", "Loading.html", "login.html", "desktop.html", "shutdown.html"):
            parser = References()
            parser.feed((ROOT / page).read_text(encoding="utf-8"))
            for reference in parser.paths:
                url = urlsplit(reference)
                if url.scheme or url.netloc:
                    continue
                self.assertFalse(url.path.startswith("/"), "Project Pages assets must use relative URLs")
                target = ROOT
                for part in Path(unquote(url.path)).parts:
                    self.assertIn(part, [p.name for p in target.iterdir()], f"Missing/case-mismatched asset: {reference}")
                    target /= part
                self.assertTrue(target.is_file(), reference)

    def test_upload_package_contains_sources_and_excludes_local_data(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "project.zip"
            package_project(output)
            with ZipFile(output) as archive:
                names = set(archive.namelist())
                self.assertTrue(set(ROOT_FILES) <= names)
                for required in ("assets/models/avatar-license.json", "assets/js/shell.js", "native/main.py",
                                 "native/requirements.txt", "tests/browser_check.mjs", "tools/convert-avatar.mjs", "docs/deployment.md"):
                    self.assertIn(required, names)
                for name in names:
                    self.assertFalse(any(part in {".venv", "__pycache__", "texts", "data", "graphify-out"} for part in Path(name).parts), name)
                    self.assertFalse(name.startswith(".scratch/local/"), name)

    def test_packager_filters_private_files_even_under_source_folders(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ROOT_FILES:
                (root / name).write_text("", encoding="utf-8")
            for name in ("native/.env", "assets/.env.local", "native/__pycache__/test.pyc", "native/test.log", "texts/note.txt", "data/window-state.json", "assets/js/ok.js"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("private" if name != "assets/js/ok.js" else "ok", encoding="utf-8")
            output = root / "upload.zip"
            package_project(output, root)
            with ZipFile(output) as archive:
                self.assertEqual(set(archive.namelist()), set(ROOT_FILES) | {"assets/js/ok.js"})


if __name__ == "__main__":
    unittest.main()
