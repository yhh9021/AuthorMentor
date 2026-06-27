# AuthorMentor

AuthorMentor 是一个本地优先的长篇网文生产系统。第一版使用 TypeScript CLI、Skill 结构、任务包和 Git 提交工作流，先打通调研、拆书、创作需求补全、设定生成、全书大纲生成、章节细纲生成等生产能力的基础设施。

## 安装

```bash
pnpm install
```

## 拆书任务包

生成拆书任务包：

```bash
pnpm dev -- deconstruct prepare <小说或二手拆书来源文件>
```

生成后会得到：

```text
runs/<run-id>/
  TASK.md
  INPUTS.md
  CONTEXT.md
  OUTPUT_CONTRACT.md
  input/
  output/
```

`input/` 保存本地输入材料，不进入 Git，避免把原始小说正文提交到远程仓库。CLI 还会为每本书创建持久拆书目录：

```text
global/deconstructions/<书名>/
  SOURCE.md
  manifest.json
  source/              # 原始正文副本，本地保留，不进入 Git
  book-map/
  segments/
  material-cards/
  synthesis/
```

把 `runs/<run-id>/TASK.md` 交给 Codex、Claude Code 或其他智能体执行。智能体填完 `output/` 后，应用拆书结果：

```bash
pnpm dev -- deconstruct apply runs/<run-id>
```

`apply` 会校验输出、更新素材库，并提交 Git。
