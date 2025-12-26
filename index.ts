import { ApexPainter } from"./lib/index";

const paint = new ApexPainter();

async function run() {

    const bg_custom = await paint.createCanvas({
        customBg: {
            source: 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Altja_j%C3%B5gi_Lahemaal.jpg',
            inherit: true
        }
    });
 
    const bg_gradient_linear = await paint.createCanvas({
        gradientBg: {
            type: 'linear',
            colors: []

        }
    });
    
    const bg_gradient_radial = await paint.createCanvas({
        gradientBg: {
            type: 'radial',
            colors: []

        }
    });
    
    const bg_gradient_conic = await paint.createCanvas({
        gradientBg: {
            type: 'conic',
            colors: []
        }
    });

    const bg_video = await paint.createCanvas({
        videoBg: {
            source: ''
        }
    });
    
}