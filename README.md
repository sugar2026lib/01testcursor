# Python Project: Chat Application

## Overview
A real-time chat application built with Flask and Flask-SocketIO. This document provides setup, deployment, and startup instructions for the Python version of the project.

## Requirements
- Python 3.8+
- Flask == 2.3.3
- Flask-SocketIO == 5.3.4
- pytest == 7.4.0
- socketio == 5.9.2

## Setup
1. Clone the repository:
   ```
   git clone https://github.com/your-username/chat-app.git
   cd chat-app
   ```
2. Create a virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

## Deployment
### Option 1: Using Gunicorn
1. Install Gunicorn:
   ```
   pip install gunicorn
   ```
2. Create a `Procfile`:
   ```
   web: gunicorn -w 4 app:app
   ```
3. Deploy to Heroku or similar platforms.

### Option 2: Production Environment
1. Set environment variables:
   ```
   set FLASK_APP=app.py  # On Windows
   export FLASK_APP=app.py  # On Linux/Mac
   ```
2. For production, use a reverse proxy like Nginx with Gunicorn or uWSGI.

## Starting the Application
1. Run in development mode:
   ```
   flask run
   ```
2. Access the app at http://localhost:5000

## Testing
1. Run tests:
   ```
   pytest tests/test_chat.py
   ```

## SocketIO Configuration
Ensure `socket.io` is properly configured in `static/js/chat.js` to point to your server endpoint.

## Data Storage
The application uses a local JSON file (`data/store.json`) for message persistence. Adjust the path in `app.py` if needed.

## Troubleshooting
- Check browser console for WebSocket connection issues
- Verify Python version with `python --version`
- Ensure all dependencies are installed