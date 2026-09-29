import { RECEIPT_BUCKET, supabase } from "./supabase";

const MAX_EDGE = 1600;

// スマホの写真は大きいので、長辺1600pxのJPEGにしてから上げる（読めない形式はそのまま）
export async function prepareReceipt(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  const passthrough = () => ({
    blob: file as Blob,
    ext: (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin",
    type: file.type || "application/octet-stream",
  });
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== "function") return passthrough();
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return passthrough();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return passthrough();
    return { blob, ext: "jpg", type: "image/jpeg" };
  } catch {
    return passthrough();
  }
}

// 保存先は「店舗ID/年-月/ランダム名」（全店共通は common/…）。権限の判定がこの先頭で決まる
export function receiptPath(shopId: string | null, date: string, ext: string) {
  return `${shopId ?? "common"}/${date.slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
}

export async function uploadReceipt(shopId: string | null, date: string, file: File) {
  const prepared = await prepareReceipt(file);
  const path = receiptPath(shopId, date, prepared.ext);
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, prepared.blob, {
    contentType: prepared.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function receiptUrl(path: string) {
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeReceipt(path: string | null) {
  if (!path) return;
  await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
}

// 店舗を付け替えたら、写真も新しい店舗のフォルダへ移す（権限が店舗単位のため）
export async function moveReceipt(path: string, shopId: string | null, date: string) {
  const head = path.split("/")[0];
  if (head === (shopId ?? "common")) return path;
  const next = receiptPath(shopId, date, path.split(".").pop() || "jpg");
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).move(path, next);
  if (error) throw error;
  return next;
}
