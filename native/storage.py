"""限於本機 texts 資料夾的 UTF-8 文件儲存。"""

import os
import re
import tempfile
from pathlib import Path
from threading import RLock
from uuid import uuid4


class TextStore:
    LIMIT = 2 * 1024 * 1024
    EXTENSIONS = {".txt", ".js", ".py", ".md"}

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()

    def _path(self, name: str) -> Path:
        if not isinstance(name, str) or not name or len(name) > 180:
            raise ValueError("請輸入 1 到 180 個字元的檔名。")
        if re.search(r'[<>:"/\\|?*\x00-\x1f]', name) or name.startswith(".") or name.endswith((" ", ".")):
            raise ValueError("檔名不可包含路徑、特殊符號，或以空白及句點結尾。")
        if re.fullmatch(r"(?i:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])", name.split(".")[0]):
            raise ValueError("此檔名為 Windows 保留名稱。")
        path = self.root / name
        if not path.suffix:
            path = path.with_suffix(".txt")
        if path.suffix.lower() not in self.EXTENSIONS:
            raise ValueError("請使用 .txt、.js、.py 或 .md 副檔名。")
        if path.is_symlink() or path.resolve().parent != self.root:
            raise ValueError("不可存取資料夾外的檔案或連結。")
        return path

    def list(self) -> list[str]:
        with self._lock:
            result = []
            for path in self.root.iterdir():
                try:
                    if path.is_file() and self._path(path.name) == path:
                        result.append(path.name)
                except ValueError:
                    continue
            return sorted(result, key=str.casefold)

    def read(self, name: str) -> str:
        with self._lock:
            path = self._path(name)
            if path.stat().st_size > self.LIMIT:
                raise ValueError("單一文件不得超過 2 MiB。")
            return path.read_text(encoding="utf-8-sig")

    def save(self, name: str, content: str, overwrite: bool = False) -> str:
        encoded = content.encode("utf-8")
        if len(encoded) > self.LIMIT:
            raise ValueError("單一文件不得超過 2 MiB。")
        with self._lock:
            path = self._path(name)
            if path.exists() and not overwrite:
                raise FileExistsError("已有同名文件，是否覆寫？")
            fd, temporary = tempfile.mkstemp(prefix=".save-", dir=self.root)
            try:
                with os.fdopen(fd, "wb") as stream:
                    stream.write(encoded)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            return path.name

    def delete(self, name: str) -> None:
        with self._lock:
            path = self._path(name)
            trash = self.root / ".trash"
            if trash.is_symlink() or trash.resolve().parent != self.root:
                raise ValueError("復原資料夾不可為外部連結。")
            trash.mkdir(exist_ok=True)
            path.rename(trash / f"{uuid4().hex}-{path.name}")
