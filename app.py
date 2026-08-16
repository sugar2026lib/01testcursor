import os
import json
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB limit
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
app.config['DATA_FILE'] = os.path.join(os.path.dirname(__file__), 'data', 'store.json')

# Ensure directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(os.path.dirname(app.config['DATA_FILE']), exist_ok=True)

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# In-memory storage
messages = []  # List of message dicts
files = {}     # Dict of file metadata by file_id
online_users = {}  # Dict of socket_id -> {nick, color}

def load_store():
    """Load messages and files from JSON file"""
    global messages, files
    try:
        if os.path.exists(app.config['DATA_FILE']):
            with open(app.config['DATA_FILE'], 'r', encoding='utf-8') as f:
                data = json.load(f)
                messages = data.get('messages', [])
                files = data.get('files', {})
    except Exception as e:
        print(f"Error loading store: {e}")
        messages = []
        files = {}

def save_store():
    """Save messages and files to JSON file"""
    try:
        data = {
            'messages': messages,
            'files': files
        }
        with open(app.config['DATA_FILE'], 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving store: {e}")

def generate_id():
    """Generate unique ID"""
    return str(uuid.uuid4())

def infer_file_type(filename, mime_type):
    """Infer file type from filename or mime type"""
    if mime_type:
        if mime_type.startswith('image/'):
            return 'image'
        elif mime_type.startswith('audio/'):
            return 'audio'
    # Fallback to extension
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    if ext in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']:
        return 'image'
    elif ext in ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'aac']:
        return 'audio'
    return 'file'

def cleanup_old_messages(limit=500):
    """Keep only recent messages and clean up orphaned files"""
    global messages
    if len(messages) > limit:
        # Get messages to remove (oldest ones)
        to_remove = messages[:-limit]
        messages = messages[-limit:]

        # Clean up orphaned files
        for msg in to_remove:
            if msg.get('type') in ['image', 'audio', 'file'] and msg.get('filename'):
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], msg['filename'])
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception as e:
                        print(f"Error deleting file {file_path}: {e}")

        # Also clean up files dict for orphaned entries
        # (In practice, files dict tracks uploads, not message references)
        # We'll keep it simple and not auto-clean files dict for now

# Load existing data on startup
load_store()

@app.route('/')
def index():
    # Return JSON for API clients (with ?json=1), HTML for browsers by default
    if request.args.get('json') == '1':
        return jsonify({"message": "Hello from Flask!", "status": "ok"})
    return render_template('index.html')

@app.route('/health')
def health():
    return jsonify({"status": "healthy"})

@app.route('/api/echo/<name>')
def echo(name):
    return jsonify({"greeting": f"Hello, {name}!"})

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    # Generate secure filename
    original_filename = secure_filename(file.filename)
    file_ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else ''
    unique_filename = f"{generate_id()}.{file_ext}" if file_ext else generate_id()
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)

    try:
        file.save(file_path)

        # Determine file type
        mime_type = file.content_type or ''
        file_type = infer_file_type(original_filename, mime_type)

        # Store file metadata
        file_id = generate_id()
        files[file_id] = {
            'filename': original_filename,
            'path': file_path,
            'url': f'/uploads/{unique_filename}',
            'type': file_type,
            'uploader_sid': request.sid if hasattr(request, 'sid') else None,
            'size': os.path.getsize(file_path),
            'uploaded_at': datetime.utcnow().isoformat()
        }

        return jsonify({
            'id': file_id,
            'filename': original_filename,
            'url': files[file_id]['url'],
            'type': file_type,
            'size': files[file_id]['size']
        })
    except Exception as e:
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/api/messages')
def get_messages():
    limit = min(int(request.args.get('limit', 50)), 100)  # Max 100
    before = request.args.get('before')

    # Filter out deleted messages
    visible_msgs = [msg for msg in messages if not msg.get('deleted', False)]

    # Sort by timestamp (newest first)
    visible_msgs.sort(key=lambda x: x.get('ts', 0), reverse=True)

    # Apply before filter if provided
    if before:
        try:
            before_ts = float(before)
            visible_msgs = [msg for msg in visible_msgs if msg.get('ts', 0) < before_ts]
        except ValueError:
            pass

    # Limit results
    result = visible_msgs[:limit]
    # Return in chronological order (oldest first) for easier frontend appending
    result.reverse()

    return jsonify({
        'messages': result,
        'count': len(result),
        'has_more': len(visible_msgs) > limit
    })


@app.route('/api/message/<message_id>', methods=['DELETE'])
def delete_message(message_id):
    # Find message
    msg_index = None
    for i, msg in enumerate(messages):
        if msg.get('id') == message_id:
            msg_index = i
            break

    if msg_index is None:
        return jsonify({'error': 'Message not found'}), 404

    msg = messages[msg_index]

    # Check if user is sender (simple sid check for anonymity)
    # In a real app, you'd have proper auth; for anon chat we allow self-deletion
    sender_sid = msg.get('sid')
    request_sid = getattr(request, 'sid', None)

    # For HTTP DELETE, we can't reliably check sid, so we'll allow deletion
    # but mark it as deleted and broadcast the deletion
    # A more secure approach would require WebSocket auth or token passing

    # Soft delete
    messages[msg_index]['deleted'] = True
    messages[msg_index]['deleted_at'] = datetime.utcnow().isoformat()

    # Clean up file if applicable
    if msg.get('type') in ['image', 'audio', 'file'] and msg.get('filename'):
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], msg['filename'])
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Error deleting file {file_path}: {e}")

    save_store()

    # Broadcast deletion to all clients
    socketio.emit('message_deleted', {'id': message_id})

    return jsonify({'success': True})

@socketio.on('connect')
def handle_connect():
    online_users[request.sid] = {
        'nick': '游客',
        'color': '#' + ''.join([str(hash(str(i)) % 10) for i in range(6)])
    }
    # Emit updated user list to all clients
    emit('user_list', {'users': [{'sid': sid, 'nick': info['nick'], 'color': info['color']} for sid, info in online_users.items()]}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in online_users:
        del online_users[request.sid]
        # Emit updated user list to all clients
        emit('user_list', {'users': [{'sid': sid, 'nick': info['nick'], 'color': info['color']} for sid, info in online_users.items()]}, broadcast=True)

@socketio.on('send_message')
def handle_send_message(data):
    """Handle incoming chat messages from clients"""
    msg_type = data.get('type', 'text')
    content = data.get('content', '')
    filename = data.get('filename')
    url = data.get('url')
    to_sid = data.get('to')  # optional target socket id for private message

    # Use nick/color from online_users for consistency; fallback to provided
    user_info = online_users.get(request.sid, {'nick': 'Anonymous', 'color': '#' + ''.join([str(hash(str(i)) % 10) for i in range(6)])})
    nick = data.get('nick', user_info['nick'])
    color = data.get('color', user_info['color'])

    # Determine room
    if to_sid and to_sid in online_users and to_sid != request.sid:
        # Private message: room is sorted pair
        room = '_'.join(sorted([request.sid, to_sid]))
    else:
        # Lobby message
        room = 'lobby'
        to_sid = None  # ensure null for lobby

    # Create message object
    message = {
        'id': generate_id(),
        'type': msg_type,
        'content': content,
        'filename': filename,
        'url': url,
        'nick': nick,
        'color': color,
        'sid': request.sid,
        'to': to_sid,
        'room': room,
        'ts': datetime.utcnow().timestamp(),
        'deleted': False
    }

    # Add to messages
    messages.append(message)

    # Keep memory size manageable
    cleanup_old_messages(limit=500)

    # Persist to disk
    save_store()

    # Emit to appropriate recipients
    if room == 'lobby':
        emit('new_message', message, broadcast=True)
    else:
        # Send to both participants in private room
        emit('new_message', message, room=room)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)