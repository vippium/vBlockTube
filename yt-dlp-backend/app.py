from flask import Flask, request, jsonify
from flask_cors import CORS
import yt_dlp
import os
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

try:
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except ImportError:
    pass

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return jsonify({
        'status': 'online',
        'message': 'yt-dlp API Server',
        'version': '1.0.0'
    })

@app.route('/api/streams/<video_id>', methods=['GET'])
def get_streams(video_id):
    try:
        url = f'https://www.youtube.com/watch?v={video_id}'

        ydl_opts = {
            'format': 'best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'no_check_certificate': True,
            'socket_timeout': 30,
            'skip_unavailable_fragments': True,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            video_formats = []
            audio_formats = []

            for f in info.get('formats', []):
                if not f.get('url'):
                    continue

                format_data = {
                    'url': f['url'],
                    'ext': f.get('ext', 'mp4'),
                    'filesize': f.get('filesize', 0),
                    'quality': f.get('format_note', 'unknown'),
                    'format_id': f.get('format_id', ''),
                }

                if f.get('vcodec') != 'none' and f.get('acodec') != 'none':
                    format_data['height'] = f.get('height', 0)
                    format_data['width'] = f.get('width', 0)
                    format_data['fps'] = f.get('fps', 30)
                    video_formats.append(format_data)
                elif f.get('vcodec') != 'none':
                    format_data['height'] = f.get('height', 0)
                    format_data['width'] = f.get('width', 0)
                    format_data['fps'] = f.get('fps', 30)
                    format_data['video_only'] = True
                    video_formats.append(format_data)
                elif f.get('acodec') != 'none':
                    format_data['bitrate'] = f.get('abr', 0)
                    audio_formats.append(format_data)

            video_formats.sort(key=lambda x: x.get('height', 0), reverse=True)
            audio_formats.sort(key=lambda x: x.get('bitrate', 0), reverse=True)

            return jsonify({
                'success': True,
                'title': info.get('title', 'video'),
                'duration': info.get('duration', 0),
                'uploader': info.get('uploader', ''),
                'videoStreams': video_formats,
                'audioStreams': audio_formats,
            })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
