# 01testcursor

一个简单的 Flask Web 应用示例。

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

| 路径 | 说明 |
|------|------|
| `GET /` | 首页，返回欢迎信息 |
| `GET /health` | 健康检查 |
| `GET /api/echo/<name>` | 回显问候语 |

## 测试

```bash
conda activate py310flaskClaudetest
pytest tests/ -v
```
