# 01testcursor

一个支持匿名聊天、文件传输、语音消息和实时通信的 Flask Web 应用。

## 功能特性

- 💬 匿名聊天室：无需注册，自动生成昵称和颜色
- 📎 文件传输：支持图片、音频、视频和其他文件上传/下载
- 🎤 语音消息：使用浏览器 MediaRecorder 录制并发送语音
- 📱 实时通信：基于 SocketIO 的实时消息同步
- 🔍 消息搜索：支持关键词搜索消息内容和文件名
- 📋 一键复制：点击复制文本消息内容
- 🗑️ 消息删除：发送者可删除自己的消息
- 💾 持久化存储：消息和文件元信息本地JSON存储，文件实际存储在uploads目录

## 环境要求

- Python 3.10
- Conda 环境：`py310flaskClaudetest`

## 安装依赖

```bash
conda activate py310flaskClaudetest
pip install -r requirements.txt
```

## 运行

```bash
conda activate py310flaskClaudetest
python app.py
```

服务启动后访问 http://127.0.0.1:5000

## API 接口

| 路径 | 方法 | 说明 |
|------|------|------|
| `GET /` | GET | 首页，返回聊天界面 |
| `GET /health` | GET | 健康检查 |
| `GET /api/echo/<name>` | GET | 回显问候语 |
| `POST /api/upload` | POST | 上传文件（multipart/form-data） |
| `GET /uploads/<filename>` | GET | 获取上传的文件 |
| `GET /api/messages` | GET | 获取消息历史（支持limit和before参数） |
| `GET /api/search` | GET | 搜索消息（q参数为搜索关键词） |
| `DELETE /api/message/<id>` | DELETE | 删除指定ID的消息（仅发送者可删除） |

### SocketIO 事件

| 事件名称 | 方向 | 说明 |
|----------|------|------|
| `connect` | 客户端→服务器 | 建立连接 |
| `disconnect` | 客户端→服务器 | 断开连接 |
| `send_message` | 客户端→服务器 | 发送新消息 |
| `new_message` | 服务器→客户端 | 广播新消息给所有客户端 |
| `message_deleted` | 服务器→客户端 | 广播消息删除事件 |
| `user_count` | 服务器→客户端 | 广播在线用户数量 |

## 消息类型

支持的消息类型包括：
- `text`：普通文本消息
- `image`：图片消息（支持 JPG, PNG, GIF, WebP 等）
- `audio`：音频消息（支持 MP3, WAV, OGG, WebM 等）
- `file`：其他文件类型

## 测试

```bash
conda activate py310flaskClaudetest
pytest tests/ -v
```

## 项目结构

```
01testcursor/
├── app.py                  # Flask 应用入口，包含 SocketIO 和 API 路由
├── requirements.txt        # 项目依赖
├── data/
│   └── store.json          # 消息和文件元信息持久化存储
├── uploads/                # 用户上传的文件存储目录
├── templates/
│   └── index.html          # 聊天界面 HTML 模板
├── static/
│   ├── css/style.css       # 样式表
│   └── js/chat.js          # 客户端聊天逻辑
└── tests/
    ├── test_app.py         # 原有的 REST API 测试
    └── test_chat.py        # 聊天功能相关测试
```

## 实现说明

### 后端
- 使用 Flask-SocketIO 实现实时通信
- 消息存储：内存中保留最近500条消息，超出时自动清理并同步到JSON文件
- 文件存储：上传的文件保存在 `uploads/` 目录，文件名使用UUID避免冲突
- 持久化：消息和文件元信息实时同步到 `data/store.json`
- 安全性：文件上传限制为10MB，使用secure_filename防止路径遍历

### 前端
- 原生 HTML/CSS/JavaScript，无需额外框架
- SocketIO 客户端实现实时消息同步
- MediaRecorder API 用于语音录制
- 响应式设计，支持移动端访问
- 消息气泡根据发送者和类型自适应布局
- 支持消息搜索、复制、删除等交互功能

## 依赖说明

- Flask: Web 框架
- Flask-SocketIO: 实时通信扩展
- python-socketio & python-engineio: SocketIO 依赖
- simple-websocket: WebSocket 支持
- Werkzeug: Flask 依赖
- Jinja2: 模板引擎