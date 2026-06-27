import { z } from "zod";

export const sourceKindSchema = z.enum(["原始小说文本", "二手拆书来源"]);
export const targetLibrarySchema = z.enum(["全局素材库", "单书专属素材库"]);
export const deconstructionModeSchema = z.enum(["总览拆书", "长程分段拆书"]);

export const prepareOptionsSchema = z.object({
  sourcePath: z.string().min(1),
  sourceKind: sourceKindSchema.default("原始小说文本"),
  targetLibrary: targetLibrarySchema.default("全局素材库"),
  mode: deconstructionModeSchema.default("长程分段拆书"),
  segmentSize: z.coerce.number().int().positive().default(20),
  project: z.string().optional(),
  title: z.string().optional()
});

export const materialUpdateSchema = z.object({
  targetLibrary: targetLibrarySchema,
  project: z.string().optional(),
  items: z.array(
    z.object({
      title: z.string().min(1),
      summary: z.string().min(1),
      tags: z.array(z.string()).default([]),
      source: z.string().optional(),
      reuseBoundary: z.string().optional()
    })
  )
});

export type PrepareOptions = z.infer<typeof prepareOptionsSchema>;
export type MaterialUpdate = z.infer<typeof materialUpdateSchema>;
