#!/bin/bash
# 加载 .env.local 文件
export $(cat .env.local | grep -v '^#' | xargs)
# 启动开发服务器
npm run dev
