import { Request, RequestHandler } from "express";
import type * as core from "express-serve-static-core";
import { z, ZodTypeAny } from "zod";
import { FOLDER_REGEX } from "../../config.js";
import { buildValidationError, createEventSchema } from "../../utils/validation.js";
import { ErrorKey, ErrorResponse } from "../../types.js";

type SchemaMap = { body?: ZodTypeAny; params?: ZodTypeAny; query?: ZodTypeAny };

type InferSchema<S extends SchemaMap> = {
  body: S["body"] extends ZodTypeAny ? z.infer<S["body"]> : unknown;
  params: S["params"] extends ZodTypeAny ? z.infer<S["params"]> : core.ParamsDictionary;
  query: S["query"] extends ZodTypeAny ? z.infer<S["query"]> : core.Query;
};

export type ValidatedReq<S extends SchemaMap> = Request<
  InferSchema<S>["params"],
  ErrorResponse,
  InferSchema<S>["body"],
  InferSchema<S>["query"]
>;

type ErrorKeyOption = ErrorKey | Partial<Record<keyof SchemaMap, ErrorKey>>;

export const validateRequest = <S extends SchemaMap>(
  schemas: S,
  opts?: { errorKey?: ErrorKeyOption }
): RequestHandler<
  InferSchema<S>["params"],
  ErrorResponse,
  InferSchema<S>["body"],
  InferSchema<S>["query"]
> => {
  return (req, res, next) => {
    const parts: Array<keyof SchemaMap> = ["body", "params", "query"];
    for (const part of parts) {
      const schema = schemas[part];
      if (!schema) continue;
      const currentValue = part === "body" ? req.body : part === "params" ? req.params : req.query;
      const parsed = schema.safeParse(currentValue ?? {});
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const errorKey =
          typeof opts?.errorKey === "string"
            ? opts.errorKey
            : opts?.errorKey?.[part] || "INVALID_INPUT";
        const formattedIssue = buildValidationError(issue, errorKey);
        return res.status(400).json(formattedIssue);
      }
      if (part === "body") {
        req.body = parsed.data as InferSchema<S>["body"];
      } else if (part === "params") {
        req.params = parsed.data as InferSchema<S>["params"];
      } else if (part === "query") {
        req.query = parsed.data as InferSchema<S>["query"];
      }
    }
    next();
  };
};

export const eventIdSchema = z.object({ eventId: createEventSchema.shape.eventId });
export const eventFileParamsSchema = eventIdSchema.extend({
  filename: z.string(),
});
export const eventFileInFolderParamsSchema = eventFileParamsSchema.extend({
  folder: z.string().trim(),
});
export const uploadFilesBodySchema = z.object({
  from: z.string().trim().regex(FOLDER_REGEX, { message: "Invalid folder name." }).optional(),
});
export type UploadFilesBody = z.infer<typeof uploadFilesBodySchema>;
