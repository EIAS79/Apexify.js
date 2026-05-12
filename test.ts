import { ApexPainter } from "./lib/index";

async function main() {
 
    const painter = new ApexPainter();

    const bg = await painter.createCanvas({
        colorBg: 'blue',
        width: 500,
        height: 200,
        borderRadius: 30,
        stroke: {
            color: 'red',
            width: 5,
            borderRadius: 30
        }
    });

    const img = await painter.createImage([{
        source: 'rectangle',
        x:  70, y: 70,
        width: 100, height: 50,
        shape:{
           fill: true,
           color: 'green',
        },
        borderRadius: 30,
        stroke: {
            borderRadius: 30,
            color: 'black',
            width: 4,
            borderPosition: 'all'
        }
    }], bg)

    await painter.save(img)

}

main()