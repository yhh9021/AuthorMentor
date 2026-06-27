# 拆书任务

运行编号：20260627-135753-deconstruction-光阴之外

请按 `capabilities/deconstruction/SKILL.md` 执行生产型拆书。

## 输入

- 来源类型：原始小说文本
- 输入文件：/Users/bytedance/Desktop/agent_projects/写小说/runs/20260627-135753-deconstruction-光阴之外/input/光阴之外.txt
- 持久拆书目录：/Users/bytedance/Desktop/agent_projects/写小说/global/deconstructions/光阴之外
- 原始正文本地副本：/Users/bytedance/Desktop/agent_projects/写小说/global/deconstructions/光阴之外/source/光阴之外.txt
- 目标素材库：全局素材库
- 单书项目：无
- 拆书模式：长程分段拆书
- 默认分段规模：20 章

## 必须产出

- `output/deconstruction-report.md`
- `output/material-updates.json`
- `output/change-record.md`

如果是长程分段拆书，请先在持久拆书目录中沉淀：

- `book-map/`：章节索引和剧情阶段划分
- `segments/`：分段拆书报告
- `material-cards/`：细粒度素材卡
- `synthesis/`：全书汇总

完成后不要直接提交 Git。由 CLI 的 `deconstruct apply` 命令校验、落库并提交。
