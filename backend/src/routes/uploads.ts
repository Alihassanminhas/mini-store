import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { database } from '../config/database.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { deleteProductImage, uploadProductImage } from '../services/storage.js';

export const uploadsRouter = Router();
uploadsRouter.use(authenticate, requireAdmin);

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(Object.assign(new Error('Upload a JPG, PNG, or WEBP image.'), { statusCode: 400 }));
      return;
    }
    callback(null, true);
  },
});

function inspectImage(buffer: Buffer): { mimeType: string; extension: string } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mimeType: 'image/png', extension: 'png' };
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { mimeType: 'image/webp', extension: 'webp' };
  return null;
}

const uploadFieldsSchema = z.object({ altText: z.string().trim().max(300).optional().default(''), isPrimary: z.enum(['true', 'false']).optional().default('false') });

uploadsRouter.post('/products/:productId/images', uploader.single('image'), async (request, response, next) => {
  const productId = z.string().regex(/^\d+$/).safeParse(request.params.productId);
  const fields = uploadFieldsSchema.safeParse(request.body);
  const file = request.file;
  if (!productId.success || !fields.success || !file) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose a product and a JPG, PNG, or WEBP image up to 5 MB.' } });
    return;
  }

  const inspected = inspectImage(file.buffer);
  if (!inspected || inspected.mimeType !== file.mimetype) {
    response.status(400).json({ error: { code: 'INVALID_IMAGE', message: 'The uploaded file does not match a supported image format.' } });
    return;
  }

  let storedImage: { key: string; url: string } | undefined;
  const client = await database.connect();
  try {
    const exists = await client.query('SELECT id FROM products WHERE id = $1', [productId.data]);
    if (!exists.rowCount) { response.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' } }); return; }
    storedImage = await uploadProductImage(file.buffer, inspected.mimeType, inspected.extension);

    await client.query('BEGIN');
    await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [productId.data]);
    const primaryCount = await client.query<{ count: number }>('SELECT COUNT(*)::integer AS count FROM product_images WHERE product_id = $1', [productId.data]);
    const isPrimary = fields.data.isPrimary === 'true' || Number(primaryCount.rows[0]?.count ?? 0) === 0;
    if (isPrimary) await client.query('UPDATE product_images SET is_primary = false WHERE product_id = $1', [productId.data]);
    const result = await client.query(
      `INSERT INTO product_images (product_id, storage_key, image_url, alt_text, is_primary)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, product_id, storage_key, image_url, alt_text, is_primary`,
      [productId.data, storedImage.key, storedImage.url, fields.data.altText, isPrimary],
    );
    await client.query('COMMIT');
    response.status(201).json({ image: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (storedImage) await deleteProductImage(storedImage.key).catch((storageError: unknown) => console.error('Could not clean up an orphaned product image', storageError));
    next(error);
  } finally { client.release(); }
});

uploadsRouter.get('/products/:productId/images', async (request, response, next) => {
  const productId = z.string().regex(/^\d+$/).safeParse(request.params.productId);
  if (!productId.success) { response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid product id.' } }); return; }
  try {
    const result = await database.query(
      'SELECT id, product_id, storage_key, image_url, alt_text, is_primary, created_at FROM product_images WHERE product_id = $1 ORDER BY is_primary DESC, id',
      [productId.data],
    );
    response.json({ images: result.rows });
  } catch (error) { next(error); }
});

uploadsRouter.delete('/images/:imageId', async (request, response, next) => {
  const imageId = z.string().regex(/^\d+$/).safeParse(request.params.imageId);
  if (!imageId.success) { response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid image id.' } }); return; }
  const client = await database.connect();
  let storageKey: string | undefined;
  try {
    await client.query('BEGIN');
    const image = await client.query<{ id: string; product_id: string; storage_key: string; is_primary: boolean }>(
      'SELECT id, product_id, storage_key, is_primary FROM product_images WHERE id = $1 FOR UPDATE', [imageId.data],
    );
    const record = image.rows[0];
    if (!record) { await client.query('ROLLBACK'); response.status(404).json({ error: { code: 'IMAGE_NOT_FOUND', message: 'Image not found.' } }); return; }
    storageKey = record.storage_key;
    await client.query('DELETE FROM product_images WHERE id = $1', [imageId.data]);
    if (record.is_primary) {
      const nextImage = await client.query<{ id: string }>(
        'SELECT id FROM product_images WHERE product_id = $1 ORDER BY id LIMIT 1', [record.product_id],
      );
      if (nextImage.rows[0]) await client.query('UPDATE product_images SET is_primary = true WHERE id = $1', [nextImage.rows[0].id]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
    return;
  } finally { client.release(); }

  if (storageKey) await deleteProductImage(storageKey).catch((error: unknown) => console.error('Could not remove the product image from S3', error));
  response.status(204).end();
});
