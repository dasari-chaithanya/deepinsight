import { NextRequest, NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import PDFDocument from "@/components/PDFDocument";
import type { JobResponse } from "@/lib/types";

// Note: @react-pdf/renderer may require node runtime to render correctly
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as JobResponse;
    if (!data || !data.result) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Render the PDF to a Node stream
    const stream = await renderToStream(<PDFDocument data={data} />);

    // Next.js NextResponse can accept Node Readable streams if wrapped,
    // but the easiest way is to convert it to a Web ReadableStream.
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="DeepInsight_Notes_${data.metadata?.title?.replace(/[^a-zA-Z0-9]/g, "_") || "analysis"}.pdf"`,
      },
    });
  } catch (error) {
    console.error("PDF Generation Error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
