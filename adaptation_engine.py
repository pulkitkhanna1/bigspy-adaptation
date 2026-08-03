#!/usr/bin/env python3
import os
import sys
import csv
import json
import urllib.request
import urllib.error

# Config
DEFAULT_CSV_PATH = "scripts_database.csv"
GEMINI_MODEL = "gemini-2.0-flash"

CRACK_RULES = """THE CRACK OPENING FRAMEWORK — Core Rules:

GOAL: Maximise CTR x CTI. An opening is NOT a summary. It is a promise built from the story's DEEPEST emotional layer.

THE 6 LENSES to analyse any script:
1. CORE CONFLICT: The central struggle driving the story (e.g. slave vs royal bloodline, enemy vs fated mate)
2. CORE FANTASY: What the audience is actually buying (e.g. rising from nothing, being chosen by the most powerful)
3. EMOTIONAL ENGINE: The dominant feeling — revenge, obsession, desire, redemption, survival
4. POWER DYNAMICS: Who starts powerful vs powerless — and how that REVERSES across the story
5. HIDDEN REVEALS: Major secrets disclosed later — these are often MORE valuable than Chapter 1 events
6. FUTURE PAYOFFS: Moments later in the story that generate the strongest emotional reactions

THE 3 LAYERS of every story:
- SURFACE STORY: What physically happens
- ACTUAL STORY: What emotionally drives it
- DEEP STORY: The full emotional arc — THIS is what the opening must be built from

HOOK TIERS:
TIER A (use these): Revenge, Slavery/Captivity, Enemy-to-lover, Sterilisation/Infertility, Hidden cure, Secret heir/true identity, Mate bond, Forbidden attraction
TIER B (layer in): Disabled heroine, Monster curse, Hidden powers, Political tension
TIER C (avoid): Library discoveries, Territorial disputes, Pack administration

THE V1 TEST — a great opening must pass ALL 6:
1. One single central emotional dynamic (e.g. "the man who hates her needs her to survive")
2. Every sentence serves that single dynamic — no departures
3. Maximum 2 characters in the opening (heroine + the most powerful person in her world)
4. NO genre vocabulary (no "mate bond", "Alpha", "Luna", "pack") — use UNIVERSAL emotional language
5. Final sentence = most powerful hook, arriving at maximum tension
6. Ending leaves ONE burning unanswerable question — tension is never released, only compounded

MERGE POINT RULES:
- The opening (power start) is 30 seconds to 1 minute of content
- The merge point is where the power start connects to the main script
- Merge point must occur at the START of the script or no later than 20-60 seconds into the script
- The merge must feel seamless — the emotional thread must not break at the merge point
- The opening's final emotional beat must CONNECT to (not contradict) what follows immediately after the merge point"""

def call_gemini_api(prompt, api_key, system_instruction=None, json_mode=False):
    """Makes a request to the Google Gemini API using only urllib."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        
    generation_config = {}
    if json_mode:
        generation_config["responseMimeType"] = "application/json"
    
    if generation_config:
        payload["generationConfig"] = generation_config
        
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            
            if not res_data.get("candidates"):
                raise ValueError(f"No candidates returned: {res_data}")
                
            text = res_data["candidates"][0]["content"]["parts"][0]["text"]
            return text
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        raise RuntimeError(f"Gemini API HTTP Error {e.code}: {error_body}")
    except Exception as e:
        raise RuntimeError(f"Error calling Gemini API: {str(e)}")

def load_database(csv_path):
    """Loads analyzed scripts from the CSV file."""
    if not os.path.exists(csv_path):
        print(f"Error: CSV database file '{csv_path}' not found.")
        print("Please run 'extract_kb_to_sheet.py' first or export your Google Sheet as CSV.")
        sys.exit(1)
        
    database = []
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Parse genre tags list
            tags = [t.strip().lower() for t in row.get("Genre Tags", "").split(",") if t.strip()]
            
            database.append({
                "id": row.get("ID"),
                "show": row.get("Show"),
                "script": row.get("Script"),
                "power_start": row.get("Power Start"),
                "power_start_trope": row.get("Power Start Trope"),
                "power_start_promise": row.get("Power Start Promise"),
                "opening_conflict_type": row.get("Conflict Type"),
                "dominant_genre_tags": tags,
                "core_promise": row.get("Core Promise"),
                "cluster_key": row.get("Cluster Key")
            })
            
    print(f"Loaded {len(database)} records from database.")
    return database

def local_pre_score(item, blueprint):
    """Calculates match score between database item and target blueprint."""
    score = 0
    
    req_conflict = (blueprint.get("conflict_type") or "").lower()
    req_tags = [t.lower() for t in blueprint.get("genre_tags", [])]
    req_trope = (blueprint.get("required_trope_type") or "").lower()
    req_thread = (blueprint.get("emotional_thread") or "").lower()
    req_promise = (blueprint.get("opening_promise") or "").lower()
    
    item_conflict = (item.get("opening_conflict_type") or "").lower()
    item_tags = [t.lower() for t in item.get("dominant_genre_tags", [])]
    item_trope = (item.get("power_start_trope") or "").lower()
    item_promise = (item.get("power_start_promise") or "").lower()
    
    # Conflict Families matching
    conflict_families = {
        "power_imbalance": ["power_imbalance", "forbidden_desire", "identity_threat"],
        "forbidden_desire": ["forbidden_desire", "power_imbalance", "secret_exposure"],
        "secret_exposure": ["secret_exposure", "identity_threat", "betrayal"],
        "identity_threat": ["identity_threat", "secret_exposure", "betrayal"],
        "betrayal": ["betrayal", "identity_threat", "moral_dilemma"],
        "moral_dilemma": ["moral_dilemma", "betrayal", "forbidden_desire"],
        "physical_danger": ["physical_danger", "power_imbalance"]
    }
    
    family = conflict_families.get(req_conflict, [])
    if req_conflict and item_conflict == req_conflict:
        score += 50
    elif req_conflict and item_conflict in family:
        score += 25
        
    # Genre Tag Exact Match
    for t in req_tags:
        if t in item_tags:
            score += 20
            
    # Genre Tag Family Match
    tag_families = {
        "forbidden_romance": ["forbidden_romance", "forced_proximity", "possessive_hero", "workplace_power"],
        "secret_pregnancy": ["secret_pregnancy", "forbidden_romance", "medical_drama"],
        "humiliation_redemption": ["humiliation_redemption", "revenge_arc", "rich_poor_divide"],
        "identity_reveal": ["identity_reveal", "secret_pregnancy", "revenge_arc"],
        "rescue_romance": ["rescue_romance", "damsel_in_peril", "possessive_hero"],
        "workplace_power": ["workplace_power", "forbidden_romance", "humiliation_redemption"],
        "revenge_arc": ["revenge_arc", "humiliation_redemption", "identity_reveal"]
    }
    
    for t in req_tags:
        fam = tag_families.get(t, [])
        for ft in fam:
            if ft in item_tags:
                score += 8
                
    # Trope Keyword Overlap
    trope_words = [w for w in req_trope.split() if len(w) > 3]
    for w in trope_words:
        if w in item_trope:
            score += 10
            
    # Emotional Thread / Promise Overlap
    thread_words = [w for w in (req_thread + " " + req_promise).split() if len(w) > 4]
    for w in thread_words:
        if w in item_trope or w in item_promise:
            score += 6
            
    return score

def main():
    print("====================================================")
    print("      BigSpy Adaptation Engine — CLI Tool")
    print("====================================================\n")
    
    # 1. API Key Setup
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        api_key = input("Enter your Gemini API Key: ").strip()
        if not api_key:
            print("Error: Gemini API Key is required.")
            sys.exit(1)
            
    # 2. Database Setup
    csv_path = input(f"Enter path to database CSV [default: {DEFAULT_CSV_PATH}]: ").strip()
    if not csv_path:
        csv_path = DEFAULT_CSV_PATH
    database = load_database(csv_path)
    
    # 3. Input Target Script
    print("\n----------------------------------------------------")
    print("Paste your TARGET SCRIPT (press Ctrl+D or Ctrl+Z on a blank line when finished):")
    print("----------------------------------------------------")
    target_lines = sys.stdin.read().strip()
    
    if len(target_lines) < 20:
        print("Error: Script is too short to analyze.")
        sys.exit(1)
        
    print("\n----------------------------------------------------")
    print("Step 1: Running 6-Lens Analysis and Blueprint Extraction...")
    print("----------------------------------------------------")
    
    # Prompt for Blueprint
    blueprint_prompt = f"""You are an expert opening writer using the CRACK Opening Framework.

CRACK RULES:
{CRACK_RULES}

Analyse this script through all 6 lenses and define the OPENING BLUEPRINT.
SCRIPT:
{target_lines}

Return ONLY a JSON response in the following format (no other text or markdown wrapper):
{{
  "conflict_type": "one of: power_imbalance|physical_danger|secret_exposure|forbidden_desire|identity_threat|betrayal|moral_dilemma",
  "genre_tags": ["tag1", "tag2", "selected from: secret_pregnancy|forbidden_romance|workplace_power|humiliation_redemption|identity_reveal|revenge_arc|rescue_romance|rich_poor_divide|medical_drama|forced_proximity|possessive_hero|damsel_in_peril"],
  "required_trope_type": "3-7 word description of the required trope",
  "emotional_thread": "the single V1 emotional dynamic",
  "opening_promise": "one sentence outlining the target script promise"
}}"""

    try:
        blueprint_text = call_gemini_api(blueprint_prompt, api_key, json_mode=True)
        blueprint = json.loads(blueprint_text.strip())
        print(f"Extracted Blueprint successfully:")
        print(f" - Conflict Type: {blueprint.get('conflict_type')}")
        print(f" - Genre Tags: {', '.join(blueprint.get('genre_tags', []))}")
        print(f" - Required Trope: {blueprint.get('required_trope_type')}")
        print(f" - Emotional Thread: {blueprint.get('emotional_thread')}")
    except Exception as e:
        print(f"Error during step 1: {e}")
        sys.exit(1)
        
    print("\n----------------------------------------------------")
    print("Step 2: Scoring and Matching against Database...")
    print("----------------------------------------------------")
    
    # Run matching
    scored = []
    for item in database:
        score = local_pre_score(item, blueprint)
        scored.append((item, score))
        
    scored.sort(key=lambda x: x[1], reverse=True)
    
    print("\nTop 5 Matching Scripts found in Database:")
    for idx, (item, score) in enumerate(scored[:5]):
        fit_percentage = min(100, int(score * 100 / 150))
        print(f"{idx+1}. Asset #{item['id']} [Fit Score: {fit_percentage}% | Match Score: {score}]")
        print(f"   Trope: {item['power_start_trope']}")
        print(f"   Conflict: {item['opening_conflict_type']}")
        print(f"   Preview: {item['power_start'][:100]}...")
        print()
        
    selection = input("Select an Asset ID to adapt (or press Enter to use the best match): ").strip()
    
    selected_item = None
    if not selection:
        selected_item = scored[0][0]
    else:
        for item, _ in scored:
            if str(item["id"]) == selection:
                selected_item = item
                break
        if not selected_item:
            print("Invalid Asset ID selected. Defaulting to the best match.")
            selected_item = scored[0][0]
            
    print(f"\nSelected Asset #{selected_item['id']} for adaptation.")

    # Pocket FM & Hallucination prompts
    print("\nSelect Target Format:")
    print("1. Standard Video Script")
    print("2. Pocket FM Audio Drama (with SFX Cues & Narration)")
    fmt_choice = input("Enter choice [default: 2]: ").strip()
    target_format = "pocketfm" if fmt_choice != "1" else "standard"

    print("\nSelect Hallucination Scale (Sensationalism):")
    print("1. Faithful (0% Hallucination)")
    print("2. Heightened (50% Drama)")
    print("3. Sensational (100% Clickbait Twist)")
    hal_choice = input("Enter choice [default: 3]: ").strip()
    hallucination_level = "faithful" if hal_choice == "1" else "heightened" if hal_choice == "2" else "sensational"

    tropes_to_inject = []
    if hallucination_level != "faithful":
        print("\nSelect Tropes to Inject (comma-separated numbers or press Enter for default):")
        print("1. Secret Billionaire / Hidden CEO")
        print("2. Secret Pregnancy / Hidden Heir")
        print("3. Revenge Reversal (Slap)")
        print("4. Forced Contract Marriage")
        print("5. Werewolf / Fated Mate Bond")
        trope_choices = input("Enter choices [default: 1,2]: ").strip()
        if trope_choices == "":
            trope_choices = "1,2"
        
        trope_map = {
            "1": "Secret Billionaire / Hidden CEO",
            "2": "Secret Pregnancy / Hidden Heir",
            "3": "Revenge Reversal (Slap)",
            "4": "Forced Contract Marriage",
            "5": "Werewolf / Fated Mate Bond"
        }
        for ch in trope_choices.split(","):
            ch = ch.strip()
            if ch in trope_map:
                tropes_to_inject.append(trope_map[ch])

    pocketfm_instructions = ""
    if target_format == "pocketfm":
        pocketfm_instructions = """
[TARGET FORMAT: POCKET FM AUDIO DRAMA]
- You MUST write this adaptation in the Pocket FM audio series promotional script format.
- Heavily weave in explicit, dramatic sound effect cues (e.g. [SFX: slap], [SFX: glass shatter], [SFX: door crash], [SFX: crowd gasp], [SFX: wolf howl], [SFX: heartbeat], [SFX: low growl]) to punctuate key emotional beats.
- Emphasize character dialogue and narrator voiceovers (NVO / FVO) that describe sensory details and raw emotion.
- Dialogue format: [CHARACTER NAME]: "dialogue line"
- Thought format: [CHARACTER NAME - internal]: "internal thoughts"
"""

    hallucination_instructions = ""
    if hallucination_level == "faithful":
        hallucination_instructions = """
[HALLUCINATION SCALE: FAITHFUL (0%)]
- Stay strictly faithful to the literal target script details and events. Do not invent any new twists or details.
"""
    elif hallucination_level == "heightened":
        hallucination_instructions = """
[HALLUCINATION SCALE: HEIGHTENED (50%)]
- Embellish and heighten the emotional conflict. Make dialogue and descriptions feel 2x more intense and dramatic.
"""
    elif hallucination_level == "sensational":
        hallucination_instructions = """
[HALLUCINATION SCALE: SENSATIONAL (100% CLICKBAIT)]
- You are encouraged to invent shocking, sensational twists and cliffhangers (i.e. 'hallucinations') that capture the core fantasy of the story in the most clickbaity way possible, even if they aren't literally present in the target script. Focus on creating an un-skippable hook.
"""

    if tropes_to_inject:
        hallucination_instructions += f"\n- Specifically inject/hallucinate the following Pocket FM trope elements into this opening hook: {', '.join(tropes_to_inject)}.\n"
    
    # 4. Perform Adaptation
    print("\n----------------------------------------------------")
    print("Step 3: Running Power Start Adaptor (PSA)...")
    print("----------------------------------------------------")
    
    source_script = selected_item["script"]
    
    # Step 3A: PSA Step 2 Analysis
    psa_step2_prompt = f"""You are the PS Adaptor tool (v2.2). Perform Step 2 of a 3-step PS adaptation.
 
SOURCE SCRIPT (Asset #{selected_item['id']}):
{source_script}
 
TARGET SCRIPT:
{target_lines}
 
Produce all three parts:
 
## BEAT MAP
List every beat in the source PS in order. For each:
- Beat # | Function label | Sentence rhythm (short/medium/long) | Intensity (1–5) | Voice register
 
## WHAT MADE IT WORK
2–3 sentences diagnosing the specific emotional mechanism. Not a plot summary — a precise identification of what makes this PS irresistible.
 
## MAPPING TABLE
Map every show-specific element (names, institutions, objects, ceremonies, power systems). Use format:
| Source Element | Functional Role | Why It Matters for Impact | Target Show Equivalent | Matchable? (YES/DROP) |
 
## UNIQUE SELLING ELEMENT
Identify the single strongest selling element from the FIRST QUARTER of the TARGET SCRIPT.
"""

    print("Analyzing source script beats and elements mapping...")
    try:
        step2_analysis = call_gemini_api(psa_step2_prompt, api_key)
        print("\n=== Elements Mapping & Analysis ===")
        print(step2_analysis)
    except Exception as e:
        print(f"Error during beat mapping: {e}")
        sys.exit(1)
        
    # Step 3B: PSA Step 3 Generation
    print("\n----------------------------------------------------")
    print("Generating Adapted Power Start Script...")
    print("----------------------------------------------------")
    
    psa_step3_prompt = f"""You are the PS Adaptor tool (v2.2). Write the adapted PS (Step 3).
 
SOURCE SCRIPT (Asset #{selected_item['id']}):
{source_script}
 
TARGET SCRIPT:
{target_lines}

{pocketfm_instructions}
{hallucination_instructions}
 
STEP 2 ANALYSIS:
{step2_analysis}
 
LENGTH CONSTRAINT: Max 16 lines.
Checklist of rules to follow:
1. Max 16 lines.
2. Line 1-2 = scroll-stopper. Lines 3-4 = hook. No warm-up.
3. Unique Selling Element embedded.
4. DROP Rule: Completely omit elements marked DROP.
5. Beat order remains same.
6. Opening line has 7 words or fewer.
7. Matches target script format.
8. Speaker labels like [CHARACTER]: or [CHARACTER - internal]:.
 
## ADAPTED PS — ASSET #{selected_item['id']} → TARGET SHOW
[Write the script here]
 
---
## MERGE LINE
Find the exact line in the TARGET SCRIPT that comes immediately after the hook hand-off.
[→ CONTINUES INTO TARGET SCRIPT]
[Exact line here]
"""

    try:
        adapted_script = call_gemini_api(psa_step3_prompt, api_key)
        print("\n=== Adapted Script Output ===")
        print(adapted_script)
    except Exception as e:
        print(f"Error during adaptation generation: {e}")
        sys.exit(1)
        
    # Step 3C: Continuity verification
    print("\n----------------------------------------------------")
    print("Checking Narrative & Emotional Continuity...")
    print("----------------------------------------------------")
    
    # Extract merge line
    merge_lines = []
    for line in adapted_script.splitlines():
        if "[→ CONTINUES INTO TARGET SCRIPT]" in line or "CONTINUES" in line:
            idx = adapted_script.splitlines().index(line)
            if idx + 1 < len(adapted_script.splitlines()):
                merge_lines = adapted_script.splitlines()[idx+1:]
            break
            
    target_merge_line = "\n".join(merge_lines).strip() or "First line of main script"
    
    continuity_prompt = f"""Evaluate continuity between this adapted Power Start and the main script merge line.

ADAPTED POWER START:
{adapted_script}

MAIN SCRIPT MERGE LINE:
{target_merge_line}

Check these three things:
1. CHARACTER CONTINUITY: Is the same character carrying from the PS into the main script?
2. EMOTIONAL CONTINUITY: Does the emotional register carry across — no sudden tonal jump?
3. NARRATIVE CONTINUITY: Does the situation make sense — no unexplained location change, time jump, or logic gap?

If all three pass, respond with exactly:
{{"continuity":"pass","bridge":null}}

If ANY fails, respond with:
{{"continuity":"fail","reason":"one sentence explaining the gap","bridge":"a bridge line that connects the PS ending to the main script first line"}}

Return ONLY valid JSON.
"""

    try:
        continuity_json = call_gemini_api(continuity_prompt, api_key, json_mode=True)
        res = json.loads(continuity_json.strip())
        
        print("\n=== Continuity Report ===")
        if res.get("continuity") == "pass":
            print("✓ Narrative, emotional, and character continuity PASSED!")
        else:
            print("⚠ Continuity GAP detected:")
            print(f"  Reason: {res.get('reason')}")
            print(f"  Suggested Bridge Line: {res.get('bridge')}")
    except Exception as e:
        print(f"Error checking continuity: {e}")
        
    print("\nAdaptation process complete!")
    print("====================================================")

if __name__ == "__main__":
    main()
