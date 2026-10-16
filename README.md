# Obsidian Clipping Anything

**保存你想要的一切。** 将网页与视频中的内容整理为自己可保存、可检索、可继续阅读的 Obsidian 笔记。

这个项目始于把 [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) 的网页剪藏能力和 [Bilibili Obsidian Clipper](https://github.com/haixiong1997/Bilibili-Obsidian-Clipper) 的视频字幕能力放进同一个扩展。长期目标是用一致的入口剪藏不同平台的文章、帖子、视频与字幕，并让保存后的媒体笔记在 Obsidian 中保持可阅读、可播放、可定位到具体片段。

当前稳定组合是 **Chrome 扩展 1.0.6 + Obsidian 配套插件 1.2.7**。项目是独立社区整合版本，并非 Obsidian 官方扩展。

## 平台支持状态

| 内容来源 | 当前状态 | 说明 |
| --- | --- | --- |
| 普通网页 | 已支持 | 使用通用网页剪藏：正文提取、模板、属性、标注和阅读模式。具体提取效果取决于网页结构。 |
| 微信公众号网页 | 通用网页模式 | 可按网页剪藏；目前没有单独的微信解析器或针对所有文章格式的兼容承诺。 |
| Bilibili 视频 | 专用模式已支持 | 视频信息、可访问的字幕轨、章节和带时间戳的笔记；配套插件实现笔记内视频与字幕联动。 |
| YouTube | 规划中 | 现可尝试通用网页剪藏；专用字幕、章节与笔记内播放联动尚未发布。 |
| X / Twitter | 规划中 | 现可尝试通用网页剪藏；帖子串、引用及媒体的专用整理尚未发布。 |
| 小红书 | 规划中 | 现可尝试通用网页剪藏；图文与视频的专用适配尚未发布。 |

“Anything”表达的是产品方向，并不代表当前版本已完整支持每个网站或文件格式。公开安装包目前面向 **Chrome / Chromium Manifest V3** 与**桌面版 Obsidian**。

## 当前已经实现

### 1. 网页剪藏

- 提取网页正文、标题与元数据，预览并编辑将要写入的 Markdown 内容。
- 使用模板决定笔记名称、目标仓库、目录、正文和属性；可按网址或页面结构自动选择模板。
- 在网页上标注内容，并把标注纳入剪藏结果；提供阅读模式、复制 Markdown 与下载等操作。
- 可选的 Interpreter 使用用户自行配置的模型服务处理模板中的自然语言变量。AI 服务商预设已随扩展打包，模型调用仍需要相应服务或本地模型。
- 普通网页和微信文章都从“网页剪藏”入口处理。网页本身的登录状态、动态加载方式会影响可提取内容。

### 2. B 站视频剪藏

- 在 B 站视频页点击扩展图标，默认进入“B 站视频”；可切换到“网页剪藏”，并能从网页模式返回。
- 读取视频标题、链接、作者等信息，选择可用的字幕轨，预览字幕；支持复制 Markdown、下载 SRT/TXT、刷新内容及在浏览器打开字幕阅读视图。阅读视图中滚动字幕时，视频保持同一播放会话。视频须有可访问的字幕轨。
- 笔记可包含视频简介、章节、字幕和可选的前 20 条热门评论；字幕时间戳可按设置保留。
- 可配置目录变量、默认标签、Frontmatter 字段、自定义属性，以及插入到简介、章节或字幕前的正文段落。
- B 站 AI 助手可结合视频上下文、字幕与可用评论进行对话；可配置模型平台、系统提示词、快捷问题和播放器中的 AI 快捷按钮。该功能需要自行配置模型服务。

### 3. 一个入口，统一保存设置

- 两种剪藏模式使用一致的 420 × 600 弹窗尺寸与统一的设置页面；B 站专用设置位于其中的“B 站视频”分区。界面共用“Clipping Anything · 保存你想要的一切”的标识。
- B 站弹窗可添加和选择 Obsidian 仓库，仓库列表与网页剪藏共用。
- B 站“保存到 Obsidian”主按钮使用 **Obsidian URI**，无需 Local REST API；配置 Local REST API 后可选择“REST 直写”。扩展发出 URI 后，应到目标仓库确认笔记是否实际创建。
- 新扩展与原有两个扩展的 Chrome 存储互不共享，首次使用需要重新配置仓库和偏好。

### 4. Obsidian 笔记内的视频与字幕

安装本仓库的 **Obsidian Clipping Anything Player** 后，在 B 站剪藏笔记的**阅读视图**中：

- 视频位于笔记开头；点击字幕时间，跳转的是**笔记内已打开播放器**的进度，不会为该时间戳新开浏览器标签页。
- 视频播放进度会高亮对应字幕；旧笔记中原有的链接时间戳也会在阅读视图中转为笔记内时间按钮。
- 向下阅读时，视频随正文离开视野但继续播放；返回视频位置时保持同一播放会话，不会因为滚动而重新从头开始。
- 视频保持在笔记正常布局中，不悬浮覆盖字幕。浏览器里的 B 站页面与笔记内播放器是独立会话；阅读已保存笔记时**无需保持 Chrome 视频页打开**。

互动字幕只在阅读视图出现；编辑视图仍保留普通 Markdown。视频与字幕联动依赖 B 站嵌入播放器可正常加载，首次载入时请等待播放器准备好。

## 安装

在 [Releases](https://github.com/TJU-ICLearner/obsidian-clipping-anything/releases/latest) 下载两个 ZIP：

1. **Chrome 扩展**：解压 `obsidian-clipping-anything-1.0.6-chrome.zip` 到固定目录。打开 `chrome://extensions/`，开启“开发者模式”，选择“加载已解压的扩展程序”，选中解压后**直接包含 `manifest.json` 的目录**。
2. **Obsidian 配套插件**：解压 `obsidian-clipping-anything-player-1.2.7.zip` 到目标仓库的 `.obsidian/plugins/`。最终应存在 `.obsidian/plugins/obsidian-clipper-anything-player/manifest.json`，同目录还有 `main.js` 和 `styles.css`。在 Obsidian 的“设置 → 第三方插件”中启用 **Obsidian Clipping Anything Player**。
3. 完全重启 Obsidian，使用扩展剪藏 B 站视频；在保存笔记的阅读视图中播放顶部视频，点击字幕时间即可跳转。

更新解压版扩展后，在 `chrome://extensions/` 点“重新加载”，并刷新已打开的 B 站页面。更新 Obsidian 插件后，请完全退出并重开 Obsidian。插件 ID 和文件夹名沿用 `obsidian-clipper-anything-player`，升级时覆盖原文件夹即可。**Chrome 安装包和 Obsidian 插件包不可互换加载。**

## 使用与排查

- B 站主按钮默认通过 Obsidian URI 写入，可在弹窗选目标仓库；未指定时使用当前打开的 Obsidian 仓库。目标目录可在“B 站视频”设置中填写。
- “REST 直写”需要在**目标仓库**启用 Local REST API，填入本地地址和 API Key，并测试连接。`Failed to fetch` 通常表示该服务不可访问；可改用默认的 Obsidian URI 保存。
- 若同一 B 站页面出现两套字幕按钮，可停用旧的 Bilibili 扩展。新扩展不会自动迁移旧扩展的设置。
- 若笔记内没有互动字幕，确认已启用配套插件、笔记包含带时间戳的字幕，并切换到阅读视图。若播放器提示未准备好，等待视频加载后再试。
- 字幕高亮约每 0.75 秒更新。B 站视频无法播放、字幕轨不可用或网站结构变动时，相关能力也会受影响。

## 接下来的方向

1. **巩固现有链路**：持续回归普通网页、微信网页和 B 站视频的保存结果；改善失败提示、同名笔记处理以及升级体验。
2. **建立跨平台内容模型**：把文章、帖子、视频、图片、作者、来源、章节和时间轴整理成可复用的笔记结构，让平台适配与 Obsidian 阅读体验逐步统一。
3. **逐个平台增加专用适配**：优先研究 YouTube 字幕与章节；随后处理 X / Twitter 帖子串与媒体、小红书图文与视频。每个平台都需单独验证登录、内容获取和保存后的阅读体验。
4. **扩展媒体笔记联动**：在平台允许且技术可行的前提下，把 B 站已验证的“笔记内播放、时间戳跳转、进度高亮”交互推广到其他视频来源。

以上是开发计划，不是当前版本的功能承诺；是否加入某个平台，以可验证的实现和安装包发布为准。

## 从源码构建与验证

普通安装**不需要 Node.js 或 npm**。Release ZIP 已包含运行时文件，包括浏览器 polyfill 和随包提供的 AI 服务商预设；Obsidian 插件的 JS、CSS 和清单也已打包。仓库用 `package-lock.json` 锁定构建依赖版本，不提交与操作系统相关且体积较大的 `node_modules`。

开发者使用 Node.js 24：

```sh
npm ci
npm run build:chrome
TZ=America/Los_Angeles npm test
```

构建结果在 `dist/`，Chrome 安装包在 `builds/`。可用 Release 附件中的 `SHA256SUMS` 校验两个 ZIP。仓库还运行 GitHub Actions，检查测试和 Chrome 构建。

## 来源与许可证

本项目整合了 [Obsidian Web Clipper 1.7.1](https://github.com/obsidianmd/obsidian-clipper) 与 [Bilibili Obsidian Clipper 1.1.3](https://github.com/haixiong1997/Bilibili-Obsidian-Clipper) 的 MIT 授权代码。根目录 [LICENSE](LICENSE) 和 `src/bilibili/LICENSE` 保留原版权声明；详见 [NOTICE.md](NOTICE.md)。
