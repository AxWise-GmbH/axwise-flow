# Fix Pylance Import Warnings

## Problem

VSCode Pylance shows import warnings for:
- `Import "fastapi" could not be resolved`
- `Import "sqlalchemy.orm" could not be resolved`
- `Import "sqlalchemy.orm.attributes" could not be resolved`

These are **IDE configuration issues**, not code issues. The dependencies are installed and the backend runs successfully.

---

## Root Cause

Pylance cannot find the Python packages because:
1. The project expects a virtual environment (`venv_py-flow-oss` or `venv_py311`)
2. The virtual environment doesn't exist yet
3. VSCode's Python interpreter is not pointing to the correct Python installation

---

## Solution 1: Create Virtual Environment (Recommended)

### Step 1: Create the virtual environment

```bash
cd /Users/admin/axwise-opensource
python3.11 -m venv venv_py-flow-oss
```

### Step 2: Activate the environment

```bash
source venv_py-flow-oss/bin/activate
```

### Step 3: Install dependencies

```bash
cd axwise-flow-oss/backend
pip install -r requirements.txt
```

### Step 4: Configure VSCode Python interpreter

1. Open Command Palette (Cmd+Shift+P)
2. Type: "Python: Select Interpreter"
3. Choose: `./venv_py-flow-oss/bin/python`

### Step 5: Reload VSCode window

1. Open Command Palette (Cmd+Shift+P)
2. Type: "Developer: Reload Window"

**Result:** Pylance warnings should disappear.

---

## Solution 2: Point VSCode to System Python (Quick Fix)

If you don't want to create a virtual environment:

### Step 1: Find your Python 3.11 installation

```bash
which python3.11
# Output: /usr/local/bin/python3.11 (or similar)
```

### Step 2: Configure VSCode Python interpreter

1. Open Command Palette (Cmd+Shift+P)
2. Type: "Python: Select Interpreter"
3. Click "Enter interpreter path..."
4. Enter: `/usr/local/bin/python3.11` (or the path from Step 1)

### Step 3: Install dependencies globally (if not already installed)

```bash
pip3.11 install -r axwise-flow-oss/backend/requirements.txt
```

### Step 4: Reload VSCode window

1. Open Command Palette (Cmd+Shift+P)
2. Type: "Developer: Reload Window"

---

## Solution 3: Workspace Settings (Alternative)

Create or update `.vscode/settings.json` in the workspace root:

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/venv_py-flow-oss/bin/python",
  "python.analysis.extraPaths": [
    "${workspaceFolder}/axwise-flow-oss/backend"
  ],
  "python.analysis.diagnosticMode": "workspace"
}
```

Then reload the window.

---

## Verification

After applying any solution, verify the fix:

1. **Check Python interpreter in VSCode:**
   - Look at the bottom-right corner of VSCode
   - Should show: `Python 3.11.x ('venv_py-flow-oss': venv)` or similar

2. **Check Pylance status:**
   - Open `axwise-flow-oss/backend/api/routes/perpetual_personas.py`
   - The import warnings should be gone

3. **Test imports in Python:**
   ```bash
   source venv_py-flow-oss/bin/activate  # if using venv
   python -c "import fastapi; import sqlalchemy; print('✓ Imports work')"
   ```

---

## Why This Happens

The Pylance language server needs to know where to find Python packages. It looks in:
1. The active virtual environment
2. The system Python's site-packages
3. Paths specified in VSCode settings

If none of these are configured correctly, Pylance shows "could not be resolved" warnings even though the code runs fine.

---

## Recommended Approach

**Use Solution 1 (Create Virtual Environment)** because:
- ✅ Isolates project dependencies
- ✅ Matches the project's expected setup (see `activate_env.sh`)
- ✅ Prevents conflicts with other Python projects
- ✅ Makes the backend startup script work correctly
- ✅ Ensures consistent Python version (3.11)

---

## Quick Command Summary

```bash
# Create venv
cd /Users/admin/axwise-opensource
python3.11 -m venv venv_py-flow-oss

# Activate venv
source venv_py-flow-oss/bin/activate

# Install dependencies
cd axwise-flow-oss/backend
pip install -r requirements.txt

# Verify
python -c "import fastapi; import sqlalchemy; print('✓ All imports work')"
```

Then in VSCode:
1. Cmd+Shift+P → "Python: Select Interpreter"
2. Choose `./venv_py-flow-oss/bin/python`
3. Cmd+Shift+P → "Developer: Reload Window"

**Done!** Pylance warnings should be resolved.

