# 使用 TypeScript CLI 作为第一版运行器

第一版能力运行器使用 TypeScript、Node.js 和 pnpm 实现。TypeScript 的类型系统适合约束能力输入输出协议，本地 CLI 适合先跑通文件工作流，后续如果需要网页工作台，也能复用领域模型和文件处理代码。

**考虑过的方案**

- Python CLI
- TypeScript CLI

**结果**

第一版使用 pnpm 管理依赖，使用 commander 构建 CLI，使用 zod 约束运行数据，使用 Markdown/YAML/JSON 保存生产资产。
