# Obsidian Clipping Anything

把网页和 Bilibili 视频字幕保存到 Obsidian 的 Chrome 扩展。当前稳定组合：Chrome 扩展 **1.0.6**、Obsidian 配套插件 **1.2.7**。这是独立社区项目，并非 Obsidian 官方扩展。

## 已支持的功能

- **网页裁剪**：提取正文，使用模板、标注、阅读模式和元数据，将内容保存为 Markdown 笔记。
- **B 站视频**：读取视频提供的字幕轨，可选择字幕、预览、复制 Markdown、下载 SRT/TXT，并保存带时间戳的笔记。视频必须有可访问的字幕轨。
- **统一入口和设置**：B 站视频页默认打开字幕模式，可切换到网页裁剪；两种弹窗尺寸一致，共用 Obsidian 仓库设置，B 站选项在统一设置页中。
- **笔记内联动**：安装配套 Obsidian 插件后，阅读视图中的视频位于笔记开头。点击字幕时间会跳到该播放器的对应进度，播放时高亮当前字幕。向下滚动后视频离开视野，但继续播放，不会另开浏览器标签页。编辑视图仍显示普通笔记内容；互动字幕在阅读视图中使用。
- **保存方式**：默认通过 Obsidian URI 保存；配置 Local REST API 后可选 REST 直写。AI 侧边栏是可选功能，需要自行配置模型服务。

目前公开的安装包面向 **Chrome / Chromium Manifest V3** 和桌面版 Obsidian。其他浏览器构建及 YouTube、X、小红书专用裁剪尚未作为稳定功能发布。

## 安装

在 [Releases](https://github.com/TJU-ICLearner/obsidian-clipping-anything/releases/latest) 下载两个 ZIP：

1. **Chrome 扩展**：解压 `obsidian-clipping-anything-1.0.6-chrome.zip` 到固定目录。打开 `chrome://extensions/`，开启“开发者模式”，选择“加载已解压的扩展程序”，选中解压后**直接包含 `manifest.json` 的目录**。不要把 ZIP 或 Obsidian 插件目录交给 Chrome 加载。
2. **Obsidian 配套插件**：解压 `obsidian-clipping-anything-player-1.2.7.zip` 到目标仓库的 `.obsidian/plugins/`。最终应存在 `.obsidian/plugins/obsidian-clipper-anything-player/manifest.json`，同目录还有 `main.js` 和 `styles.css`。在 Obsidian 的“设置 → 第三方插件”中启用 **Obsidian Clipping Anything Player**。
3. 重新打开 Obsidian，使用扩展裁剪 B 站视频；在笔记的**阅读视图**中播放顶部视频，点击字幕时间即可跳转。若使用已有笔记，字幕行需包含时间戳。

更新解压版扩展后，在 `chrome://extensions/` 点“重新加载”，并刷新已打开的 B 站页面。更新 Obsidian 插件后，请完全退出并重开 Obsidian。旧插件的 ID 和文件夹名沿用 `obsidian-clipper-anything-player`，升级时覆盖该文件夹即可。

## 使用与排查

- B 站主按钮默认通过 Obsidian URI 写入，可在弹窗选目标仓库；仓库名称可在统一设置页添加。若未列出仓库，会使用当前打开的 Obsidian 仓库。
- “REST 直写”需要在**目标仓库**启用 Local REST API，填入本地地址和 API Key，并测试连接。`Failed to fetch` 通常表示该本地服务不可访问；可改用默认的 Obsidian URI 保存。
- Chrome 扩展和原有两个扩展的设置不共享，需要重新配置。旧扩展可以保留；若同一 B 站页面出现两套按钮，可停用旧的 Bilibili 扩展。
- 笔记视频和字幕联动依赖 B 站嵌入播放器及网络。首次加载请等待播放器准备好再点时间。视频保持在笔记开头的正常布局，字幕高亮约每 0.75 秒更新。

## 从源码构建

普通安装**不需要 Node.js 或 npm**。Release ZIP 已包含运行时文件，包括所需的浏览器 polyfill 和随包提供的 AI 服务商预设；Obsidian 插件的 JS、CSS 和清单也已打包。源码仓库提供 `package-lock.json` 锁定构建依赖版本，不提交与操作系统相关且体积较大的 `node_modules`。

开发者使用 Node.js 运行：

```sh
npm ci
npm run build:chrome
TZ=America/Los_Angeles npm test
```

构建结果在 `dist/`，Chrome 安装包在 `builds/`。运行 `npm ci` 会按锁文件安装固定版本；扩展本身无需连接 GitHub 获取预设。可用 `SHA256SUMS` 校验 Release 附件。

## 来源与许可证

项目整合 [Obsidian Web Clipper 1.7.1](https://github.com/obsidianmd/obsidian-clipper) 与 [Bilibili Obsidian Clipper 1.1.3](https://github.com/haixiong1997/Bilibili-Obsidian-Clipper) 的 MIT 授权代码。根目录 [LICENSE](LICENSE) 和 `src/bilibili/LICENSE` 保留原版权声明；详见 [NOTICE.md](NOTICE.md)。
