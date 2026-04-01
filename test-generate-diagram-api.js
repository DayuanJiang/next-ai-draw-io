#!/usr/bin/env node

/**
 * Generate Diagram API 测试脚本
 *
 * 使用方法：
 * node test-generate-diagram-api.js [format]
 *
 * format: xml | png | svg (默认: xml)
 *
 * 示例：
 * node test-generate-diagram-api.js xml
 * node test-generate-diagram-api.js png
 * node test-generate-diagram-api.js svg
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// 配置
const BASE_URL = process.env.BASE_URL || 'http://localhost:9000';
const ACCESS_CODE = process.env.ACCESS_CODE || ''; // 如果配置了 ACCESS_CODE_LIST，在这里设置
const FORMAT = process.argv[2] || 'xml'; // xml | png | svg
const DESCRIPTION = '创建一个用户登录流程图，包含用户输入、验证、成功和失败的分支';

// 图片保存目录
const STORAGE_DIR = path.join(process.cwd(), '.next', 'cache', 'diagrams');

console.log('='.repeat(60npm ));
console.log('Generate Diagram API 测试');
console.log('='.repeat(60));
console.log(`格式: ${FORMAT}`);
console.log(`描述: ${DESCRIPTION}`);
console.log(`图片保存目录: ${STORAGE_DIR}`);
console.log('='.repeat(60));
console.log();

// 步骤 1: 创建任务
async function createTask() {
  console.log('📝 步骤 1: 创建图表生成任务...');

  const options = {
    method: 'POST',
    hostname: 'localhost',
    port: 9000,
    path: '/api/generate-diagram',
    headers: {
      'Content-Type': 'application/json',
      ...(ACCESS_CODE && { 'x-access-code': ACCESS_CODE })
    }
  };

  const data = JSON.stringify({
    description: DESCRIPTION,
    format: FORMAT,
    options: {
      width: 1920,
      height: 1080
    }
  });

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const result = JSON.parse(body);
          console.log(`✅ 任务已创建: ${result.taskId}`);
          console.log(`   状态: ${result.status}`);
          resolve(result.taskId);
        } else {
          console.error(`❌ 创建任务失败 (${res.statusCode}):`, body);
          reject(new Error(body));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 步骤 2: 轮询任务状态
async function pollTaskStatus(taskId) {
  console.log('\n⏳ 步骤 2: 轮询任务状态...');

  const maxAttempts = 60; // 最多轮询 60 次
  const interval = 2000; // 每 2 秒轮询一次

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, interval));

    const url = new URL(BASE_URL);
    const options = {
      method: 'GET',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `/api/generate-diagram/${taskId}`,
      headers: {
        ...(ACCESS_CODE && { 'x-access-code': ACCESS_CODE })
      }
    };

    const task = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(body));
          } else {
            reject(new Error(body));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });

    console.log(`   [${i + 1}/${maxAttempts}] 状态: ${task.status}${task.progress ? ` (${task.progress}%)` : ''}`);

    if (task.status === 'completed') {
      console.log('✅ 任务完成！');
      return task;
    } else if (task.status === 'failed') {
      console.error('❌ 任务失败:', task.error);
      throw new Error(task.error);
    }
  }

  throw new Error('轮询超时');
}

// 步骤 3: 显示结果
function displayResult(task) {
  console.log('\n📊 步骤 3: 任务结果');
  console.log('='.repeat(60));
  console.log(`任务 ID: ${task.taskId}`);
  console.log(`格式: ${task.format}`);
  console.log(`创建时间: ${task.createdAt}`);
  console.log(`完成时间: ${task.completedAt}`);

  if (task.format === 'xml') {
    console.log('\n📄 生成的 XML:');
    console.log('-'.repeat(60));
    const xmlContent = typeof task.result === 'string' ? task.result : task.result.xml;
    if (xmlContent) {
      console.log(xmlContent.substring(0, 500) + '...');
    } else {
      console.log('XML 内容为空');
    }
    console.log('-'.repeat(60));
  } else {
    console.log('\n🖼️  图片信息:');
    console.log(`   下载 URL: ${BASE_URL}${task.result.url}`);
    console.log(`   文件大小: ${(task.result.size / 1024).toFixed(2)} KB`);

    const imagePath = path.join(STORAGE_DIR, `${task.taskId}.${task.format}`);
    console.log(`   保存位置: ${imagePath}`);

    if (fs.existsSync(imagePath)) {
      console.log('   ✅ 文件已保存');
    } else {
      console.log('   ⚠️  文件未找到');
    }
  }

  console.log('='.repeat(60));
}

// 主函数
async function main() {
  try {
    const taskId = await createTask();
    const task = await pollTaskStatus(taskId);
    displayResult(task);

    console.log('\n✅ 测试完成！');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

main();
