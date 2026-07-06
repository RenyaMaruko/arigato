/**
 * QRコードを画像（PNG）として保存するためのヘルパ。
 * 画面上の QRCodeSVG（SVG要素）を高解像度で canvas に描き直し、
 * 印刷と同じ構成（QR＋中央のハート＋名前＋店名）の1枚画像にしてダウンロードする。
 * 写真アプリへの保存・コンビニ印刷・SNS/LINEでの共有に使える。
 */

// 生成する画像のサイズ（正方形QRの一辺と余白・文字領域。十分な解像度で出力する）
const QR_SIZE = 880;
const PADDING = 100;
const TEXT_AREA = 220;

/**
 * QR（SVG要素）をPNG化してダウンロードする。
 * line1 は名前（例: 「山田 さくら さん」）、line2 は店名。fileName は拡張子なしのファイル名。
 */
export async function downloadQrAsImage(
  svg: SVGSVGElement,
  line1: string,
  line2: string,
  fileName: string,
): Promise<void> {
  // SVG を文字列化して Image に読み込む（Blob URL 経由）
  const svgString = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("QR画像の読み込みに失敗しました"));
      img.src = url;
    });

    // 白背景のキャンバスに QR → 中央ハート → 名前・店名 の順で描く
    const width = QR_SIZE + PADDING * 2;
    const height = QR_SIZE + PADDING * 2 + TEXT_AREA;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas を初期化できませんでした");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, PADDING, PADDING, QR_SIZE, QR_SIZE);

    // 中央のハート（画面と同じ目印。誤り訂正レベル H のため読み取りに影響しない）
    const cx = PADDING + QR_SIZE / 2;
    const cy = PADDING + QR_SIZE / 2;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, 96, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "96px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("❤️", cx, cy + 8);

    // 名前・店名（印刷と同じ最小限の情報）
    ctx.fillStyle = "#1f2024";
    ctx.font = "bold 64px 'Noto Sans JP', sans-serif";
    ctx.fillText(line1, width / 2, QR_SIZE + PADDING + 90);
    ctx.fillStyle = "#6b6f76";
    ctx.font = "44px 'Noto Sans JP', sans-serif";
    ctx.fillText(line2, width / 2, QR_SIZE + PADDING + 170);

    // PNG にしてダウンロード（ファイル名に使えない文字は除去）
    const safeName = fileName.replace(/[\\/:*?"<>|\s]+/g, "-");
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${safeName}.png`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
