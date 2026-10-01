/**
 * Reusable action templates for common computer-use workflows.
 * Each template generates an array of declarative action objects for batch-actions execution.
 */

export const ActionTemplates = {
  /**
   * Switch to a specific tab index in the browser.
   */
  browserTabSwitch(tabIndex, appName = 'Google Chrome') {
    return [
      { type: 'activate', appName },
      { type: 'hotkey', keys: ['cmd', String(tabIndex)] },
      { type: 'wait', ms: 100 },
    ];
  },

  /**
   * Navigate browser to a new URL.
   */
  browserNavigate(url, appName = 'Google Chrome') {
    return [
      { type: 'activate', appName },
      { type: 'hotkey', keys: ['cmd', 'l'] },
      { type: 'wait', ms: 60 },
      { type: 'type', text: url, delayMs: 10 },
      { type: 'key', key: 'return' },
      { type: 'wait', ms: 250 },
    ];
  },

  /**
   * Find text in active page.
   */
  browserFindOnPage(query) {
    return [
      { type: 'hotkey', keys: ['cmd', 'f'] },
      { type: 'wait', ms: 50 },
      { type: 'type', text: query, delayMs: 10 },
      { type: 'key', key: 'return' },
    ];
  },

  /**
   * Click and edit a spreadsheet cell, then commit with Return.
   */
  spreadsheetEditCell(x, y, value) {
    return [
      { type: 'click', x, y, speed: 'fast' },
      { type: 'wait', ms: 60 },
      { type: 'type', text: value, delayMs: 15 },
      { type: 'key', key: 'return' },
      { type: 'wait', ms: 60 },
    ];
  },

  /**
   * Drag formula / fill-handle in spreadsheet from source cell to target cell.
   */
  spreadsheetFillFormula(fromX, fromY, toX, toY, options = {}) {
    return [
      { type: 'click', x: fromX, y: fromY, speed: 'fast' },
      { type: 'wait', ms: 80 },
      {
        type: 'drag',
        fromX,
        fromY,
        toX,
        toY,
        durationMs: options.durationMs ?? 300,
        steps: options.steps ?? 20,
      },
      { type: 'wait', ms: 100 },
    ];
  },

  /**
   * Fill out multiple form fields sequentially.
   * fields: [{ x, y, value }, ...]
   */
  formFillFields(fields, submitButton = null) {
    const actions = [];
    for (const f of fields) {
      actions.push({ type: 'click', x: f.x, y: f.y, speed: 'fast' });
      actions.push({ type: 'wait', ms: 40 });
      actions.push({ type: 'type', text: f.value, delayMs: 12 });
      actions.push({ type: 'wait', ms: 50 });
    }
    if (submitButton) {
      actions.push({ type: 'click', x: submitButton.x, y: submitButton.y, speed: 'snappy' });
    }
    return actions;
  },

  /**
   * Make a chess move by clicking source square, then target square.
   */
  chessMove(fromX, fromY, toX, toY) {
    return [
      { type: 'click', x: fromX, y: fromY, speed: 'fast' },
      { type: 'wait', ms: 60 },
      { type: 'click', x: toX, y: toY, speed: 'fast' },
      { type: 'wait', ms: 100 },
    ];
  },
};
