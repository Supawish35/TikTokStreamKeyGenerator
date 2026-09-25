import unittest
from unittest.mock import MagicMock

import app as flask_app
from TiktokStreamKeyGenerator import Stream


class TestLinkMic(unittest.TestCase):
    def setUp(self):
        self.client = flask_app.app.test_client()
        self.old_live = flask_app.is_live
        self.old_stream = flask_app.stream
        self.old_device_id = flask_app.device_id
        self.old_install_id = flask_app.install_id
        flask_app.device_id = "test-device"
        flask_app.install_id = "test-install"

    def tearDown(self):
        flask_app.is_live = self.old_live
        flask_app.stream = self.old_stream
        flask_app.device_id = self.old_device_id
        flask_app.install_id = self.old_install_id

    def test_status_returns_guest_count_for_live_stream(self):
        mock_stream = MagicMock()
        mock_stream.getLinkMicStatus.return_value = {"guest_count": 2, "available": True}
        flask_app.is_live = True
        flask_app.stream = mock_stream

        response = self.client.get("/api/linkmic/status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {
            "is_live": True, "guest_count": 2, "available": True
        })
        mock_stream.getLinkMicStatus.assert_called_once()

    def test_status_does_not_call_stream_when_offline(self):
        mock_stream = MagicMock()
        flask_app.is_live = False
        flask_app.stream = mock_stream

        response = self.client.get("/api/linkmic/status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {
            "is_live": False, "guest_count": None, "available": False
        })
        mock_stream.getLinkMicStatus.assert_not_called()

    def test_status_reports_upstream_error(self):
        mock_stream = MagicMock()
        mock_stream.getLinkMicStatus.side_effect = RuntimeError("upstream unavailable")
        flask_app.is_live = True
        flask_app.stream = mock_stream

        response = self.client.get("/api/linkmic/status")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json()["error"], "Unable to fetch LinkMic status.")

    def test_stream_method_returns_confirmed_count_only(self):
        stream = Stream.__new__(Stream)
        stream.getContinuableStreamInfo = MagicMock(return_value={
            "has_room": True,
            "link_mic_user_num": 3,
            "room": {"id": "room"},
        })

        self.assertEqual(stream.getLinkMicStatus(), {"guest_count": 3, "available": True})
        stream.getContinuableStreamInfo.assert_called_once_with(
            device_id="", install_id="", priority_region=""
        )

    def test_stream_method_marks_missing_room_unavailable(self):
        stream = Stream.__new__(Stream)
        stream.getContinuableStreamInfo = MagicMock(return_value={
            "has_room": False, "link_mic_user_num": None
        })

        self.assertEqual(stream.getLinkMicStatus(), {"guest_count": None, "available": False})


if __name__ == "__main__":
    unittest.main()
