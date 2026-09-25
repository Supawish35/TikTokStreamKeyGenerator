import os
import sys
import json
import io
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import app as flask_app

class TestApp(unittest.TestCase):
    def setUp(self):
        flask_app.app.config['TESTING'] = True
        self.tmp_dir = tempfile.mkdtemp()
        self.test_cookies_path = os.path.join(self.tmp_dir, "test_cookies.json")
        self.test_config_path = os.path.join(self.tmp_dir, "test_config.json")

        with open(self.test_config_path, "w", encoding="utf-8") as f:
            json.dump({
                "test_key": "test_val",
                "device_id": "7689175736356292117",
                "install_id": "7689177697239222036"
            }, f)

        self.orig_cookies = flask_app.COOKIES_PATH
        self.orig_config = flask_app.CONFIG_PATH
        flask_app.COOKIES_PATH = self.test_cookies_path
        flask_app.CONFIG_PATH = self.test_config_path
        flask_app.stream = None
        flask_app.is_live = False
        flask_app.is_paused = False
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

    def test_zero_pyside6_imports(self):
        """Verify PySide6 is mocked and no GUI engine is loaded."""
        self.assertIn('PySide6', sys.modules)
        self.assertIsInstance(sys.modules['PySide6'], MagicMock)

    def test_config_get_and_post(self):
        res = self.client.get('/api/config')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIsInstance(data, dict)

        res = self.client.post('/api/config', json={"new_setting": "enabled"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json().get("success"))

    def test_topics_endpoint(self):
        res = self.client.get('/api/topics')
        self.assertEqual(res.status_code, 200)
        topics = res.get_json()
        self.assertIsInstance(topics, dict)
        self.assertIn('5', topics)

    def test_games_endpoint(self):
        res = self.client.get('/api/games')
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.get_json(), dict)

    def test_quota_endpoint(self):
        res = self.client.get('/api/quota')
        self.assertEqual(res.status_code, 200)
        q = res.get_json()
        self.assertIn("limit", q)
        self.assertIn("remaining", q)

    def test_account_no_cookies(self):
        if os.path.exists(flask_app.get_cookies_path()):
            os.remove(flask_app.get_cookies_path())

        res = self.client.get('/api/account')
        self.assertEqual(res.status_code, 200)
        acc = res.get_json()
        self.assertEqual(acc["status"], "no_cookies")
        self.assertFalse(acc["can_go_live"])

    def test_cookie_upload_json(self):
        sample_cookies = [
            {"name": "sessionid", "value": "test_session_123"},
            {"name": "tt_chain_token", "value": "test_token_456"}
        ]
        data = {
            'file': (io.BytesIO(json.dumps(sample_cookies).encode('utf-8')), 'cookies.json')
        }
        res = self.client.post('/api/login/cookies', data=data, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json().get("success"))
        cookies_file = flask_app.get_cookies_path()
        self.assertTrue(os.path.exists(cookies_file))
        with open(cookies_file, encoding='utf-8') as f:
            saved = json.load(f)
        self.assertEqual(len(saved), 2)
        self.assertEqual(saved[0]["name"], "sessionid")

    def test_cookie_upload_netscape(self):
        netscape_content = (
            "# Netscape HTTP Cookie File\n"
            ".tiktok.com\tTRUE\t/\tTRUE\t1758652800\tsessionid\tnetscape_val_123\n"
            ".tiktok.com\tTRUE\t/\tTRUE\t1758652800\ttt_csrf_token\tcsrf_val_456\n"
        )
        data = {
            'file': (io.BytesIO(netscape_content.encode('utf-8')), 'cookies.txt')
        }
        res = self.client.post('/api/login/cookies', data=data, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json().get("success"))
        cookies_file = flask_app.get_cookies_path()
        self.assertTrue(os.path.exists(cookies_file))
        with open(cookies_file, encoding='utf-8') as f:
            saved = json.load(f)
        self.assertEqual(len(saved), 2)
        self.assertEqual(saved[0]["name"], "sessionid")
        self.assertEqual(saved[0]["value"], "netscape_val_123")

    def test_account_with_mock_cookies(self):
        with open(flask_app.get_cookies_path(), "w", encoding='utf-8') as f:
            json.dump([{"name": "sessionid", "value": "xyz"}], f)

        mock_stream = MagicMock()
        mock_stream.getCreateRoomInfo.return_value = {
            "anchor_info": {"nick_name": "StreamerBob"},
            "live_permission": True,
            "multi_stream_scene": 1
        }

        with patch('app.Stream', return_value=mock_stream):
            flask_app.stream = None
            res = self.client.get('/api/account')
            self.assertEqual(res.status_code, 200)
            acc = res.get_json()
            self.assertEqual(acc["username"], "StreamerBob")
            self.assertTrue(acc["can_go_live"])
            self.assertTrue(acc["dual_layout_supported"])
            self.assertEqual(acc["status"], "ready")

    def test_go_live_lifecycle_and_proxy_args(self):
        with open(flask_app.get_cookies_path(), "w", encoding='utf-8') as f:
            json.dump([{"name": "sessionid", "value": "xyz"}], f)

        mock_stream = MagicMock()
        mock_stream.createStream.return_value = True
        mock_stream.baseStreamUrl = "rtmp://push.tiktok.com/live"
        mock_stream.streamKey = "streamkey_abc123"
        mock_stream.streamUrl = "rtmp://push.tiktok.com/live/streamkey_abc123"
        mock_stream.streamShareUrl = "https://www.tiktok.com/@live/share"
        mock_stream.roomId = "739281928"
        mock_stream.multiBaseStreamUrl = "rtmp://push.tiktok.com/live_multi"
        mock_stream.multiStreamKey = "streamkey_portrait_456"
        mock_stream.multiStreamUrl = "rtmp://push.tiktok.com/live_multi/streamkey_portrait_456"

        mock_proc = MagicMock()
        mock_proc.poll.return_value = None

        with patch('app.Stream', return_value=mock_stream), \
             patch('subprocess.Popen', return_value=mock_proc) as mock_popen, \
             patch('app._bundled_ffmpeg_path', return_value="/usr/bin/ffmpeg"):

            flask_app.stream = None
            go_live_payload = {
                "title": "My Awesome Stream",
                "topic": "5",
                "game": "123",
                "replay": True,
                "close_room": True,
                "age_restricted": False,
                "dual_layout": True
            }
            res = self.client.post('/api/go-live', json=go_live_payload)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(data["stream_url"], "rtmp://127.0.0.1:19350/live")
            self.assertEqual(data["stream_key"], "obs")
            self.assertEqual(data["portrait_url"], "rtmp://127.0.0.1:19351/live")
            self.assertEqual(data["portrait_key"], "portrait")
            self.assertEqual(data["room_id"], "739281928")

            # Verify proxy subprocess invocations
            self.assertEqual(mock_popen.call_count, 2)
            # Landscape call args
            call1_args = mock_popen.call_args_list[0][0][0]
            self.assertIn("--ffmpeg", call1_args)
            self.assertIn("/usr/bin/ffmpeg", call1_args)
            self.assertIn("--listen-url", call1_args)
            self.assertIn("rtmp://127.0.0.1:19350/live/obs", call1_args)
            self.assertIn("--output-url", call1_args)
            self.assertIn("rtmp://push.tiktok.com/live/streamkey_abc123", call1_args)
            self.assertIn("--resolution", call1_args)
            self.assertIn("1920x1080", call1_args)

            # Portrait call args
            call2_args = mock_popen.call_args_list[1][0][0]
            self.assertIn("--listen-url", call2_args)
            self.assertIn("rtmp://127.0.0.1:19351/live/portrait", call2_args)
            self.assertIn("--resolution", call2_args)
            self.assertIn("1080x1920", call2_args)

            # Test Status
            status_res = self.client.get('/api/status')
            self.assertEqual(status_res.status_code, 200)
            st = status_res.get_json()
            self.assertTrue(st["is_live"])
            self.assertEqual(st["proxy_status"], "running")

            # Test Pause
            pause_res = self.client.post('/api/pause', json={})
            self.assertEqual(pause_res.status_code, 200)
            mock_stream.pauseStream.assert_called_once()
            self.assertTrue(flask_app.is_paused)

            # Test Resume
            resume_res = self.client.post('/api/resume', json={})
            self.assertEqual(resume_res.status_code, 200)
            mock_stream.resumePausedStream.assert_called_once()
            self.assertFalse(flask_app.is_paused)

            # Test End Live
            end_res = self.client.post('/api/end-live', json={})
            self.assertEqual(end_res.status_code, 200)
            mock_stream.endStream.assert_called_once()
            self.assertFalse(flask_app.is_live)
            self.assertIsNone(flask_app.proxy_process)
            self.assertIsNone(flask_app.portrait_proxy_process)
            mock_proc.terminate.assert_called()

    def test_sse_event_stream_format(self):
        flask_app.is_live = False
        with self.client.get('/api/events') as res:
            self.assertEqual(res.status_code, 200)
            self.assertIn('text/event-stream', res.content_type)
            chunk = next(res.response).decode('utf-8')
            self.assertTrue(
                chunk.startswith("event: heartbeat") or
                chunk.startswith("event: status") or
                chunk.startswith("event: quota")
            )

    def test_account_with_get_account_info(self):
        """Verify /api/account extracts username, screen_name, avatar, and permissions from getAccountInfo."""
        with open(flask_app.get_cookies_path(), "w", encoding='utf-8') as f:
            json.dump([{"name": "sessionid", "value": "xyz"}], f)

        mock_stream = MagicMock()
        mock_stream.getAccountInfo.return_value = {
            "account": {
                "username": "official_streamer",
                "screen_name": "Official Streamer Display",
                "avatar_url": "https://avatar.url/pic.jpg",
                "user_id_str": "9988776655"
            },
            "can_go_live": True,
            "status": "Ready",
            "allow_multi_stream_scene1": True,
            "dual_layout_unlocked": True
        }

        with patch('app.Stream', return_value=mock_stream):
            flask_app.stream = None
            res = self.client.get('/api/account')
            self.assertEqual(res.status_code, 200)
            acc = res.get_json()
            self.assertEqual(acc["username"], "official_streamer")
            self.assertEqual(acc["screen_name"], "Official Streamer Display")
            self.assertEqual(acc["avatar_url"], "https://avatar.url/pic.jpg")
            self.assertEqual(acc["user_id"], "9988776655")
            self.assertTrue(acc["can_go_live"])
            self.assertTrue(acc["dual_layout_supported"])
            self.assertEqual(acc["status"], "ready")

    def test_cookie_upload_wrapped_dict_and_semicolon(self):
        """Verify upload handles dict wrappers like {'cookies': [...]} and raw cookie strings."""
        mock_stream = MagicMock()
        mock_stream.getAccountInfo.return_value = {
            "account": {"username": "wrapped_user", "screen_name": "Wrapped User"},
            "can_go_live": True,
            "status": "Ready"
        }
        with patch('app.Stream', return_value=mock_stream):
            # 1. Wrapped dictionary format
            wrapped = {"cookies": [{"name": "sessionid", "value": "wrapped_val"}]}
            data = {'file': (io.BytesIO(json.dumps(wrapped).encode('utf-8')), 'cookies.json')}
            res = self.client.post('/api/login/cookies', data=data, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get_json()["username"], "wrapped_user")

            # 2. Raw semicolon string
            raw = "sessionid=raw_cookie_val; tt_chain_token=chain_123"
            data = {'file': (io.BytesIO(raw.encode('utf-8')), 'cookies.txt')}
            res = self.client.post('/api/login/cookies', data=data, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get_json()["username"], "wrapped_user")

    def test_cookie_upload_netscape_with_httponly_prefix(self):
        """Verify Netscape cookies with #HttpOnly_ prefixes retain sessionid."""
        mock_stream = MagicMock()
        mock_stream.getAccountInfo.return_value = {
            "account": {"username": "httponly_user", "screen_name": "HttpOnly Display"},
            "can_go_live": True,
            "status": "Ready"
        }
        with patch('app.Stream', return_value=mock_stream):
            content = (
                "# Netscape HTTP Cookie File\n"
                "#HttpOnly_.tiktok.com\tTRUE\t/\tTRUE\t1758652800\tsessionid\thttponly_secret_val\n"
                ".tiktok.com\tTRUE\t/\tTRUE\t1758652800\ttt_csrf_token\tcsrf_123\n"
            )
            data = {'file': (io.BytesIO(content.encode('utf-8')), 'cookies.txt')}
            res = self.client.post('/api/login/cookies', data=data, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 200)
            res_data = res.get_json()
            self.assertTrue(res_data["success"])
            self.assertEqual(res_data["username"], "httponly_user")

            cookies_file = flask_app.get_cookies_path()
            with open(cookies_file, encoding='utf-8') as f:
                saved = json.load(f)
            names = [c["name"] for c in saved]
            self.assertIn("sessionid", names)

    def test_cookie_upload_json_key_value_map(self):
        """Verify JSON dict mapping name -> value is parsed properly."""
        mock_stream = MagicMock()
        mock_stream.getAccountInfo.return_value = {
            "account": {"username": "kv_user", "screen_name": "KV User"},
            "can_go_live": True,
            "status": "Ready"
        }
        with patch('app.Stream', return_value=mock_stream):
            kv_map = {"sessionid": "kv_sess_val", "ttwid": "kv_ttwid_val"}
            data = {'file': (io.BytesIO(json.dumps(kv_map).encode('utf-8')), 'cookies.json')}
            res = self.client.post('/api/login/cookies', data=data, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.get_json()["success"])
            self.assertEqual(res.get_json()["username"], "kv_user")

    def test_cookie_upload_raw_header_cookie_prefix(self):
        """Verify raw cookie header string with 'Cookie: ' prefix parses sessionid cleanly."""
        mock_stream = MagicMock()
        mock_stream.getAccountInfo.return_value = {
            "account": {"username": "prefix_user", "screen_name": "Prefix User"},
            "can_go_live": True,
            "status": "Ready"
        }
        with patch('app.Stream', return_value=mock_stream):
            raw = "Cookie: sessionid=val_with_prefix; ttwid=val2"
            data = {'file': (io.BytesIO(raw.encode('utf-8')), 'cookies.txt')}
            res = self.client.post('/api/login/cookies', data=data, content_type='multipart/form-data')
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get_json()["username"], "prefix_user")

            cookies_file = flask_app.get_cookies_path()
            with open(cookies_file, encoding='utf-8') as f:
                saved = json.load(f)
            names = [c["name"] for c in saved]
            self.assertIn("sessionid", names)
            self.assertNotIn("Cookie: sessionid", names)

    def test_account_session_expired_handling(self):
        """Verify that account_info_error is NOT treated as username and status is session_expired."""
        with open(flask_app.get_cookies_path(), "w", encoding='utf-8') as f:
            json.dump([{"name": "sessionid", "value": "expired_val"}], f)

        mock_stream = MagicMock()
        mock_stream.getAccountInfo.return_value = {
            "account": {
                "name": "account_info_error",
                "description": "session expired, please sign in again",
                "error_code": 13,
                "user_id": 0
            },
            "can_go_live": False,
            "status": "Restricted"
        }

        with patch('app.Stream', return_value=mock_stream):
            flask_app.stream = None
            res = self.client.get('/api/account')
            self.assertEqual(res.status_code, 200)
            acc = res.get_json()
            self.assertEqual(acc["username"], "")
            self.assertEqual(acc["status"], "session_expired")
            self.assertIn("session expired", acc["message"].lower())

    def test_account_resolves_unique_id_and_nickname(self):
        """Verify unique_id and nickname are extracted when username is missing."""
        with open(flask_app.get_cookies_path(), "w", encoding='utf-8') as f:
            json.dump([{"name": "sessionid", "value": "val"}], f)

        mock_stream = MagicMock()
        mock_stream.getAccountInfo.return_value = {
            "account": {
                "unique_id": "gamer_unique",
                "nickname": "Gamer Nickname",
                "user_id_str": "12345"
            },
            "can_go_live": True,
            "status": "Ready"
        }

        with patch('app.Stream', return_value=mock_stream):
            flask_app.stream = None
            res = self.client.get('/api/account')
            self.assertEqual(res.status_code, 200)
            acc = res.get_json()
            self.assertEqual(acc["username"], "gamer_unique")
            self.assertEqual(acc["screen_name"], "Gamer Nickname")

    def test_cookie_upload_json_paste(self):
        """Verify pasting cookies via JSON payload to /api/login/cookies works."""
        mock_stream = MagicMock()
        mock_stream.getAccountInfo.return_value = {
            "account": {"username": "pasted_user", "screen_name": "Pasted User"},
            "can_go_live": True,
            "status": "Ready"
        }
        with patch('app.Stream', return_value=mock_stream):
            payload = {"cookies": "sessionid=pasted_sess; ttwid=pasted_ttwid"}
            res = self.client.post('/api/login/cookies', json=payload)
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.get_json()["success"])
            self.assertEqual(res.get_json()["username"], "pasted_user")

    def test_cookie_upload_curl_command(self):
        """Verify pasting a cURL command parses sessionid cleanly without corrupted keys."""
        mock_stream = MagicMock()
        mock_stream.getAccountInfo.return_value = {
            "account": {"username": "curl_user", "screen_name": "Curl User"},
            "can_go_live": True,
            "status": "Ready"
        }
        with patch('app.Stream', return_value=mock_stream):
            curl_cmd = (
                "curl 'https://www.tiktok.com/' \\\n"
                "  -H 'accept: text/html' \\\n"
                "  -H 'cookie: sessionid=curl_sess_val; ttwid=curl_ttwid_val' \\\n"
                "  --compressed"
            )
            res = self.client.post('/api/login/cookies', json={"cookies": curl_cmd})
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.get_json()["success"])
            self.assertEqual(res.get_json()["username"], "curl_user")

            cookies_file = flask_app.get_cookies_path()
            with open(cookies_file, encoding='utf-8') as f:
                saved = json.load(f)
            names = [c["name"] for c in saved]
            self.assertIn("sessionid", names)
            self.assertIn("ttwid", names)
            # Ensure no garbage headers got parsed as cookies
            self.assertNotIn("accept", names)

    def test_cookie_upload_set_cookie_header(self):
        """Verify Set-Cookie headers ignore attributes like Path and Domain."""
        mock_stream = MagicMock()
        mock_stream.getAccountInfo.return_value = {
            "account": {"username": "set_user", "screen_name": "Set User"},
            "can_go_live": True,
            "status": "Ready"
        }
        with patch('app.Stream', return_value=mock_stream):
            raw = (
                "Set-Cookie: sessionid=sess_set_cookie; Path=/; Domain=.tiktok.com; Secure; HttpOnly\r\n"
                "Set-Cookie: ttwid=ttwid_set_cookie; Path=/"
            )
            res = self.client.post('/api/login/cookies', json={"cookies": raw})
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.get_json()["success"])
            self.assertEqual(res.get_json()["username"], "set_user")

            cookies_file = flask_app.get_cookies_path()
            with open(cookies_file, encoding='utf-8') as f:
                saved = json.load(f)
            names = [c["name"] for c in saved]
            self.assertIn("sessionid", names)
            self.assertNotIn("Path", names)
            self.assertNotIn("Domain", names)
            self.assertNotIn("HttpOnly", names)

    def test_init_stream_mirrors_sessionid_ss_in_memory(self):
        """Verify that initializing stream with only sessionid mirrors sessionid_ss in memory."""
        with open(flask_app.get_cookies_path(), "w", encoding='utf-8') as f:
            json.dump([{"name": "sessionid", "value": "single_token_abc"}], f)

        flask_app.stream = None
        ok, err = flask_app.init_stream()
        self.assertTrue(ok)
        self.assertIsNotNone(flask_app.stream)
        self.assertEqual(flask_app.stream.s.cookies.get("sessionid"), "single_token_abc")
        self.assertEqual(flask_app.stream.s.cookies.get("sessionid_ss"), "single_token_abc")

    def test_stream_init_with_dict_cookies_on_disk(self):
        """Verify Stream initializes cleanly when cookies.json on disk is a dict."""
        from TiktokStreamKeyGenerator import Stream
        dict_cookies_path = os.path.join(self.tmp_dir, "dict_cookies.json")
        with open(dict_cookies_path, "w", encoding="utf-8") as f:
            json.dump({"sessionid": "dict_token_123"}, f)

        stream = Stream(cookies_path=dict_cookies_path)
        self.assertEqual(stream.s.cookies.get("sessionid"), "dict_token_123")
        self.assertEqual(stream.s.cookies.get("sessionid_ss"), "dict_token_123")

    def test_account_with_signer_error_status(self):
        """Verify that RapidAPI signature failure surfaces as signer_error status."""
        with open(flask_app.get_cookies_path(), "w", encoding='utf-8') as f:
            json.dump([{"name": "sessionid", "value": "test_val"}], f)

        mock_stream = MagicMock()
        mock_stream.getAccountInfo.side_effect = RuntimeError("signature API failed: RapidAPI signer HTTP 403: Forbidden")

        with patch('app.Stream', return_value=mock_stream):
            flask_app.stream = None
            res = self.client.get('/api/account')
            self.assertEqual(res.status_code, 200)
            acc = res.get_json()
            self.assertEqual(acc["username"], "")
            self.assertEqual(acc["status"], "signer_error")
            self.assertIn("RapidAPI", acc["message"])

    def test_cookie_upload_missing_sessionid_warns(self):
        """Verify uploading cookies without sessionid returns success=False and no_cookies status."""
        res = self.client.post('/api/login/cookies', json={"cookies": "tt_csrf_token=csrf_only_val"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertFalse(data["success"])
        self.assertEqual(data["status"], "no_cookies")
        self.assertIn("sessionid", data["message"].lower())

    def test_save_rapidapi_key_resets_stream(self):
        """Verify saving rapidapi_key in config resets stream and sets env variable."""
        flask_app.stream = MagicMock()
        res = self.client.post('/api/config', json={"rapidapi_key": "new_rapidapi_key_test"})
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(flask_app.stream)
        self.assertEqual(os.environ.get("RAPIDAPI_KEY"), "new_rapidapi_key_test")

if __name__ == '__main__':
    unittest.main()

