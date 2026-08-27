import os
import io
import re
import struct
import time
import json
import random
import string
import hashlib
import urllib.parse
from typing import Dict, Any, List, Optional
from flask import Flask, render_template, request, jsonify, Response, redirect, stream_with_context
import requests

app = Flask(__name__)

# Native APKPure Signature & API Configuration (v3.19.80 - Aegon)
API_SECRET_SALT = "J845Nku4IOoS9rEq1q9vs9rHEPuBY1Y"
API_HOST = "api.pureapk.com"
API_BASE_URL = f"https://{API_HOST}/m/v3"
AUTH_KEY = "qNKrYmW8SSUqJ73k3P2yfMxRTo3sJTR"
AID = "com.apkpure.aegon"
VERSION_CODE = "3198027"
SDK_VERSION = "34"

def get_apkpure_headers() -> Dict[str, str]:
    return {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UD1A.230803.041) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 Aegon/3.19.80",
        "X-Auth-Key": AUTH_KEY,
        "X-Country": "US",
        "X-Aid": AID,
        "X-Flavor": "advertisingArmallNonNativeCrash",
        "X-Cv": VERSION_CODE,
        "X-Sv": SDK_VERSION,
        "X-Abis": "arm64-v8a",
        "Accept-Encoding": "gzip",
        "Connection": "Keep-Alive"
    }

def sign_endpoint(endpoint: str, query_params: Optional[Dict[str, Any]] = None) -> tuple[str, Dict[str, Any]]:
    """Generates an authentic signed URL with dynamic salt and MD5 signature."""
    salt = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    raw = f"{API_SECRET_SALT}{salt}{API_HOST}/m/v3/{endpoint}"
    k = hashlib.md5(raw.encode("utf-8")).hexdigest() + salt
    params = {"hl": "en", "k": k}
    if query_params:
        params.update(query_params)
    return f"{API_BASE_URL}/{endpoint}", params

# ----------------- Protobuf Nano Wire Decoder -----------------

def read_varint(stream: io.BytesIO) -> Optional[int]:
    res = 0
    shift = 0
    while True:
        b = stream.read(1)
        if not b:
            return None
        byte = b[0]
        res |= (byte & 0x7f) << shift
        if not (byte & 0x80):
            break
        shift += 7
    return res

def parse_proto_raw(data: bytes) -> Dict[int, Any]:
    if not isinstance(data, bytes):
        return {}
    fields = {}
    stream = io.BytesIO(data)
    while True:
        key = read_varint(stream)
        if key is None:
            break
        field_num = key >> 3
        wire_type = key & 0x7
        if wire_type == 0:
            val = read_varint(stream)
        elif wire_type == 1:
            val = stream.read(8)
            if len(val) < 8: break
            val = struct.unpack('<d', val)[0]
        elif wire_type == 2:
            length = read_varint(stream)
            if length is None: break
            raw = stream.read(length)
            if len(raw) < length: break
            val = raw
        elif wire_type == 5:
            val = stream.read(4)
            if len(val) < 4: break
            val = struct.unpack('<f', val)[0]
        else:
            break
            
        if field_num in fields:
            if not isinstance(fields[field_num], list):
                fields[field_num] = [fields[field_num]]
            fields[field_num].append(val)
        else:
            fields[field_num] = val
    return fields

def decode_asset(data_bytes: Any) -> Dict[str, Any]:
    if not isinstance(data_bytes, bytes): return {}
    f = parse_proto_raw(data_bytes)
    return {
        'expiryDate': f.get(1, b'').decode('utf-8', errors='ignore') if isinstance(f.get(1), bytes) else '',
        'name': f.get(2, b'').decode('utf-8', errors='ignore') if isinstance(f.get(2), bytes) else '',
        'sha1': f.get(3, b'').decode('utf-8', errors='ignore') if isinstance(f.get(3), bytes) else '',
        'size': f.get(4, 0) if isinstance(f.get(4), (int, float)) else 0,
        'type': f.get(8, b'APK').decode('utf-8', errors='ignore') if isinstance(f.get(8), bytes) else 'APK',
        'url': f.get(9, b'').decode('utf-8', errors='ignore') if isinstance(f.get(9), bytes) else ''
    }

def decode_banner_image(data_bytes: Any) -> str:
    if not isinstance(data_bytes, bytes): return ''
    f = parse_proto_raw(data_bytes)
    for sub_k in [1, 2]:
        sub_raw = f.get(sub_k)
        if isinstance(sub_raw, bytes):
            sub_f = parse_proto_raw(sub_raw)
            url = sub_f.get(1)
            if isinstance(url, bytes):
                return url.decode('utf-8', errors='ignore')
    m = re.search(rb'https://[^\x00-\x1f\x7f-\xff\s\"\'\<\>]+', data_bytes)
    if m:
        return m.group(0).decode('utf-8', errors='ignore')
    return ''

def decode_app_detail(data_bytes: Any) -> Dict[str, Any]:
    if not isinstance(data_bytes, bytes): return {}
    f = parse_proto_raw(data_bytes)
    
    screenshots = []
    screen_raw = f.get(25, [])
    if isinstance(screen_raw, bytes): screen_raw = [screen_raw]
    elif isinstance(screen_raw, list): pass
    else: screen_raw = []
    for s in screen_raw:
        if isinstance(s, bytes):
            img_url = decode_banner_image(s)
            if img_url and img_url not in screenshots:
                screenshots.append(img_url)
            
    icon_url = decode_banner_image(f.get(27))
    if not icon_url and isinstance(f.get(27), bytes):
        m = re.search(rb'https://[^\x00-\x1f\x7f-\xff\s\"\'\<\>]+', f.get(27))
        if m: icon_url = m.group(0).decode('utf-8', errors='ignore')

    asset_info = decode_asset(f.get(24))

    title = f.get(1, b'').decode('utf-8', errors='ignore') if isinstance(f.get(1), bytes) else str(f.get(1, ''))
    pkg = f.get(4, b'').decode('utf-8', errors='ignore') if isinstance(f.get(4), bytes) else str(f.get(4, ''))
    title = re.sub(r'[\x00-\x1f\x7f]', '', title).strip()
    pkg = re.sub(r'[\x00-\x1f\x7f]', '', pkg).strip()
    
    v_code = str(f.get(5, ''))
    if isinstance(f.get(5), bytes):
        v_code = f.get(5).decode('utf-8', errors='ignore')

    return {
        'title': title,
        'packageName': pkg,
        'versionCode': v_code,
        'versionName': f.get(6, b'').decode('utf-8', errors='ignore') if isinstance(f.get(6), bytes) else str(f.get(6, '')),
        'sha1': f.get(7, b'').decode('utf-8', errors='ignore') if isinstance(f.get(7), bytes) else '',
        'rating': round(float(f.get(8, 4.5)), 1) if isinstance(f.get(8), (int, float)) else 4.5,
        'description': f.get(9, b'').decode('utf-8', errors='ignore') if isinstance(f.get(9), bytes) else '',
        'shortDescription': f.get(10, b'').decode('utf-8', errors='ignore') if isinstance(f.get(10), bytes) else '',
        'whatsNew': f.get(11, b'').decode('utf-8', errors='ignore') if isinstance(f.get(11), bytes) else '',
        'developer': f.get(13, b'Developer').decode('utf-8', errors='ignore') if isinstance(f.get(13), bytes) else 'Developer',
        'categoryName': f.get(31, b'App').decode('utf-8', errors='ignore') if isinstance(f.get(31), bytes) else 'App',
        'updateDate': f.get(36, b'').decode('utf-8', errors='ignore') if isinstance(f.get(36), bytes) else '',
        'downloadCount': f.get(20, 1500000) if isinstance(f.get(20), (int, float)) else 1500000,
        'icon': icon_url,
        'screenshots': screenshots,
        'asset': asset_info
    }

def is_valid_app(pkg: str, title: str) -> bool:
    """Strict validation filter to reject CMS links/URLs/placeholders."""
    if not pkg or not title:
        return False
    if pkg.startswith("http") or title.startswith("http") or pkg.startswith("CMS") or title.startswith("CMS"):
        return False
    if not re.match(r'^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$', pkg):
        return False
    if len(title) < 2 or len(pkg) < 4:
        return False
    return True

def extract_apps_from_stream(content_bytes: bytes) -> List[Dict[str, Any]]:
    """Extracts all valid App items from JSON string chunks or protobuf responses."""
    text = content_bytes.decode('utf-8', errors='ignore')
    apps = []
    seen = set()
    
    # 1. Look for embedded JSON segments {"type":"common_app_bar", ...}
    for m in re.finditer(r'\{[^{}]*"type"\s*:', text):
        start = m.start()
        depth = 0
        in_s = False
        esc = False
        for i in range(start, len(text)):
            c = text[i]
            if c == '"' and not esc:
                in_s = not in_s
            elif not in_s:
                if c == '{':
                    depth += 1
                elif c == '}':
                    depth -= 1
                    if depth == 0:
                        try:
                            block = json.loads(text[start:i+1])
                            items = block.get('data', [])
                            if isinstance(items, dict): items = [items]
                            for it in items:
                                pkg = it.get('packageName') or it.get('package_name') or ''
                                title = it.get('title') or it.get('name') or it.get('label') or ''
                                if is_valid_app(pkg, title) and pkg not in seen:
                                    seen.add(pkg)
                                    icon = ''
                                    if isinstance(it.get('icon'), dict):
                                        icon = it['icon'].get('thumbnail', {}).get('url') or it['icon'].get('original', {}).get('url', '')
                                    elif isinstance(it.get('icon'), str):
                                        icon = it['icon']
                                    elif it.get('iconUrl'):
                                        icon = it['iconUrl']
                                    
                                    asset = it.get('asset', {})
                                    dl_url = asset.get('url', '') if isinstance(asset, dict) else ''
                                    size = asset.get('size', 0) if isinstance(asset, dict) else 0
                                    file_type = asset.get('type', 'APK') if isinstance(asset, dict) else 'APK'
                                    sha1 = asset.get('sha1', '') if isinstance(asset, dict) else ''
                                    
                                    apps.append({
                                        'title': title,
                                        'packageName': pkg,
                                        'developer': it.get('developer', 'Developer'),
                                        'versionName': it.get('versionName', ''),
                                        'versionCode': str(it.get('versionCode', '')),
                                        'rating': float(it.get('reviewStars') or it.get('commentScoreStars') or 4.5),
                                        'categoryName': it.get('categoryName', 'App'),
                                        'shortDescription': it.get('descriptionShort') or it.get('description') or '',
                                        'icon': icon,
                                        'downloadUrl': dl_url,
                                        'size': size,
                                        'fileType': file_type,
                                        'sha1': sha1
                                    })
                        except Exception:
                            pass
                        break
            esc = (c == '\\' and not esc)

    # 2. If no JSON blocks found, decode through Protobuf walker
    if not apps:
        raw_top = parse_proto_raw(content_bytes)
        top1 = parse_proto_raw(raw_top.get(1, b''))
        
        # Direct App Detail
        if 10 in top1:
            a = decode_app_detail(top1[10])
            if is_valid_app(a.get('packageName', ''), a.get('title', '')) and a['packageName'] not in seen:
                seen.add(a['packageName'])
                apps.append({
                    'title': a['title'],
                    'packageName': a['packageName'],
                    'developer': a['developer'],
                    'versionName': a['versionName'],
                    'versionCode': a['versionCode'],
                    'rating': a['rating'],
                    'categoryName': a['categoryName'],
                    'shortDescription': a['shortDescription'] or a['description'],
                    'icon': a['icon'],
                    'downloadUrl': a['asset'].get('url', ''),
                    'size': a['asset'].get('size', 0),
                    'fileType': a['asset'].get('type', 'APK'),
                    'sha1': a['sha1'] or a['asset'].get('sha1', '')
                })

        # CmsList entries
        for f_idx in [2, 7]:
            cms_lists = top1.get(f_idx, [])
            if isinstance(cms_lists, bytes): cms_lists = [cms_lists]
            for cms_raw in cms_lists:
                cms_f = parse_proto_raw(cms_raw)
                item_lists = cms_f.get(2, [])
                if isinstance(item_lists, bytes): item_lists = [item_lists]
                for item_raw in item_lists:
                    item_f = parse_proto_raw(item_raw)
                    for sub_k in [2, 3]:
                        app_raw = item_f.get(sub_k)
                        if isinstance(app_raw, bytes):
                            a = decode_app_detail(app_raw)
                            if is_valid_app(a.get('packageName', ''), a.get('title', '')) and a['packageName'] not in seen:
                                seen.add(a['packageName'])
                                apps.append({
                                    'title': a['title'],
                                    'packageName': a['packageName'],
                                    'developer': a['developer'],
                                    'versionName': a['versionName'],
                                    'versionCode': a['versionCode'],
                                    'rating': a['rating'],
                                    'categoryName': a['categoryName'],
                                    'shortDescription': a['shortDescription'] or a['description'],
                                    'icon': a['icon'],
                                    'downloadUrl': a['asset'].get('url', ''),
                                    'size': a['asset'].get('size', 0),
                                    'fileType': a['asset'].get('type', 'APK'),
                                    'sha1': a['sha1'] or a['asset'].get('sha1', '')
                                })

    return apps

def resolve_app_asset(package_name: str) -> tuple[str, str, int, str]:
    """Helper to fetch direct download URL, filename, file size and format."""
    url, params = sign_endpoint("app/detail", {"package_name": package_name})
    res = requests.get(url, params=params, headers=get_apkpure_headers(), timeout=12)
    
    raw_top = parse_proto_raw(res.content)
    top1 = parse_proto_raw(raw_top.get(1, b''))
    app_data = decode_app_detail(top1.get(10))
    
    dl_url = app_data.get("asset", {}).get("url", "")
    app_title = app_data.get("title", package_name)
    ver = app_data.get("versionName", "")
    ftype = (app_data.get("asset", {}).get("type") or "apk").lower()
    size = app_data.get("asset", {}).get("size", 0)
    
    if not dl_url:
        apps = extract_apps_from_stream(res.content)
        if apps and apps[0].get("downloadUrl"):
            dl_url = apps[0]["downloadUrl"]
            app_title = apps[0].get("title", package_name)
            ver = apps[0].get("versionName", "")
            size = apps[0].get("size", 0)
            ftype = (apps[0].get("fileType") or "apk").lower()

    # Clean filename
    clean_title = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', app_title)
    if ver:
        clean_filename = f"{clean_title}_v{ver}.{ftype}"
    else:
        clean_filename = f"{clean_title}.{ftype}"

    return dl_url, clean_filename, size, ftype

# ----------------- UI Web Routes -----------------

@app.route("/")
def index():
    return render_template("index.html")

# ----------------- REST API Endpoints -----------------

@app.route("/api/home", methods=["GET"])
def get_home_feed():
    try:
        url_apps, p_apps = sign_endpoint("cms/search_query", {"key": "top"})
        res_apps = requests.get(url_apps, params=p_apps, headers=get_apkpure_headers(), timeout=12)
        top_apps = extract_apps_from_stream(res_apps.content)

        url_new, p_new = sign_endpoint("cms/search_query", {"key": "new"})
        res_new = requests.get(url_new, params=p_new, headers=get_apkpure_headers(), timeout=12)
        new_releases = extract_apps_from_stream(res_new.content)

        url_pop, p_pop = sign_endpoint("cms/search_query", {"key": "popular"})
        res_pop = requests.get(url_pop, params=p_pop, headers=get_apkpure_headers(), timeout=12)
        popular_apps = extract_apps_from_stream(res_pop.content)

        return jsonify({
            "success": 1,
            "data": {
                "top_apps": top_apps[:16],
                "new_releases": new_releases[:16],
                "popular_apps": popular_apps[:16]
            }
        })
    except Exception as e:
        return jsonify({"success": 0, "error": str(e)}), 500

@app.route("/api/search", methods=["GET"])
def search_apps():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"success": 0, "error": "Query parameter 'q' is required"}), 400

    try:
        url, params = sign_endpoint("cms/search_query", {"key": query})
        res = requests.get(url, params=params, headers=get_apkpure_headers(), timeout=12)
        results = extract_apps_from_stream(res.content)
        return jsonify({
            "success": 1,
            "data": results
        })
    except Exception as e:
        return jsonify({"success": 0, "error": str(e)}), 500

@app.route("/api/app/detail", methods=["GET"])
def get_app_detail():
    pkg = request.args.get("package_name", "").strip()
    if not pkg:
        return jsonify({"success": 0, "error": "Parameter 'package_name' is required"}), 400

    try:
        url, params = sign_endpoint("app/detail", {"package_name": pkg})
        res = requests.get(url, params=params, headers=get_apkpure_headers(), timeout=12)
        
        raw_top = parse_proto_raw(res.content)
        top1 = parse_proto_raw(raw_top.get(1, b''))
        app_data = decode_app_detail(top1.get(10))
        
        if not app_data.get("title") and not app_data.get("packageName"):
            apps = extract_apps_from_stream(res.content)
            if apps:
                app_data = apps[0]
            else:
                return jsonify({"success": 0, "error": "App details not found"}), 404

        return jsonify({
            "success": 1,
            "data": app_data
        })
    except Exception as e:
        return jsonify({"success": 0, "error": str(e)}), 500

@app.route("/api/app/versions", methods=["GET"])
def get_app_versions():
    pkg = request.args.get("package_name", "").strip()
    if not pkg:
        return jsonify({"success": 0, "error": "Parameter 'package_name' is required"}), 400

    try:
        url, params = sign_endpoint("cms/app_version", {"package_name": pkg})
        res = requests.get(url, params=params, headers=get_apkpure_headers(), timeout=15)
        versions = extract_apps_from_stream(res.content)
        return jsonify({
            "success": 1,
            "data": versions
        })
    except Exception as e:
        return jsonify({"success": 0, "error": str(e)}), 500

@app.route("/api/categories", methods=["GET"])
def get_categories():
    categories = [
        {"id": "game", "name": "Games", "icon": "fa-gamepad", "color": "#00adb5"},
        {"id": "action", "name": "Action", "icon": "fa-crosshairs", "color": "#ef4444"},
        {"id": "arcade", "name": "Arcade", "icon": "fa-ghost", "color": "#f59e0b"},
        {"id": "social", "name": "Social", "icon": "fa-users", "color": "#ec4899"},
        {"id": "communication", "name": "Communication", "icon": "fa-comments", "color": "#22c55e"},
        {"id": "tools", "name": "Tools", "icon": "fa-wrench", "color": "#8b5cf6"},
        {"id": "productivity", "name": "Productivity", "icon": "fa-briefcase", "color": "#3b82f6"},
        {"id": "multimedia", "name": "Multimedia", "icon": "fa-film", "color": "#f97316"},
        {"id": "personalization", "name": "Personalization", "icon": "fa-palette", "color": "#14b8a6"},
        {"id": "news", "name": "News & Magazines", "icon": "fa-newspaper", "color": "#6366f1"}
    ]
    return jsonify({"success": 1, "data": categories})

@app.route("/api/category/<cat_id>/apps", methods=["GET"])
def get_category_apps(cat_id: str):
    try:
        url, params = sign_endpoint("cms/search_query", {"key": cat_id})
        res = requests.get(url, params=params, headers=get_apkpure_headers(), timeout=12)
        results = extract_apps_from_stream(res.content)
        return jsonify({"success": 1, "data": results})
    except Exception as e:
        return jsonify({"success": 0, "error": str(e)}), 500

# ----------------- Robust APK/XAPK Download Endpoints -----------------

@app.route("/api/download/file", methods=["GET"])
def download_file_direct():
    """Direct APK/XAPK file download stream with guaranteed attachment header."""
    pkg = request.args.get("package_name", "").strip()
    if not pkg:
        return jsonify({"success": 0, "error": "Parameter 'package_name' is required"}), 400

    try:
        dl_url, filename, size, ftype = resolve_app_asset(pkg)
        if not dl_url:
            return jsonify({"success": 0, "error": "Download URL not available for this app"}), 404

        req = requests.get(dl_url, headers={"User-Agent": "Mozilla/5.0"}, stream=True, timeout=25)
        if req.status_code == 200:
            content_type = "application/vnd.android.package-archive" if ftype == "apk" else "application/octet-stream"
            headers = {
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": content_type
            }
            if size > 0:
                headers["Content-Length"] = str(size)
            elif req.headers.get("Content-Length"):
                headers["Content-Length"] = req.headers["Content-Length"]

            return Response(
                stream_with_context(req.iter_content(chunk_size=131072)),
                headers=headers,
                status=200
            )
        else:
            return redirect(dl_url, code=302)
    except Exception as e:
        return jsonify({"success": 0, "error": str(e)}), 500

@app.route("/api/download/direct", methods=["GET"])
def direct_download_redirect():
    """Resolves authentic direct CDN download URL and redirects the browser."""
    pkg = request.args.get("package_name", "").strip()
    if not pkg:
        return jsonify({"success": 0, "error": "Parameter 'package_name' is required"}), 400

    try:
        dl_url, filename, size, ftype = resolve_app_asset(pkg)
        if dl_url:
            return redirect(dl_url, code=302)
        else:
            return jsonify({"success": 0, "error": "Direct download link not found"}), 404
    except Exception as e:
        return jsonify({"success": 0, "error": str(e)}), 500

@app.route("/api/download/stream", methods=["GET"])
def stream_custom_url():
    """Proxy stream for any valid CDN URL."""
    dl_url = request.args.get("url", "").strip()
    filename = request.args.get("filename", "app.apk").strip()
    if not dl_url:
        return jsonify({"success": 0, "error": "Parameter 'url' is required"}), 400

    try:
        req = requests.get(dl_url, headers={"User-Agent": "Mozilla/5.0"}, stream=True, timeout=25)
        if req.status_code == 200:
            headers = {
                "Content-Disposition": f'attachment; filename="{urllib.parse.quote(filename)}"',
                "Content-Type": req.headers.get("Content-Type", "application/octet-stream")
            }
            if req.headers.get("Content-Length"):
                headers["Content-Length"] = req.headers["Content-Length"]

            return Response(
                stream_with_context(req.iter_content(chunk_size=131072)),
                headers=headers,
                status=200
            )
        else:
            return redirect(dl_url, code=302)
    except Exception as e:
        return redirect(dl_url, code=302)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[*] Starting LX APP STORE on http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
