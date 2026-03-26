# HiMax 项目记忆

## 项目概况
- **应用名称：HiMax**（2026-03-26 正式命名，原代号 Downie Clone）
- 类似 macOS Downie 的跨平台视频下载器（开源）
- 技术栈：Electron + React + TypeScript + yt-dlp + FFmpeg
- 平台：Windows + macOS
- UI 语言：中英双语（i18n）
- 主题：暗色 + 亮色手动切换（非跟随系统）

## 关键文档
- 技术架构方案：artifact `downie-clone-architecture.md`
- 产品需求文档：`docs/PRD.md`

## 技术栈（已确定并投入使用）
- Electron 41 + React 19 + TypeScript 6 + Vite 8
- Tailwind CSS 4 + Zustand 5 + Recharts 3
- Lucide React 图标 + i18next 国际化
- 目录结构：src/components/ src/pages/ src/store/ src/mock/ src/i18n/ src/types/ electron/

## 开发状态
- UI 纯前端版本已完成（2026-03-25），全部使用 Mock 数据
- Windows exe 打包已配置（electron-builder + NSIS + Portable），产物在 `release/`（NSIS）和 `release-portable/`（免安装）
- TitleBar 窗口控制按钮已通过 preload.cjs + IPC 实现
- 打包命令：`npm run dist:win`（NSIS 安装版）、`npm run dist:portable`（免安装单文件版）、`npm run dist:win:all`（两种都打）
- **Phase 1 MVP 后端已实现**：
  - `electron/services/binary-manager.cjs` — yt-dlp/FFmpeg 自动下载管理
  - `electron/services/ytdlp-engine.cjs` — URL 解析 + 下载引擎 + 进度追踪
  - `electron/services/download-manager.cjs` — 任务队列 + 并发控制 + JSON 持久化
  - `electron/ipc-handlers.cjs` — 完整 IPC 通信
  - 前端 store 支持双模式（Electron=真实IPC / 浏览器=Mock数据）
- 下一步：测试真实下载流程、设置应用图标、~~系统托盘~~

## 设置系统（2026-03-26）
- **数据存储位置**：所有应用数据存在**安装目录**内的 `appdata/` 子目录（通过 `electron/services/app-paths.cjs` 统一管理），卸载即清理干净
  - `appdata/data/settings.json` — 应用设置
  - `appdata/data/tasks.json` — 下载任务
  - `appdata/bin/` — yt-dlp、ffmpeg、ffprobe
  - `appdata/cookies.txt` — Netscape cookie 文件
  - `appdata/debug/` — 调试 JSON
- 开发模式路径根：`app.getAppPath()`；打包后：`path.dirname(process.resourcesPath)`
- **设置持久化**：通过 `_saveSettings()`/`_loadSettings()` 实现
- IPC: `settings:load`（加载）、`settings:update`（更新+保存）、`settings:set-login-item`（开机自启）、`settings:get-login-item`
- 前端 `loadSettings()` 在 store 初始化时加载持久化设置，同步 theme/language
- **通用页签全功能**：语言、主题、开机自启（`app.setLoginItemSettings`）、最小化到托盘、关闭行为、自动更新
- **下载页签全功能**：
  - 默认目录（`defaultDir`）：浏览按钮连接 `selectFolder` API
  - 默认质量/格式/字幕：保存到 settings 并自动应用到新下载任务（VideoPreviewModal 初始化时）
  - **文件名模板**（`filenameTemplate`）：支持变量 `{title}` `{author}` `{date}` `{resolution}` `{id}`，在 `_buildFilename()` 中替换 + 文件名消毒
  - **文件冲突处理**（`fileConflict`）：rename=自动重命名 `(1)(2)...` / overwrite=`--force-overwrites` / skip=跳过
  - **最大并发数**（`maxConcurrent`）：滑块控制 1-10，实时同步到 `downloadManager.maxConcurrent`
  - **速度限制**（`speedLimit`）：传递给 yt-dlp `--limit-rate`
  - **字幕格式**（`subtitleFormat`）：传递给 yt-dlp `--sub-format`
  - **下载完成后操作**（`afterComplete`）：`notify`=系统通知（`Electron.Notification`）/ `none`=无操作
- **系统托盘**：`electron/main.cjs` 中实现 Tray（图标 `electron/tray-icon.png`，fallback 空图标）
  - 右键菜单：Show Window / Quit
  - 双击托盘图标恢复窗口
  - 关闭行为拦截：closeAction=minimize 时隐藏到托盘（需 minimizeToTray=true）或最小化窗口
- settings 新增字段：`launchAtStartup`, `minimizeToTray`, `closeAction`, `autoUpdate`, `afterComplete`, `theme`
- theme 双存储：顶层 `theme` + `settings.theme` 保持同步
- 语言持久化：切换时保存到 settings，loadSettings 时调用 `i18n.changeLanguage()`

## Cookie 支持（2026-03-25）
- yt-dlp 引擎支持三种 cookie 模式：none / browser / file
- **DPAPI 问题**：Windows 上 Electron 进程干扰 DPAPI，`--cookies-from-browser` 直接用会报错
- **解决方案（v2）**：
  - `exportCookies()` 使用**干净环境变量**（移除所有 Electron/Chrome/Node 前缀变量）运行 yt-dlp
  - 导出前**自动检测浏览器是否运行**（tasklist），运行中则阻止并提示关闭
  - 导出结果细分：成功 / 浏览器运行中 / DPAPI 失败 / Cookie 为空 / 其他错误
  - DPAPI 失败时提供 3 步解决方案（关浏览器 / 换 Firefox / 手动导入）
  - **手动导入 cookies.txt**：新增 `importCookieFile()` 作为终极 fallback
  - IPC: `cookie:export`, `cookie:import`, `cookie:status`, `cookie:delete`
  - Firefox 推荐排在浏览器列表第一位（不受 DPAPI 影响）
- `parseUrl()` 和 `startDownload()` 都会自动优先使用已导出的 cookie 文件
- store settings 字段：cookieMode, cookieBrowser, cookieProfile, cookieFile

## 已知问题（已解决）
- ~~filepath 中文乱码~~：Windows GBK (CP936) 导致 yt-dlp stdout 中文变乱码 → 多层修复：
  1. `PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1` 环境变量（第一道防线）
  2. `_decodeOutput(buffer)` 方法：UTF-8 解码失败（检测到 `\uFFFD`）时自动回退 GBK（第二道防线）
  3. `_runParse`/`parsePlaylist` 使用 Buffer 聚合后统一解码（避免跨 chunk 乱码）
  4. download-manager complete 事件中检查 filepath 是否真实存在，不存在就 `_findOutputFile` 修复
  5. ipc-handlers `shell:open-path`/`shell:show-in-folder` 中文件不存在时智能查找
- ~~暂停不停止下载~~：Windows 上 `process.kill('SIGTERM')` 不杀子进程树 → 改用 `taskkill /T /F /PID` 杀整个进程树
- ~~播放/打开文件夹无效~~：filepath 为 null → 正则匹配 Merger/MoveFiles 输出 + _findOutputFile 兜底
- ~~播放/打开文件夹无效~~：filepath 为 null → 正则匹配 Merger/MoveFiles 输出 + _findOutputFile 兜底
- ~~删除不删文件~~：新增 ConfirmDialog 确认弹窗，支持选择是否同时删除文件
- ~~YouTube n-parameter challenge 失败~~：yt-dlp 默认只启用 deno 作为 JS runtime，需 `--js-runtimes node` 启用 Node.js → 新增 `_buildCommonArgs()` 统一注入

## yt-dlp JS Runtime 要求
- YouTube 反爬需要外部 JS 运行时解密 n-parameter（2025 年末起强制）
- yt-dlp exe 版本自带 `yt_dlp_ejs-0.8.0` 组件，但**默认只启用 deno**
- 解决方案：所有 yt-dlp 调用统一加 `--js-runtimes node`（通过 `_buildCommonArgs()`）
- 需要系统 PATH 中有 Node.js v20+（项目已依赖 Node.js 所以一般不是问题）

## 已知问题（未解决）
- YouTube 反爬严格，很多视频需要 cookie 才能解析（"Sign in to confirm you're not a bot"）
- B 站 HTTP 412 需要 cookie
- Windows DPAPI 解密在 Electron 中不可靠，必须用 cookie 文件模式
- ~~**抖音 httpOnly cookie**~~：**已解决** — 实现了自定义 DouyinExtractor（`electron/services/douyin-extractor.cjs`），完全不需要 cookie，通过 iesdouyin.com 移动端页面解析 `_ROUTER_DATA` 获取无水印视频 URL。yt-dlp 对抖音的 extractor 有已知 bug（GitHub #9667），自定义提取器作为自动 fallback。

## 用户偏好
- 功能要全面，不砍需求
- 不做浏览器扩展（至少 MVP 不做）
- 重视 UI 质量（开源项目需要好看的 UI）
- **后续开发不打包exe，直接网页端调试**（`npm run dev` / vite dev server）

*更新于 2026-03-26*
