// Chat client-side logic
let socket;
let userNick = '';
let userColor = '';
let userSid = ''; // will be set after connect

// State
let allMessages = []; // all messages received (from history and real-time)
let currentRoom = 'lobby'; // default room
let onlineUsers = []; // list of {sid, nick, color}
let conversations = new Map(); // roomId -> {lastMessagePreview, timestamp, userNick (for private)}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket.IO connection
    socket = io();

    // Load or generate user identity
    loadUserIdentity();

    // Set up event listeners
    setupEventListeners();

    // Handle socket events
    setupSocketEvents();

    // Load initial message history
    loadMessageHistory();
});

function loadUserIdentity() {
    const storedNick = localStorage.getItem('chatNick');
    const storedColor = localStorage.getItem('chatColor');

    if (storedNick && storedColor) {
        userNick = storedNick;
        userColor = storedColor;
    } else {
        // Generate random nick and color
        const adjectives = ['快乐的', '善良的', '勇敢的', '智慧的', '友好的', '温暖的'];
        const nouns = ['小熊', '星星', '花朵', '海浪', '微风', '彩虹'];
        const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
        userNick = randomAdj + randomNoun + Math.floor(Math.random() * 100);

        // Generate random color
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        userColor = randomColor;

        // Save to localStorage
        localStorage.setItem('chatNick', userNick);
        localStorage.setItem('chatColor', userColor);
    }
}

function getContrastColor(hexColor) {
    // Simple luminance-based contrast
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

function setupEventListeners() {
    // Message input
    const messageInput = document.getElementById('message-input');
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Send button (form submit)
    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage();
    });

    // File upload
    document.getElementById('file-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', handleFileSelect);

    // Audio recording
    document.getElementById('audio-btn').addEventListener('click', toggleAudioRecording);

    // Nickname edit
    document.getElementById('edit-nick').addEventListener('click', editNickname);
}

function setupSocketEvents() {
    socket.on('connect', () => {
        console.log('Connected to server');
        // Send our nick and color to server (so it can store in online_users)
        socket.emit('join', { nick: userNick, color: userColor });
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    // Receive the user list (online users) from server
    socket.on('user_list', (data) => {
        onlineUsers = data.users.map(u => ({
            sid: u.sid,
            nick: u.nick,
            color: u.color
        }));
        // Update our own sid from the list (find the one matching our nick/color? better: server could send our sid in connect)
        // We'll update our sid by looking for a user with our nick and color (not perfect but ok for anon)
        const me = onlineUsers.find(u => u.nick === userNick && u.color === userColor);
        if (me) {
            userSid = me.sid;
        }
        renderSidebar();
    });

    // Receive new message
    socket.on('new_message', (message) => {
        // Store message
        allMessages.push(message);
        // Update conversation preview
        updateConversationPreview(message);
        // If message is for current room, append to DOM
        if (message.room === currentRoom) {
            addMessageToDom(message);
        }
    });

    // Receive message deletion (optional, we can handle by removing from allMessages and re-rendering)
    socket.on('message_deleted', (data) => {
        const messageId = data.id;
        // Remove from allMessages
        allMessages = allMessages.filter(msg => msg.id !== messageId);
        // If the deleted message was in current room, re-render
        if (data.room === currentRoom) {
            renderMessagesForCurrentRoom();
        } else {
            // Just update preview (since the last message might have been deleted)
            updateConversationPreview(null, data.room); // null to indicate we need to recalc preview
        }
    });
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (!content) return;

    // Determine target room: if we have a private conversation selected, to_sid is the other user's sid
    let toSid = null;
    if (currentRoom !== 'lobby') {
        // currentRoom is a sorted pair like "sid1_sid2"
        const [sidA, sidB] = currentRoom.split('_');
        toSid = (sidA === userSid) ? sidB : sidA;
    }

    // Send message via socket
    socket.emit('send_message', {
        type: 'text',
        content: content,
        // nick and color will be filled by server from online_users, but we send anyway for consistency
        nick: userNick,
        color: userColor,
        to: toSid
    });

    // Clear input
    input.value = '';
    input.focus();
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    // Show uploading indicator
    const fileBtn = document.getElementById('file-btn');
    fileBtn.disabled = true;
    fileBtn.innerHTML = '⏳';

    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }

        // Determine target room (same as sendMessage)
        let toSid = null;
        if (currentRoom !== 'lobby') {
            const [sidA, sidB] = currentRoom.split('_');
            toSid = (sidA === userSid) ? sidB : sidA;
        }

        // Send file message
        socket.emit('send_message', {
            type: data.type,
            content: data.filename,
            filename: data.filename,
            url: data.url,
            nick: userNick,
            color: userColor,
            to: toSid
        });

        // Reset file input
        e.target.value = '';
    })
    .catch(error => {
        alert('文件上传失败: ' + error.message);
        console.error('Upload error:', error);
    })
    .finally(() => {
        fileBtn.disabled = false;
        fileBtn.innerHTML = '📎';
    });
}

// Audio recording functionality
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

async function toggleAudioRecording() {
    const audioBtn = document.getElementById('audio-btn');

    if (!isRecording) {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });

                const formData = new FormData();
                formData.append('file', audioFile);

                // Show uploading
                audioBtn.disabled = true;
                audioBtn.innerHTML = '⏳';

                try {
                    const response = await fetch('/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();

                    if (data.error) {
                        throw new Error(data.error);
                    }

                    // Determine target room
                    let toSid = null;
                    if (currentRoom !== 'lobby') {
                        const [sidA, sidB] = currentRoom.split('_');
                        toSid = (sidA === userSid) ? sidB : sidA;
                    }

                    // Send audio message
                    socket.emit('send_message', {
                        type: data.type,
                        content: data.filename,
                        filename: data.filename,
                        url: data.url,
                        nick: userNick,
                        color: userColor,
                        to: toSid
                    });
                } catch (error) {
                    alert('语音上传失败: ' + error.message);
                    console.error('Audio upload error:', error);
                } finally {
                    audioBtn.disabled = false;
                    audioBtn.innerHTML = '🎤';
                }

                // Clean up
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            audioBtn.innerHTML = '⏹️';
            audioBtn.style.background = '#e74c3c';
        } catch (error) {
            alert('无法访问麦克风: ' + error.message);
            console.error('Microphone access error:', error);
        }
    } else {
        // Stop recording
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        isRecording = false;
        audioBtn.innerHTML = '🎤';
        audioBtn.style.background = '#ecf0f1';
    }
}

function updateConversationPreview(message, room) {
    // If room is provided, update that room's preview; otherwise use message.room
    const targetRoom = room || message.room;
    if (!targetRoom) return;

    // Get the other user's nick for private rooms, or null for lobby
    let displayNick = '大厅';
    let isLobby = (targetRoom === 'lobby');
    if (!isLobby) {
        // Private room: format is "sid1_sid2"
        const [sidA, sidB] = targetRoom.split('_');
        const otherSid = (sidA === userSid) ? sidB : sidA;
        const otherUser = onlineUsers.find(u => u.sid === otherSid);
        displayNick = otherUser ? otherUser.nick : '未知用户';
    }

    // Determine preview text based on message type
    let preview = '';
    if (message) {
        switch (message.type) {
            case 'text':
                preview = message.content;
                break;
            case 'image':
                preview = '[图片]';
                break;
            case 'audio':
                preview = '[语音]';
                break;
            case 'file':
                preview = `[文件] ${message.filename}`;
                break;
            default:
                preview = message.content || '[消息]';
        }
    } else {
        // If message is null, we need to recalc preview from allMessages for this room
        const roomMessages = allMessages.filter(m => m.room === targetRoom && !m.deleted);
        if (roomMessages.length === 0) {
            preview = '等待消息...';
        } else {
            // Get the last message
            const lastMsg = roomMessages.reduce((prev, current) => (prev.ts > current.ts) ? prev : current);
            switch (lastMsg.type) {
                case 'text':
                    preview = lastMsg.content;
                    break;
                case 'image':
                    preview = '[图片]';
                    break;
                case 'audio':
                    preview = '[语音]';
                    break;
                case 'file':
                    preview = `[文件] ${lastMsg.filename}`;
                    break;
                default:
                    preview = lastMsg.content || '[消息]';
            }
        }
    }

    // Update conversations map
    if (!conversations.has(targetRoom)) {
        conversations.set(targetRoom, {});
    }
    const conv = conversations.get(targetRoom);
    conv.preview = preview;
    conv.timestamp = message ? message.ts : (conversations.get(targetRoom).timestamp || 0);
    if (!isLobby) {
        conv.displayNick = displayNick;
    }

    // Re-render sidebar
    renderSidebar();
}

function renderSidebar() {
    const sidebarContent = document.querySelector('.sidebar-content');
    const onlineUsersContent = document.getElementById('online-users-content');

    // Clear existing content (we'll rebuild)
    sidebarContent.innerHTML = `
        <div class="chat-item ${currentRoom === 'lobby' ? 'active' : ''}" data-room="lobby">
            <div class="chat-item-avatar">
                <span>💬</span>
            </div>
            <div class="chat-item-info">
                <div class="chat-item-name">大厅</div>
                <div class="chat-item-preview">等待消息...</div>
            </div>
            <div class="chat-item-meta">
                <span class="chat-item-time"></span>
            </div>
        </div>
    `;
    onlineUsersContent.innerHTML = '';

    // Add lobby item (already added above, but we need to update its preview and time)
    const lobbyItem = sidebarContent.querySelector('[data-room="lobby"]');
    const lobbyConv = conversations.get('lobby') || {preview: '等待消息...', timestamp: 0};
    lobbyItem.querySelector('.chat-item-preview').textContent = lobbyConv.preview;
    if (lobbyConv.timestamp) {
        lobbyItem.querySelector('.chat-item-time').textContent = new Date(lobbyConv.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    // Add online users as private conversation items
    onlineUsers.forEach(user => {
        // Skip ourselves
        if (user.sid === userSid) return;

        // Create a unique room id for this pair (sorted)
        const roomId = [userSid, user.sid].sort().join('_');
        const isActive = (currentRoom === roomId);

        const item = document.createElement('div');
        item.className = `chat-item ${isActive ? 'active' : ''}`;
        item.dataset.room = roomId;

        // Avatar: use first letter of nick or emoji? We'll use first letter for simplicity.
        const avatarLetter = user.nick.charAt(0);
        item.innerHTML = `
            <div class="chat-item-avatar" style="background: ${user.color};">
                <span>${avatarLetter}</span>
            </div>
            <div class="chat-item-info">
                <div class="chat-item-name" style="color: ${user.color};">${user.nick}</div>
                <div class="chat-item-preview">等待消息...</div>
            </div>
            <div class="chat-item-meta">
                <span class="chat-item-time"></span>
            </div>
        `;

        // Update preview and time if we have conversation data
        const conv = conversations.get(roomId) || {preview: '等待消息...', timestamp: 0};
        item.querySelector('.chat-item-preview').textContent = conv.preview;
        if (conv.timestamp) {
            item.querySelector('.chat-item-time').textContent = new Date(conv.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }

        // Click to switch conversation
        item.addEventListener('click', () => {
            switchToRoom(roomId);
        });

        onlineUsersContent.appendChild(item);
    });
}

function switchToRoom(roomId) {
    currentRoom = roomId;
    // Update header title
    const chatTitle = document.getElementById('current-chat-title');
    if (roomId === 'lobby') {
        chatTitle.textContent = '大厅';
    } else {
        // Find the other user's nick
        const [sidA, sidB] = roomId.split('_');
        const otherSid = (sidA === userSid) ? sidB : sidA;
        const otherUser = onlineUsers.find(u => u.sid === otherSid);
        chatTitle.textContent = otherUser ? otherUser.nick : '未知用户';
    }
    // Update active state in sidebar
    document.querySelectorAll('.chat-item').forEach(item => {
        if (item.dataset.room === roomId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    // Re-render messages for the new room
    renderMessagesForCurrentRoom();
}

function renderMessagesForCurrentRoom() {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';

    // Filter messages for current room, not deleted, sorted by timestamp ascending
    const roomMessages = allMessages
        .filter(m => m.room === currentRoom && !m.deleted)
        .sort((a, b) => a.ts - b.ts);

    roomMessages.forEach(message => {
        addMessageToDom(message);
    });

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addMessageToDom(message) {
    const messagesContainer = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    // Determine if message is from self
    const isSelf = message.sid === userSid;
    messageDiv.className = `message ${isSelf ? 'self' : 'other'}`;
    messageDiv.dataset.id = message.id;
    messageDiv.dataset.sid = message.sid;

    // Format timestamp
    const timestamp = new Date(message.ts * 1000);
    const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });

    let contentHTML = '';

    switch (message.type) {
        case 'text':
            contentHTML = `
                <div class="message-header">
                    <span class="message-nick" style="color: ${message.color}">${message.nick}</span>
                    <span class="message-time">${timeString}</span>
                </div>
                <div class="message-content">
                    <div class="message-text">${escapeHtml(message.content)}</div>
                    <div class="message-actions">
                        <button onclick="copyToClipboard(this)" title="复制">📋</button>
                        ${isSelf ? `<button onclick="deleteMessage(this, '${message.id}')" title="删除">🗑️</button>` : ''}
                    </div>
                </div>
            `;
            break;

        case 'image':
            contentHTML = `
                <div class="message-header">
                    <span class="message-nick" style="color: ${message.color}">${message.nick}</span>
                    <span class="message-time">${timeString}</span>
                </div>
                <div class="message-content">
                    <div class="message-image">
                        <img src="${message.url}" alt="${message.filename}" onclick="openImageInNewTab('${message.url}')">
                    </div>
                    <div class="message-actions">
                        ${isSelf ? `<button onclick="deleteMessage(this, '${message.id}')" title="删除">🗑️</button>` : ''}
                    </div>
                </div>
            `;
            break;

        case 'audio':
            contentHTML = `
                <div class="message-header">
                    <span class="message-nick" style="color: ${message.color}">${message.nick}</span>
                    <span class="message-time">${timeString}</span>
                </div>
                <div class="message-content">
                    <div class="message-audio">
                        <audio controls src="${message.url}"></audio>
                    </div>
                    <div class="message-actions">
                        ${isSelf ? `<button onclick="deleteMessage(this, '${message.id}')" title="删除">🗑️</button>` : ''}
                    </div>
                </div>
            `;
            break;

        case 'file':
            const fileIcon = getFileIcon(message.filename);
            contentHTML = `
                <div class="message-header">
                    <span class="message-nick" style="color: ${message.color}">${message.nick}</span>
                    <span class="message-time">${timeString}</span>
                </div>
                <div class="message-content">
                    <div class="message-file">
                        <div class="message-file-icon">${fileIcon}</div>
                        <div class="message-file-info">
                            <div class="message-file-name">${escapeHtml(message.filename)}</div>
                            <div class="message-file-size">${formatFileSize(message.size || 0)}</div>
                        </div>
                        <a href="${message.url}" class="message-file-download" download>下载</a>
                    </div>
                    <div class="message-actions">
                        ${isSelf ? `<button onclick="deleteMessage(this, '${message.id}')" title="删除">🗑️</button>` : ''}
                    </div>
                </div>
            `;
            break;

        default:
            contentHTML = `
                <div class="message-header">
                    <span class="message-nick" style="color: ${message.color}">${message.nick}</span>
                    <span class="message-time">${timeString}</span>
                </div>
                <div class="message-content">
                    <div class="message-text">${escapeHtml(message.content || '')}</div>
                    <div class="message-actions">
                        ${isSelf ? `<button onclick="deleteMessage(this, '${message.id}')" title="删除">🗑️</button>` : ''}
                    </div>
                </div>
            `;
    }

    messageDiv.innerHTML = contentHTML;
    messagesContainer.appendChild(messageDiv);
}

function deleteMessage(button, messageId) {
    if (!confirm('确定要删除这条消息吗？')) return;

    // Disable button during request
    button.disabled = true;
    button.innerHTML = '⏳';

    fetch(`/api/message/${messageId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('删除失败');
        }
        // The actual removal will happen via socket event
    })
    .catch(error => {
        alert('删除失败: ' + error.message);
        console.error('Delete error:', error);
    })
    .finally(() => {
        button.disabled = false;
        button.innerHTML = '🗑️';
    });
}

function copyToClipboard(button) {
    const messageDiv = button.closest('.message');
    const textElement = messageDiv.querySelector('.message-text');
    const text = textElement.textContent;

    navigator.clipboard.writeText(text).then(() => {
        const originalHtml = button.innerHTML;
        button.innerHTML = '✅';
        setTimeout(() => {
            button.innerHTML = originalHtml;
        }, 1500);
    }).catch(error => {
        alert('复制失败: ' + error);
        console.error('Clipboard error:', error);
    });
}

function loadMessageHistory() {
    fetch('/api/messages?limit=50')
    .then(response => response.json())
    .then(data => {
        // Store all messages
        allMessages = data.messages.map(msg => {
            // Ensure room exists (for backward compatibility, if not present assume lobby)
            if (!msg.room) {
                msg.room = 'lobby';
            }
            // Ensure socketId for self-check (we don't have it from history, so we'll compare sid later)
            msg.socketId = null; // we'll set this when we get the sid from socket
            return msg;
        });
        // Update conversation previews based on loaded messages
        allMessages.forEach(msg => {
            if (!msg.deleted) {
                updateConversationPreview(msg);
            }
        });
        // Render messages for current room (lobby by default)
        renderMessagesForCurrentRoom();
    })
    .catch(error => {
        console.error('Failed to load message history:', error);
    });
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
        case 'pdf': return '📄';
        case 'doc':
        case 'docx': return '📘';
        case 'xls':
        case 'xlsx': return '📊';
        case 'ppt':
        case 'pptx': return '📽️';
        case 'zip':
        case 'rar':
        case '7z': return '📦';
        case 'txt': return '📝';
        default: return '📎';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function openImageInNewTab(url) {
    window.open(url, '_blank');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function editNickname() {
    const newNick = prompt('请输入新的昵称:', userNick);
    if (newNick !== null && newNick.trim() !== '') {
        userNick = newNick.trim();
        localStorage.setItem('chatNick', userNick);
        document.getElementById('user-nick').textContent = userNick;

        // Notify others of nickname change (optional)
        socket.emit('nickname_changed', { nick: userNick, id: userSid });
    }
}