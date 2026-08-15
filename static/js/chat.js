// Chat client-side logic
let socket;
let userNick = '';
let userColor = '';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket.IO connection
    socket = io();

    // Load or generate user identity
    loadUserIdentity();

    // Set up event listeners
    setupEventListeners();

    // Load initial message history
    loadMessageHistory();

    // Handle socket events
    setupSocketEvents();
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

    // Display user nick
    document.getElementById('user-nick').textContent = userNick;
    document.getElementById('user-nick').style.backgroundColor = userColor;
    document.getElementById('user-nick').style.color = getContrastColor(userColor);
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

    // Send button
    document.getElementById('send-btn').addEventListener('click', sendMessage);

    // File upload
    document.getElementById('file-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', handleFileSelect);

    // Audio recording
    document.getElementById('audio-btn').addEventListener('click', toggleAudioRecording);

    // Nickname edit
    document.getElementById('edit-nick').addEventListener('click', editNickname);

    // Search
    document.getElementById('search-btn').addEventListener('click', searchMessages);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchMessages();
        }
    });
}

function setupSocketEvents() {
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('join', { nick: userNick, color: userColor });
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    socket.on('new_message', (message) => {
        addMessageToDom(message);
    });

    socket.on('message_deleted', (data) => {
        const msgElement = document.querySelector(`.message[data-id="${data.id}"]`);
        if (msgElement) {
            msgElement.remove();
        }
    });

    socket.on('user_count', (data) => {
        document.getElementById('online-count').textContent = `在线人数: ${data.count}`;
    });
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (!content) return;

    // Send text message
    socket.emit('send_message', {
        type: 'text',
        content: content,
        nick: userNick,
        color: userColor
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

        // Send file message
        socket.emit('send_message', {
            type: data.type,
            content: data.filename,
            filename: data.filename,
            url: data.url,
            nick: userNick,
            color: userColor
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

                    // Send audio message
                    socket.emit('send_message', {
                        type: data.type,
                        content: data.filename,
                        filename: data.filename,
                        url: data.url,
                        nick: userNick,
                        color: userColor
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

function addMessageToDom(message) {
    const messagesContainer = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.socketId === socket.id ? 'self' : 'other'}`;
    messageDiv.dataset.id = message.id;
    messageDiv.dataset.sid = message.socketId;

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
                        ${message.socketId === socket.id ? `<button onclick="deleteMessage(this, '${message.id}')" title="删除">🗑️</button>` : ''}
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
                        ${message.socketId === socket.id ? `<button onclick="deleteMessage(this, '${message.id}')" title="删除">🗑️</button>` : ''}
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
                        ${message.socketId === socket.id ? `<button onclick="deleteMessage(this, '${message.id}')" title="删除">🗑️</button>` : ''}
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
                        ${message.socketId === socket.id ? `<button onclick="deleteMessage(this, '${message.id}')" title="删除">🗑️</button>` : ''}
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
                        ${message.socketId === socket.id ? `<button onclick="deleteMessage(this, '${message.id}')" title="删除">🗑️</button>` : ''}
                    </div>
                </div>
            `;
    }

    messageDiv.innerHTML = contentHTML;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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

function searchMessages() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    const searchBtn = document.getElementById('search-btn');
    searchBtn.disabled = true;
    searchBtn.innerHTML = '🔍';

    fetch(`/api/search?q=${encodeURIComponent(query)}`)
    .then(response => response.json())
    .then(data => {
        showSearchResults(data.messages);
    })
    .catch(error => {
        alert('搜索失败: ' + error.message);
        console.error('Search error:', error);
    })
    .finally(() => {
        searchBtn.disabled = false;
        searchBtn.innerHTML = '🔍';
    });
}

function showSearchResults(messages) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'search-modal';
    modal.innerHTML = `
        <div class="search-modal-content">
            <h3>搜索结果 (${messages.length} 条)</h3>
            <div class="search-results">
                ${messages.length > 0 ? messages.map(msg => `
                    <div class="search-result" data-id="${msg.id}">
                        <div class="search-result-header">
                            <span class="search-result-nick" style="color: ${msg.color}">${msg.nick}</span>
                            <span class="search-result-time">${new Date(msg.ts * 1000).toLocaleString()}</span>
                        </div>
                        <div class="search-result-content">
                            ${msg.type === 'text' ?
                                `<p>${escapeHtml(msg.content.substring(0, 100))}${msg.content.length > 100 ? '...' : ''}</p>` :
                                msg.type === 'image' ?
                                `<img src="${msg.url}" alt="${msg.filename}" style="max-width: 100px; max-height: 100px;">` :
                                msg.type === 'audio' ?
                                `<audio controls src="${msg.url}" style="max-width: 200px;"></audio>` :
                                `<div><strong>${escapeHtml(msg.filename)}</strong> (${formatFileSize(msg.size || 0)})</div>`
                            }
                        </div>
                    </div>
                `).join('') : '<p>没有找到相关消息</p>'}
            </div>
            <button id="close-search">关闭</button>
        </div>
    `;

    document.body.appendChild(modal);

    // Add click listeners to results
    modal.querySelectorAll('.search-result').forEach(result => {
        result.addEventListener('click', () => {
            const messageId = result.dataset.id;
            // Scroll to message in chat
            const msgElement = document.querySelector(`.message[data-id="${messageId}"]`);
            if (msgElement) {
                msgElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Highlight briefly
                msgElement.style.border = '2px solid #3498db';
                setTimeout(() => {
                    msgElement.style.border = '';
                }, 2000);
            }
            // Close modal
            document.body.removeChild(modal);
        });
    });

    // Close button
    modal.querySelector('#close-search').addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

function loadMessageHistory() {
    fetch('/api/messages?limit=50')
    .then(response => response.json())
    .then(data => {
        // Display messages in chronological order
        data.messages.forEach(msg => {
            // Add socketId for self-check (we don't have it from history, so assume not self)
            msg.socketId = null;
            addMessageToDom(msg);
        });
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
        // Keep same color or generate new one?
        localStorage.setItem('chatNick', userNick);
        document.getElementById('user-nick').textContent = userNick;

        // Notify others of nickname change (optional)
        socket.emit('nickname_changed', { nick: userNick, id: socket.id });
    }
}