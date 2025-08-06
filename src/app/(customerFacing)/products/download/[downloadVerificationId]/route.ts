import db from "@/db/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  {
    params: { downloadVerificationId },
  }: { params: { downloadVerificationId: string } }
) {
  const data = await db.downloadVerification.findUnique({
    where: { id: downloadVerificationId, expiresAt: { gt: new Date() } },
    select: { product: { select: { filePath: true, name: true } } },
  })

  if (!data) {
    return NextResponse.redirect(new URL("/products/download/expired", req.url))
  }

  const blobUrl = data.product.filePath
  const fileRes = await fetch(blobUrl)

  if (!fileRes.ok) {
    return new NextResponse("File not found on Blob", { status: 404 })
  }

  const extension = blobUrl.split(".").pop() || "bin"
  const fileBuffer = await fileRes.arrayBuffer()

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Disposition": `attachment; filename="${data.product.name}.${extension}"`,
      "Content-Type": fileRes.headers.get("content-type") ?? "application/octet-stream",
      "Content-Length": fileBuffer.byteLength.toString(),
    },
  })
}
