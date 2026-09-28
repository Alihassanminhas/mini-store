import { Router } from 'express';
import { z } from 'zod';
import { database } from '../config/database.js';

export const catalogRouter = Router();

const listingQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  minPrice: z.coerce.number().finite().min(0).optional(),
  maxPrice: z.coerce.number().finite().min(0).optional(),
  sort: z.enum(['featured', 'price-asc', 'price-desc', 'newest']).default('featured'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

const orderBy = {
  featured: 'is_featured DESC, created_at DESC, id DESC',
  'price-asc': 'starting_price ASC, id DESC',
  'price-desc': 'starting_price DESC, id DESC',
  newest: 'created_at DESC, id DESC',
} as const;

catalogRouter.get('/categories', async (_request, response, next) => {
  try {
    const result = await database.query(
      `SELECT c.id, c.name, c.slug, c.description, COUNT(p.id)::integer AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = true
       GROUP BY c.id
       ORDER BY c.name ASC`,
    );
    response.json({ categories: result.rows });
  } catch (error) {
    next(error);
  }
});

catalogRouter.get('/products', async (request, response, next) => {
  const parsed = listingQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid product filters.', details: parsed.error.flatten().fieldErrors } });
    return;
  }

  const { q, category, minPrice, maxPrice, sort, page, pageSize } = parsed.data;
  const values: Array<string | number> = [];
  const filters: string[] = [];
  const parameter = (value: string | number): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (q) {
    const searchValue = parameter(`%${q}%`);
    filters.push(`(name ILIKE ${searchValue} OR description ILIKE ${searchValue})`);
  }
  if (category) filters.push(`category_slug = ${parameter(category)}`);
  if (minPrice !== undefined) filters.push(`starting_price >= ${parameter(minPrice)}`);
  if (maxPrice !== undefined) filters.push(`starting_price <= ${parameter(maxPrice)}`);

  const offset = parameter((page - 1) * pageSize);
  const limit = parameter(pageSize);
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const result = await database.query(
      `WITH catalog_products AS (
         SELECT p.id, p.name, p.slug, p.description, p.created_at,
                c.name AS category_name, c.slug AS category_slug,
                COALESCE(MIN(v.price), p.base_price)::numeric(12, 2) AS starting_price,
                COALESCE(BOOL_OR(v.stock_quantity > 0), false) AS in_stock,
                COALESCE((ARRAY_AGG(pi.image_url ORDER BY pi.is_primary DESC, pi.id ASC)
                  FILTER (WHERE pi.id IS NOT NULL))[1], '') AS image_url,
                COALESCE((ARRAY_AGG(pi.alt_text ORDER BY pi.is_primary DESC, pi.id ASC)
                  FILTER (WHERE pi.id IS NOT NULL))[1], '') AS image_alt,
                false AS is_featured
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN variants v ON v.product_id = p.id AND v.is_active = true
         LEFT JOIN product_images pi ON pi.product_id = p.id
         WHERE p.is_active = true
         GROUP BY p.id, c.name, c.slug
       ), filtered_products AS (
         SELECT * FROM catalog_products ${whereClause}
       )
       SELECT *, COUNT(*) OVER()::integer AS total_count
       FROM filtered_products
       ORDER BY ${orderBy[sort]}
       OFFSET ${offset} LIMIT ${limit}`,
      values,
    );

    const products = result.rows.map(({ total_count: _totalCount, ...product }) => product);
    const total = result.rows[0]?.total_count ?? 0;
    response.json({ products, pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } });
  } catch (error) {
    next(error);
  }
});

catalogRouter.get('/products/:slug', async (request, response, next) => {
  try {
    const productResult = await database.query(
      `SELECT p.id, p.name, p.slug, p.description, p.base_price, c.name AS category_name,
              c.slug AS category_slug, p.created_at
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.slug = $1 AND p.is_active = true`,
      [request.params.slug],
    );
    const product = productResult.rows[0];
    if (!product) {
      response.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'We could not find that product.' } });
      return;
    }

    const [images, variants] = await Promise.all([
      database.query(
        `SELECT id, image_url, alt_text, is_primary FROM product_images
         WHERE product_id = $1 ORDER BY is_primary DESC, id ASC`, [product.id],
      ),
      database.query(
        `SELECT id, variant_name, price, (stock_quantity > 0) AS in_stock
         FROM variants WHERE product_id = $1 AND is_active = true ORDER BY id ASC`, [product.id],
      ),
    ]);
    response.json({ product: { ...product, images: images.rows, variants: variants.rows } });
  } catch (error) {
    next(error);
  }
});
