"""
==========================================================================
 Biz Lens Automata - Data Layer Build Script
 يبني قاعدة بيانات DuckDB نظيفة من الملفات الخام مع توثيق كل قرار تنظيف
==========================================================================
"""
import pandas as pd
import duckdb

# ---------- 1) تحميل البيانات الخام ----------
sales_raw = pd.read_excel("data/Sales Data.xlsx").drop(columns=["Unnamed: 1"])
sales_raw.columns = [
    "sales_units", "month_no", "month_name", "year",
    "status", "category", "logistics_type", "pincode", "breach", "logistic_partner"
]

pincode_raw = pd.read_csv("data/Pincode_mapping.csv", encoding="cp1252")
pincode_raw.columns = [c.strip() for c in pincode_raw.columns]

bu_raw = pd.read_csv("data/BU mapping.csv", encoding="utf-8-sig")
bu_raw.columns = [c.strip() for c in bu_raw.columns]

# ---------- 2) إصلاح جذري: category في Sales Data = business_unit فعلياً ----------
# تم إثباته في الخطوة 1: تطابق 100% بين sales.category و bu_mapping['Business Unit']
sales_raw["business_unit"] = sales_raw["category"]  # لا حاجة لجدول mapping وسيط لهذا الملف

# ---------- 3) بناء dim_pincode نظيف (صف واحد لكل Pincode) ----------
# قرار تنظيف موثّق: بعض الرموز البريدية (8.9%) تتبع أكثر من District بسبب
# تداخل حدودي في بيانات البريد الهندي -> نختار القيمة الأكثر تكراراً (mode) كحل عملي
def safe_mode(s):
    s = s.dropna()
    if len(s) == 0:
        return None
    return s.mode().iloc[0]

dim_pincode = (
    pincode_raw.groupby("Pincode")
    .agg(
        district=("District", safe_mode),
        state_name=("StateName", safe_mode),
        region_name=("Region Name", safe_mode),
        circle_name=("Circle Name", safe_mode),
    )
    .reset_index()
    .rename(columns={"Pincode": "pincode"})
)

# ---------- 4) بناء fact_sales النهائي ----------
fact_sales = sales_raw[[
    "sales_units", "month_no", "month_name", "year", "status",
    "category", "business_unit", "logistics_type", "pincode",
    "breach", "logistic_partner"
]].copy()

# ---------- 5) كتابة كل شيء في DuckDB ----------
con = duckdb.connect("db/biz_lens.duckdb")
con.execute("DROP TABLE IF EXISTS fact_sales")
con.execute("DROP TABLE IF EXISTS dim_pincode")
con.execute("DROP TABLE IF EXISTS dim_bu_mapping_raw")
con.register("fact_sales_df", fact_sales)
con.register("dim_pincode_df", dim_pincode)
con.register("bu_raw_df", bu_raw)
con.execute("CREATE TABLE fact_sales AS SELECT * FROM fact_sales_df")
con.execute("CREATE TABLE dim_pincode AS SELECT * FROM dim_pincode_df")
con.execute("CREATE TABLE dim_bu_mapping_raw AS SELECT * FROM bu_raw_df")  # نحتفظ بها كتوثيق فقط

print("fact_sales:", con.execute("SELECT COUNT(*) FROM fact_sales").fetchone()[0], "صف")
print("dim_pincode:", con.execute("SELECT COUNT(*) FROM dim_pincode").fetchone()[0], "صف")
con.close()
print("\n✅ تم بناء db/biz_lens.duckdb بنجاح")
