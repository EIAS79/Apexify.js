declare module 'imgur' {
  export interface ImgurClientConfig {
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
    refreshToken?: string;
  }

  export interface UploadOptions {
    image: string;
    type?: 'base64' | 'url' | 'stream';
    album?: string;
    name?: string;
    title?: string;
    description?: string;
  }

  export interface ImgurResponse<T = any> {
    data: T;
    success: boolean;
    status: number;
  }

  export interface UploadResponseData {
    id: string;
    title: string | null;
    description: string | null;
    datetime: number;
    type: string;
    animated: boolean;
    width: number;
    height: number;
    size: number;
    views: number;
    bandwidth: number;
    vote: string | null;
    favorite: boolean;
    nsfw: string | null;
    section: string | null;
    account_url: string | null;
    account_id: number | null;
    is_ad: boolean;
    in_most_viral: boolean;
    has_sound: boolean;
    tags: string[];
    ad_type: number;
    ad_url: string;
    edited: string | number;
    in_gallery: boolean;
    deletehash: string;
    name: string;
    link: string;
  }

  export class ImgurClient {
    constructor(config: ImgurClientConfig);
    
    upload(options: UploadOptions): Promise<ImgurResponse<UploadResponseData>>;
    
    // Add other common methods that might be used
    getImage(imageId: string): Promise<ImgurResponse<UploadResponseData>>;
    deleteImage(deleteHash: string): Promise<ImgurResponse<boolean>>;
  }
}

