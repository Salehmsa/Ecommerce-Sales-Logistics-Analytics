-- ==========================================================================
-- Biz Lens Automata — KPI Layer (DuckDB SQL)
-- كل استعلام هنا يحل مكان حساب كان يتم داخل كود React بشكل صامت وغير موثّق
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) نظرة عامة: الحجم الكلي وحالة الطلبات
-- --------------------------------------------------------------------------
-- Q1_overview
SELECT
    COUNT(*)                                              AS total_orders,
    SUM(sales_units)                                      AS total_units,
    SUM(CASE WHEN status = 'DELIVERED' THEN sales_units ELSE 0 END) AS delivered_units,
    SUM(CASE WHEN status = 'Return'    THEN sales_units ELSE 0 END) AS returned_units,
    SUM(CASE WHEN status = 'Cancelled' THEN sales_units ELSE 0 END) AS cancelled_units,
    ROUND(100.0 * SUM(CASE WHEN status = 'DELIVERED' THEN sales_units ELSE 0 END) / SUM(sales_units), 1) AS delivered_pct,
    ROUND(100.0 * SUM(CASE WHEN status = 'Return'    THEN sales_units ELSE 0 END) / SUM(sales_units), 1) AS returned_pct,
    ROUND(100.0 * SUM(CASE WHEN status = 'Cancelled' THEN sales_units ELSE 0 END) / SUM(sales_units), 1) AS cancelled_pct
FROM fact_sales;

-- --------------------------------------------------------------------------
-- 2) SLA Breach — الحساب الصحيح (بديل الرقم السالب في اللوحة الأصلية)
-- ملاحظة منهجية: breach هو flag على مستوى "الطلب" (order line) وليس على
-- مستوى "الوحدة" (unit) لذا نحسب النسبة والعدد بمنطق order-level بشكل ثابت
-- --------------------------------------------------------------------------
-- Q2_sla_breach
SELECT
    COUNT(*)                                        AS total_orders,
    SUM(CASE WHEN breach = 1 THEN 1 ELSE 0 END)      AS late_orders,          -- موجب دائماً، بلا bug
    SUM(CASE WHEN breach = 0 THEN 1 ELSE 0 END)      AS on_time_orders,
    ROUND(100.0 * SUM(CASE WHEN breach = 1 THEN 1 ELSE 0 END) / COUNT(*), 1)  AS breach_rate_pct,
    ROUND(100.0 * SUM(CASE WHEN breach = 0 THEN 1 ELSE 0 END) / COUNT(*), 1)  AS on_time_rate_pct
FROM fact_sales;

-- --------------------------------------------------------------------------
-- 3) الأداء حسب Business Unit — بعد إصلاح مشكلة Unknown (58.3% كانت ضائعة)
-- --------------------------------------------------------------------------
-- Q3_bu_performance
SELECT
    business_unit,
    COUNT(*)                                                          AS orders,
    SUM(sales_units)                                                  AS units,
    ROUND(100.0 * SUM(sales_units) / SUM(SUM(sales_units)) OVER (), 1) AS volume_share_pct,
    ROUND(100.0 * SUM(CASE WHEN status='Return'    THEN sales_units ELSE 0 END) / SUM(sales_units), 1) AS return_rate_pct,
    ROUND(100.0 * SUM(CASE WHEN status='Cancelled' THEN sales_units ELSE 0 END) / SUM(sales_units), 1) AS cancel_rate_pct,
    ROUND(100.0 * SUM(CASE WHEN breach = 1 THEN 1 ELSE 0 END) / COUNT(*), 1)                            AS sla_breach_rate_pct
FROM fact_sales
GROUP BY business_unit
ORDER BY units DESC;

-- --------------------------------------------------------------------------
-- 4) الأداء اللوجستي حسب الشريك ونوع الشحنة
-- --------------------------------------------------------------------------
-- Q4_logistics_partner
SELECT
    logistic_partner,
    COUNT(*)                                                     AS orders,
    ROUND(100.0 * SUM(CASE WHEN breach = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS sla_breach_rate_pct
FROM fact_sales
GROUP BY logistic_partner
ORDER BY orders DESC;

-- Q5_logistics_type
SELECT
    logistics_type,
    COUNT(*)                                                     AS orders,
    ROUND(100.0 * SUM(CASE WHEN breach = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS sla_breach_rate_pct
FROM fact_sales
GROUP BY logistics_type
ORDER BY orders DESC;

-- --------------------------------------------------------------------------
-- 5) التوزيع الجغرافي — Top 10 مناطق حسب الحجم (join مع dim_pincode النظيف)
-- --------------------------------------------------------------------------
-- Q6_top_districts
SELECT
    p.district,
    p.state_name,
    COUNT(*)                                                     AS orders,
    SUM(f.sales_units)                                           AS units,
    ROUND(100.0 * SUM(CASE WHEN f.status='Return' THEN f.sales_units ELSE 0 END) / SUM(f.sales_units), 1) AS return_rate_pct
FROM fact_sales f
JOIN dim_pincode p ON f.pincode = p.pincode
GROUP BY p.district, p.state_name
ORDER BY units DESC
LIMIT 10;

-- --------------------------------------------------------------------------
-- 6) خريطة الحرارة: State × Business Unit (لاستبدال Region×BU الأصلية)
-- --------------------------------------------------------------------------
-- Q7_state_bu_heatmap
SELECT
    p.state_name,
    f.business_unit,
    SUM(f.sales_units) AS units
FROM fact_sales f
JOIN dim_pincode p ON f.pincode = p.pincode
GROUP BY p.state_name, f.business_unit
ORDER BY p.state_name, units DESC;

-- --------------------------------------------------------------------------
-- 7) الاتجاه الشهري — Units by Status (لرسم Monthly Trend)
-- --------------------------------------------------------------------------
-- Q8_monthly_trend
SELECT
    year, month_no, month_name,
    status,
    SUM(sales_units) AS units
FROM fact_sales
GROUP BY year, month_no, month_name, status
ORDER BY year, month_no;
