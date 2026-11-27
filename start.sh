#!/usr/bin/env bash
# 个人生活管理平台 · 启动脚本
cd "$(dirname "$0")"
PORT="${PORT:-8000}"
echo "启动中… 打开 http://127.0.0.1:${PORT}"
exec python3.11 app.py
