import { FOLDER_REGEX } from "../constants";

export const FOLDER_PATTERN = "[A-Za-z0-9 \\-]+";

export const isFolderNameValid = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 && FOLDER_REGEX.test(trimmed);
};

export const isOptionalFolderNameValid = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length === 0 || FOLDER_REGEX.test(trimmed);
};
