import os
import sys
import json
import io
import shutil
import tempfile
import unittest
import subprocess
from unittest.mock import MagicMock, patch

import app as flask_app

class TestEdgeCases(unittest.TestCase):
    def setUp(self):
        flask_app.app.config['TESTING'] = True
        self.tmp_dir = tempfile.mkdtemp()
        self.test_cookies_path = os.path.join(self.tmp_dir, "edge_cookies.json")

        self.orig_cookies = flask_app.COOKIES_PATH
        flask_app.COOKIES_PATH = self.test_cookies_path
        flask_app.stream = None
        flask_app.is_live = False
        flask_app.is_paused = False
        flask_app.proxy_process = None
        flask_app.portrait_proxy_process = None

        self.client = flask_app.app.test_client()

    def tearDown(self):
        flask_app.stop_ffmpeg_proxy()
        flask_app.COOKIES_PATH = self.orig_cookies
        flask_app.stream = None
        flask_app.is_live = False
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_proxy_cleanup_timeout_fallback(self):
        """Verify that if proxy fails to terminate within timeout, kill() is invoked."""
        mock_proc = MagicMock()
        mock_proc.terminate.return_value = None
        # First wait() times out, second wait() after kill succeeds
        mock_proc.wait.side_effect = [subprocess.TimeoutExpired(cmd="ffmpeg", timeout=2), 0]

        flask_app.proxy_process = mock_proc
        flask_app.portrait_proxy_process = None

        flask_app.stop_ffmpeg_proxy()

        mock_proc.terminate.assert_called_once()
        mock_proc.kill.assert_called_once()
        self.assertIsNone(flask_app.proxy_process)

    def test_go_live_without_cookies_fails(self):
        cookies_file = flask_app.get_cookies_path()
        if os.path.exists(cookies_file):
            os.remove(cookies_file)

        res = self.client.post('/api/go-live', json={"title": "Test"})
        self.assertEqual(res.status_code, 400)
        err_msg = res.get_json()["error"].lower()
        self.assertTrue("upload" in err_msg and "cookies" in err_msg)

    def test_go_live_tiktok_error(self):
        cookies_file = flask_app.get_cookies_path()
        with open(cookies_file, "w", encoding='utf-8') as f:
            json.dump([{"name": "sessionid", "value": "test"}], f)

        mock_stream = MagicMock()
        mock_stream.createStream.side_effect = RuntimeError("Account has no live streaming permission")

        with patch('app.Stream', return_value=mock_stream):
            flask_app.stream = None
            res = self.client.post('/api/go-live', json={"title": "Test"})
            self.assertEqual(res.status_code, 500)
            self.assertIn("no live streaming permission", res.get_json()["error"])

    def test_pause_resume_when_offline(self):
        flask_app.is_live = False

        res = self.client.post('/api/pause', json={})
        self.assertEqual(res.status_code, 400)
        self.assertIn("not currently live", res.get_json()["error"])

        res = self.client.post('/api/resume', json={})
        self.assertEqual(res.status_code, 400)
        self.assertIn("not currently live", res.get_json()["error"])

    def test_cookie_upload_missing_file(self):
        res = self.client.post('/api/login/cookies', data={})
        self.assertEqual(res.status_code, 400)
        self.assertIn("No file uploaded", res.get_json()["error"])

    def test_cookie_upload_invalid_content(self):
        data = {
            'file': (io.BytesIO(b'Random non cookie invalid garbage'), 'bad.txt')
        }
        res = self.client.post('/api/login/cookies', data=data, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)
        self.assertIn("Unable to parse cookies file", res.get_json()["error"])

    def test_offline_stats_and_audience(self):
        flask_app.is_live = False

        res = self.client.get('/api/stats')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json(), {"realtime": {}, "trends": {}})

        res = self.client.get('/api/audience')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json(), {})

        res = self.client.get('/api/violations')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json(), {})

if __name__ == '__main__':
    unittest.main()
