// OpenCode 专用场景：根据实际的 OpenCode 工具和提示词优化

const scenarios = [
  // Step 1: 初始响应 - 简洁，符合 OpenCode 的要求
  `我会帮你创建一个待办事项 Web 应用，包含前后端。`,

  // Step 2-17: 后续步骤
  `创建后端目录`,
  `创建 package.json`,
  `创建服务器文件`,
  `创建 API 路由`,
  `创建前端目录`,
  `创建 HTML 页面`,
  `创建样式文件`,
  `创建 JS 文件`,
  `创建 README`,
  `验证后端文件`,
  `验证前端文件`,
  `安装依赖：cd backend && npm install`,
  `启动服务：cd backend && npm start`,
  `在浏览器打开 frontend/index.html`,
  `项目已完成`,
  `完成`
];

// OpenCode 工具调用格式
const stepActions = {
  2: {
    reasoning: "需要创建项目目录结构",
    action: "创建后端目录",
    toolCalls: [
      {
        id: "call_bash_mkdir_backend",
        type: "function",
        function: {
          name: "bash",
          arguments: JSON.stringify({
            command: "mkdir -p backend/routes",
            description: "创建后端目录结构"
          })
        }
      }
    ]
  },
  
  3: {
    reasoning: "创建后端配置文件",
    action: "创建 package.json",
    toolCalls: [
      {
        id: "call_write_package",
        type: "function",
        function: {
          name: "write",
          arguments: JSON.stringify({
            filePath: "/Users/lujs/optest/backend/package.json",
            content: `{
  "name": "todo-backend",
  "version": "1.0.0",
  "description": "Todo app backend",
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
    reasoning: "创建 Express 服务器",
    action: "创建服务器文件",
    toolCalls: [
      {
        id: "call_write_server",
        type: "function",
        function: {
          name: "write",
          arguments: JSON.stringify({
            filePath: "/Users/lujs/optest/backend/server.js",
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
    reasoning: "实现 CRUD API",
    action: "创建 API 路由",
    toolCalls: [
      {
        id: "call_write_routes",
        type: "function",
        function: {
          name: "write",
          arguments: JSON.stringify({
            filePath: "/Users/lujs/optest/backend/routes/todos.js",
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
    reasoning: "创建前端目录",
    action: "创建前端目录",
    toolCalls: [
      {
        id: "call_bash_mkdir_frontend",
        type: "function",
        function: {
          name: "bash",
          arguments: JSON.stringify({
            command: "mkdir -p frontend",
            description: "创建前端目录"
          })
        }
      }
    ]
  },
  
  7: {
    reasoning: "创建 HTML 结构",
    action: "创建 HTML 页面",
    toolCalls: [
      {
        id: "call_write_html",
        type: "function",
        function: {
          name: "write",
          arguments: JSON.stringify({
            filePath: "/Users/lujs/optest/frontend/index.html",
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
    reasoning: "添加样式",
    action: "创建样式文件",
    toolCalls: [
      {
        id: "call_write_css",
        type: "function",
        function: {
          name: "write",
          arguments: JSON.stringify({
            filePath: "/Users/lujs/optest/frontend/style.css",
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
    reasoning: "实现前端逻辑",
    action: "创建 JS 文件",
    toolCalls: [
      {
        id: "call_write_js",
        type: "function",
        function: {
          name: "write",
          arguments: JSON.stringify({
            filePath: "/Users/lujs/optest/frontend/app.js",
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
        alert('无法连接到服务器');
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
    reasoning: "添加文档",
    action: "创建 README",
    toolCalls: [
      {
        id: "call_write_readme",
        type: "function",
        function: {
          name: "write",
          arguments: JSON.stringify({
            filePath: "/Users/lujs/optest/README.md",
            content: `# 待办事项应用

前后端分离的待办事项管理应用。

## 运行

\`\`\`bash
cd backend
npm install
npm start
\`\`\`

然后在浏览器打开 frontend/index.html`
          })
        }
      }
    ]
  }
};

// 获取响应（支持思考和工具调用）
function getResponseWithTools(step, messages) {
  console.log(`  Current step: ${step}, Total scenarios: ${scenarios.length}`);
  
  if (stepActions[step]) {
    const stepData = stepActions[step];
    return {
      content: stepData.action,
      reasoning: stepData.reasoning || null,
      toolCalls: stepData.toolCalls || null
    };
  }
  
  const scenarioIndex = Math.min(step - 1, scenarios.length - 1);
  return {
    content: scenarios[scenarioIndex],
    reasoning: null,
    toolCalls: null
  };
}

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
