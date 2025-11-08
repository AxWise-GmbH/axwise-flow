# Testing Guide: Perpetual Personas Implementation

## Prerequisites

1. **Backend running:** `scripts/oss/run_backend_oss.sh`
2. **Frontend accessible:** `http://localhost:3000/prototypes/perpetual_personas.html`
3. **Database:** PostgreSQL with at least one analysis result
4. **Gemini API Key:** Set in `backend/.env.oss`

---

## Test 1: Image Uniqueness (Critical)

### Objective
Verify that each image generation produces a unique result, even for identical inputs.

### Steps

1. **Open the prototype page**
   - Navigate to `http://localhost:3000/prototypes/perpetual_personas.html`
   - Enable backend mode
   - Select an analysis result

2. **Test Avatar Uniqueness**
   ```
   a. Click "Generate avatar" for Persona #0
   b. Wait for image to load
   c. Right-click image → "Save Image As..." → save as "avatar_1.png"
   d. Click "Regenerate avatar" for the same persona
   e. Wait for new image to load
   f. Right-click image → "Save Image As..." → save as "avatar_2.png"
   g. Compare avatar_1.png and avatar_2.png visually
   ```
   
   **Expected:** Images should be different (different pose, lighting, background details)
   
   **Backend logs should show:**
   ```
   [DEBUG] Avatar generation for <Name> (city: Berlin, unique_id: a1b2c3d4-1699123456789)
   [DEBUG] Avatar generation for <Name> (city: Berlin, unique_id: e5f6g7h8-1699123457890)
   ```

3. **Test Food Image Uniqueness**
   ```
   a. Click "City profile" for Persona #0
   b. Wait for lunch/dinner recommendations to appear
   c. Click the food image placeholder for Lunch #0
   d. Wait for image to generate
   e. Save as "food_1.png"
   f. Delete the persona's food_images from database (or use a different persona)
   g. Generate city profile again
   h. Click the food image placeholder for Lunch #0 again
   i. Save as "food_2.png"
   j. Compare food_1.png and food_2.png
   ```
   
   **Expected:** Images should be different (different plating, angle, lighting)
   
   **Backend logs should show:**
   ```
   [DEBUG] Generating food image for <Restaurant> (lunch #0, unique_id: i9j0k1l2-1699123458901)
   [DEBUG] Generating food image for <Restaurant> (lunch #0, unique_id: m3n4o5p6-1699123459012)
   ```

---

## Test 2: City-Aware Avatar Generation

### Objective
Verify that avatars incorporate city context into the generated images.

### Steps

1. **Test Berlin Context**
   ```
   a. Set Location input to "Berlin"
   b. Generate avatar for Persona #0
   c. Observe background (should have Berlin workplace/café vibes)
   ```

2. **Test London Context**
   ```
   a. Set Location input to "London"
   b. Generate avatar for Persona #1
   c. Observe background (should have London workplace/café vibes)
   ```

3. **Test Tokyo Context**
   ```
   a. Set Location input to "Tokyo"
   b. Generate avatar for Persona #2
   c. Observe background (should have Tokyo workplace/café vibes)
   ```

**Backend logs should show:**
```
[DEBUG] Avatar generation for <Name> (city: Berlin, unique_id: ...)
[DEBUG] Avatar generation for <Name> (city: London, unique_id: ...)
[DEBUG] Avatar generation for <Name> (city: Tokyo, unique_id: ...)
```

---

## Test 3: Database Persistence

### Objective
Verify that all generated data persists correctly to the database.

### Steps

1. **Generate All Content**
   ```
   a. Generate avatar for Persona #0
   b. Generate city profile for Persona #0
   c. Generate quote for Persona #0
   d. Generate food images for all lunch/dinner recommendations
   ```

2. **Verify Persistence**
   ```
   a. Hard refresh the page (Cmd/Ctrl+Shift+R)
   b. Select the same analysis result
   c. Verify avatar appears immediately (not placeholder)
   d. Verify city profile appears immediately
   e. Verify quote appears immediately
   f. Verify food images appear immediately (not placeholders)
   ```

3. **Database Check (Optional)**
   ```sql
   -- Connect to PostgreSQL
   psql -U postgres -d axwise
   
   -- Check persona data
   SELECT 
     result_id,
     jsonb_pretty(results->'personas'->0) 
   FROM analysis_results 
   WHERE result_id = <your_result_id>;
   
   -- Verify fields exist:
   -- - avatar_data_uri
   -- - city_profile
   -- - quote
   -- - food_images
   ```

**Expected:** All fields should be populated with data URIs or JSON objects.

---

## Test 4: Error Handling & Logging

### Objective
Verify that errors are logged properly and don't crash the application.

### Steps

1. **Test Invalid City Profile**
   ```
   a. Set Location to "InvalidCity123"
   b. Generate city profile
   c. Check backend logs for fallback behavior
   ```

2. **Test Missing Gemini API Key**
   ```
   a. Temporarily remove GEMINI_API_KEY from .env.oss
   b. Restart backend
   c. Try to generate avatar
   d. Verify fallback SVG avatar appears
   e. Restore GEMINI_API_KEY
   ```

3. **Check Error Logs**
   ```
   # Backend terminal should show:
   [ERROR] Failed to persist avatar for persona <id>: <error details>
   [ERROR] Failed to save food image: <error details>
   [ERROR] Failed to persist city profile for persona <id>: <error details>
   ```

---

## Test 5: UI/UX Validation

### Objective
Verify that the user interface works correctly.

### Steps

1. **Food Image Placeholders**
   ```
   a. Select a persona without city profile
   b. Verify NO food image placeholders appear
   c. Generate city profile
   d. Verify food image placeholders appear for each recommendation
   e. Verify placeholders show "📸 Click to generate food image"
   ```

2. **Lightbox Functionality**
   ```
   a. Click an avatar image
   b. Verify lightbox opens with full-size image
   c. Press Escape key → lightbox closes
   d. Click avatar again
   e. Click background → lightbox closes
   f. Click avatar again
   g. Click × button → lightbox closes
   h. Repeat for food images
   ```

3. **Loading States**
   ```
   a. Click "Generate avatar"
   b. Verify button shows "Generating avatar…"
   c. Verify button is disabled during generation
   d. Verify button returns to normal after completion
   ```

---

## Expected Results Summary

✅ **Image Uniqueness:** Every generation produces a visually distinct image  
✅ **City Awareness:** Avatars reflect the specified city's visual context  
✅ **Persistence:** All data survives page refresh  
✅ **Error Logging:** Errors are logged with context, not silently swallowed  
✅ **UI Validation:** Placeholders only appear when appropriate  
✅ **Lightbox:** Works for both avatars and food images  

---

## Troubleshooting

### Images look identical
- Check backend logs for unique_id values (should be different)
- Verify Gemini API is being called (not using cached/fallback)
- Try increasing temperature parameter further (edit code)

### Images don't persist
- Check backend logs for `[ERROR] Failed to persist...`
- Verify database connection is working
- Check that `flag_modified()` is being called

### Food placeholders don't appear
- Verify city profile was generated successfully
- Check that `typical_order` field has content
- Inspect browser console for JavaScript errors

### Backend logs missing
- Verify backend is running with `--reload` flag
- Check that `print()` statements are not being buffered
- Try adding `flush=True` to print statements

