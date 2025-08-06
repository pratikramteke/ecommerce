"use server"

import db from "@/db/db"
import { put, del } from "@vercel/blob"
import { z } from "zod"
import { notFound, redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

// Zod file validators
const fileSchema = z.instanceof(File, { message: "Required" })
const imageSchema = fileSchema.refine(
  file => file.size === 0 || file.type.startsWith("image/")
)

const addSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  priceInCents: z.coerce.number().int().min(1),
  file: fileSchema.refine(file => file.size > 0, "Required"),
  image: imageSchema.refine(file => file.size > 0, "Required"),
})

export async function addProduct(prevState: unknown, formData: FormData) {
  const result = addSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!result.success) {
    return result.error.formErrors.fieldErrors
  }

  const data = result.data

  // Upload to Vercel Blob
  const fileBlob = await put(
    `products/files/${crypto.randomUUID()}-${data.file.name}`,
    data.file,
    { access: "public" }
  )

  const imageBlob = await put(
    `products/images/${crypto.randomUUID()}-${data.image.name}`,
    data.image,
    { access: "public" }
  )

  // Save to DB
  await db.product.create({
    data: {
      isAvailableForPurchase: false,
      name: data.name,
      description: data.description,
      priceInCents: data.priceInCents,
      filePath: fileBlob.url,
      imagePath: imageBlob.url,
    },
  })

  revalidatePath("/")
  revalidatePath("/products")
  redirect("/admin/products")
}

const editSchema = addSchema.extend({
  file: fileSchema.optional(),
  image: imageSchema.optional(),
})

export async function updateProduct(
  id: string,
  prevState: unknown,
  formData: FormData
) {
  const result = editSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!result.success) {
    return result.error.formErrors.fieldErrors
  }

  const data = result.data
  const product = await db.product.findUnique({ where: { id } })
  if (!product) return notFound()

  let filePath = product.filePath
  if (data.file && data.file.size > 0) {
    const fileBlob = await put(
      `products/files/${crypto.randomUUID()}-${data.file.name}`,
      data.file,
      { access: "public" }
    )
    filePath = fileBlob.url
  }

  let imagePath = product.imagePath
  if (data.image && data.image.size > 0) {
    const imageBlob = await put(
      `products/images/${crypto.randomUUID()}-${data.image.name}`,
      data.image,
      { access: "public" }
    )
    imagePath = imageBlob.url
  }

  await db.product.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      priceInCents: data.priceInCents,
      filePath,
      imagePath,
    },
  })

  revalidatePath("/")
  revalidatePath("/products")
  redirect("/admin/products")
}

export async function toggleProductAvailability(
  id: string,
  isAvailableForPurchase: boolean
) {
  await db.product.update({
    where: { id },
    data: { isAvailableForPurchase },
  })

  revalidatePath("/")
  revalidatePath("/products")
}

export async function deleteProduct(id: string) {
  const product = await db.product.delete({ where: { id } })
  if (!product) return notFound()

  try {
    await del(new URL(product.filePath).pathname)
  } catch {}

  try {
    await del(new URL(product.imagePath).pathname)
  } catch {}

  revalidatePath("/")
  revalidatePath("/products")
}
