-- Synthetic seed data for the dealer portal. Applied by the api at startup when portal.dealers is empty
-- (Development) and by the test fixture. Dates are relative to now so warranty windows stay meaningful.
BEGIN;
INSERT INTO portal.dealers (id, code, name) VALUES
  (1, 'D-100', 'Blue Ridge RV'),
  (2, 'D-200', 'Lakeshore Motorhomes'),
  (3, 'D-300', 'High Desert RV');

-- Entra oid -> dealer. The first three are the tenant's test users (scripts/entra-setup.sh).
INSERT INTO portal.app_users (id, object_id, email, display_name, dealer_id) VALUES
  (1, '30b994d4-8277-4791-8801-b8553cda8dec', 'dealer.user@jeep8598gmail.onmicrosoft.com', 'Dana Ulrich (Dealer.User)', 1),
  (2, 'c6310899-1869-4f7c-9425-a6aa083999a6', 'dealer.admin@jeep8598gmail.onmicrosoft.com', 'Avery Dahl (Dealer.Admin)', 1),
  (3, '2bede04d-e740-4fc5-a78f-fb050fb69127', 'thor.admin@jeep8598gmail.onmicrosoft.com', 'Tomas Haring (Thor.Admin)', NULL),
  (4, '00000000-0000-4000-8000-000000000204', 'user@lakeshore.example', 'Lee Okafor (Dealer.User)', 2),
  (5, '00000000-0000-4000-8000-000000000205', 'admin@lakeshore.example', 'Priya Natarajan (Dealer.Admin)', 2),
  (6, '00000000-0000-4000-8000-000000000306', 'user@highdesert.example', 'Sam Reyes (Dealer.User)', 3),
  (7, '00000000-0000-4000-8000-000000000307', 'admin@highdesert.example', 'Jordan Whitfield (Dealer.Admin)', 3),
  (8, '00000000-0000-4000-8000-000000000008', 'warranty@thor.example', 'Casey Lindqvist (Thor.Admin)', NULL);

INSERT INTO portal.units (id, dealer_id, vin, model, delivery_date) VALUES
  (1, 1, '1THRA24X2RN000001', 'Aria 24', (CURRENT_DATE - INTERVAL '12 months')::date),
  (2, 2, '1THRA28X0RN000002', 'Aria 28', (CURRENT_DATE - INTERVAL '14 months')::date),
  (3, 3, '1THRS32X8RN000003', 'Summit 32', (CURRENT_DATE - INTERVAL '4 months')::date),
  (4, 1, '1THRS36X5RN000004', 'Summit 36', (CURRENT_DATE - INTERVAL '5 months')::date),
  (5, 2, '1THRT21X0RN000005', 'Trailhead 21', (CURRENT_DATE - INTERVAL '20 months')::date),
  (6, 3, '1THRA24X3RN000006', 'Aria 24', (CURRENT_DATE - INTERVAL '18 months')::date),
  (7, 1, '1THRA28X1RN000007', 'Aria 28', (CURRENT_DATE - INTERVAL '3 months')::date),
  (8, 2, '1THRS32X6RN000008', 'Summit 32', (CURRENT_DATE - INTERVAL '15 months')::date),
  (9, 3, '1THRS36X3RN000009', 'Summit 36', (CURRENT_DATE - INTERVAL '4 months')::date),
  (10, 1, '1THRT21X8RN000010', 'Trailhead 21', (CURRENT_DATE - INTERVAL '4 months')::date),
  (11, 2, '1THRA24X0RN000011', 'Aria 24', (CURRENT_DATE - INTERVAL '15 months')::date),
  (12, 3, '1THRA28X9RN000012', 'Aria 28', (CURRENT_DATE - INTERVAL '28 months')::date),
  (13, 1, '1THRS32X3RN000013', 'Summit 32', (CURRENT_DATE - INTERVAL '5 months')::date),
  (14, 2, '1THRS36X9RN000014', 'Summit 36', (CURRENT_DATE - INTERVAL '22 months')::date),
  (15, 3, '1THRT21X0RL000015', 'Trailhead 21', (CURRENT_DATE - INTERVAL '70 months')::date),
  (16, 1, '1THRA24X9RL000016', 'Aria 24', (CURRENT_DATE - INTERVAL '58 months')::date),
  (17, 2, '1THRA28X0RL000017', 'Aria 28', (CURRENT_DATE - INTERVAL '52 months')::date),
  (18, 3, '1THRS32X0RL000018', 'Summit 32', (CURRENT_DATE - INTERVAL '47 months')::date),
  (19, 1, '1THRS36X2RL000019', 'Summit 36', (CURRENT_DATE - INTERVAL '57 months')::date),
  (20, 2, '1THRT21X6RL000020', 'Trailhead 21', (CURRENT_DATE - INTERVAL '49 months')::date);

INSERT INTO portal.claims (id, dealer_id, unit_id, description, amount, status, created_at, approved_at) VALUES
  (1, 2, 8, 'Water heater igniter fails intermittently', 760.00, 'Open', now() - INTERVAL '139 days', NULL),
  (2, 1, 1, 'Awning motor stalls at full extension', 12400.00, 'Approved', now() - INTERVAL '79 days', now() - INTERVAL '76 days'),
  (3, 2, 8, 'Delamination on driver side lower panel', 420.50, 'Open', now() - INTERVAL '149 days', NULL),
  (4, 1, 1, 'Furnace sail switch fault code', 3900.00, 'Open', now() - INTERVAL '25 days', NULL),
  (5, 2, 8, 'Entry step retract failure', 12400.00, 'Approved', now() - INTERVAL '16 days', now() - INTERVAL '13 days'),
  (6, 1, 1, 'Roof seam sealant separation', 5600.00, 'Rejected', now() - INTERVAL '175 days', NULL),
  (7, 2, 8, 'Inverter shuts down under load', 3900.00, 'Rejected', now() - INTERVAL '120 days', NULL),
  (8, 1, 1, 'Refrigerator cooling unit replacement', 3900.00, 'Open', now() - INTERVAL '77 days', NULL),
  (9, 2, 8, 'Leveling jack hydraulic leak', 760.00, 'Open', now() - INTERVAL '179 days', NULL),
  (10, 1, 1, 'Slide-out seal leaking at rear bedroom', 420.50, 'Approved', now() - INTERVAL '148 days', now() - INTERVAL '145 days'),
  (11, 2, 8, 'Water heater igniter fails intermittently', 7250.00, 'Approved', now() - INTERVAL '127 days', now() - INTERVAL '124 days'),
  (12, 1, 1, 'Awning motor stalls at full extension', 5600.00, 'PendingApproval', now() - INTERVAL '74 days', NULL),
  (13, 2, 8, 'Delamination on driver side lower panel', 420.50, 'Rejected', now() - INTERVAL '132 days', NULL),
  (14, 1, 1, 'Furnace sail switch fault code', 760.00, 'Open', now() - INTERVAL '88 days', NULL),
  (15, 2, 8, 'Entry step retract failure', 5600.00, 'PendingApproval', now() - INTERVAL '108 days', NULL),
  (16, 1, 1, 'Roof seam sealant separation', 420.50, 'Approved', now() - INTERVAL '143 days', now() - INTERVAL '140 days'),
  (17, 2, 8, 'Inverter shuts down under load', 3900.00, 'Approved', now() - INTERVAL '178 days', now() - INTERVAL '175 days'),
  (18, 1, 1, 'Refrigerator cooling unit replacement', 12400.00, 'Rejected', now() - INTERVAL '128 days', NULL),
  (19, 2, 8, 'Leveling jack hydraulic leak', 420.50, 'Approved', now() - INTERVAL '24 days', now() - INTERVAL '21 days'),
  (20, 1, 1, 'Slide-out seal leaking at rear bedroom', 5600.00, 'PendingApproval', now() - INTERVAL '179 days', NULL),
  (21, 2, 8, 'Water heater igniter fails intermittently', 180.00, 'Approved', now() - INTERVAL '180 days', now() - INTERVAL '177 days'),
  (22, 1, 1, 'Awning motor stalls at full extension', 12400.00, 'Rejected', now() - INTERVAL '175 days', NULL),
  (23, 2, 8, 'Delamination on driver side lower panel', 2480.00, 'Approved', now() - INTERVAL '99 days', now() - INTERVAL '96 days'),
  (24, 1, 1, 'Furnace sail switch fault code', 180.00, 'Approved', now() - INTERVAL '119 days', now() - INTERVAL '116 days'),
  (25, 2, 8, 'Entry step retract failure', 760.00, 'Open', now() - INTERVAL '157 days', NULL),
  (26, 1, 1, 'Roof seam sealant separation', 5600.00, 'Approved', now() - INTERVAL '16 days', now() - INTERVAL '13 days'),
  (27, 2, 8, 'Inverter shuts down under load', 2480.00, 'Open', now() - INTERVAL '34 days', NULL),
  (28, 1, 1, 'Refrigerator cooling unit replacement', 4999.00, 'Rejected', now() - INTERVAL '101 days', NULL),
  (29, 2, 8, 'Leveling jack hydraulic leak', 420.50, 'Rejected', now() - INTERVAL '43 days', NULL),
  (30, 1, 1, 'Slide-out seal leaking at rear bedroom', 4999.00, 'Approved', now() - INTERVAL '141 days', now() - INTERVAL '138 days');

INSERT INTO portal.parts (sku, name, unit_price) VALUES
  ('AWN-1200', 'Awning motor 12V', 389.00),
  ('BAT-AGM-100', 'AGM house battery 100Ah', 329.99),
  ('SEAL-SO-RR', 'Slide-out seal kit, rear', 74.50),
  ('WH-IGN-6G', 'Water heater igniter assembly', 48.25),
  ('STEP-3R', 'Entry step motor, 3-step', 214.00),
  ('FRN-SAIL', 'Furnace sail switch', 19.95),
  ('INV-2000', 'Inverter 2000W pure sine', 689.00),
  ('JACK-HYD-L', 'Leveling jack cylinder, left', 412.00),
  ('ROOF-SEAL-Q', 'Roof seam sealant, quart', 36.00),
  ('FRIDGE-CU', 'Refrigerator cooling unit', 1189.00),
  ('PANEL-DS-L', 'Lower side panel, driver', 845.00),
  ('LED-INT-4', 'Interior LED fixture, 4-pack', 59.00);

INSERT INTO portal.parts_orders (id, dealer_id, unit_id, status, total, created_at) VALUES
  (1, 1, 4, 'Submitted', 2211.00, now() - INTERVAL '88 days'),
  (2, 2, 11, 'Submitted', 197.25, now() - INTERVAL '30 days'),
  (3, 3, NULL, 'Shipped', 1038.00, now() - INTERVAL '24 days'),
  (4, 1, 7, 'Shipped', 1984.00, now() - INTERVAL '48 days'),
  (5, 2, 14, 'Submitted', 2397.95, now() - INTERVAL '116 days'),
  (6, 3, NULL, 'Submitted', 3524.00, now() - INTERVAL '51 days'),
  (7, 1, 1, 'Submitted', 2493.00, now() - INTERVAL '9 days'),
  (8, 2, 5, 'Shipped', 635.50, now() - INTERVAL '7 days'),
  (9, 3, NULL, 'Submitted', 1048.98, now() - INTERVAL '79 days'),
  (10, 1, 1, 'Shipped', 1416.46, now() - INTERVAL '33 days'),
  (11, 2, 8, 'Submitted', 4775.95, now() - INTERVAL '109 days'),
  (12, 3, NULL, 'Submitted', 1884.00, now() - INTERVAL '11 days'),
  (13, 1, 4, 'Shipped', 1069.77, now() - INTERVAL '21 days'),
  (14, 2, 14, 'Shipped', 1263.50, now() - INTERVAL '70 days'),
  (15, 3, NULL, 'Shipped', 1203.00, now() - INTERVAL '109 days');
INSERT INTO portal.parts_order_lines (id, parts_order_id, sku, quantity, unit_price) VALUES
  (1, 1, 'INV-2000', 3, 689.00),
  (2, 1, 'ROOF-SEAL-Q', 4, 36.00),
  (3, 2, 'WH-IGN-6G', 1, 48.25),
  (4, 2, 'SEAL-SO-RR', 2, 74.50),
  (5, 3, 'PANEL-DS-L', 1, 845.00),
  (6, 3, 'WH-IGN-6G', 4, 48.25),
  (7, 4, 'STEP-3R', 2, 214.00),
  (8, 4, 'AWN-1200', 4, 389.00),
  (9, 5, 'FRIDGE-CU', 2, 1189.00),
  (10, 5, 'FRN-SAIL', 1, 19.95),
  (11, 6, 'PANEL-DS-L', 4, 845.00),
  (12, 6, 'ROOF-SEAL-Q', 4, 36.00),
  (13, 7, 'JACK-HYD-L', 4, 412.00),
  (14, 7, 'PANEL-DS-L', 1, 845.00),
  (15, 8, 'JACK-HYD-L', 1, 412.00),
  (16, 8, 'SEAL-SO-RR', 3, 74.50),
  (17, 9, 'BAT-AGM-100', 2, 329.99),
  (18, 9, 'AWN-1200', 1, 389.00),
  (19, 10, 'BAT-AGM-100', 4, 329.99),
  (20, 10, 'WH-IGN-6G', 2, 48.25),
  (21, 11, 'FRIDGE-CU', 4, 1189.00),
  (22, 11, 'FRN-SAIL', 1, 19.95),
  (23, 12, 'JACK-HYD-L', 4, 412.00),
  (24, 12, 'LED-INT-4', 4, 59.00),
  (25, 13, 'BAT-AGM-100', 3, 329.99),
  (26, 13, 'FRN-SAIL', 4, 19.95),
  (27, 14, 'AWN-1200', 3, 389.00),
  (28, 14, 'WH-IGN-6G', 2, 48.25),
  (29, 15, 'AWN-1200', 3, 389.00),
  (30, 15, 'ROOF-SEAL-Q', 1, 36.00);

-- Manufacturer documents. Files live under assistant/fixtures/docs and are indexed for retrieval.
INSERT INTO portal.documents (id, title, kind, path, model, published_on) VALUES
  (1, 'Aria Owners Manual (2024)', 'OwnerManual', 'owner-manual-aria.md', 'Aria', '2024-01-15'),
  (2, 'Summit Owners Manual (2024)', 'OwnerManual', 'owner-manual-summit.md', 'Summit', '2024-02-01'),
  (3, 'Trailhead Owners Manual (2025)', 'OwnerManual', 'owner-manual-trailhead.md', 'Trailhead', '2025-03-10'),
  (4, 'SB-2026-03 Slide-out seal inspection and replacement', 'ServiceBulletin', 'sb-2026-03-slide-out-seal.md', 'Aria', '2026-03-04'),
  (5, 'SB-2026-07 Battery isolator relay replacement', 'ServiceBulletin', 'sb-2026-07-battery-isolator.md', 'Summit', '2026-07-22'),
  (6, 'SB-2026-09 Furnace sail switch update', 'ServiceBulletin', 'sb-2026-09-furnace-sail-switch.md', NULL, '2026-09-02');

SELECT setval(pg_get_serial_sequence('portal.dealers','id'), (SELECT max(id) FROM portal.dealers));
SELECT setval(pg_get_serial_sequence('portal.app_users','id'), (SELECT max(id) FROM portal.app_users));
SELECT setval(pg_get_serial_sequence('portal.units','id'), (SELECT max(id) FROM portal.units));
SELECT setval(pg_get_serial_sequence('portal.claims','id'), (SELECT max(id) FROM portal.claims));
SELECT setval(pg_get_serial_sequence('portal.parts_orders','id'), (SELECT max(id) FROM portal.parts_orders));
SELECT setval(pg_get_serial_sequence('portal.parts_order_lines','id'), (SELECT max(id) FROM portal.parts_order_lines));
SELECT setval(pg_get_serial_sequence('portal.documents','id'), (SELECT max(id) FROM portal.documents));
COMMIT;
