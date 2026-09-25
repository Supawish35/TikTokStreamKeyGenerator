import os
import sys
import json
import io
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import app as flask_app

class TestComprehensive(unittest.TestCase):
    def setUp(self):
        flask_app.app.config['TESTING'] = True
        self.tmp_dir = tempfile.mkdtemp()
        self.test_cookies_path = os.path.join(self.tmp_dir, "comp_cookies.json")
        self.test_config_path = os.path.join(self.tmp_dir, "comp_config.json")

        with open(self.test_config_path, "w", encoding="utf-8") as f:
            json.dump({
                "device_id": "999888777",
                "install_id": "111222333",
                "hashtag_id": "5"
            }, f)

        self.orig_cookies = flask_app.COOKIES_PATH
        self.orig_config = flask_app.CONFIG_PATH
        flask_app.COOKIES_PATH = self.test_cookies_path
        flask_app.CONFIG_PATH = self.test_config_path
        flask_app.stream = None
        flask_app.is_live = False
        flask_app.is_paused = False
        flask_app.stream_end_event.clear()
        flask_app.proxy_process = None
        flask_app.portrait_proxy_process = None

        self.client = flask_app.app.test_client()

    def tearDown(self):
        flask_app.stop_ffmpeg_proxy()
        flask_app.COOKIES_PATH = self.orig_cookies
        flask_app.CONFIG_PATH = self.orig_config
        flask_app.stream = None
        flask_app.is_live = False
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_config_aliases_and_preservation(self):
        """Test config saves friendly aliases without overwriting device identifiers."""
        payload = {
            "title": "New Stream",
            "topic": "6",
            "game": "1001",
            "region": "us",
            "replay": False,
            "close_room": False,
            "dual_layout": True,
            "rapidapi_key": "test_api_key_xyz"
        }
        res = self.client.post('/api/config', json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["success"])

        # Verify on disk that device_id was preserved and aliases were mapped
        with open(self.test_config_path, "r", encoding="utf-8") as f:
            saved = json.load(f)
        self.assertEqual(saved.get("device_id"), "999888777")
        self.assertEqual(saved.get("install_id"), "111222333")
        self.assertEqual(saved.get("hashtag_id"), "6")
        self.assertEqual(saved.get("game_tag_id"), "1001")
        self.assertEqual(saved.get("priority_region"), "us")
        self.assertFalse(saved.get("generate_replay"))
        self.assertFalse(saved.get("close_room_when_close_stream"))
        self.assertTrue(saved.get("dual_layout_supported"))
        self.assertEqual(saved.get("rapidapi_key"), "test_api_key_xyz")

        # Verify GET /api/config returns both
        get_res = self.client.get('/api/config')
        self.assertEqual(get_res.status_code, 200)
        cfg_data = get_res.get_json()
        self.assertEqual(cfg_data["topic"], "6")
        self.assertEqual(cfg_data["game"], "1001")
        self.assertEqual(cfg_data["region"], "us")
        self.assertFalse(cfg_data["replay"])

    def test_cookie_upload_returns_username(self):
        """Verify cookie upload returns success and the parsed TikTok username."""
        mock_stream = MagicMock()
        mock_stream.getCreateRoomInfo.return_value = {
            "data": {
                "anchor_info": {"nick_name": "GamerGirl99"},
                "live_permission": True
            }
        }

        with patch('app.Stream', return_value=mock_stream):
            cookies = [{"name": "sessionid", "value": "abc"}]
            data = {
                'file': (io.BytesIO(json.dumps(cookies).encode('utf-8')), 'cookies.json')
            }
            res = self.client.post('/api/login/cookies', data=data, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 200)
            res_json = res.get_json()
            self.assertTrue(res_json["success"])
            self.assertEqual(res_json["username"], "GamerGirl99")

    def test_go_live_passes_thumbnail_and_options(self):
        """Verify thumbnail_path and dual_layout options are properly forwarded to createStream."""
        with open(self.test_cookies_path, "w", encoding='utf-8') as f:
            json.dump([{"name": "sessionid", "value": "abc"}], f)

        mock_stream = MagicMock()
        mock_stream.createStream.return_value = True
        mock_stream.baseStreamUrl = "rtmp://push.tiktok.com/live"
        mock_stream.streamKey = "key_main"
        mock_stream.streamUrl = "rtmp://push.tiktok.com/live/key_main"
        mock_stream.streamShareUrl = "https://tiktok.com/@live"
        mock_stream.roomId = "11223344"
        mock_stream.multiBaseStreamUrl = "rtmp://push.tiktok.com/live_multi"
        mock_stream.multiStreamKey = "key_multi"
        mock_stream.multiStreamUrl = "rtmp://push.tiktok.com/live_multi/key_multi"

        mock_proc = MagicMock()
        mock_proc.poll.return_value = None

        with patch('app.Stream', return_value=mock_stream), \
             patch('subprocess.Popen', return_value=mock_proc):

            payload = {
                "title": "Stream With Cover",
                "topic": "42",
                "game": "555",
                "region": "de",
                "replay": True,
                "close_room": True,
                "age_restricted": True,
                "dual_layout": True,
                "thumbnail_path": "/var/tmp/cover.jpg"
            }
            res = self.client.post('/api/go-live', json=payload)
            self.assertEqual(res.status_code, 200)

            mock_stream.createStream.assert_called_once_with(
                title="Stream With Cover",
                hashtag_id="42",
                game_tag_id="555",
                gen_replay=True,
                close_room_when_close_stream=True,
                age_restricted=True,
                priority_region="de",
                thumbnail_path="/var/tmp/cover.jpg",
                device_id="999888777",
                install_id="111222333",
                multi_stream_scene=1
            )

    def test_combined_stats_when_live(self):
        """Verify GET /api/stats combines realtime and trends data when stream is live."""
        flask_app.is_live = True
        mock_stream = MagicMock()
        mock_stream.getRealtimeStats.return_value = {
            "watch_count": 1500,
            "like_count": 320,
            "comment_count": 45,
            "share_count": 12,
            "new_fans_count": 8,
            "total_coin": 100
        }
        mock_stream.getTrendsStats.return_value = {
            "current_viewers": 230
        }
        flask_app.stream = mock_stream

        res = self.client.get('/api/stats')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        self.assertEqual(data["viewer_count"], 230)
        self.assertEqual(data["current_viewers"], 230)
        self.assertEqual(data["total_views"], 1500)
        self.assertEqual(data["likes"], 320)
        self.assertEqual(data["comments"], 45)
        self.assertEqual(data["shares"], 12)
        self.assertEqual(data["new_fans"], 8)
        self.assertEqual(data["total_coin"], 100)
        self.assertIn("realtime", data)
        self.assertIn("trends", data)

    def test_violations_enrichment(self):
        """Verify /api/violations enriches community_status, ban_status, and summaries."""
        flask_app.is_live = True
        mock_stream = MagicMock()
        mock_stream.getViolationStatus.return_value = {
            "status": "Active violation",
            "ban_active": False,
            "community_flagged": True,
            "community_review": False,
            "active_violation_records": [
                {
                    "violation_id_str": "vio_001",
                    "punish_info": {"punish_title": "Copyright Audio", "punish_reason": "Unlicensed music"}
                }
            ],
            "history_violation_records": []
        }
        flask_app.stream = mock_stream

        res = self.client.get('/api/violations')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["violation_summary"], "Active violation")
        self.assertEqual(data["community_status"], "Flagged")
        self.assertEqual(data["ban_status"], "Clear")
        self.assertEqual(len(data["active_violations"]), 1)
        self.assertEqual(data["active_violations"][0]["violation_id_str"], "vio_001")

    def test_sse_breaks_on_stream_end(self):
        """Verify that an active SSE stream generator terminates when stream ends."""
        flask_app.is_live = True
        flask_app.stream_end_event.clear()

        # Start generator while live, verify it yields, then set stream_end_event and verify termination
        with self.client.get('/api/events') as res:
            self.assertEqual(res.status_code, 200)
            it = iter(res.response)
            # Read first chunk
            chunk1 = next(it).decode('utf-8')
            self.assertTrue(len(chunk1) > 0)
            # Signal end of stream
            flask_app.stream_end_event.set()
            # Iterating should cleanly finish with StopIteration
            with self.assertRaises(StopIteration):
                while True:
                    next(it)

if __name__ == '__main__':
    unittest.main()
