"""限於本機 texts 資料夾的 UTF-8 文件儲存。"""

import json
import os
import random
import re
import tempfile
from contextlib import contextmanager
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
        self._locked = False

    @contextmanager
    def _transaction(self):
        # 同一資料夾可由多個App開啟；鎖涵蓋整段索引讀取、文件改動及索引提交。
        with self._lock:
            if self._locked:
                yield
                return
            path = self.root / '.catalog.lock'
            if path.is_symlink():
                raise ValueError('文件索引鎖不可為連結。')
            with path.open('a+b') as stream:
                if stream.seek(0, os.SEEK_END) == 0:
                    stream.write(b'0')
                    stream.flush()
                stream.seek(0)
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
                else:
                    import fcntl
                    fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
                self._locked = True
                try:
                    yield
                finally:
                    self._locked = False
                    stream.seek(0)
                    if os.name == 'nt':
                        msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
                    else:
                        fcntl.flock(stream.fileno(), fcntl.LOCK_UN)

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
        return [entry['name'] for entry in self.catalog()]

    def _canonical_path(self, name, entries):
        path = self._path(name)
        canonical = next((key for key in entries if os.path.normcase(key) == os.path.normcase(path.name)), path.name)
        return self._path(canonical)

    def _catalog(self):
        path = self.root / '.catalog.json'
        if path.is_symlink():
            raise ValueError('文件索引不可為連結。')
        if path.exists():
            data = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(data, dict) or data.get('version') != 1 or not isinstance(data.get('files'), dict):
                raise ValueError('文件索引格式錯誤，請保留索引並檢查備份。')
            totals = dict.fromkeys(('head', 'torso', 'arms', 'legs'), 0)
            for name, entry in data['files'].items():
                if not isinstance(entry, dict) or not {'name', 'size', 'compiled', 'cost', 'region'} <= entry.keys():
                    raise ValueError('文件索引項目損壞。')
                cost, region = entry.get('cost'), entry.get('region')
                valid_cost = type(cost) is int and 30 <= cost <= 40
                if (entry.get('name') != name or type(entry.get('size')) is not int or entry['size'] < 0
                        or type(entry.get('compiled')) is not bool or (cost is not None and not valid_cost)
                        or (entry['compiled'] and not valid_cost)
                        or (region is not None and (not isinstance(region, str) or region not in totals or not entry['compiled']))):
                    raise ValueError('文件索引項目損壞。')
                if region is not None:
                    totals[region] += cost
            if any(used > 100 for used in totals.values()):
                raise ValueError('文件索引的部位資源超過容量。')
            return data['files']
        entries = {}
        for candidate in self.root.iterdir():
            try:
                if candidate.is_file() and self._path(candidate.name) == candidate:
                    entries[candidate.name] = self._entry(candidate.name, candidate.stat().st_size)
            except ValueError:
                continue
        self._write_catalog(entries)
        return entries

    @staticmethod
    def _entry(name, size):
        return dict(name=name, size=size, compiled=False, cost=None, region=None)

    def _write_catalog(self, entries):
        self._atomic_write(self.root / '.catalog.json', json.dumps(
            dict(version=1, files=entries), ensure_ascii=False, indent=2).encode('utf-8'))

    def _atomic_write(self, path, encoded):
        fd, temporary = tempfile.mkstemp(prefix='.save-', dir=self.root)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def catalog(self):
        with self._transaction():
            return sorted(self._catalog().values(), key=lambda entry: entry['name'].casefold())

    def compile(self, name):
        with self._transaction():
            entries = self._catalog()
            name = self._canonical_path(name, entries).name
            content = self.read(name)
            entry = entries.setdefault(name, self._entry(name, len(content.encode('utf-8'))))
            entry.update(compiled=True, cost=entry['cost'] or random.randint(30, 40), region=None)
            self._write_catalog(entries)
            return entry

    def activate(self, name, region):
        with self._transaction():
            entries = self._catalog()
            name = self._canonical_path(name, entries).name
            entry = entries.get(name)
            if not entry or not entry['compiled']:
                raise ValueError('請先編譯此能力。')
            if region is not None:
                if region not in ('head', 'torso', 'arms', 'legs'):
                    raise ValueError('無效的掛載部位。')
                used = sum(item['cost'] or 0 for key, item in entries.items() if key != name and item['region'] == region)
                if used + entry['cost'] > 100:
                    raise ValueError('此部位資源不足，請先解除其他能力。')
            entry['region'] = region
            self._write_catalog(entries)
            return entry

    def invalidate(self, name):
        with self._transaction():
            entries = self._catalog()
            name = self._canonical_path(name, entries).name
            if name in entries:
                entries[name].update(compiled=False, region=None)
                self._write_catalog(entries)

    def rename(self, name, new_name):
        with self._transaction():
            entries = self._catalog()
            source, target = self._canonical_path(name, entries), self._path(new_name)
            if not source.is_file():
                raise FileNotFoundError('找不到此文件。')
            if source.name == target.name:
                return target.name
            if (target.exists() and source != target) or target.name in entries:
                raise FileExistsError('已有同名文件，請使用其他名稱。')
            source.rename(target)
            entry = entries.pop(source.name, self._entry(source.name, target.stat().st_size))
            entry['name'] = target.name
            entries[target.name] = entry
            try:
                self._write_catalog(entries)
            except OSError:
                target.rename(source)
                raise
            return target.name

    def read(self, name: str) -> str:
        with self._transaction():
            path = self._path(name)
            if path.stat().st_size > self.LIMIT:
                raise ValueError("單一文件不得超過 2 MiB。")
            return path.read_text(encoding="utf-8-sig")

    def save(self, name: str, content: str, overwrite: bool = False) -> str:
        encoded = content.encode("utf-8")
        if len(encoded) > self.LIMIT:
            raise ValueError("單一文件不得超過 2 MiB。")
        with self._transaction():
            entries = self._catalog()
            path = self._canonical_path(name, entries)
            if path.exists() and not overwrite:
                raise FileExistsError("已有同名文件，是否覆寫？")
            previous = path.read_bytes() if path.exists() else None
            unchanged = previous is not None and previous.decode('utf-8-sig', errors='replace').replace('\r\n', '\n').replace('\r', '\n') == content
            self._atomic_write(path, encoded)
            entry = entries.setdefault(path.name, self._entry(path.name, len(encoded)))
            entry['size'] = len(encoded)
            if not unchanged:
                entry.update(compiled=False, region=None)
            try:
                self._write_catalog(entries)
            except OSError:
                if previous is None:
                    path.unlink()
                else:
                    self._atomic_write(path, previous)
                raise
            return path.name

    def delete(self, name: str) -> None:
        with self._transaction():
            entries = self._catalog()
            path = self._canonical_path(name, entries)
            trash = self.root / ".trash"
            if trash.is_symlink() or trash.resolve().parent != self.root:
                raise ValueError("復原資料夾不可為外部連結。")
            trash.mkdir(exist_ok=True)
            destination = trash / f"{uuid4().hex}-{path.name}"
            path.rename(destination)
            entries.pop(path.name, None)
            try:
                self._write_catalog(entries)
            except OSError:
                destination.rename(path)
                raise
