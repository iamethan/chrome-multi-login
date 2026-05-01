# Multi-Login Session Isolator

每个标签页拥有独立的登录态，同一网站可同时登录多个账号，互不干扰。类似 SessionBox 的 Edge 浏览器扩展。

## 功能

- **Cookie 隔离** — 每个标签页维护独立 Cookie 会话，切换标签自动切换登录态
- **LocalStorage 隔离** — 通过 MAIN world 注入代理，为每个 Session 独立命名空间
- **一键新建隔离标签** — 通过弹出面板快速创建新的隔离标签页
- **Session 管理** — 自定义名称、查看活跃列表、一键重置
- **纯本地存储** — 所有数据保存在 `chrome.storage.local`，不上传任何信息

## 安装

1. 打开 Edge，地址栏输入 `edge://extensions/`
2. 开启 **开发人员模式**
3. 点击 **加载解压缩的扩展**，选择本项目目录
4. 点击工具栏拼图图标，将扩展固定到工具栏

## 使用

1. 点击工具栏扩展图标，打开管理面板
2. 点击「新建隔离标签」创建独立会话
3. 在不同标签页访问同一网站，登录不同账号
4. 自由切换标签，各账号登录态互不影响

## 项目结构

```
multi-login/
├── manifest.json          # Manifest V3 清单
├── background.js          # Service Worker — Cookie 剩换核心逻辑
├── content/
│   ├── content.js         # 内容脚本（ISOLATED world）— 获取 Session 并通知
│   └── injected.js        # 注入脚本（MAIN world）— localStorage 代理
├── popup/
│   ├── popup.html         # 管理面板 UI
│   ├── popup.js           # 面板逻辑
│   └── popup.css          # 样式
├── icons/                 # 扩展图标（16/48/128px）
└── assets/                # 商店发布素材
```

## 工作原理

### Cookie 隔离

浏览器所有标签页共享同一个 Cookie Jar。本扩展通过 **Cookie 剩换** 实现隔离：

1. 每个标签页创建时分配唯一 `sessionId`
2. 切换标签时，`background.js` 将当前标签的 Cookie 保存到 `chrome.storage.local`
3. 然后从存储中恢复目标标签的 Cookie 到浏览器
4. 通过全局 Promise 锁避免快速切换时的竞态问题

### LocalStorage 隔离

通过 Manifest V3 的 `world: "MAIN"` 机制注入脚本：

1. `content.js`（ISOLATED world）从 background 获取当前标签的 `sessionId`
2. 通过 `window.postMessage` 将 `sessionId` 传递给 `injected.js`
3. `injected.js`（MAIN world）通过 `Object.defineProperty` 替换 `window.localStorage`
4. 代理对象使用 key 前缀（`__ml_{sessionId}_`）实现数据隔离

## 发布到扩展商店

详见 [assets/store-listing.md](assets/store-listing.md)，包含商店描述、分类和隐私声明。

宣传图和截图素材在 `assets/` 目录下，推荐使用 HTML 版本截图以获得最佳质量。

## 权限说明

| 权限 | 用途 |
|------|------|
| `cookies` | 读写浏览器 Cookie，实现标签页间 Cookie 剩换 |
| `storage` | 使用 `chrome.storage.local` 存储 Session 数据 |
| `tabs` | 监听标签页创建/切换/关闭事件 |
| `activeTab` | 获取当前标签页信息 |
| `<all_urls>` | 在所有网站上注入内容脚本和操作 Cookie |

## License

MIT
