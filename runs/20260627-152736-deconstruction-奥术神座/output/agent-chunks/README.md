# 子 Agent 精读输出目录

每个子 Agent 读取 `runs/<run-id>/input/agent-chunks/NNNN.md`，并把同名 JSON 写入本目录，例如 `0001.json`。

如果使用 `--agent-command`，命令会收到两个环境变量：

- `AUTHOR_MENTOR_AGENT_INPUT_DIR`
- `AUTHOR_MENTOR_AGENT_OUTPUT_DIR`
