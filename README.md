# Biz Lens Automata

**E-commerce sales & logistics analytics** — a two-layer project: an interactive dashboard prototype (React, no-code) plus a real Python/SQL analysis layer that diagnoses and fixes data-quality bugs found in the dashboard.

🌐 **Live dashboard:** https://biz-lens-automata.lovable.app

---

## 📌 Project Overview

This repository has two components, kept separate on purpose:

| Layer | What it is | Tech |
|---|---|---|
| **Dashboard prototype** (`src/`, `.lovable/`) | An executive-facing UI built rapidly with an AI no-code tool (Lovable) to explore KPI presentation and UX | React, TypeScript, Vite, shadcn/ui |
| **Analysis layer** (`data/`, `sql/`, `notebooks/`, `build_db.py`) | The actual data engineering and analysis work: profiling, root-cause diagnosis, cleaning, and KPI computation | Python (pandas), SQL (DuckDB), matplotlib/seaborn |

**Why two layers?** The dashboard prototype was built first and, on inspection, was found to contain two data-quality bugs that produced incorrect executive KPIs (see below). Rather than hide or silently patch this, the analysis layer documents the full diagnosis and provides a verified, reproducible alternative computation of every KPI shown on the dashboard.

---

## 🐛 Bugs Found & Fixed

| Bug | Symptom | Root Cause | Fix |
|---|---|---|---|
| **Unknown Business Unit** | 58.3% of transactions (69.5% of volume) classified as "Unknown" | The dashboard joined `Sales_Data.category` to `BU_mapping.Category`, but `category` values in the sales data are actually **Business Unit codes**, not the granular sub-category the mapping table expects. All 7 category values match `BU_mapping['Business Unit']` at 100%, but only 4/7 match `BU_mapping['Category']`. | `business_unit = category` directly — no intermediate join needed for this dataset |
| **Negative SLA breach count** | Dashboard showed `-147,524,555` late orders | Traced to the dashboard's internal aggregation logic (not a data issue — `breach` is a clean 0/1 flag with no negative values anywhere upstream) | Recomputed directly in SQL: `SUM(CASE WHEN breach=1 THEN 1 ELSE 0 END)` → 169,999 (positive, consistent with the 79.2% breach rate shown) |

Full diagnosis with evidence and charts: [`notebooks/Biz_Lens_EDA.ipynb`](notebooks/Biz_Lens_EDA.ipynb)

---

## 📂 Repository Structure

```
├── data/                      # Raw source data
│   ├── Sales Data.xlsx        # 214,767 transaction-level records (2023)
│   ├── BU mapping.csv         # Category → Business Unit reference table
│   └── Pincode_mapping.csv    # India Post pincode → district/state directory
├── sql/
│   └── kpis.sql                # Documented SQL queries for every executive KPI
├── notebooks/
│   └── Biz_Lens_EDA.ipynb     # Full analysis: profiling → root-cause diagnosis → KPIs → recommendations
├── outputs/                    # Exported charts (also embedded in the notebook)
├── build_db.py                 # Builds a clean DuckDB database from the raw files
├── src/                        # Dashboard prototype source (React/TypeScript)
└── .lovable/                   # No-code tool project metadata
```

---

## 📖 Data Dictionary

### `Sales Data.xlsx` (214,767 rows)
| Column (raw) | Column (cleaned) | Type | Description |
|---|---|---|---|
| Sales units | `sales_units` | int | Units sold in this transaction line |
| Month No | `month_no` | int | Month number (1–12) |
| month | `month_name` | str | Month name |
| Year | `year` | int | 2023 |
| Status | `status` | str | `DELIVERED`, `Return`, `Cancelled` |
| Category | `category` → `business_unit` | str | Business unit code: `BGM`, `Others`, `LifeStyle`, `Home`, `Mobile`, `Appliances`, `Furniture` |
| Logisitcs type | `logistics_type` | str | `Small_Order`, `large_Order`, `Grocery`, `Digital_Order` |
| city | `pincode` | int | **Indian postal code** (misleadingly named `city` in the source file) |
| Breach | `breach` | 0/1 | SLA breach flag (1 = delivered late) |
| Logistic Partner | `logistic_partner` | str | `x-cart`, `3PL` |

### `BU mapping.csv` (13 rows)
Legacy reference table (`Business Unit`, `Category`) intended for a more granular category field than what exists in `Sales Data.xlsx`. **Not used as the join key for this dataset** — see Bug #1 above. Kept in the repo for transparency and reference.

### `Pincode_mapping.csv` (155,600 rows → 19,252 unique pincodes after cleaning)
India Post directory at **post-office level** (`Circle Name`, `Region Name`, `Division Name`, `Office Name`, `Pincode`, `OfficeType`, `Delivery`, `District`, `StateName`). One pincode can map to multiple post offices, so this is deduplicated to one row per pincode in `dim_pincode` by taking the most frequent (`mode`) district/state — documented, not silent. **Known limitation:** 8.9% of pincodes span more than one district (natural boundary overlap in Indian postal data); the mode-based resolution is a practical simplification, not a perfect one.

---

## ▶️ How to Reproduce

```bash
pip install pandas duckdb openpyxl matplotlib seaborn
python build_db.py                                  # builds db/biz_lens.duckdb
jupyter notebook notebooks/Biz_Lens_EDA.ipynb        # full analysis, runs top to bottom
```

---

## 🎯 Key Findings & Recommendations

1. **x-cart** carries 93% of order volume with an **85.0% SLA breach rate**, versus **3PL** at **0.0%** on a smaller volume — the single largest operational lever in this dataset. Immediate action: renegotiate SLA terms with x-cart or shift incremental volume to 3PL.
2. **Others** (24.7% of volume) has the highest cancellation rate (17.7%) — warrants a dedicated investigation into cause.
3. **Geographic concentration risk:** Karnataka (Bengaluru) accounts for 68% of total volume.
4. **December 2023** shows an 85% volume drop versus the September peak — verify data completeness before using this month in year-over-year comparisons.

---

## Credits

Dashboard prototype, data analysis, and cleaning methodology by **Saleh Mahbub**.
