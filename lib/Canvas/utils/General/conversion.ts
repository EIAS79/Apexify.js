import  { ImgurClient } from "imgur";


  export async function url(buffer: Buffer) {
    const client = new ImgurClient({
       clientId: "cd66e7c46e15b4e",
       clientSecret: "14a6adf67597a7b2db5e535a09c24843470fc70b",
       accessToken: "ad06eacb7c7228d8f482d2db20f490d649f58e52",
       refreshToken: "57fd64eeca315fcd25584fbbde91950bf17a7f5e"
    });
  
    const response = await client.upload({
       image: base64(buffer),
       type: 'base64',
    });

   return response.data.link;
  }

  export function dataURL(buffer: any): string {
    return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
  }
  
  export function blob(buffer: any): Blob {
    return new Blob([buffer], { type: 'image/png' });
  }
  
  export function base64(buffer: any): string {
    return Buffer.from(buffer).toString('base64');
  }
  
  export function arrayBuffer(buffer: any): ArrayBuffer {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
