#!/bin/bash

# 初始化 package.json
npm init -y

# 安装 TypeScript + Rollup + Jest 相关依赖
npm install typescript ts-node @types/node --save-dev
npm install rollup rollup-plugin-typescript2 --save-dev
npm install jest ts-jest @types/jest --save-dev
npm install axios

# 初始化 TypeScript
npx tsc --init

# 初始化 Jest
npx ts-jest config:init

# 创建目录结构
mkdir src
mkdir test
mkdir dist
mkdir examples

# 创建基础文件
touch src/index.ts
touch test/index.test.ts
touch examples/simple.ts
touch README.md

# 输出完成信息
echo "✅ 项目结构已初始化完成"

