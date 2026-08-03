import re
import json
import csv
import os

html_path = "/Users/pulkit/Downloads/Bigspy-adaptation/index.html"
csv_out_path = "/Users/pulkit/Downloads/Bigspy-adaptation/scripts_database.csv"

print("Reading index.html...")
with open(html_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Extract kb-data
kb_data = {}
kb_match = re.search(r'<script id="kb-data" type="application/json">(.*?)</script>', content)
if kb_match:
    try:
        kb_data = json.loads(kb_match.group(1).strip())
        print(f"Extracted {len(kb_data)} metadata records from kb-data.")
    except Exception as e:
        print(f"Error parsing kb-data: {e}")
else:
    print("Could not find kb-data script tag!")

# 2. Extract SCRIPT_DUMP
script_dump = {}
dump_match = re.search(r'const SCRIPT_DUMP = (\{.*?\});\n', content)
if not dump_match:
    # If not on its own line, try standard pattern search
    dump_match = re.search(r'const SCRIPT_DUMP = (\{.*?\});', content)

if dump_match:
    try:
        script_dump = json.loads(dump_match.group(1).strip())
        print(f"Extracted {len(script_dump)} scripts from SCRIPT_DUMP.")
    except Exception as e:
        print(f"Error parsing SCRIPT_DUMP: {e}")
else:
    print("Could not find SCRIPT_DUMP definition!")

# Combine them. All assets are indexed by their ID (as string)
all_ids = sorted(list(set(list(kb_data.keys()) + list(script_dump.keys()))), key=lambda x: int(x) if x.isdigit() else 999999)

csv_headers = [
    "ID",
    "Show",
    "Script",
    "Power Start",
    "Power Start Trope",
    "Power Start Promise",
    "Conflict Type",
    "Genre Tags",
    "Core Promise",
    "Why It Works",
    "How To Adapt",
    "Merge Viability",
    "Cluster Key"
]

print(f"Writing database to {csv_out_path}...")
rows_written = 0

with open(csv_out_path, "w", newline="", encoding="utf-8") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(csv_headers)
    
    for asset_id in all_ids:
        meta = kb_data.get(str(asset_id), {}) or kb_data.get(int(asset_id), {}) or {}
        script_text = script_dump.get(str(asset_id), "") or script_dump.get(int(asset_id), "") or ""
        
        # If there is no metadata and no script, skip
        if not meta and not script_text:
            continue
            
        # Genre tags formatting
        genre_tags = meta.get("dominant_genre_tags", [])
        if isinstance(genre_tags, list):
            genre_tags = ", ".join(genre_tags)
        elif not genre_tags:
            genre_tags = ""
            
        # Show name extraction (if available in SCRIPT_DUMP or meta)
        show_name = meta.get("show_name", "Romance/Drama Show")
        
        row = [
            asset_id,
            show_name,
            script_text,
            meta.get("power_start", ""),
            meta.get("power_start_trope", ""),
            meta.get("power_start_promise", ""),
            meta.get("opening_conflict_type", ""),
            genre_tags,
            meta.get("core_promise", ""),
            meta.get("why_it_works", ""),
            meta.get("how_to_adapt", ""),
            meta.get("merge_viability", ""),
            meta.get("cluster_key", "")
        ]
        writer.writerow(row)
        rows_written += 1

print(f"Successfully migrated {rows_written} scripts and metadata to CSV.")
