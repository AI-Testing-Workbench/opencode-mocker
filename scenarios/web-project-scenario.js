// 预设场景：通过多轮交互引导创建一个待办事项Web应用（前后端分离）
// 每一步都需要用户确认后才继续，以测试长时间稳定性

const scenarios = [
  // Step 1: 初始问候和项目规划
  `好的，我来帮你创建一个待办事项Web应用。

这个项目将包括：
- 前端：HTML + CSS + JavaScript
- 后端：Node.js + Express
- 功能：增删改查待办事项

项目结构：
\`\`\`
todo-app/
├── backend/
│   ├── server.js
│   ├── package.json
│   └── routes/
│       └── todos.js
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
\`\`\`

准备好了吗？请回复"继续"开始创建项目。`,

  // Step 2: 创建后端目录
  `第一步：创建后端目录结构。

我将创建 backend 文件夹和 routes 子文件夹。

完成后请回复"继续"进行下一步。`,

  // Step 3: 创建后端package.json
  `第二步：创建后端的 package.json 文件。

这个文件定义了项目依赖和启动脚本。

完成后请回复"继续"。`,

  // Step 4: 创建后端服务器主文件
  `第三步：创建后端服务器主文件 server.js。

这个文件将启动 Express 服务器并配置中间件。

完成后请回复"继续"。`,

  // Step 5: 创建API路由文件
  `第四步：创建 API 路由文件 routes/todos.js。

这个文件包含所有待办事项的 CRUD 操作。

完成后请回复"继续"。`,

  // Step 6: 创建前端目录
  `第五步：创建前端目录结构。

我将创建 frontend 文件夹。

完成后请回复"继续"。`,

  // Step 7: 创建前端HTML
  `第六步：创建前端 HTML 文件 index.html。

这是应用的主页面结构。

完成后请回复"继续"。`,

  // Step 8: 创建前端CSS
  `第七步：创建样式文件 style.css。

这个文件定义了页面的视觉样式。

完成后请回复"继续"。`,

  // Step 9: 创建前端JavaScript
  `第八步：创建前端交互逻辑 app.js。

这个文件处理所有的用户交互和 API 调用。

完成后请回复"继续"。`,

  // Step 10: 创建README
  `第九步：创建项目说明文档 README.md。

这个文件包含项目介绍和使用说明。

完成后请回复"继续"。`,

  // Step 11: 验证后端文件
  `第十步：验证后端文件是否创建成功。

让我检查一下 backend 目录下的文件。

完成后请回复"继续"。`,

  // Step 12: 验证前端文件
  `第十一步：验证前端文件是否创建成功。

让我检查一下 frontend 目录下的文件。

完成后请回复"继续"。`,

  // Step 13: 测试后端服务
  `第十二步：准备测试后端服务。

建议你在新终端中运行：
\`\`\`bash
cd backend
npm install
npm start
\`\`\`

安装完成后请回复"继续"。`,

  // Step 14: 测试前端页面
  `第十三步：测试前端页面。

请在浏览器中打开 frontend/index.html 文件。

测试完成后请回复"继续"。`,

  // Step 15: 功能测试指导
  `第十四步：进行功能测试。

请测试以下功能：
1. 添加一个待办事项
2. 标记为完成
3. 删除待办事项

测试完成后请回复"继续"。`,

  // Step 16: 优化建议
  `第十五步：项目优化建议。

可以考虑添加的功能：
- 数据持久化（使用数据库）
- 用户认证
- 待办事项分类
- 截止日期提醒

需要我帮你实现这些功能吗？请回复"继续"或"结束"。`,

  // Step 17: 总结
  `项目创建完成！

已创建的文件：
- backend/package.json
- backend/server.js
- backend/routes/todos.js
- frontend/index.html
- frontend/style.css
- frontend/app.js
- README.md

运行步骤：
1. cd backend && npm install && npm start
2. 在浏览器打开 frontend/index.html

如需继续优化，请告诉我具体需求。`
];

// 每一步的具体操作内容（包含思考和工具调用）
const stepActions = {
  2: {
    description: "创建后端目录结构",
    reasoning: "用户同意开始项目创建。首先需要创建项目的目录结构，从后端开始。我需要创建 backend 目录和其子目录 routes。",
    action: "好的，我现在开始创建项目结构。",
    toolCalls: [
      {
        id: "call_mkdir_backend",
        type: "function",
        function: {
          name: "create_directory",
          arguments: JSON.stringify({
            path: "backend"
          })
        }
      },
      {
        id: "call_mkdir_routes",
        type: "function",
        function: {
          name: "create_directory",
          arguments: JSON.stringify({
            path: "backend/routes"
          })
        }
      }
    ]
  },
  
  3: {
    description: "创建 backend/package.json",
    reasoning: "目录结构已创建完成。现在需要创建后端的 package.json 文件，定义项目依赖和脚本。这个文件需要包含 express、cors 和 body-parser 等依赖。",
    action: "创建后端配置文件。",
    toolCalls: [
      {
        id: "call_write_package_json",
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({
            path: "backend/package.json",
            content: `{
  "name": "todo-backend",
  "version": "1.0.0",
  "description": "Todo app backend API",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "body-parser": "^1.20.2"
  }
}`
          })
        }
      }
    ]
  },
  
  4: {
    description: "创建 backend/server.js",
    reasoning: "package.json 已创建。接下来创建服务器主文件 server.js，这是后端的入口文件。需要配置 Express 服务器、CORS、body-parser 中间件，并引入 todos 路由。",
    action: "创建后端服务器主文件。",
    toolCalls: [
      {
        id: "call_write_server_js",
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({
            path: "backend/server.js",
            content: `const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const todosRouter = require('./routes/todos');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

app.use('/api/todos', todosRouter);

app.get('/', (req, res) => {
  res.json({ message: 'Todo API Server' });
});

app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});`
          })
        }
      }
    ]
  },
  
  5: {
    description: "创建 backend/routes/todos.js",
    reasoning: "服务器主文件已创建。现在需要实现 API 路由文件，包含待办事项的 CRUD 操作：GET（获取所有）、POST（创建）、PUT（更新）、DELETE（删除）。使用内存数组存储数据。",
    action: "创建 API 路由文件，实现待办事项的增删改查功能。",
    toolCalls: [
      {
        id: "call_write_todos_js",
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({
            path: "backend/routes/todos.js",
            content: `const express = require('express');
const router = express.Router();

let todos = [];
let nextId = 1;

router.get('/', (req, res) => {
  res.json(todos);
});

router.post('/', (req, res) => {
  const { text } = req.body;
  const newTodo = {
    id: nextId++,
    text,
    completed: false,
    createdAt: new Date().toISOString()
  };
  todos.push(newTodo);
  res.status(201).json(newTodo);
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  const todo = todos.find(t => t.id === parseInt(id));
  
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  
  todo.completed = completed;
  res.json(todo);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const index = todos.findIndex(t => t.id === parseInt(id));
  
  if (index === -1) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  
  todos.splice(index, 1);
  res.status(204).send();
});

module.exports = router;`
          })
        }
      }
    ]
  },
  
  6: {
    description: "创建前端目录",
    reasoning: "后端代码已全部完成。现在开始创建前端部分，首先创建 frontend 目录。",
    action: "后端完成，开始创建前端。",
    toolCalls: [
      {
        id: "call_mkdir_frontend",
        type: "function",
        function: {
          name: "create_directory",
          arguments: JSON.stringify({
            path: "frontend"
          })
        }
      }
    ]
  },
  
  7: {
    description: "创建 frontend/index.html",
    reasoning: "前端目录已创建。现在创建 HTML 主页面，包含输入框、按钮、待办列表和统计信息。页面结构要清晰，便于后续添加样式和交互。",
    action: "创建前端 HTML 页面结构。",
    toolCalls: [
      {
        id: "call_write_index_html",
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({
            path: "frontend/index.html",
            content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>待办事项</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <h1>📝 我的待办事项</h1>
        
        <div class="input-section">
            <input type="text" id="todoInput" placeholder="添加新的待办事项...">
            <button id="addBtn">添加</button>
        </div>
        
        <div id="todoList" class="todo-list"></div>
        
        <div class="stats">
            <span id="totalCount">总计: 0</span>
            <span id="completedCount">已完成: 0</span>
        </div>
    </div>
    
    <script src="app.js"></script>
</body>
</html>`
          })
        }
      }
    ]
  },
  
  8: {
    description: "创建 frontend/style.css",
    reasoning: "HTML 结构已完成。现在添加 CSS 样式，使用渐变背景、卡片式布局、圆角和阴影效果，让界面更美观现代。",
    action: "添加样式文件，美化界面。",
    toolCalls: [
      {
        id: "call_write_style_css",
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({
            path: "frontend/style.css",
            content: `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    padding: 20px;
}

.container {
    max-width: 600px;
    margin: 0 auto;
    background: white;
    border-radius: 10px;
    padding: 30px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

h1 {
    text-align: center;
    color: #333;
    margin-bottom: 30px;
}

.input-section {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

#todoInput {
    flex: 1;
    padding: 12px;
    border: 2px solid #ddd;
    border-radius: 5px;
    font-size: 16px;
}

#addBtn {
    padding: 12px 24px;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 16px;
}

#addBtn:hover {
    background: #5568d3;
}

.todo-list {
    margin-bottom: 20px;
}

.todo-item {
    display: flex;
    align-items: center;
    padding: 15px;
    background: #f8f9fa;
    margin-bottom: 10px;
    border-radius: 5px;
    transition: all 0.3s;
}

.todo-item:hover {
    background: #e9ecef;
}

.todo-item.completed .todo-text {
    text-decoration: line-through;
    color: #999;
}

.todo-checkbox {
    width: 20px;
    height: 20px;
    margin-right: 15px;
    cursor: pointer;
}

.todo-text {
    flex: 1;
    font-size: 16px;
}

.delete-btn {
    padding: 6px 12px;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
}

.delete-btn:hover {
    background: #c82333;
}

.stats {
    display: flex;
    justify-content: space-around;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 5px;
    font-weight: bold;
    color: #666;
}`
          })
        }
      }
    ]
  },
  
  9: {
    description: "创建 frontend/app.js",
    reasoning: "样式已完成。最后创建 JavaScript 文件实现交互逻辑：加载待办事项、添加、切换完成状态、删除，以及更新统计信息。使用 fetch API 与后端通信。",
    action: "创建前端交互逻辑。",
    toolCalls: [
      {
        id: "call_write_app_js",
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({
            path: "frontend/app.js",
            content: `const API_URL = 'http://localhost:3001/api/todos';

let todos = [];

document.addEventListener('DOMContentLoaded', () => {
    loadTodos();
    
    document.getElementById('addBtn').addEventListener('click', addTodo);
    document.getElementById('todoInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });
});

async function loadTodos() {
    try {
        const response = await fetch(API_URL);
        todos = await response.json();
        renderTodos();
    } catch (error) {
        console.error('加载失败:', error);
        alert('无法连接到服务器，请确保后端服务已启动');
    }
}

function renderTodos() {
    const todoList = document.getElementById('todoList');
    todoList.innerHTML = '';
    
    todos.forEach(todo => {
        const todoItem = document.createElement('div');
        todoItem.className = \`todo-item \${todo.completed ? 'completed' : ''}\`;
        
        todoItem.innerHTML = \`
            <input type="checkbox" class="todo-checkbox" 
                   \${todo.completed ? 'checked' : ''} 
                   onchange="toggleTodo(\${todo.id})">
            <span class="todo-text">\${todo.text}</span>
            <button class="delete-btn" onclick="deleteTodo(\${todo.id})">删除</button>
        \`;
        
        todoList.appendChild(todoItem);
    });
    
    updateStats();
}

async function addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        
        const newTodo = await response.json();
        todos.push(newTodo);
        input.value = '';
        renderTodos();
    } catch (error) {
        console.error('添加失败:', error);
        alert('添加失败，请重试');
    }
}

async function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    
    try {
        await fetch(\`\${API_URL}/\${id}\`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: !todo.completed })
        });
        
        todo.completed = !todo.completed;
        renderTodos();
    } catch (error) {
        console.error('更新失败:', error);
    }
}

async function deleteTodo(id) {
    try {
        await fetch(\`\${API_URL}/\${id}\`, { method: 'DELETE' });
        todos = todos.filter(t => t.id !== id);
        renderTodos();
    } catch (error) {
        console.error('删除失败:', error);
    }
}

function updateStats() {
    const total = todos.length;
    const completed = todos.filter(t => t.completed).length;
    
    document.getElementById('totalCount').textContent = \`总计: \${total}\`;
    document.getElementById('completedCount').textContent = \`已完成: \${completed}\`;
}`
          })
        }
      }
    ]
  },
  
  10: {
    description: "创建 README.md",
    reasoning: "所有代码文件已创建完成。现在创建 README.md 文档，说明项目结构、运行步骤和功能特性，方便用户理解和使用。",
    action: "创建项目说明文档。",
    toolCalls: [
      {
        id: "call_write_readme",
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({
            path: "README.md",
            content: `# 待办事项 Web 应用

一个简单的待办事项管理应用，包含前后端分离架构。

## 技术栈

- 前端：HTML + CSS + JavaScript
- 后端：Node.js + Express
- 数据存储：内存存储

## 项目结构

\\\`\\\`\\\`
todo-app/
├── backend/
│   ├── server.js
│   ├── package.json
│   └── routes/
│       └── todos.js
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
\\\`\\\`\\\`

## 运行步骤

1. 安装后端依赖：
   \\\`\\\`\\\`bash
   cd backend
   npm install
   \\\`\\\`\\\`

2. 启动后端服务：
   \\\`\\\`\\\`bash
   npm start
   \\\`\\\`\\\`

3. 打开前端页面：
   在浏览器中打开 frontend/index.html

## 功能特性

- ✅ 添加待办事项
- ✅ 标记完成/未完成
- ✅ 删除待办事项
- ✅ 实时统计`
          })
        }
      }
    ]
  },
  
  11: {
    description: "验证后端文件",
    reasoning: "项目文件已全部创建。现在需要验证后端文件是否都正确创建，确保没有遗漏。",
    action: "验证后端文件是否创建成功。",
    toolCalls: [
      {
        id: "call_list_backend",
        type: "function",
        function: {
          name: "list_directory",
          arguments: JSON.stringify({
            path: "backend"
          })
        }
      }
    ]
  },
  
  12: {
    description: "验证前端文件",
    reasoning: "后端文件验证完成。现在验证前端文件是否都正确创建。",
    action: "验证前端文件是否创建成功。",
    toolCalls: [
      {
        id: "call_list_frontend",
        type: "function",
        function: {
          name: "list_directory",
          arguments: JSON.stringify({
            path: "frontend"
          })
        }
      }
    ]
  }
};

// 获取响应的主函数（支持思考和工具调用）
function getResponseWithTools(step, messages) {
  console.log(`  Current step: ${step}, Total scenarios: ${scenarios.length}`);
  
  // 如果有对应的步骤操作，返回完整的响应对象
  if (stepActions[step]) {
    const stepData = stepActions[step];
    return {
      content: stepData.action,
      reasoning: stepData.reasoning || null,
      toolCalls: stepData.toolCalls || null
    };
  }
  
  // 否则返回场景描述（纯文本，无工具调用）
  const scenarioIndex = Math.min(step - 1, scenarios.length - 1);
  return {
    content: scenarios[scenarioIndex],
    reasoning: null,
    toolCalls: null
  };
}

// 兼容旧的 getResponse 函数
function getResponse(step, messages) {
  const result = getResponseWithTools(step, messages);
  return result.content;
}

module.exports = {
  getResponse,
  getResponseWithTools,
  scenarios,
  stepActions
};
