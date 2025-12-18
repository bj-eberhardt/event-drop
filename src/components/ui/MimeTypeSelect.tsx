import { useMemo } from "react";

type MimeGroup = {
  id: string;
  label: string;
  mimeTypes: string[];
};

type MimeTypeSelectProps = {
  value: string[];
  onChange: (mimeTypes: string[]) => void;
  disabled?: boolean;
};

const MIME_GROUPS: MimeGroup[] = [
  { id: "images", label: "Bilder", mimeTypes: ["image/*"] },
  { id: "videos", label: "Videos", mimeTypes: ["video/*"] },
  { id: "images-videos", label: "Bilder & Videos", mimeTypes: ["image/*", "video/*"] },
  { id: "zip", label: "ZIP-Dateien", mimeTypes: ["application/zip"] },
  {
    id: "archives",
    label: "Archive (zip, tar, 7z, rar)",
    mimeTypes: [
      "application/zip",
      "application/x-7z-compressed",
      "application/x-tar",
      "application/gzip",
      "application/x-bzip2",
      "application/x-rar-compressed",
    ],
  },
];

const MIME_TYPE_REGEX = /^[\w.+-]+\/[\w.+*%-]+$/i;

export function MimeTypeSelect({ value, onChange, disabled }: MimeTypeSelectProps) {
  const uniqueValues = useMemo(
    () => Array.from(new Set(value.map((v) => v.trim()).filter(Boolean))),
    [value],
  );

  const toggleGroup = (group: MimeGroup) => {
    const allSelected = group.mimeTypes.every((mime) => uniqueValues.includes(mime));
    if (allSelected) {
      onChange(uniqueValues.filter((mime) => !group.mimeTypes.includes(mime)));
    } else {
      onChange(Array.from(new Set([...uniqueValues, ...group.mimeTypes])));
    }
  };

  const removeTag = (mime: string) => {
    onChange(uniqueValues.filter((item) => item !== mime));
  };

  const handleCustomAdd = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const target = event.currentTarget;
    const raw = target.value.trim();
    if (!raw) return;
    if (!MIME_TYPE_REGEX.test(raw)) {
      target.setCustomValidity("Ungültiger MIME-Type.");
      target.reportValidity();
      return;
    }
    target.setCustomValidity("");
    onChange(Array.from(new Set([...uniqueValues, raw])));
    target.value = "";
  };

  return (
    <div>
      <div className="tag-input" aria-label="Erlaubte MIME-Typen">
        {uniqueValues.map((mime) => (
          <span className="tag-chip" key={mime}>
            {mime}
            <button type="button" onClick={() => removeTag(mime)} disabled={disabled}>
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          placeholder="mime/type hinzufügen (Enter)"
          onKeyDown={handleCustomAdd}
          onInput={(event) => event.currentTarget.setCustomValidity("")}
          disabled={disabled}
        />
      </div>
      <div className="tag-options">
        {MIME_GROUPS.map((group) => {
          const active = group.mimeTypes.every((mime) => uniqueValues.includes(mime));
          return (
            <button
              type="button"
              key={group.id}
              className={`ghost${active ? " active" : ""}`}
              onClick={() => toggleGroup(group)}
              disabled={disabled}
            >
              {group.label}
            </button>
          );
        })}
      </div>
      <p className="helper">Du kannst Gruppen antippen oder eigene MIME-Types mit Enter hinzufügen.</p>
    </div>
  );
}
