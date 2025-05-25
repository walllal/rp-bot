import axios from 'axios';
import { Buffer } from 'buffer';
import sharp from 'sharp';
import { FastifyInstance } from 'fastify'; // Added for logger type

// Helper function to download a GIF image URL, convert it to JPEG, and return as a Base64 Data URI.
// Returns null if not a GIF, or if any error occurs.
export async function convertGifToJpegBase64(
    imageUrl: string,
    logger: FastifyInstance['log'] | typeof console
): Promise<string | null> {
    try {
        const currentLogger = (typeof (logger as any).trace === 'function') ? logger : console;
        (currentLogger as any).trace(`[convertGifToJpegBase64] Attempting to process URL: ${imageUrl}`);
        
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 15000 // 15 seconds timeout
        });

        if (response.status !== 200) {
            (currentLogger as any).warn(`[convertGifToJpegBase64] Failed to download image from ${imageUrl}. Status: ${response.status}`);
            return null;
        }

        const downloadedImageData = response.data as ArrayBuffer;
        
        let mimeType = response.headers['content-type']?.toLowerCase();

        // Infer MIME type from extension if header is missing or uninformative
        if (!mimeType || !mimeType.startsWith('image/')) {
            const extension = imageUrl.substring(imageUrl.lastIndexOf('.') + 1).toLowerCase();
            const extToMime: { [key: string]: string } = {
                'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
                'gif': 'image/gif', 'webp': 'image/webp',
            };
            const inferredMimeType = extToMime[extension];
            if (inferredMimeType) {
                mimeType = inferredMimeType;
                (currentLogger as any).trace(`[convertGifToJpegBase64] Inferred MIME type '${mimeType}' from extension for ${imageUrl}.`);
            } else {
                (currentLogger as any).warn(`[convertGifToJpegBase64] Could not determine a valid image MIME type for ${imageUrl}. Assuming not a processable image.`);
                return null; // Not a recognized image type
            }
        }
        
        if (mimeType !== 'image/gif') {
            (currentLogger as any).trace(`[convertGifToJpegBase64] Image is not a GIF (MIME: ${mimeType}). Skipping conversion for URL: ${imageUrl}`);
            return null; // Indicate it's not a GIF, so original URL should be used by caller
        }

        (currentLogger as any).trace(`[convertGifToJpegBase64] Image is GIF. Attempting to convert to JPEG: ${imageUrl}`);
        let imageBufferForBase64 = Buffer.from(downloadedImageData);
        try {
            imageBufferForBase64 = await sharp(imageBufferForBase64)
                .jpeg() // Convert to JPEG
                .toBuffer();
            const base64String = imageBufferForBase64.toString('base64');
            (currentLogger as any).trace(`[convertGifToJpegBase64] Successfully converted GIF to JPEG and Base64 for URL: ${imageUrl}`);
            return `data:image/jpeg;base64,${base64String}`;
        } catch (conversionError: any) {
            (currentLogger as any).error(`[convertGifToJpegBase64] Failed to convert GIF to JPEG for ${imageUrl}: ${conversionError.message}`, conversionError.stack?.substring(0, 300));
            return null; // Conversion failed
        }

    } catch (error: any) {
        const currentLogger = (typeof (logger as any).error === 'function') ? logger : console;
        (currentLogger as any).error(`[convertGifToJpegBase64] Error processing image URL ${imageUrl}: ${error.message}`, error.stack?.substring(0, 500));
        return null;
    }
}