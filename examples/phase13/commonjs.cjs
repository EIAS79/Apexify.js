const { ApexPainter } = require("apexify.js");

async function main() {
  const painter = new ApexPainter({ type: "buffer" });
  const { buffer } = await painter.createCanvas({
    width: 96,
    height: 64,
    colorBg: "#111827",
  });

  if (!Buffer.isBuffer(buffer)) throw new Error("Expected CanvasResults.buffer to be a Buffer.");
  if (buffer.subarray(1, 4).toString("ascii") !== "PNG") throw new Error("Expected PNG bytes.");
  console.log(`commonjs: ${buffer.length} PNG bytes`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
