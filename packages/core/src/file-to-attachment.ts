import type { Attachment } from "./types";

/**
 * Convert a browser `File` object to an `Attachment` by reading it as base64.
 *
 * **Browser-only** — uses `FileReader` and does not work in server/Node contexts.
 *
 * @example
 * ```ts
 * const [file] = event.target.files;
 * const att = await fileToAttachment(file);
 * chat.send("Describe this image", { attachments: [att] });
 * ```
 */
export async function fileToAttachment(file: File): Promise<Attachment> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix: "data:<mime>;base64,"
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { mimeType: file.type, data };
}
