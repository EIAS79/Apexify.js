import { ApexPainter } from "apexify.js";

const painter = new ApexPainter({ type: "buffer" });
const canvas = await painter.createCanvas({
  width: 320,
  height: 180,
  colorBg: "#0f172a",
});

const png = await painter.createText(
  {
    text: "Apexify.js",
    x: 160,
    y: 90,
    font: { size: 36, family: "Arial" },
    fill: { color: "#ffffff" },
    placement: { textAlign: "center", textBaseline: "middle" },
  },
  canvas
);

if (!Buffer.isBuffer(png)) throw new Error("Expected a Buffer result.");
if (png.subarray(1, 4).toString("ascii") !== "PNG") throw new Error("Expected PNG bytes.");
console.log(`quick-start: ${png.length} PNG bytes`);
