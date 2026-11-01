
import { NextResponse } from "next/server";
import mammoth from "mammoth";


const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 150000;
const CHUNK_SIZE = 10000;
const CHUNK_OVERLAP = 500;

function splitIntoChunks(text: string) {
  const chunks: string[] = [];

  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));

    if (end === text.length) break;

    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Please upload a file." },
        { status: 400 }
      );
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File must be between 1 byte and 10 MB." },
        { status: 413 }
      );
    }

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (!["pdf", "docx", "txt"].includes(extension || "")) {
      return NextResponse.json(
        { error: "Only PDF, DOCX and TXT files are supported." },
        { status: 415 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let extractedText = "";

    if (extension === "pdf") {
    const pdfParse = require("pdf-parse/lib/pdf-parse");
    const result = await pdfParse(buffer);
    extractedText = result.text;
  }

  if (extension === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    }

    if (extension === "txt") {
      extractedText = new TextDecoder("utf-8", {
        fatal: true,
      }).decode(buffer);
    }

    extractedText = extractedText
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();

    if (!extractedText) {
      return NextResponse.json(
        { error: "No readable text found in this document." },
        { status: 422 }
      );
    }

    if (extractedText.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: "Document is too large. Maximum extracted text is 150,000 characters." },
        { status: 413 }
      );
    }

    const chunks = splitIntoChunks(extractedText);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileType: extension,
      totalCharacters: extractedText.length,
      totalChunks: chunks.length,
      chunks,
    });
  } catch (error) {
    console.error("Document upload error:", error);

    return NextResponse.json(
      { error: "Could not process this document." },
      { status: 500 }
    );
  }
}


