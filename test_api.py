import unittest
import requests
import json
from app import app

class TestLXAppStore(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_01_index_page(self):
        res = self.client.get('/')
        self.assertEqual(res.status_code, 200)
        self.assertIn(b'LX APP STORE', res.data)
        print("[PASS] Index page rendered successfully with 'LX APP STORE' branding.")

    def test_02_home_feed(self):
        res = self.client.get('/api/home')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get('success'), 1)
        self.assertIn('top_apps', data.get('data', {}))
        self.assertIn('new_releases', data.get('data', {}))
        print(f"[PASS] Home feed loaded with {len(data['data']['top_apps'])} top apps and {len(data['data']['new_releases'])} new releases.")

    def test_03_search(self):
        res = self.client.get('/api/search?q=subway%20surfers')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get('success'), 1)
        apps = data.get('data', [])
        self.assertGreater(len(apps), 0)
        print(f"[PASS] Search for 'subway surfers' returned {len(apps)} apps.")
        print(f"       Top match: {apps[0]['title']} ({apps[0]['packageName']})")

    def test_04_app_detail(self):
        res = self.client.get('/api/app/detail?package_name=com.whatsapp')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get('success'), 1)
        app_data = data.get('data', {})
        self.assertEqual(app_data.get('packageName'), 'com.whatsapp')
        self.assertIn('WhatsApp', app_data.get('title', ''))
        self.assertTrue(len(app_data.get('asset', {}).get('url', '')) > 0)
        print(f"[PASS] App detail for WhatsApp retrieved:")
        print(f"       Title: {app_data.get('title')}")
        print(f"       Version: {app_data.get('versionName')}")
        print(f"       Developer: {app_data.get('developer')}")
        print(f"       Screenshots: {len(app_data.get('screenshots', []))}")
        print(f"       Download URL: {app_data.get('asset', {}).get('url')[:60]}...")

    def test_05_version_history(self):
        res = self.client.get('/api/app/versions?package_name=com.kiloo.subwaysurf')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get('success'), 1)
        versions = data.get('data', [])
        print(f"[PASS] Version history retrieved: {len(versions)} versions.")

    def test_06_categories(self):
        res = self.client.get('/api/categories')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get('success'), 1)
        self.assertGreater(len(data.get('data', [])), 0)
        print(f"[PASS] Categories loaded: {len(data['data'])} categories.")

    def test_07_direct_download_resolution(self):
        res = self.client.get('/api/download/direct?package_name=com.whatsapp', follow_redirects=False)
        self.assertEqual(res.status_code, 302)
        location = res.headers.get('Location', '')
        self.assertTrue(location.startswith('https://download.pureapk.com/b/'))
        print(f"[PASS] Direct download redirect resolved:")
        print(f"       Redirect Target: {location[:80]}...")

    def test_08_verify_apk_stream_download(self):
        res = self.client.get('/api/app/detail?package_name=com.kiloo.subwaysurf')
        data = res.get_json()
        dl_url = data['data']['asset']['url']
        self.assertTrue(bool(dl_url))
        
        # Test real streaming response from APKPure CDN
        r = requests.get(dl_url, headers={'User-Agent': 'Mozilla/5.0'}, stream=True, timeout=15)
        self.assertEqual(r.status_code, 200)
        content_length = int(r.headers.get('Content-Length', 0))
        self.assertGreater(content_length, 1000000) # > 1MB
        chunk = next(r.iter_content(chunk_size=1024))
        # APK/ZIP magic bytes
        self.assertEqual(chunk[:4], b'PK\x03\x04')
        print(f"[PASS] Real APK File Stream verified for Subway Surfers:")
        print(f"       Content-Length: {content_length} bytes ({round(content_length/(1024*1024), 2)} MB)")
        print(f"       Magic Byte Header: {chunk[:4].hex()} (Valid Android APK)")

if __name__ == '__main__':
    unittest.main(verbosity=2)
