# 输出契约

## deconstruction-report.md

面向人类审阅的拆书报告，必须包含：

- 基本信息
- 开局设计
- 核心卖点
- 主角成长线
- 金手指或能力系统
- 冲突升级
- 地图或势力展开
- 章节钩子
- 爽点兑现
- 读者期待管理
- 可复用模式
- 复用风险

## material-updates.json

必须符合以下结构：

```json
{
  "targetLibrary": "全局素材库",
  "items": [
    {
      "title": "模式名称",
      "summary": "可复用模式说明",
      "tags": ["开局", "爽点"],
      "source": "来源说明",
      "reuseBoundary": "复用边界"
    }
  ]
}
```

## change-record.md

记录本次能力调用改动了什么、为什么改、依据是什么。
