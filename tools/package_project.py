"""封裝可上傳的完整原始碼，不包含本機環境、個人文件及暫存。"""

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = ("index.html", "Loading.html", "login.html", "desktop.html", "shutdown.html",
              "README.md", "RUN.cmd", ".gitignore", ".gitattributes", ".nojekyll")
SOURCE_DIRS = ("assets", "native", "tests", "tools", "docs", ".scratch/shared")


def project_files(root=ROOT):
    for name in ROOT_FILES:
        path = root / name
        if not path.is_file():
            raise FileNotFoundError(f"Missing project file: {name}")
        yield path
    for folder in SOURCE_DIRS:
        for path in sorted((root / folder).rglob("*")):
            relative = path.relative_to(root)
            if any(part in {"__pycache__", "node_modules", ".git", ".venv"} for part in relative.parts):
                continue
            if path.is_symlink() or path.name.startswith(".env") or path.suffix in {".pyc", ".pyo", ".log"}:
                continue
            if path.is_file():
                yield path


def package_project(output, root=ROOT):
    files = list(project_files(root))
    output = Path(output).resolve()
    if any(path.resolve() == output for path in files):
        raise ValueError("Archive output cannot overwrite a project source file")
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, path.relative_to(root).as_posix())
    return len(files)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".scratch/local/releases/WindingXO-project.zip")
    args = parser.parse_args()
    count = package_project(args.output)
    print(f"Packaged {count} files: {args.output} ({args.output.stat().st_size:,} bytes)")
