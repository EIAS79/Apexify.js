import { createCanvas, loadImage } from '@napi-rs/canvas';
import { barChart_1, bgConfig, DataItem, KeyBoxConfig, PieDataConfig, PieChartData, LineChartConfig } from "../types";
import path from 'path';

// Line chart DataPoint interface (different from bar chart DataPoint)
interface LineDataPoint {
  label: string;
  y: number;
}


////////////////////////////////////////BAR CHARTS////////////////////////////////////////

export async function verticalBarChart(data: barChart_1) {
    try {
        const { chartData, xLabels, yLabels, data: { xAxis, yAxis, keys, xTitle, yTitle, labelStyle } } = data;

        if (!xLabels || !yLabels || !xAxis || !yAxis) {
            throw new Error('Required data is missing.');
        }

        xAxis.forEach(bar => {
            if (bar.position.startsXLabel < Math.min(...xLabels) || bar.position.endsXLabel > Math.max(...xLabels)) {
                throw new Error(`X-axis value range for bar '${bar.label}' is invalid.`);
            }
            if (bar.value < Math.min(...yAxis) || bar.value > Math.max(...yAxis)) {
                throw new Error(`Y-axis value for bar '${bar.label}' is out of range.`);
            }
        });

        const canvasWidth = chartData?.width || 800;
        const canvasHeight = chartData?.height || 600;
        let img: any;

        if ((chartData?.widthPerc || 0.8) > 1 || (chartData?.widthPerc || 0.8) < 0) throw new Error(`widthPerc: Cannor be bigger than 1 or smaller than 0`)
        if ((chartData?.heightPerc || 0.8) > 1 || (chartData?.heightPerc || 0.8) < 0) throw new Error(`widthPerc: Cannor be bigger than 1 or smaller than 0`)
        const chartWidth = canvasWidth * (chartData?.widthPerc || 0.8); 
        const chartHeight = canvasHeight * (chartData?.heightPerc || 0.8); 

        if (chartData?.bg?.image) {
            try {
                let img;
                if (chartData.bg.image.startsWith('http')) {
                    const response = await fetch(chartData.bg.image);
                    if (!response.ok) {
                        throw new Error("Failed to fetch image.");
                    }
                    const buffer = await response.arrayBuffer();
                    img = await loadImage(Buffer.from(buffer));
                } else {
                    const imagePath = path.join(process.cwd(), chartData.bg.image);
                    img = await loadImage(imagePath);
                }
            } catch (error) {
                console.error('Error loading image:', error);
            }
        }
        
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d') as SKRSContext2D;
        if (!ctx) throw new Error("Unable to get 2D context");

        if (chartData?.bg?.image) { 
            ctx.drawImage(img, 0, 0, 800, 600);
        } else {
            ctx.fillStyle = chartData?.bg?.bgColor || 'white';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        }

    
        ctx.fillStyle = `${chartData?.title?.color || 'black'}`;
        ctx.font = `bold ${chartData?.title?.size || 12}px Arial`;
        ctx.fillText(chartData?.title?.title || 'Sample Chart', (canvasWidth - ctx.measureText(chartData?.title?.title || 'Sample Chart').width) / 2, 30);

        if (keys && Object.keys(keys).length > 0) {
            const keysTopMargin = 70;
            const keysLeftMargin = chartWidth + 60; 
            const keyWidth = 20; 
            const keyHeight = 20; 
            const keySpacing = 10;

            let keyIndex = 0;
            for (const color in keys) {
                const keyX = keysLeftMargin;
                const keyY = keysTopMargin + keyIndex * (keyHeight + keySpacing);
                const keyColor = color || 'blue';
                const keyLabel = keys[color].length > 15 ? keys[color].substring(0, 15) + '...' : keys[color]; 

                ctx.fillStyle = keyColor;
                ctx.fillRect(keyX, keyY, keyWidth, keyHeight);

                ctx.fillStyle = `${keyColor || 'black'}`;
                ctx.font = '12px Arial';
                ctx.fillText(keyLabel, keyX + keyWidth + 5, keyY + keyHeight - 3);

                keyIndex++;
            }
        }

        const chartTopMargin = 50;
        const chartLeftMargin = 50;

        ctx.strokeStyle = chartData?.grid?.color || 'gray';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chartLeftMargin, chartTopMargin);
        ctx.lineTo(chartLeftMargin, chartTopMargin + chartHeight);
        ctx.lineTo(chartLeftMargin + chartWidth, chartTopMargin + chartHeight);
        ctx.stroke();

        if (chartData?.grid?.enable) {
            drawGridLines(ctx, chartLeftMargin, chartTopMargin, chartWidth, chartHeight, xLabels, yLabels, chartData.grid);
        }

        ctx.fillStyle = `${chartData?.labels?.color || 'black'}`;
        ctx.font = `bold ${chartData?.labels?.fontSize || 16}px Arial`;
        xLabels.forEach((label, index) => {
            const x = chartLeftMargin + index * (chartWidth / (xLabels.length - 1));
            const y = chartTopMargin + chartHeight + 20;
            ctx.fillText(String(label), x - ctx.measureText(String(label)).width / 2, y);
        });

        ctx.textAlign = 'right';
        yLabels.forEach((label, index) => {
            const x = chartLeftMargin - 5; 
            const y = chartTopMargin + chartHeight - index * (chartHeight / (yLabels.length - 1));
            ctx.fillText(String(label), x, y + 5);
        });
        

        ctx.fillStyle = `${chartData?.axis?.color|| 'black'}`;
        ctx.font = `bold ${chartData?.axis?.size || 12}px Arial`;
        ctx.fillText(xTitle || 'X Axis', 30 + canvasWidth / 2, canvasHeight - 15);

        ctx.save();
        ctx.translate(10, canvasHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(yTitle || 'Y Axis', 0, 10);
        ctx.restore();

        xAxis.forEach((bar, index) => {
            const startX = chartLeftMargin + ((bar.position?.startsXLabel - Math.min(...xLabels)) / (Math.max(...xLabels) - Math.min(...xLabels))) * chartWidth;
            const endX = chartLeftMargin + ((bar.position?.endsXLabel - Math.min(...xLabels)) / (Math.max(...xLabels) - Math.min(...xLabels))) * chartWidth;
            const barWidth = endX - startX;
            const barHeight = (bar.value / Math.max(...yAxis)) * chartHeight;
            const y = chartTopMargin + chartHeight - barHeight;

            ctx.fillStyle = bar.barColor || 'blue';
            ctx.fillRect(startX, y, barWidth, barHeight);
            ctx.strokeStyle = bar?.stroke?.color || 'black';
            ctx.lineWidth = bar?.stroke?.width || 1;
            ctx.strokeRect(startX, y, barWidth, barHeight);

            ctx.fillStyle = `${labelStyle?.color || 'black'}`;
            ctx.textAlign = 'center';
            ctx.font = `bold ${labelStyle?.size || 16}px Arial`;
            const labelX = startX + barWidth / 2;
            const labelY = y - 5; 
            ctx.fillText(bar.label, labelX, labelY);
        });

        const buffer = canvas.toBuffer('image/png');
       return buffer
    } catch (error) {
        console.error('An error occurred while drawing the bar chart:', error);
    }
}

import { SKRSContext2D } from '@napi-rs/canvas';

function drawGridLines(ctx: SKRSContext2D, leftMargin: number, topMargin: number, width: number, height: number, xLabels: number[], yLabels: number[], grid: { color?: string; width?: number }) {
    ctx.strokeStyle = grid.color || 'gray';
    ctx.lineWidth = grid.width  || 2;
    
    xLabels.forEach((label: any, index: any) => {
        const x = leftMargin + index * (width / (xLabels.length - 1));
        ctx.beginPath();
        ctx.moveTo(x, topMargin);
        ctx.lineTo(x, topMargin + height);
        ctx.stroke();
    });
    
    yLabels.forEach((label: any, index: any) => {
        const y = topMargin + index * (height / (yLabels.length - 1));
        ctx.beginPath();
        ctx.moveTo(leftMargin, y);
        ctx.lineTo(leftMargin + width, y);
        ctx.stroke();
    });
}


////////////////////////////////////////PIE CHARTS////////////////////////////////////////


function drawPieChart(ctx: SKRSContext2D, data: DataItem[], canvasConfig: bgConfig, pieDataConfig: PieDataConfig): void {
    const width = canvasConfig?.width ?? 1200;
    const height = canvasConfig?.height ?? 400;
    const centerX = width / 2 + (pieDataConfig?.x || 0);
    const centerY = height / 2 + (pieDataConfig?.y || 0);
    const radius = pieDataConfig?.radius || Math.min(width, height) * 0.35;
    let startAngle = 0;
    const totalValue = data.reduce((acc, { value }) => acc + value, 0);

    for (const { label, color, value } of data) {
    const sliceAngle = (value / totalValue) * (Math.PI * 2);
    const midAngle = startAngle + sliceAngle / 2;
    const labelDistance = pieDataConfig?.boxes?.labelDistance || 50;
    const labelX = centerX + Math.cos(midAngle) * (radius + labelDistance);
    const labelY = centerY + Math.sin(midAngle) * (radius + labelDistance);

    ctx.strokeStyle = pieDataConfig?.boxes?.strokeColor  || 'black';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(labelX, labelY);
    ctx.stroke();

    const boxWidth = pieDataConfig?.boxes?.width || 100;
    const boxHeight = pieDataConfig?.boxes?.height || 40;
    const boxX = labelX - boxWidth / 2;
    const boxY = labelY - boxHeight / 2;
    ctx.fillStyle = pieDataConfig?.boxes?.boxColor || 'black';
    ctx.beginPath();
    ctx.rect(boxX, boxY, boxWidth, boxHeight);
    ctx.fill();
    ctx.stroke();

    // Draw the label text
    ctx.fillStyle = pieDataConfig?.boxes?.labelColor || 'black';
    ctx.font = `bold ${pieDataConfig?.boxes?.fontSize || 14}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX, labelY);

    startAngle += sliceAngle;
  }

  startAngle = 0;
  for (const { color, value } of data) {
    const sliceAngle = (value / totalValue) * (Math.PI * 2);
    ctx.fillStyle = color || 'black';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fill();
    startAngle += sliceAngle;
  }

  const strokeConfig = pieDataConfig.stroke || { color: 'transparent', size: 0 };
  const { color: strokeColor, size: strokeWidth } = strokeConfig;
  ctx.strokeStyle = strokeColor || 'transparent';
  ctx.lineWidth = strokeWidth || 0;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (pieDataConfig.title) {
    const { text, color, fontSize, x = 0, y = 0 } = pieDataConfig.title;
    ctx.fillStyle = color || 'black';
    ctx.font = `${fontSize || 20}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(text || '', centerX + x, centerY + y);
  }
}

function drawKeys(ctx: SKRSContext2D, data: DataItem[], pieConfig: { keyBox: KeyBoxConfig; canvas: bgConfig }): void {
  const { bgcolor, width, height, radius, x, y, content } = pieConfig.keyBox || {};
  const keyX = x || 0;
  const keyY = y || 0;
  ctx.fillStyle = bgcolor || 'white';
  ctx.beginPath();
  ctx.moveTo(keyX + (radius || 0), keyY);
  ctx.lineTo(keyX + (width || 0) - (radius || 0), keyY);
  ctx.arcTo(keyX + (width || 0), keyY, keyX + (width || 0), keyY + (radius || 0), radius || 0);
  ctx.lineTo(keyX + (width || 0), keyY + (height || 0) - (radius || 0));
  ctx.arcTo(keyX + (width || 0), keyY + (height || 0), keyX + (width || 0) - (radius || 0), keyY + (height || 0), radius || 0);
  ctx.lineTo(keyX + (radius || 0), keyY + (height || 0));
  ctx.arcTo(keyX, keyY + (height || 0), keyX, keyY + (height || 0) - (radius || 0), radius || 0);
  ctx.lineTo(keyX, keyY + (radius || 0));
  ctx.arcTo(keyX, keyY, keyX + (radius || 0), keyY, radius || 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'black';
  ctx.font = `bold ${content?.keyTitle?.fontSize || 14}px Arial`;

  const textWidth = ctx.measureText('Keys').width;
  const textX = ((content?.keyTitle?.x || 0) + 20 + keyX + ((width || 0) - textWidth) / 2) || 0;
  const textY = (keyY + 30 + (content?.keyTitle?.y || 0)) || 0;

  ctx.fillText('Keys', textX, textY);

  let fontSize = content?.keys?.fontSize || Math.min(16, Math.floor((width || 0) / 20));
  ctx.font = `${fontSize}px Arial`;

  data.forEach(({ label, color, key }, index) => {
    ctx.fillStyle = color || 'black';
    ctx.fillRect(keyX + 20, keyY + 60 + index * (fontSize + 10), 20, 20);
    ctx.fillStyle = 'black';
    ctx.fillText(`${key || ''}: ${label || ''}`, (keyX + 95 + (content?.keys?.x || 0)), (content?.keys?.y || 0) + keyY + 70 + index * (fontSize + 10));
  });
}

export async function pieChart(pieChartData: PieChartData): Promise<Buffer> {
    const { data = [], pieConfig = {} } = pieChartData;
    const { canvas = {}, keyBox = {}, pieData = {} } = pieConfig;
  
    const { width: canvasWidth = 1200, height: canvasHeight = 400, bgcolor: canvasBgcolor = 'gray' } = canvas || {};
  
    const { width: keyBoxWidth = 200, height: keyBoxHeight = 300, radius: keyBoxRadius = 20, bgcolor: keyBoxBgcolor = '#ffffff', x: keyBoxX = 0, y: keyBoxY = 0, content: keyBoxContent } = keyBox || {};
  
    const chartCanvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = chartCanvas.getContext('2d');
  
    ctx.fillStyle = canvasBgcolor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
    const pieConfigData: PieDataConfig = pieConfig.pieData ?? {}; 

    drawPieChart(ctx, data, canvas, pieConfigData);
      
    drawKeys(ctx, data, { keyBox: { bgcolor: keyBoxBgcolor, width: keyBoxWidth, height: keyBoxHeight, radius: keyBoxRadius, x: keyBoxX, y: keyBoxY, content: keyBoxContent }, canvas });
  
    return chartCanvas.toBuffer('image/png');
}

////////////////////////////////////////LINE CHARTS////////////////////////////////////////


export async function lineChart(data: { data: LineDataPoint[][], lineConfig: LineChartConfig }): Promise<Buffer> {
    if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0 || !data.lineConfig) {
        throw new Error('Invalid data object or missing data properties');
    }

    const lineConfig = data.lineConfig;
    if (!lineConfig.yLabels || !Array.isArray(lineConfig.yLabels) || lineConfig.yLabels.length === 0) {
        throw new Error('Missing or invalid yLabels property in line configuration');
    }

    if (!lineConfig.fillArea || !Array.isArray(lineConfig.fillArea) || lineConfig.fillArea.length !== data.data.length) {
        throw new Error('Missing or invalid fillArea property in line configuration');
    }

    if (!lineConfig.lineColor || !Array.isArray(lineConfig.lineColor) || lineConfig.lineColor.length !== data.data.length) {
        throw new Error('Missing or invalid lineColor property in line configuration');
    }

    if (!lineConfig.plot || typeof lineConfig.plot !== 'object') {
        throw new Error('Missing or invalid plot property in line configuration');
    }

    if (!lineConfig.lineTension || !Array.isArray(lineConfig.lineTension) || lineConfig.lineTension.length !== data.data.length) {
        throw new Error('Missing or invalid lineTension property in line configuration');
    }

    if (!lineConfig.grid || typeof lineConfig.grid !== 'object') {
        throw new Error('Missing or invalid grid property in line configuration');
    }

    const canvasWidth = Math.max(data.lineConfig?.canvas?.width || 800, (data.data[0]?.length - 1) * 80 + 100);
    const canvasHeight = Math.max(data.lineConfig?.canvas?.height || 600, (lineConfig.yLabels.length - 1) * 60 + 100);

    let img: any;
    if (data.lineConfig?.canvas?.image) {
        try {
            if (data.lineConfig.canvas.image.startsWith('http')) {
              const response = await fetch(data.lineConfig.canvas.image);
                if (!response.ok) {
                  throw new Error("Failed to fetch image.");
                }
              const buffer = await response.arrayBuffer();
              img = await loadImage(Buffer.from(buffer));
            } else {
              const imagePath = path.join(process.cwd(), data.lineConfig.canvas.image);
              img = await loadImage(imagePath);
            }
        } catch (error) {
          console.error('Error loading image:', error);
        }
    }

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    const xAxisLabels = data.data[0].map(point => point.label);
    const yAxisLabel = data.lineConfig?.yaxisLabel?.label || 'Y Axis';
    ctx.font = `${data.lineConfig?.yaxisLabel?.fontSize || 16} Arial`;

    if (data.lineConfig?.canvas?.image) { 
        ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
    } else {
        ctx.fillStyle = data.lineConfig?.canvas?.bgColor || '#f0f0f0';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    if (data.lineConfig?.grid) {
        const grid = data.lineConfig.grid;
        ctx.strokeStyle = grid.color || '#ccc';
        ctx.lineWidth = grid.width || 1;

        if (grid.type === 'vertical' || grid.type === 'both') {
            for (let i = 1; i < xAxisLabels.length; i++) {
                const x = i * (canvasWidth - 100) / (xAxisLabels.length - 1) + 50;
                ctx.beginPath();
                ctx.moveTo(x, 50);
                ctx.lineTo(x, canvasHeight - 50);
                ctx.stroke();
            }
        }

        if (grid.type === 'horizontal' || grid.type === 'both') {
            for (let i = 1; i < lineConfig.yLabels.length; i++) {
                const y = i * (canvasHeight - 100) / (lineConfig.yLabels.length - 1) + 50;
                ctx.beginPath();
                ctx.moveTo(50, y);
                ctx.lineTo(canvasWidth - 50, y);
                ctx.stroke();
            }
        }
    }

    ctx.save();
    ctx.translate(20, canvasHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = data.lineConfig?.yaxisLabel?.color || 'black'; 
    ctx.fillText(yAxisLabel, data.lineConfig?.yaxisLabel?.y || 0, data.lineConfig?.yaxisLabel?.x || 0);
    ctx.restore();

    let maxY = 0;
    data.data.forEach(line => {
        const maxLineY = Math.max(...line.map(point => point.y));
        if (maxLineY > maxY) maxY = maxLineY;
    });

    const segmentWidth = (canvasWidth - 100) / (xAxisLabels.length - 1);

    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.lineTo(50, canvasHeight - 50);
    ctx.lineTo(canvasWidth - 50, canvasHeight - 50);
    ctx.stroke();

    data.data.forEach((line, index) => {
        ctx.beginPath();
        ctx.strokeStyle = lineConfig?.lineColor[index] || 'blue';
        ctx.lineWidth = 2;

        const tension = (lineConfig && lineConfig.lineTension && lineConfig.lineTension[index]) || 0.1;

        line.forEach((point, index) => {
            const x = index * segmentWidth + 50;
            const y = canvasHeight - (point.y / maxY) * (canvasHeight - 100) - 50;
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                const prevX = (index - 1) * segmentWidth + 50;
                const prevY = canvasHeight - (line[index - 1].y / maxY) * (canvasHeight - 100) - 50;
                const cpX1 = prevX + (x - prevX) * tension;
                const cpY1 = prevY;
                const cpX2 = x - (x - prevX) * tension;
                const cpY2 = y;
                ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, x, y);
            }
        });

        ctx.stroke();

        if (lineConfig.fillArea[index]) {
            const lastPoint = line[line.length - 1];
            const lastX = (line.length - 1) * segmentWidth + 50;
            const lastY = canvasHeight - (lastPoint.y / maxY) * (canvasHeight - 100) - 50;

            ctx.lineTo(lastX, canvasHeight - 50);
            ctx.lineTo(50, canvasHeight - 50);
            ctx.closePath();
            ctx.fillStyle = lineConfig.fillArea[index].color || 'rgba(0, 0, 255, 0.1)';
            ctx.fill();
        }

        if (data.lineConfig?.plot && data.lineConfig?.plot?.enable) {
            const plotConfig = data.lineConfig?.plot;
            ctx.fillStyle = plotConfig.color ? plotConfig.color[index] || 'red' : 'red';
            line.forEach((point, index) => {
                const x = index * segmentWidth + 50;
                const y = canvasHeight - (point.y / maxY) * (canvasHeight - 100) - 50;
                ctx.beginPath();
                ctx.arc(x, y, plotConfig.size || 4, 0, 2 * Math.PI);
                ctx.fill();
            });
        }
    });


    ctx.fillStyle = data.lineConfig?.canvas?.fontColor || 'black';
    ctx.font = `${data.lineConfig?.canvas?.fontSize || 16}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    xAxisLabels.forEach((label, index) => {
        const x = index * segmentWidth + 50;
        const y = canvasHeight - 30;
        ctx.fillText(label, x, y);
    });

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    lineConfig.yLabels.forEach((label, index) => {
        const y = canvasHeight - index * (canvasHeight - 100) / (lineConfig.yLabels.length - 1) - 50;
        ctx.fillText(label, 40, y);
    });


    if (lineConfig.keys && typeof lineConfig.keys === 'object') {
        const keyRadius = lineConfig.keysConfig?.radius || 10;
        const keyPadding = lineConfig.keysConfig?.keyPadding || 30;
        const textPadding = lineConfig.keysConfig?.textPadding || 60;
        const lineLength = 2 * keyRadius + 9 + (lineConfig.keysConfig?.textPadding || 0);
        const lineWidth = lineConfig.keysConfig?.lineWidth || 3;
        let totalKeyWidth = 0;
        for (const color in lineConfig.keys) {
            const keyText = lineConfig.keys[color];
            totalKeyWidth += ctx.measureText(keyText).width + keyPadding + (2 * keyRadius) + textPadding;
        }
        let startX = (canvasWidth - totalKeyWidth) / 2;
        for (const color in lineConfig.keys) {
            const keyText = lineConfig.keys[color];
            ctx.beginPath();
            ctx.arc(startX + keyRadius, 20 + keyRadius, keyRadius, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.closePath();
            ctx.beginPath();
            ctx.moveTo(startX + keyRadius - lineLength / 2, 20 + keyRadius);
            ctx.lineTo(startX + keyRadius + lineLength / 2, 20 + keyRadius);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            ctx.closePath();
            ctx.fillStyle = lineConfig.keysConfig?.fontColor || 'black';
            ctx.fillText(keyText, startX + (2 * keyRadius) + keyPadding + textPadding, 20 + keyRadius);
            startX += ctx.measureText(keyText).width + keyPadding + (2 * keyRadius) + textPadding + keyPadding;
        }
    }


    return canvas.toBuffer('image/png');
}