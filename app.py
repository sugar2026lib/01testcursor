from flask import Flask, jsonify

app = Flask(__name__)


@app.route("/")
def index():
    return jsonify({"message": "Hello from Flask!", "status": "ok"})


@app.route("/health")
def health():
    return jsonify({"status": "healthy"})


@app.route("/api/echo/<name>")
def echo(name):
    return jsonify({"greeting": f"Hello, {name}!"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
