/** Plain text from a downloaded document, by file extension. */
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".csv",
  ".json",
  ".html",
  ".xml",
]);

function extension(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

export function isExtractable(name: string): boolean {
  const ext = extension(name);
  return ext === ".pdf" || ext === ".docx" || TEXT_EXTENSIONS.has(ext);
}

export async function extractText(name: string, data: Buffer): Promise<string> {
  const ext = extension(name);
  if (ext === ".pdf") {
    const parser = new PDFParse({ data });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  if (ext === ".docx")
    return (await mammoth.extractRawText({ buffer: data })).value;
  if (TEXT_EXTENSIONS.has(ext)) return data.toString("utf8");
  throw new Error(
    `Cannot extract text from ${name}: unsupported type ${ext || "(none)"}`,
  );
}
