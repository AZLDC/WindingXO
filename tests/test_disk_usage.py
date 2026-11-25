import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'native'))
import main as app


class DiskUsageTests(unittest.TestCase):
    def test_app_volume_usage_and_error_result(self):
        with tempfile.TemporaryDirectory() as folder:
            api=app.DesktopAPI(Path(folder))
            with patch.object(app.shutil,'disk_usage',return_value=(4_000_000_000,1_280_000_000,2_720_000_000)) as usage:
                self.assertEqual(api.get_disk_usage(),{'ok':True,'value':{'total':4_000_000_000,'used':1_280_000_000,'free':2_720_000_000}})
                usage.assert_called_once_with(app.ROOT)
            with patch.object(app.shutil,'disk_usage',side_effect=OSError('unavailable')):
                self.assertEqual(api.get_disk_usage(),{'ok':False,'error':'unavailable'})


if __name__=='__main__':
    unittest.main()
