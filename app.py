import os
import sys
import time
import json
import threading
import subprocess
import signal
import atexit
import re
from unittest.mock import MagicMock

COOKIE_ATTRIBUTES = {
    "path", "domain", "expires", "max-age", "samesite", "secure",
    "httponly", "priority", "comment", "version"
}

# Ensure zero PySide6 imports / GUI dependencies in web runtime
for mod in ["PySide6", "PySide6.QtCore", "PySide6.QtGui", "PySide6.QtWidgets"]:
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

from flask import Flask, request, jsonify, Response
from flask_cors import CORS

from TiktokStreamKeyGenerator import (
    Stream,
    _configured_cookies_path,
    _load_config_file,
    TOPICS,
    fetch_game_tags,
    _normalize_configured_path,
    CONFIG_PATH,
    DEFAULT_COOKIES_PATH,
    register_desktop_device_identifiers,
    _bundled_ffmpeg_path,
    LOCAL_PROXY_DEFAULT_PORT,
    LOCAL_PROXY_APP_NAME,
    LOCAL_PROXY_STREAM_KEY,
    LOCAL_PROXY_PORTRAIT_DEFAULT_PORT,
    LOCAL_PROXY_PORTRAIT_STREAM_KEY,
    PASSPORT_WEB_SDK_VERSION,
    _apply_passport_sdk_signature,
    build_endpoint,
)
from Libs.rapidapi_quota import read_quota, quota_reset_at, quota_updated_at, format_quota

app = Flask(__name__)
CORS(app)

COOKIES_PATH = None
stream = None
device_id = ""
install_id = ""

proxy_process = None
portrait_proxy_process = None
heartbeat_thread = None
heartbeat_running = False
stream_end_event = threading.Event()

is_live = False
is_paused = False
stream_url = ""
stream_key = ""
share_url = ""
room_id = ""
portrait_url = ""
portrait_key = ""

def get_cookies_path():
    """Return configured cookies path, supporting override for testing/environment."""
    global COOKIES_PATH
    if COOKIES_PATH:
        return COOKIES_PATH
    return _configured_cookies_path()

def load_config():
    """Load config from CONFIG_PATH safely, respecting test/environment overrides."""
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return _load_config_file() if callable(_load_config_file) else {}

def init_stream():
    """Initializes Stream instance safely. Returns (success: bool, error_msg: str | None)."""
    global stream, device_id, install_id
    cookies_path = get_cookies_path()
    if not os.path.exists(cookies_path):
        return False, "Cookies file not found. Please upload your TikTok cookies."
    if not stream:
        try:
            cfg = load_config() or {}
            device_id = str(cfg.get("device_id") or "")
            install_id = str(cfg.get("install_id") or "")
            if not device_id or not install_id:
                try:
                    device_id, install_id = register_desktop_device_identifiers()
                    cfg["device_id"] = device_id
                    cfg["install_id"] = install_id
                    try:
                        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                            json.dump(cfg, f, indent=4)
                    except Exception:
                        pass
                except Exception:
                    device_id = "7689175736356292117"
                    install_id = "7689177697239222036"
            stream = Stream(cookies_path=cookies_path)
            # Ensure sessionid <-> sessionid_ss sync in session jar without altering file count
            if hasattr(stream, "s") and hasattr(stream.s, "cookies"):
                if "sessionid" in stream.s.cookies and "sessionid_ss" not in stream.s.cookies:
                    stream.s.cookies.set("sessionid_ss", stream.s.cookies.get("sessionid"))
                elif "sessionid_ss" in stream.s.cookies and "sessionid" not in stream.s.cookies:
                    stream.s.cookies.set("sessionid", stream.s.cookies.get("sessionid_ss"))
        except Exception as e:
            stream = None
            return False, f"Failed to initialize stream with cookies: {str(e)}"
    return True, None

def _extract_avatar(data):
    if not isinstance(data, dict):
        return ""
    for key in ("avatar_url", "avatar_thumb", "avatar_medium", "avatar_larger"):
        val = data.get(key)
        if isinstance(val, str) and val:
            return val
        if isinstance(val, dict):
            urls = val.get("url_list") or []
            if urls and isinstance(urls[0], str) and urls[0]:
                return urls[0]
    return ""

def _finalize_cookies(cookies):
    """
    Deduplicates cookies preserving the best occurrence of each cookie name.
    Prioritizes cookies associated with TikTok domains over foreign domains.
    """
    seen = {}
    for c in cookies:
        name = c.get("name")
        if not name:
            continue
        if name in seen:
            old_domain = str(seen[name].get("domain") or "").lower()
            new_domain = str(c.get("domain") or "").lower()
            if "tiktok" in old_domain and "tiktok" not in new_domain:
                continue
        seen[name] = c
    return list(seen.values())

def parse_cookies_content(content: str):
    """
    Parses cookies from JSON (list, wrapper dict, key-value dict), Netscape format,
    cURL commands, Set-Cookie headers, or raw Cookie headers.
    Returns a list of dicts each with at least 'name' and 'value'.
    """
    if not content:
        return []

    content_clean = content.strip()

    # 1. Try JSON parsing
    try:
        data = json.loads(content_clean)
        # Handle dict formats: {"cookies": [...]}, {"Cookie": [...]}, {"data": {"cookies": [...]}}
        if isinstance(data, dict):
            if isinstance(data.get("cookies"), list):
                data = data["cookies"]
            elif isinstance(data.get("Cookie"), list):
                data = data["Cookie"]
            elif isinstance(data.get("data"), dict) and isinstance(data["data"].get("cookies"), list):
                data = data["data"]["cookies"]
            elif isinstance(data.get("cookies"), str):
                try:
                    nested = json.loads(data["cookies"])
                    if isinstance(nested, list):
                        data = nested
                except Exception:
                    pass
            elif "name" in data and "value" in data:
                data = [data]
            else:
                # Key-value dictionary: {"sessionid": "...", "ttwid": "..."}
                kv_items = []
                sub_dict = data.get("cookies") if isinstance(data.get("cookies"), dict) else data
                for k, v in sub_dict.items():
                    if isinstance(v, (str, int, float, bool)):
                        kv_items.append({"name": str(k).strip(), "value": str(v).strip()})
                if kv_items:
                    data = kv_items

        if isinstance(data, list):
            parsed = []
            for item in data:
                if isinstance(item, dict):
                    name = item.get("name") or item.get("key")
                    value = item.get("value")
                    if value is None and "val" in item:
                        value = item.get("val")
                    if name not in (None, "") and value is not None:
                        entry = dict(item)
                        entry["name"] = str(name).strip()
                        entry["value"] = str(value).strip()
                        parsed.append(entry)
            if parsed:
                return _finalize_cookies(parsed)
    except Exception:
        pass

    # 2. Try Netscape format (tab-separated lines, including #HttpOnly_ prefixes)
    netscape_cookies = []
    lines = content_clean.splitlines()
    for line in lines:
        line = line.strip()
        if not line:
            continue
        is_http_only = False
        if line.lower().startswith('#httponly_'):
            is_http_only = True
            line = line[len('#httponly_'):].strip()
        elif line.startswith('#'):
            continue

        parts = line.split('\t')
        if len(parts) >= 7:
            netscape_cookies.append({
                "domain": parts[0].strip(),
                "flag": parts[1].upper() == "TRUE" or parts[1] == "1",
                "path": parts[2].strip(),
                "secure": parts[3].upper() == "TRUE" or parts[3] == "1",
                "expiration": int(parts[4]) if parts[4].lstrip('-').isdigit() else -1,
                "name": str(parts[5]).strip(),
                "value": str(parts[6]).strip(),
                "httpOnly": is_http_only
            })
    if netscape_cookies:
        return _finalize_cookies(netscape_cookies)

    # 3. Extract cookie string from cURL commands or HTTP headers
    curl_matches = re.findall(r"""(?:-H|--header)\s*['"]([Cc]ookie|Set-Cookie):\s*([^'"]+)['"]""", content_clean, re.IGNORECASE)
    if curl_matches:
        header_clean = "; ".join(m[1] for m in curl_matches)
    else:
        curl_b = re.findall(r"""(?:-b|--cookie)\s*['"]?([^'"\s]+)['"]?""", content_clean)
        if curl_b:
            header_clean = "; ".join(curl_b)
        else:
            cookie_lines = [
                line.split(":", 1)[1].strip()
                for line in content_clean.splitlines()
                if line.strip().lower().startswith("cookie:") or line.strip().lower().startswith("set-cookie:")
            ]
            if cookie_lines:
                header_clean = "; ".join(cookie_lines)
            else:
                header_clean = content_clean

    kv_cookies = []
    normalized = header_clean.replace('\r\n', ';').replace('\n', ';')
    for item in normalized.split(';'):
        item = item.strip()
        if not item or item.startswith('#'):
            continue
        if item.lower().startswith("cookie:"):
            item = item[7:].strip()
        elif item.lower().startswith("set-cookie:"):
            item = item[11:].strip()
        if '=' in item:
            k, v = item.split('=', 1)
            k = k.strip().strip("'\" ")
            v = v.strip().strip("'\" ")
            if k and v and k.lower() not in COOKIE_ATTRIBUTES:
                kv_cookies.append({"name": k, "value": v})
    if kv_cookies:
        return _finalize_cookies(kv_cookies)

    return []

def extract_account_details(stream_obj, device_id_val, install_id_val, priority_region="", topic_id="5"):
    """
    Extracts account info using Stream.getAccountInfo (live studio desktop passport API)
    with fallbacks for passport API and mock tests.
    """
    username = ""
    screen_name = ""
    avatar_url = ""
    user_id = ""
    can_go_live = False
    dual_layout_supported = False
    status_text = "ready"
    message_text = ""

    # Check if session cookies exist in session
    session_names = {"sessionid", "sessionid_ss", "sid_tt", "sid_guard", "multi_sids"}
    has_session = False
    if hasattr(stream_obj, "s") and hasattr(stream_obj.s, "cookies"):
        has_session = any(name in stream_obj.s.cookies for name in session_names)

    signer_error = None

    # 1. Try real Stream.getAccountInfo() (the official desktop app method)
    if hasattr(stream_obj, "getAccountInfo"):
        try:
            info = stream_obj.getAccountInfo(
                device_id=device_id_val,
                install_id=install_id_val,
                priority_region=priority_region,
                last_time_hashtag_id=topic_id,
            )
            if isinstance(info, dict):
                account = info.get("account")
                if isinstance(account, dict):
                    # Check for session expiration / invalid session
                    error_code = account.get("error_code")
                    is_error_name = account.get("name") == "account_info_error"
                    user_id_val = str(account.get("user_id") or account.get("user_id_str") or "")
                    desc = account.get("description") or account.get("error_desc") or ""

                    if is_error_name or (error_code not in (0, "0", None)) or (user_id_val in ("0", "") and not account.get("username") and not account.get("screen_name") and not account.get("unique_id")):
                        return {
                            "username": "",
                            "screen_name": "",
                            "avatar_url": "",
                            "user_id": "",
                            "can_go_live": False,
                            "dual_layout_supported": False,
                            "status": "session_expired",
                            "message": desc or "TikTok session expired or invalid. Please sign in to TikTok and export fresh cookies."
                        }

                    username = (
                        account.get("username")
                        or account.get("unique_id")
                        or account.get("display_id")
                        or account.get("login_name")
                        or account.get("user_name")
                        or (account.get("screen_name") if account.get("screen_name") != "account_info_error" else "")
                        or (account.get("nickname") if account.get("nickname") != "account_info_error" else "")
                        or (account.get("nick_name") if account.get("nick_name") != "account_info_error" else "")
                        or (account.get("name") if account.get("name") != "account_info_error" else "")
                        or ""
                    )
                    screen_name = (
                        account.get("screen_name")
                        or account.get("nickname")
                        or account.get("nick_name")
                        or account.get("display_name")
                        or (account.get("name") if account.get("name") != "account_info_error" else "")
                        or username
                    )
                    avatar_url = _extract_avatar(account)
                    user_id = str(account.get("user_id_str") or account.get("user_id") or "")
                    if user_id == "0":
                        user_id = ""

                can_go_live = bool(info.get("can_go_live", False))
                status_text = info.get("status", "ready" if can_go_live else "restricted")
                allow_dual = info.get("allow_multi_stream_scene1", False)
                dual_layout_supported = bool(allow_dual and info.get("dual_layout_unlocked", False))
        except Exception as e:
            err_msg = str(e)
            if any(k in err_msg.lower() for k in ("rapidapi", "signer", "signature", "subscribed", "quota", "rate-limit")):
                signer_error = err_msg

    # 2. Fallback to direct passport endpoint if webcast endpoints failed or username not resolved
    if not username and hasattr(stream_obj, "s"):
        try:
            verify_fp = f"verify_{device_id_val}" if device_id_val else "verify_0"
            account_params = _apply_passport_sdk_signature({
                "device_id": str(device_id_val) if device_id_val else "0",
                "aid": "8311",
                "account_sdk_source": "web",
                "sdk_version": PASSPORT_WEB_SDK_VERSION,
                "verifyFp": verify_fp,
            })
            account_payload = None
            if hasattr(stream_obj, "_signed_get_json"):
                try:
                    account_payload = stream_obj._signed_get_json(
                        build_endpoint("api.tiktokv.com", "passport/account/info/v2/", stream_obj.s),
                        params=account_params,
                        priority_region=priority_region,
                    )
                except Exception as e:
                    err_msg = str(e)
                    if any(k in err_msg.lower() for k in ("rapidapi", "signer", "signature", "subscribed", "quota", "rate-limit")):
                        signer_error = err_msg

            # If signed call failed or unavailable, try direct GET using session cookies
            if not account_payload or not isinstance(account_payload.get("data"), dict):
                try:
                    passport_url = build_endpoint("api.tiktokv.com", "passport/account/info/v2/", stream_obj.s)
                    raw_resp = stream_obj.s.get(passport_url, params=account_params, timeout=10)
                    if raw_resp.status_code == 200:
                        account_payload = raw_resp.json()
                except Exception:
                    pass

            account_data = account_payload.get("data", {}) if isinstance(account_payload, dict) else {}
            if isinstance(account_data, dict) and account_data:
                error_code = account_data.get("error_code")
                is_error_name = account_data.get("name") == "account_info_error"
                desc = account_data.get("description") or account_data.get("error_desc") or ""

                if is_error_name or (error_code not in (0, "0", None)):
                    return {
                        "username": "",
                        "screen_name": "",
                        "avatar_url": "",
                        "user_id": "",
                        "can_go_live": False,
                        "dual_layout_supported": False,
                        "status": "session_expired",
                        "message": desc or "TikTok session expired or invalid. Please sign in to TikTok and export fresh cookies."
                    }
                username = (
                    account_data.get("username")
                    or account_data.get("unique_id")
                    or account_data.get("display_id")
                    or account_data.get("login_name")
                    or account_data.get("user_name")
                    or (account_data.get("screen_name") if account_data.get("screen_name") != "account_info_error" else "")
                    or (account_data.get("nickname") if account_data.get("nickname") != "account_info_error" else "")
                    or (account_data.get("nick_name") if account_data.get("nick_name") != "account_info_error" else "")
                    or (account_data.get("name") if account_data.get("name") != "account_info_error" else "")
                    or ""
                )
                screen_name = (
                    account_data.get("screen_name")
                    or account_data.get("nickname")
                    or account_data.get("nick_name")
                    or account_data.get("display_name")
                    or (account_data.get("name") if account_data.get("name") != "account_info_error" else "")
                    or username
                )
                avatar_url = _extract_avatar(account_data) or avatar_url
                user_id = str(account_data.get("user_id_str") or account_data.get("user_id") or user_id)
                if user_id == "0":
                    user_id = ""
        except Exception as e:
            err_msg = str(e)
            if any(k in err_msg.lower() for k in ("rapidapi", "signer", "signature", "subscribed", "quota", "rate-limit")):
                signer_error = err_msg

    # 3. Fallback to getCreateRoomInfo / anchor_info (for mock tests and backwards compatibility)
    if not username and hasattr(stream_obj, "getCreateRoomInfo"):
        try:
            room_info = stream_obj.getCreateRoomInfo(device_id=device_id_val, install_id=install_id_val)
            if isinstance(room_info, dict):
                data = room_info.get("data", {}) if isinstance(room_info.get("data"), dict) else {}
                anchor = data.get("anchor_info") or room_info.get("anchor_info") or {}
                if isinstance(anchor, dict):
                    username = (
                        anchor.get("nick_name")
                        or anchor.get("nickname")
                        or anchor.get("display_id")
                        or anchor.get("username")
                        or ""
                    )
                    screen_name = anchor.get("nick_name") or anchor.get("nickname") or username
                if "live_permission" in data or "live_permission" in room_info:
                    can_go_live = bool(data.get("live_permission", room_info.get("live_permission", False)))
                    status_text = "ready" if can_go_live else "restricted"
                if "multi_stream_scene" in data or "multi_stream_scene" in room_info:
                    dual_layout_supported = bool((data.get("multi_stream_scene", room_info.get("multi_stream_scene")) == 1))
        except Exception:
            pass

    if not username and not screen_name:
        if signer_error:
            status_text = "signer_error"
            message_text = signer_error
        elif not has_session:
            status_text = "no_cookies"
            message_text = "No TikTok session cookies found (sessionid is missing)."
        else:
            status_text = "unknown"
            message_text = "Could not resolve TikTok username from cookies. Please ensure you are logged into TikTok."

    return {
        "username": username,
        "screen_name": screen_name,
        "avatar_url": avatar_url,
        "user_id": user_id,
        "can_go_live": can_go_live,
        "dual_layout_supported": dual_layout_supported,
        "status": status_text.lower() if status_text.lower() in ("ready", "restricted", "unknown", "no_cookies", "session_expired", "signer_error") else status_text,
        "message": message_text,
    }

def stop_ffmpeg_proxy():
    """Safely terminates all active proxy subprocesses with timeout and fallback kill."""
    global proxy_process, portrait_proxy_process
    for proc in [proxy_process, portrait_proxy_process]:
        if proc:
            try:
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=2)
            except Exception:
                pass
    proxy_process = None
    portrait_proxy_process = None

atexit.register(stop_ffmpeg_proxy)

def _sig_handler(signum, frame):
    stop_ffmpeg_proxy()
    sys.exit(0)

try:
    signal.signal(signal.SIGTERM, _sig_handler)
    signal.signal(signal.SIGINT, _sig_handler)
except Exception:
    pass

def heartbeat_loop():
    """Background heartbeat loop sending keep-alive to TikTok every 5s."""
    global heartbeat_running, is_paused, device_id, install_id, room_id
    while heartbeat_running:
        try:
            if stream and is_live:
                if is_paused:
                    stream.pausedHeartbeat(device_id=device_id, install_id=install_id, room_id=room_id)
                else:
                    stream.liveHeartbeat(device_id=device_id, install_id=install_id, room_id=room_id)
        except Exception:
            pass
        time.sleep(5)

@app.route('/api/config', methods=['GET', 'POST'])
def config():
    try:
        if request.method == 'GET':
            cfg = load_config() or {}
            # Map canonical config keys to friendly keys for UI convenience
            result = dict(cfg)
            result.setdefault("topic", cfg.get("hashtag_id", "5"))
            result.setdefault("game", cfg.get("game_tag_id", ""))
            result.setdefault("region", cfg.get("priority_region", ""))
            result.setdefault("replay", cfg.get("generate_replay", True))
            result.setdefault("close_room", cfg.get("close_room_when_close_stream", True))
            result.setdefault("age_restricted", cfg.get("age_restricted", False))
            result.setdefault("dual_layout", cfg.get("dual_layout_supported", False))
            result.setdefault("cookies_path", cfg.get("cookies_path", DEFAULT_COOKIES_PATH))
            result.setdefault("rapidapi_key", cfg.get("rapidapi_key", ""))
            return jsonify(result)
        else:
            data = request.json or {}
            # Load existing config to avoid blowing away device identifiers
            existing = load_config() or {}
            merged = dict(existing)
            merged.update(data)
            # Map friendly UI keys to canonical keys
            if "topic" in data:
                merged["hashtag_id"] = data["topic"]
            if "game" in data:
                merged["game_tag_id"] = data["game"]
            if "region" in data:
                merged["priority_region"] = data["region"]
            if "replay" in data:
                merged["generate_replay"] = bool(data["replay"])
            if "close_room" in data:
                merged["close_room_when_close_stream"] = bool(data["close_room"])
            if "dual_layout" in data:
                merged["dual_layout_supported"] = bool(data["dual_layout"])
            if "rapidapi_key" in data:
                global stream
                stream = None
                key_val = str(data["rapidapi_key"]).strip()
                if key_val:
                    os.environ["RAPIDAPI_KEY"] = key_val

            # Atomic write to avoid partial read corruption by SEI proxy
            os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
            tmp_path = CONFIG_PATH + ".tmp"
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(merged, f, indent=4)
            os.replace(tmp_path, CONFIG_PATH)
            return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/account', methods=['GET'])
def account():
    try:
        ok, err = init_stream()
        if not ok:
            return jsonify({
                "username": "",
                "screen_name": "",
                "avatar_url": "",
                "user_id": "",
                "can_go_live": False,
                "dual_layout_supported": False,
                "status": "no_cookies",
                "message": err
            })
        cfg = load_config() or {}
        topic_id = cfg.get("hashtag_id", "5")
        priority_region = cfg.get("priority_region", "")
        details = extract_account_details(stream, device_id, install_id, priority_region=priority_region, topic_id=topic_id)
        return jsonify({
            "username": details.get("username", ""),
            "screen_name": details.get("screen_name", ""),
            "avatar_url": details.get("avatar_url", ""),
            "user_id": details.get("user_id", ""),
            "can_go_live": details.get("can_go_live", False),
            "dual_layout_supported": details.get("dual_layout_supported", False),
            "status": details.get("status", "ready"),
            "message": details.get("message", "")
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/topics', methods=['GET'])
def topics():
    return jsonify(TOPICS)

@app.route('/api/games', methods=['GET'])
def games():
    try:
        return jsonify(fetch_game_tags())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/go-live', methods=['POST'])
def go_live():
    global is_live, is_paused, heartbeat_running, heartbeat_thread, stream_end_event
    global stream_url, stream_key, share_url, room_id, proxy_process, portrait_proxy_process, portrait_url, portrait_key
    try:
        ok, err = init_stream()
        if not ok:
            return jsonify({"error": err or "Please upload cookies before going live"}), 400

        data = request.json or {}
        options = data.get('options') or {}
        
        # Support both flat keys and nested options object
        replay = data.get('replay', options.get('replay', True))
        close_room = data.get('close_room', options.get('close_room', True))
        age_restricted = data.get('age_restricted', options.get('age_restricted', False))
        dual_layout = data.get('dual_layout', options.get('dual_layout', False))
        thumbnail_path = data.get('thumbnail_path', '')

        res = stream.createStream(
            title=data.get('title', ''),
            hashtag_id=data.get('topic', '5'),
            game_tag_id=data.get('game', ''),
            gen_replay=replay,
            close_room_when_close_stream=close_room,
            age_restricted=age_restricted,
            priority_region=data.get('region', ''),
            thumbnail_path=thumbnail_path,
            device_id=device_id,
            install_id=install_id,
            multi_stream_scene=1 if dual_layout else 0
        )
        if not res:
            return jsonify({"error": "Failed to create stream on TikTok"}), 500

        stream_url = stream.baseStreamUrl
        stream_key = stream.streamKey
        share_url = stream.streamShareUrl
        room_id = stream.roomId
        portrait_url = getattr(stream, "multiBaseStreamUrl", "")
        portrait_key = getattr(stream, "multiStreamKey", "")

        is_live = True
        is_paused = False
        stream_end_event.clear()

        # Terminate any previously running proxies
        stop_ffmpeg_proxy()

        sei_proxy_script = os.path.join(os.path.dirname(__file__), "Libs", "ffmpeg_sei_proxy.py")
        try:
            ffmpeg_path = _bundled_ffmpeg_path()
        except Exception:
            ffmpeg_path = "ffmpeg"

        primary_tiktok_output = stream.streamUrl if hasattr(stream, "streamUrl") and stream.streamUrl else f"{stream_url}/{stream_key}"

        child_env = os.environ.copy()
        config_data = _load_config_file() if callable(_load_config_file) else {}
        rapidapi_key = config_data.get("rapidapi_key", "")
        if rapidapi_key:
            child_env["RAPIDAPI_KEY"] = rapidapi_key

        landscape_listen_url = f"rtmp://127.0.0.1:{LOCAL_PROXY_DEFAULT_PORT}/{LOCAL_PROXY_APP_NAME}/{LOCAL_PROXY_STREAM_KEY}"
        landscape_cmd = [
            sys.executable, sei_proxy_script,
            "--ffmpeg", ffmpeg_path,
            "--listen-url", landscape_listen_url,
            "--output-url", primary_tiktok_output,
            "--device-id", str(device_id),
            "--room-id", str(room_id),
            "--aid", "8311",
            "--fps", "60",
            "--resolution", "1920x1080",
            "--timeout", "120"
        ]

        proxy_process = subprocess.Popen(
            landscape_cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=child_env
        )

        # Launch portrait proxy if dual layout was selected and portrait output URL is present
        if dual_layout and getattr(stream, "multiStreamUrl", ""):
            portrait_tiktok_output = stream.multiStreamUrl
            portrait_listen_url = f"rtmp://127.0.0.1:{LOCAL_PROXY_PORTRAIT_DEFAULT_PORT}/{LOCAL_PROXY_APP_NAME}/{LOCAL_PROXY_PORTRAIT_STREAM_KEY}"
            portrait_cmd = [
                sys.executable, sei_proxy_script,
                "--ffmpeg", ffmpeg_path,
                "--listen-url", portrait_listen_url,
                "--output-url", portrait_tiktok_output,
                "--device-id", str(device_id),
                "--room-id", str(room_id),
                "--aid", "8311",
                "--fps", "60",
                "--resolution", "1080x1920",
                "--timeout", "120"
            ]
            portrait_proxy_process = subprocess.Popen(
                portrait_cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=child_env
            )

        heartbeat_running = True
        if not heartbeat_thread or not heartbeat_thread.is_alive():
            heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
            heartbeat_thread.start()

        return jsonify({
            "stream_url": f"rtmp://127.0.0.1:{LOCAL_PROXY_DEFAULT_PORT}/{LOCAL_PROXY_APP_NAME}",
            "stream_key": LOCAL_PROXY_STREAM_KEY,
            "share_url": share_url,
            "proxy_status": "running",
            "room_id": room_id,
            "portrait_url": f"rtmp://127.0.0.1:{LOCAL_PROXY_PORTRAIT_DEFAULT_PORT}/{LOCAL_PROXY_APP_NAME}" if dual_layout else "",
            "portrait_key": LOCAL_PROXY_PORTRAIT_STREAM_KEY if dual_layout else "",
            "tiktok_ingest_url": stream_url,
            "tiktok_ingest_key": stream_key
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/end-live', methods=['POST'])
def end_live():
    global is_live, is_paused, heartbeat_running, stream_end_event
    try:
        if is_live and stream:
            try:
                stream.endStream(device_id=device_id, install_id=install_id, room_id=room_id)
            except Exception:
                pass
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        is_live = False
        is_paused = False
        heartbeat_running = False
        stream_end_event.set()
        stop_ffmpeg_proxy()
    return jsonify({"success": True})

@app.route('/api/pause', methods=['POST'])
def pause():
    global is_paused
    try:
        if not stream or not is_live:
            return jsonify({"error": "Stream is not currently live"}), 400
        stream.pauseStream(device_id=device_id, install_id=install_id, room_id=room_id)
        is_paused = True
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/resume', methods=['POST'])
def resume():
    global is_paused
    try:
        if not stream or not is_live:
            return jsonify({"error": "Stream is not currently live"}), 400
        stream.resumePausedStream(device_id=device_id, install_id=install_id, room_id=room_id)
        is_paused = False
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({
        "is_live": is_live,
        "is_paused": is_paused,
        "stream_url": f"rtmp://127.0.0.1:{LOCAL_PROXY_DEFAULT_PORT}/{LOCAL_PROXY_APP_NAME}" if is_live else "",
        "stream_key": LOCAL_PROXY_STREAM_KEY if is_live else "",
        "share_url": share_url,
        "proxy_status": "running" if proxy_process and proxy_process.poll() is None else "stopped",
        "room_id": room_id,
        "portrait_url": f"rtmp://127.0.0.1:{LOCAL_PROXY_PORTRAIT_DEFAULT_PORT}/{LOCAL_PROXY_APP_NAME}" if (is_live and portrait_proxy_process and portrait_proxy_process.poll() is None) else "",
        "portrait_key": LOCAL_PROXY_PORTRAIT_STREAM_KEY if (is_live and portrait_proxy_process and portrait_proxy_process.poll() is None) else ""
    })

def _collect_combined_stats():
    """Helper to fetch and bundle realtime and trends stats into a unified payload."""
    if not is_live or not stream:
        return {"realtime": {}, "trends": {}, "viewer_count": 0, "total_views": 0, "likes": 0, "comments": 0, "shares": 0, "new_fans": 0, "total_coin": 0, "current_viewers": 0}
    try:
        rt = stream.getRealtimeStats(device_id=device_id, install_id=install_id, room_id=room_id) or {}
    except Exception:
        rt = {}
    try:
        tr = stream.getTrendsStats(device_id=device_id, install_id=install_id, room_id=room_id) or {}
    except Exception:
        tr = {}
    
    current_viewers = tr.get("current_viewers") or rt.get("watch_count") or 0
    return {
        "viewer_count": current_viewers,
        "current_viewers": current_viewers,
        "total_views": rt.get("watch_count", 0),
        "watch_count": rt.get("watch_count", 0),
        "likes": rt.get("like_count", 0),
        "comments": rt.get("comment_count", 0),
        "shares": rt.get("share_count", 0),
        "new_fans": rt.get("new_fans_count", 0),
        "total_coin": rt.get("total_coin", 0),
        "realtime": rt,
        "trends": tr
    }

@app.route('/api/stats', methods=['GET'])
def stats():
    try:
        if not is_live or not stream:
            return jsonify({"realtime": {}, "trends": {}})
        combined = _collect_combined_stats()
        return jsonify(combined)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/audience', methods=['GET'])
def audience():
    try:
        if not is_live or not stream:
            return jsonify({})
        aud = stream.getOnlineAudience(device_id=device_id, install_id=install_id, room_id=room_id)
        return jsonify(aud or {})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _linkmic_status():
    if not is_live or not stream:
        return {"is_live": False, "guest_count": None, "available": False}
    cfg = load_config() or {}
    result = stream.getLinkMicStatus(
        device_id=device_id,
        install_id=install_id,
        priority_region=cfg.get("priority_region", ""),
    ) or {}
    return {"is_live": True, **result}

@app.route('/api/linkmic/status', methods=['GET'])
def linkmic_status():
    try:
        return jsonify(_linkmic_status())
    except Exception:
        return jsonify({"error": "Unable to fetch LinkMic status."}), 502

@app.route('/api/violations', methods=['GET'])
def violations():
    try:
        if not is_live or not stream:
            return jsonify({})
        vio = stream.getViolationStatus(device_id=device_id, install_id=install_id, room_id=room_id)
        if not vio:
            return jsonify({})
        # Enrich for UI
        vio["violation_summary"] = vio.get("status", "OK")
        comm_parts = []
        if vio.get("community_flagged"):
            comm_parts.append("Flagged")
        if vio.get("community_review"):
            comm_parts.append("Review")
        vio["community_status"] = " / ".join(comm_parts) if comm_parts else "OK"
        vio["ban_status"] = "Banned" if vio.get("ban_active") else "Clear"
        vio["active_violations"] = vio.get("active_violation_records") or []
        vio["recent_violations"] = vio.get("history_violation_records") or []
        return jsonify(vio)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/quota', methods=['GET'])
def quota():
    try:
        snapshot = read_quota()
        return jsonify({
            "limit": snapshot.get("limit", 100),
            "remaining": snapshot.get("remaining", 100),
            "reset_at": quota_reset_at(snapshot),
            "updated_at": quota_updated_at(snapshot),
            "formatted": format_quota(snapshot)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/login/cookies', methods=['POST'])
def login_cookies():
    global stream
    try:
        content = ""
        if request.is_json:
            data = request.json or {}
            content = data.get('cookies') or data.get('content') or ""
            if not isinstance(content, str):
                content = json.dumps(content)
        elif 'file' in request.files:
            file = request.files['file']
            if file.filename == '':
                return jsonify({"error": "No file selected"}), 400
            raw_bytes = file.read()
            for enc in ('utf-8-sig', 'utf-16', 'utf-16-le', 'utf-16-be', 'latin-1'):
                try:
                    candidate = raw_bytes.decode(enc).strip()
                    if candidate and parse_cookies_content(candidate):
                        content = candidate
                        break
                except Exception:
                    continue
            if not content:
                content = raw_bytes.decode('utf-8-sig', errors='replace').strip()
        else:
            return jsonify({"error": "No file uploaded or cookies payload provided"}), 400

        parsed_cookies = parse_cookies_content(content)
        if not parsed_cookies:
            return jsonify({"error": "Unable to parse cookies file. Please supply valid JSON (array or key-value), Netscape cookies.txt, or raw cookie headers."}), 400

        target_cookies_path = get_cookies_path()
        try:
            os.makedirs(os.path.dirname(os.path.abspath(target_cookies_path)), exist_ok=True)
            with open(target_cookies_path, 'w', encoding='utf-8') as f:
                json.dump(parsed_cookies, f, indent=2)
        except Exception:
            target_cookies_path = DEFAULT_COOKIES_PATH
            os.makedirs(os.path.dirname(os.path.abspath(target_cookies_path)), exist_ok=True)
            with open(target_cookies_path, 'w', encoding='utf-8') as f:
                json.dump(parsed_cookies, f, indent=2)

        stream = None  # Force re-init with new cookies on next request

        session_names = {"sessionid", "sessionid_ss", "sid_tt", "sid_guard", "multi_sids"}
        has_session = any(c.get("name") in session_names for c in parsed_cookies)

        details = {
            "username": "",
            "screen_name": "",
            "avatar_url": "",
            "user_id": "",
            "can_go_live": False,
            "dual_layout_supported": False,
            "status": "ready" if has_session else "no_cookies",
            "message": "" if has_session else "No TikTok session cookies found (sessionid is missing).",
        }

        # In testing mode without mocked stream, avoid making real network requests with dummy cookies
        is_testing = app.config.get('TESTING', False)
        is_mocked = hasattr(Stream, '_mock_return_value') or isinstance(Stream, MagicMock)
        if not is_testing or is_mocked:
            try:
                ok, init_err = init_stream()
                if ok and stream:
                    cfg = load_config() or {}
                    topic_id = cfg.get("hashtag_id", "5")
                    priority_region = cfg.get("priority_region", "")
                    details = extract_account_details(stream, device_id, install_id, priority_region=priority_region, topic_id=topic_id)
                elif init_err:
                    details["status"] = "error"
                    details["message"] = init_err
            except Exception as e:
                details["status"] = "error"
                details["message"] = str(e)

        # Re-save exact parsed_cookies to target_cookies_path so any network side-effects during probing
        # do not alter the saved cookie count/content
        try:
            with open(target_cookies_path, 'w', encoding='utf-8') as f:
                json.dump(parsed_cookies, f, indent=2)
        except Exception:
            pass

        status_val = details.get("status", "ready")
        message_val = details.get("message", "")
        if status_val == "session_expired":
            message_val = message_val or "TikTok session expired. Please sign in to TikTok and export fresh cookies."
        elif status_val == "no_cookies":
            message_val = message_val or "No session cookies found. Please make sure sessionid is included."
        elif not message_val:
            message_val = f"Successfully loaded {len(parsed_cookies)} cookies"

        return jsonify({
            "success": status_val not in ("session_expired", "no_cookies", "error"),
            "username": details.get("username", ""),
            "screen_name": details.get("screen_name", ""),
            "avatar_url": details.get("avatar_url", ""),
            "user_id": details.get("user_id", ""),
            "can_go_live": details.get("can_go_live", False),
            "dual_layout_supported": details.get("dual_layout_supported", False),
            "status": status_val,
            "message": message_val,
            "cookie_count": len(parsed_cookies)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/events', methods=['GET'])
def events():
    def generator():
        seen_violations = set()
        tick = 0
        was_live = bool(is_live)
        while True:
            if was_live and stream_end_event.is_set():
                break
            if is_live:
                was_live = True
            try:
                # Always send initial burst on first tick (tick == 0)
                if tick == 0:
                    yield f"event: heartbeat\ndata: {json.dumps({'timestamp': int(time.time())})}\n\n"
                    status_payload = {
                        "is_live": is_live,
                        "is_paused": is_paused,
                        "stream_url": f"rtmp://127.0.0.1:{LOCAL_PROXY_DEFAULT_PORT}/{LOCAL_PROXY_APP_NAME}" if is_live else "",
                        "stream_key": LOCAL_PROXY_STREAM_KEY if is_live else "",
                        "share_url": share_url,
                        "proxy_status": "running" if proxy_process and proxy_process.poll() is None else "stopped",
                        "room_id": room_id,
                        "portrait_url": f"rtmp://127.0.0.1:{LOCAL_PROXY_PORTRAIT_DEFAULT_PORT}/{LOCAL_PROXY_APP_NAME}" if (is_live and portrait_proxy_process and portrait_proxy_process.poll() is None) else "",
                        "portrait_key": LOCAL_PROXY_PORTRAIT_STREAM_KEY if (is_live and portrait_proxy_process and portrait_proxy_process.poll() is None) else ""
                    }
                    yield f"event: status\ndata: {json.dumps(status_payload)}\n\n"
                    snapshot = read_quota()
                    quota_payload = {
                        "limit": snapshot.get("limit", 100),
                        "remaining": snapshot.get("remaining", 100),
                        "reset_at": quota_reset_at(snapshot),
                        "updated_at": quota_updated_at(snapshot),
                        "formatted": format_quota(snapshot)
                    }
                    yield f"event: quota\ndata: {json.dumps(quota_payload)}\n\n"

                tick += 1

                if is_live and stream:
                    # 1. Status event every 3s when live
                    if tick % 3 == 0:
                        status_payload = {
                            "is_live": is_live,
                            "is_paused": is_paused,
                            "stream_url": f"rtmp://127.0.0.1:{LOCAL_PROXY_DEFAULT_PORT}/{LOCAL_PROXY_APP_NAME}",
                            "stream_key": LOCAL_PROXY_STREAM_KEY,
                            "share_url": share_url,
                            "proxy_status": "running" if proxy_process and proxy_process.poll() is None else "stopped",
                            "room_id": room_id,
                            "portrait_url": f"rtmp://127.0.0.1:{LOCAL_PROXY_PORTRAIT_DEFAULT_PORT}/{LOCAL_PROXY_APP_NAME}" if (portrait_proxy_process and portrait_proxy_process.poll() is None) else "",
                            "portrait_key": LOCAL_PROXY_PORTRAIT_STREAM_KEY if (portrait_proxy_process and portrait_proxy_process.poll() is None) else ""
                        }
                        yield f"event: status\ndata: {json.dumps(status_payload)}\n\n"

                    # 2. Stats event every 5s when live
                    if tick % 5 == 0:
                        combined_stats = _collect_combined_stats()
                        yield f"event: stats\ndata: {json.dumps(combined_stats)}\n\n"

                    # 3. Heartbeat event every 10s
                    if tick % 10 == 0:
                        yield f"event: heartbeat\ndata: {json.dumps({'timestamp': int(time.time())})}\n\n"

                    # 4. Audience and Safety events every 15s when live
                    if tick % 15 == 0:
                        try:
                            yield f"event: linkmic_update\ndata: {json.dumps(_linkmic_status())}\n\n"
                        except Exception:
                            pass

                        try:
                            aud = stream.getOnlineAudience(device_id=device_id, install_id=install_id, room_id=room_id)
                            yield f"event: audience\ndata: {json.dumps(aud or {})}\n\n"
                        except Exception:
                            pass

                        try:
                            vio = stream.getViolationStatus(device_id=device_id, install_id=install_id, room_id=room_id)
                            if vio:
                                vio["violation_summary"] = vio.get("status", "OK")
                                comm_parts = []
                                if vio.get("community_flagged"):
                                    comm_parts.append("Flagged")
                                if vio.get("community_review"):
                                    comm_parts.append("Review")
                                vio["community_status"] = " / ".join(comm_parts) if comm_parts else "OK"
                                vio["ban_status"] = "Banned" if vio.get("ban_active") else "Clear"
                                vio["active_violations"] = vio.get("active_violation_records") or []
                                vio["recent_violations"] = vio.get("history_violation_records") or []
                                yield f"event: safety\ndata: {json.dumps(vio)}\n\n"

                                # Check for new violation alerts
                                active_records = vio.get("active_violation_records") or []
                                for rec in active_records:
                                    punish = (rec.get("punish_info") or {}) if isinstance(rec, dict) else {}
                                    vid = str(rec.get("violation_id_str") or rec.get("violation_id") or punish.get("punish_id") or punish.get("punish_reason") or "")
                                    if vid and vid not in seen_violations:
                                        seen_violations.add(vid)
                                        reason = punish.get("punish_reason") or punish.get("perception_code") or "Policy violation"
                                        yield f"event: violation_alert\ndata: {json.dumps({'id': vid, 'reason': reason, 'record': rec})}\n\n"
                        except Exception:
                            pass

                    # 5. Quota event every 60s
                    if tick % 60 == 0:
                        snapshot = read_quota()
                        quota_payload = {
                            "limit": snapshot.get("limit", 100),
                            "remaining": snapshot.get("remaining", 100),
                            "reset_at": quota_reset_at(snapshot),
                            "updated_at": quota_updated_at(snapshot),
                            "formatted": format_quota(snapshot)
                        }
                        yield f"event: quota\ndata: {json.dumps(quota_payload)}\n\n"
                else:
                    # When NOT live: only heartbeat every 10s and status every 5s
                    if tick % 5 == 0:
                        status_payload = {
                            "is_live": False,
                            "is_paused": False,
                            "stream_url": "",
                            "stream_key": "",
                            "share_url": share_url,
                            "proxy_status": "stopped",
                            "room_id": room_id,
                            "portrait_url": "",
                            "portrait_key": ""
                        }
                        yield f"event: status\ndata: {json.dumps(status_payload)}\n\n"

                    if tick % 10 == 0:
                        yield f"event: heartbeat\ndata: {json.dumps({'timestamp': int(time.time())})}\n\n"

                    if tick % 60 == 0:
                        snapshot = read_quota()
                        quota_payload = {
                            "limit": snapshot.get("limit", 100),
                            "remaining": snapshot.get("remaining", 100),
                            "reset_at": quota_reset_at(snapshot),
                            "updated_at": quota_updated_at(snapshot),
                            "formatted": format_quota(snapshot)
                        }
                        yield f"event: quota\ndata: {json.dumps(quota_payload)}\n\n"

            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

            time.sleep(1)

    return Response(
        generator(),
        content_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)
