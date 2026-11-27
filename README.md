# 个人生活管理平台

围绕四件事的个人习惯系统：**身体 · 成长 · 事务 · 种草清单**，全部汇总到同一个「今日页面」。

## 快速开始

```bash
cd 个人管理平台
pip3 install -r requirements.txt   # 系统还需 poppler-utils（PDF 转图片用）
bash start.sh                      # 默认端口 8000，可用 PORT=9000 bash start.sh 修改
```

浏览器打开 `http://127.0.0.1:8000` 即可。

## 功能一览

| 模块 | 能力 |
| --- | --- |
| 今日总览 | 日期/星期/天气（Open-Meteo）、今日体重、统一打卡日历、待办、各模块部件 |
| 身体 | 训练安排（按星期循环）、训练打卡（力量明细：重量/组数/完成度；有氧：时长/距离/心率）、体测记录（体重/体脂/肌肉/水分）、趋势图 |
| 成长 · 英语 | 生词本（艾宾浩斯复习 / 学新词 / 单词默写）、会议精听、知识库、生词记忆库 |
| 事务 | 待办/日程，支持重复规则（每天/每周/每月/自定义星期）、优先级、浏览器桌面提醒 |
| 种草清单 | 拍照/上传图片、名称、价格、链接，按文件夹分类，种草中/已入手状态 |
| 记录事项 | 重要事项/灵感/备忘，分类 + 置顶 |

## 数据（CSV 线上数据库）

所有数据明文存储在 `data/*.csv`（UTF-8），上传的图片在 `data/uploads/`。
设置页支持**一键导出全部数据（ZIP）**与**单表 CSV 导入恢复**，方便备份和迁移。

## 预留扩展接口（新增模块）

后端是**通用表 CRUD**，新增业务模块只需两步，业务接口零改动：

1. **注册数据表**：在 `app.py` 的 `SCHEMAS` 中加一行，如：
   ```python
   "diet_records": ["id", "date", "meal", "kcal", "note", "created_at"],
   ```
   立即获得 `GET/POST/PUT/DELETE /api/table/diet_records` 全套接口。

2. **注册前端模块**：在 `static/js/` 新建 `mod-diet.js`：
   ```javascript
   PM.registerModule({
     id: 'diet', name: '饮食', icon: '🥗', group: '身体',
     nav: [{ label: '饮食记录', path: '' }],
     routes: { '': async (el, q) => { /* 渲染页面 */ } },
     today: [{ order: 50, render: async (box) => { /* 今日页部件 */ } }],
   });
   ```
   并在 `static/index.html` 中 `<script src="/js/mod-diet.js">` 引入。
   侧边栏、移动端导航、路由、今日页部件会**自动出现**。

复用的前端内核能力（`PM.*`）：`api`（数据层）、`modal/drawer/confirm/toast`（弹层）、
`calendar`（打卡日历）、`formData/fillForm`（表单）、`speak`（语音）、`u`（日期工具）。

> ⚠️ 写自定义弹窗编辑器时注意：**先 `resolve(true)` 再 `close()`**。
> 若写成 `close(); resolve(true);`，`close()` 会先触发 `onClose(){ resolve(false) }`，
> Promise 会以 `false` 结束，调用处 `if (await editor()) PM.refresh()` 就不会刷新，
> 表现为「保存成功但页面不更新，需手动刷新」。

> `data/` 目录与 `settings.json` 不在仓库里，首次启动时自动创建空库；
> 邮件日报的 SMTP 授权码保存在本地 `data/settings.json`，不会随代码提交。

## 目录结构

```
个人管理平台/
├── app.py               # FastAPI 后端：通用 CSV CRUD + 天气/词典/PDF/上传/导出/邮件日报
├── start.sh             # 启动脚本
├── requirements.txt
├── DESIGN-SYSTEM.md     # 前端设计规范（颜色/尺寸 token、组件、断点）
├── data/                # CSV 数据库 + 上传图片（运行时生成，不入库）
└── static/
    ├── index.html
    ├── css/app.css      # 样式（暖夜玻璃暗色主题，响应式，含折叠屏断点）
    └── js/
        ├── core.js      # 内核：数据层、模块注册中心、路由、弹层
        ├── boot.js      # 设置模块 + 启动
        ├── reminder.js  # 待办/日程浏览器提醒
        ├── icons.js / holiday.js / listening-seed.js
        ├── mod-today.js     # 今日页 + 打卡日历
        ├── mod-fitness.js   # 身体
        ├── mod-todo.js      # 事务
        ├── mod-wishlist.js  # 种草清单
        ├── mod-notes.js     # 记录事项
        └── mod-english.js   # 成长 · 英语（生词本 / 复习 / 默写 / 会议精听 / 知识库）
```

## 新增模块

### 可直接复用的后端能力

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `vocabulary` | word / phonetic / meaning_cn / example / source / level / next_review / … | 单词本。`api.reviewWord(id, know)` 自动跑艾宾浩斯（1/2/4/7/15/30/60/120 天） |
| `study_logs` | date / kind / title / minutes / count | 学习记录。完成日历的「学习天数」统计直接读这张表，新模块往里写即可自动汇入 |
| `articles` | title / content / source / read | 阅读素材（PDF 导入接口已就绪：`/api/pdf/articles`） |
| `scenes` | session / title / english / chinese / image | 场景卡片（`/api/pdf/scenes`） |

其余内核能力：`api.list/create/update/remove/bulk`、`PM.modal/drawer/confirm/toast`、
`PM.calendar`（打卡日历）、`PM.formData/fillForm`、`u.speak`（TTS 朗读）、`u`（日期工具）。

## 说明

- 天气/查词依赖公网接口（Open-Meteo、dictionaryapi.dev、有道），离线时自动降级为本地可用状态。
- 单词发音使用浏览器自带 TTS（SpeechSynthesis）。
- 桌面提醒需要授权浏览器通知权限（事务页可一键开启）。
