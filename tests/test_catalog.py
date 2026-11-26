import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from native.storage import TextStore


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'legacy.txt').write_text('既有', encoding='utf-8')
        self.store = TextStore(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_import_once_and_persist(self):
        self.assertEqual(self.store.catalog()[0]['name'], 'legacy.txt')
        with patch.object(Path, 'iterdir', side_effect=AssertionError('不可重掃')):
            self.assertEqual(TextStore(self.root).list(), ['legacy.txt'])
        self.assertEqual(json.loads((self.root / '.catalog.json').read_text(encoding='utf-8'))['version'], 1)

    def test_cost_capacity_and_reload(self):
        for index in range(4):
            name = self.store.save(f'{index}.txt', 'skill')
            state = self.store.compile(name)
            self.assertTrue(30 <= state['cost'] <= 40)
            if index < 2:
                self.store.activate(name, 'head')
        cost = self.store.compile('0.txt')['cost']
        self.assertEqual(self.store.compile('0.txt')['cost'], cost)
        self.store.activate('0.txt', 'head')
        with self.assertRaises(ValueError):
            self.store.activate('3.txt', 'unknown')
        # 四項即使最低消耗也超過100%。
        for index in (2, 3):
            try:
                self.store.activate(f'{index}.txt', 'head')
            except ValueError:
                pass
        entries = TextStore(self.root).catalog()
        mounted = [entry for entry in entries if entry['region'] == 'head']
        self.assertIn(len(mounted), (2, 3))
        self.assertLessEqual(sum(entry['cost'] for entry in mounted), 100)

    def test_rename_preserves_and_changed_content_invalidates(self):
        state = self.store.compile('legacy.txt')
        self.store.activate('legacy.txt', 'arms')
        self.store.rename('legacy.txt', 'renamed.md')
        entry = self.store.catalog()[0]
        self.assertEqual((entry['region'], entry['cost']), ('arms', state['cost']))
        self.assertEqual(self.store.read('renamed.md'), '既有')
        self.store.save('renamed.md', '既有', True)
        self.assertTrue(self.store.catalog()[0]['compiled'])
        self.store.save('renamed.md', 'new', True)
        entry = self.store.catalog()[0]
        self.assertFalse(entry['compiled'])
        self.assertIsNone(entry['region'])
        self.assertEqual(entry['cost'], state['cost'])
        with self.assertRaises(ValueError):
            self.store.activate('renamed.md', 'head')
        self.store.save('taken.txt', 'keep')
        with self.assertRaises(FileExistsError):
            self.store.rename('renamed.md', 'taken.txt')
        self.assertEqual(self.store.read('taken.txt'), 'keep')
        self.store.delete('renamed.md')
        self.assertEqual(self.store.list(), ['taken.txt'])

    def test_case_rename_and_draft_invalidation_persist(self):
        cost = self.store.compile('legacy.txt')['cost']
        self.store.activate('legacy.txt', 'legs')
        self.store.rename('legacy.txt', 'LEGACY.txt')
        self.assertEqual(self.store.list(), ['LEGACY.txt'])
        self.assertEqual(self.store.catalog()[0]['region'], 'legs')
        self.store.invalidate('LEGACY.txt')
        entry = TextStore(self.root).catalog()[0]
        self.assertEqual((entry['compiled'], entry['region'], entry['cost']), (False, None, cost))

    def test_corrupt_index_is_not_overwritten(self):
        self.store.catalog()
        path = self.root / '.catalog.json'
        path.write_text('broken', encoding='utf-8')
        with self.assertRaises(ValueError):
            self.store.save('new.txt', 'new')
        self.assertFalse((self.root / 'new.txt').exists())
        self.assertEqual(path.read_text(encoding='utf-8'), 'broken')

    def test_index_write_failure_rolls_back_content_operations(self):
        self.store.catalog()
        with patch.object(self.store, '_write_catalog', side_effect=OSError('disk full')):
            for operation in (
                lambda: self.store.save('legacy.txt', 'changed', True),
                lambda: self.store.save('new.txt', 'new'),
                lambda: self.store.rename('legacy.txt', 'renamed.txt'),
                lambda: self.store.delete('legacy.txt'),
            ):
                with self.assertRaises(OSError):
                    operation()
                self.assertEqual(self.store.read('legacy.txt'), '既有')
                self.assertEqual(self.store.list(), ['legacy.txt'])
                self.assertFalse((self.root / 'new.txt').exists())
                self.assertFalse((self.root / 'renamed.txt').exists())

    def test_same_content_crlf_preserves_mount(self):
        (self.root / 'legacy.txt').write_bytes(b'first\r\nsecond\r\n')
        self.store.compile('legacy.txt')
        self.store.activate('legacy.txt', 'head')
        self.store.save('legacy.txt', self.store.read('legacy.txt'), True)
        self.assertEqual(self.store.catalog()[0]['region'], 'head')

    @unittest.skipUnless(os.name == 'nt', 'Windows大小寫不敏感檔名')
    def test_case_alias_save_has_single_entry(self):
        self.store.compile('legacy.txt')
        self.store.activate('legacy.txt', 'head')
        self.assertEqual(self.store.save('LEGACY.txt', '既有', True), 'legacy.txt')
        self.assertEqual(self.store.list(), ['legacy.txt'])
        self.assertEqual(self.store.catalog()[0]['region'], 'head')
        self.store.rename('legacy.txt', 'LEGACY.txt')
        self.store.compile('legacy.txt')
        self.assertEqual(self.store.list(), ['LEGACY.txt'])
        self.store.activate('legacy.txt', 'head')
        self.store.invalidate('legacy.txt')
        self.assertFalse(self.store.catalog()[0]['compiled'])
        self.store.delete('legacy.txt')
        self.assertEqual(self.store.list(), [])

    def test_bad_entry_rejected_before_file_mutation(self):
        path = self.root / '.catalog.json'
        path.write_text(json.dumps({'version': 1, 'files': {'legacy.txt': None}}), encoding='utf-8')
        for operation in (
            lambda: self.store.save('legacy.txt', 'replacement', True),
            lambda: self.store.rename('legacy.txt', 'renamed.txt'),
            lambda: self.store.delete('legacy.txt'),
        ):
            with self.assertRaises(ValueError):
                operation()
            self.assertEqual((self.root / 'legacy.txt').read_text(encoding='utf-8'), '既有')
            self.assertFalse((self.root / 'renamed.txt').exists())
        for field in ('cost', 'region'):
            item = dict(name='legacy.txt', size=6, compiled=False, cost=None, region=None)
            del item[field]
            path.write_text(json.dumps({'version': 1, 'files': {'legacy.txt': item}}), encoding='utf-8')
            with self.assertRaises(ValueError):
                self.store.compile('legacy.txt')

    def test_concurrent_app_instances_preserve_all_files(self):
        self.store.catalog()
        worker = '''
import sys,time
from pathlib import Path
from native.storage import TextStore
root=Path(sys.argv[1]); index=sys.argv[2]; store=TextStore(root)
(root / ('.ready-'+index)).touch()
while not (root / '.start').exists(): time.sleep(.01)
for item in range(15): store.save(f'worker-{index}-{item}.txt', 'content')
'''
        processes = [subprocess.Popen([sys.executable, '-c', worker, str(self.root), str(index)]) for index in range(2)]
        try:
            deadline = time.monotonic() + 10
            while not all((self.root / f'.ready-{index}').exists() for index in range(2)):
                if time.monotonic() > deadline:
                    self.fail('worker startup timeout')
                time.sleep(.01)
            (self.root / '.start').touch()
            for process in processes:
                self.assertEqual(process.wait(timeout=25), 0)
            self.assertEqual(len(self.store.list()), 31)
        finally:
            for process in processes:
                if process.poll() is None:
                    process.kill()
                    process.wait()


if __name__ == '__main__':
    unittest.main()
