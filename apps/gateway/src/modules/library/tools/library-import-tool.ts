import { z } from 'zod';
import {
  type ToolDefinition,
  type ToolExecutionContext,
  ToolPermissions,
  ToolLocations,
} from '@study-studio/tool-core';
import { ok, isOk, type Result, type BusinessError } from '@study-studio/shared';
import { DrizzleLearnerRepository } from '../../../infrastructure/drizzle-learner-repository.js';
import { readDocumentFileBytes } from '../application/document-import/document-import-service.js';
import type { ImportTask } from '../persistence/import-tasks.js';

export const LibraryImportInputSchema = z.object({
  userId: z.string().min(1).max(64),
  kind: z.enum(['pdf', 'epub', 'text']).optional(),
  /** 本机文档绝对路径（只读，不走 HTTP 拷贝）。 */
  filePath: z.string().min(1).max(1024),
});

export type LibraryImportInput = z.infer<typeof LibraryImportInputSchema>;

export interface LibraryImportOutput {
  task: ImportTask;
  documentId: string;
  title: string;
  lessons: number;
}

/**
 * 文档统一导入 Server Tool（WRITE：落库）。
 * PDF/EPUB/文本同一命令；OCR 是能力层，不在本 Tool 内。
 */
export class LibraryImportTool implements ToolDefinition<LibraryImportInput, LibraryImportOutput> {
  public readonly name = 'library.import_document';
  public readonly description =
    '导入本机文档为教材（PDF/EPUB/文本同一入口，落库并返回任务）。AI 帮用户整理资料时调用。';
  public readonly location = ToolLocations.SERVER;
  public readonly permission = ToolPermissions.WRITE;
  public readonly schema = LibraryImportInputSchema;

  constructor(private readonly learnerRepo: DrizzleLearnerRepository) {}

  public async execute(
    input: LibraryImportInput,
    _context: ToolExecutionContext
  ): Promise<Result<LibraryImportOutput, BusinessError>> {
    void _context;
    const kind = input.kind ?? 'text';
    const bytes = await readDocumentFileBytes(input.filePath, kind);
    if (!isOk(bytes)) return bytes;
    const filename = input.filePath.split(/[\\/]/).pop() ?? '未命名';
    const result = await this.learnerRepo.importDocumentFile({
      userId: input.userId,
      kind,
      filename,
      bytes: bytes.value,
    });
    if (!isOk(result)) return result;
    return ok({
      task: result.value.task,
      documentId: result.value.document.id,
      title: result.value.document.title,
      lessons: result.value.lessons,
    });
  }
}
