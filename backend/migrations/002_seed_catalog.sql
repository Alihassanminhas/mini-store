INSERT INTO categories (name, slug, description) VALUES
  ('Kitchen & dining', 'kitchen-dining', 'Thoughtful pieces for the daily ritual.'),
  ('Home & living', 'home-living', 'Quietly useful details for a softer space.'),
  ('Bags & carry', 'bags-carry', 'Everyday companions, made to be used.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO products (category_id, name, slug, description, base_price) VALUES
  ((SELECT id FROM categories WHERE slug = 'kitchen-dining'), 'Everyday ceramic mug', 'everyday-ceramic-mug', 'A hand-finished stoneware mug with a comfortable handle and softly speckled glaze.', 28.00),
  ((SELECT id FROM categories WHERE slug = 'kitchen-dining'), 'Linen tea towel set', 'linen-tea-towel-set', 'Two washed linen towels that become softer and more absorbent with every use.', 34.00),
  ((SELECT id FROM categories WHERE slug = 'home-living'), 'Natural cotton throw', 'natural-cotton-throw', 'A relaxed cotton throw for cool evenings, afternoon reading and slow weekends.', 96.00),
  ((SELECT id FROM categories WHERE slug = 'home-living'), 'Oak catchall tray', 'oak-catchall-tray', 'Solid oak, shaped to keep the small everyday essentials close at hand.', 42.00),
  ((SELECT id FROM categories WHERE slug = 'bags-carry'), 'Market tote', 'market-tote', 'A sturdy organic cotton tote with a wide base and reinforced handles.', 38.00),
  ((SELECT id FROM categories WHERE slug = 'bags-carry'), 'Canvas day pouch', 'canvas-day-pouch', 'A compact zip pouch for the useful little things that travel with you.', 24.00)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO variants (product_id, sku, variant_name, price, stock_quantity, low_stock_threshold)
SELECT product.id, seed.sku, seed.variant_name, seed.price, seed.stock_quantity, 5
FROM (VALUES
  ('everyday-ceramic-mug', 'MUG-CLAY', 'Warm clay', 28.00::numeric, 24),
  ('everyday-ceramic-mug', 'MUG-OAT', 'Soft oat', 28.00::numeric, 18),
  ('linen-tea-towel-set', 'TOWEL-NATURAL', 'Natural', 34.00::numeric, 16),
  ('linen-tea-towel-set', 'TOWEL-OLIVE', 'Olive stripe', 34.00::numeric, 12),
  ('natural-cotton-throw', 'THROW-ONE', 'Natural / one size', 96.00::numeric, 8),
  ('oak-catchall-tray', 'TRAY-OAK-S', 'Small', 42.00::numeric, 10),
  ('oak-catchall-tray', 'TRAY-OAK-L', 'Large', 58.00::numeric, 6),
  ('market-tote', 'TOTE-ECRU', 'Ecru', 38.00::numeric, 20),
  ('market-tote', 'TOTE-OLIVE', 'Olive', 38.00::numeric, 11),
  ('canvas-day-pouch', 'POUCH-NATURAL', 'Natural', 24.00::numeric, 14)
) AS seed(product_slug, sku, variant_name, price, stock_quantity)
JOIN products AS product ON product.slug = seed.product_slug
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory_transactions (variant_id, quantity_change, transaction_type)
SELECT v.id, v.stock_quantity, 'restock'
FROM variants v
WHERE v.stock_quantity > 0
  AND v.sku IN ('MUG-CLAY', 'MUG-OAT', 'TOWEL-NATURAL', 'TOWEL-OLIVE', 'THROW-ONE', 'TRAY-OAK-S', 'TRAY-OAK-L', 'TOTE-ECRU', 'TOTE-OLIVE', 'POUCH-NATURAL')
  AND NOT EXISTS (
    SELECT 1 FROM inventory_transactions it
    WHERE it.variant_id = v.id AND it.transaction_type = 'restock' AND it.reference_id IS NULL
  );

INSERT INTO product_images (product_id, storage_key, image_url, alt_text, is_primary)
SELECT product.id, seed.storage_key, seed.image_url, seed.alt_text, true
FROM (VALUES
  ('everyday-ceramic-mug', 'seed/everyday-ceramic-mug.jpg', 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=1000&q=85', 'A handmade ceramic mug on a linen table'),
  ('linen-tea-towel-set', 'seed/linen-tea-towel-set.jpg', 'https://images.unsplash.com/photo-1603199506016-b9a594b593c0?auto=format&fit=crop&w=1000&q=85', 'Natural linen towels folded on a kitchen counter'),
  ('natural-cotton-throw', 'seed/natural-cotton-throw.jpg', 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=85', 'A soft neutral throw draped across a chair'),
  ('oak-catchall-tray', 'seed/oak-catchall-tray.jpg', 'https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?auto=format&fit=crop&w=1000&q=85', 'Wooden home accessories in a calm interior'),
  ('market-tote', 'seed/market-tote.jpg', 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1000&q=85', 'A practical neutral canvas tote'),
  ('canvas-day-pouch', 'seed/canvas-day-pouch.jpg', 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1000&q=85', 'A simple canvas pouch for everyday carry')
) AS seed(product_slug, storage_key, image_url, alt_text)
JOIN products AS product ON product.slug = seed.product_slug
ON CONFLICT (storage_key) DO NOTHING;
